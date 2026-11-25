// Peer-to-peer connection for Pulse Tag, so the game needs no server of its own and can be
// hosted as static files (GitHub Pages). The room creator's browser is the host: it holds the
// room state (roomlogic.js) and the joining player connects to it directly over WebRTC.
// PeerJS (vendor/peerjs.min.js, loaded as window.Peer) is used only to find the other player;
// by default it uses the free public PeerJS service. For testing, ?peerHost=&peerPort=&peerPath=
// &peerSecure=0|1 point it at another PeerJS server.
import { createRoomState, joinRoomState, updatePlayer, tick, findPlayer, randomCode } from './roomlogic.js';

const PREFIX = 'birdy-pulse-tag-';
const CONNECT_TIMEOUT = 15000;
const SILENCE_LIMIT = 4000; // no messages for this long during a match = connection lost

function peerOptions() {
  const q = new URLSearchParams(location.search);
  if (!q.get('peerHost')) return { debug: 0 };
  return { host: q.get('peerHost'), port: Number(q.get('peerPort') || 9000), path: q.get('peerPath') || '/', secure: q.get('peerSecure') === '1', debug: 0 };
}

const friendly = (error) => new Error(
  error?.type === 'network' || error?.type === 'server-error' || error?.type === 'socket-error'
    ? 'Could not reach the connection service. Check your internet connection and try again.'
    : error?.type === 'browser-incompatible' ? 'This browser does not support direct connections (WebRTC).'
    : error?.message || 'Could not connect.');

function openPeer(id) {
  if (typeof window.Peer !== 'function') return Promise.reject(new Error('Connection library failed to load. Reload the page.'));
  return new Promise((resolve, reject) => {
    const peer = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
    const done = () => { clearTimeout(timer); peer.off('open', onOpen); peer.off('error', onError); };
    const onOpen = () => { done(); resolve(peer); };
    const onError = (error) => { done(); peer.destroy(); reject(error); };
    const timer = setTimeout(() => onError(new Error('Could not reach the connection service. Check your internet connection and try again.')), CONNECT_TIMEOUT);
    peer.on('open', onOpen);
    peer.on('error', onError);
  });
}

export class Net {
  constructor() {
    this.isHost = false;
    this.peer = null;
    this.room = null;      // host only
    this.guest = null;     // host only: the ant player's connection
    this.conn = null;      // guest only: connection to the host
    this.latest = null;    // guest only: newest state from the host
    this.lost = false;     // guest only: host connection closed
    this.lastHeard = 0;    // when the other player last sent anything
  }

  // Robot player: create a room and wait for the ant player
  async createRoom(name) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(PREFIX + code);
      } catch (error) {
        if (error?.type === 'unavailable-id') continue; // code in use, pick another
        throw friendly(error);
      }
      this.isHost = true;
      this.room = createRoomState(code, name);
      this.peer.on('connection', (conn) => this.accept(conn));
      // Stay registered with the connection service so a player can still join after a network blip
      this.peer.on('disconnected', () => { if (!this.peer.destroyed) this.peer.reconnect(); });
      this.peer.on('error', () => {});
      return { playerId: this.room.players[0].id, state: tick(this.room) };
    }
    throw new Error('Could not create a room. Try again.');
  }

  accept(conn) {
    conn.on('data', (msg) => {
      if (conn === this.guest || msg?.type === 'join') this.lastHeard = performance.now();
      if (msg?.type === 'join') {
        const result = joinRoomState(this.room, String(msg.name || ''));
        if (result.error) { conn.send({ type: 'error', error: result.error }); setTimeout(() => conn.close(), 500); return; }
        conn.playerId = result.player.id;
        this.guest = conn;
        conn.send({ type: 'joined', playerId: result.player.id, state: tick(this.room) });
      } else if (msg?.type === 'move' && conn === this.guest) {
        updatePlayer(this.room, findPlayer(this.room, conn.playerId), msg);
        conn.send({ type: 'state', state: tick(this.room) });
      }
    });
    conn.on('close', () => {
      if (conn !== this.guest) return;
      const player = findPlayer(this.room, conn.playerId);
      if (player) player.connected = false;
    });
  }

  // Ant player: connect to the host's room
  async joinRoom(code, name) {
    try { this.peer = await openPeer(); } catch (error) { throw friendly(error); }
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message) => { if (settled) return; settled = true; clearTimeout(timer); this.peer.destroy(); reject(new Error(message)); };
      const timer = setTimeout(() => fail('Could not reach that room. Check the code, and that the other player still has it open.'), CONNECT_TIMEOUT);
      this.peer.on('error', (error) => {
        if (error?.type === 'peer-unavailable') fail('Room not found. Check the code and try again.');
        else if (!settled) fail(friendly(error).message);
      });
      const conn = this.peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => conn.send({ type: 'join', name }));
      conn.on('data', (msg) => {
        this.lastHeard = performance.now();
        if (msg?.type === 'joined' && !settled) {
          settled = true; clearTimeout(timer);
          this.conn = conn; this.latest = msg.state;
          resolve({ playerId: msg.playerId, state: msg.state });
        } else if (msg?.type === 'state') this.latest = msg.state;
        else if (msg?.type === 'error') fail(msg.error);
      });
      conn.on('close', () => { this.lost = true; });
    });
  }

  get connectionLost() {
    const silent = performance.now() - this.lastHeard > SILENCE_LIMIT;
    if (this.isHost) return this.room?.status === 'playing' && (this.room.players[1]?.connected === false || silent);
    return this.lost || (this.latest?.status === 'playing' && silent);
  }

  // Send this player's update; resolves with the newest room state
  async move(payload) {
    if (this.isHost) {
      updatePlayer(this.room, this.room.players[0], payload);
      const state = tick(this.room);
      if (this.guest?.open) this.guest.send({ type: 'state', state });
      return { state };
    }
    if (!this.conn?.open) throw new Error('Lost connection to the other player.');
    this.conn.send({ type: 'move', ...payload });
    return { state: this.latest };
  }

  async poll() {
    if (this.isHost) return { state: tick(this.room) };
    if (this.lost) throw new Error('Lost connection to the other player.');
    return { state: this.latest };
  }
}
