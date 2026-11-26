// Peer-to-peer connection for Pulse Tag, so the game needs no server of its own and can be
// hosted as static files (GitHub Pages). The room creator's browser is the host: it holds the
// room state (roomlogic.js) and the joining player connects to it directly over WebRTC.
// PeerJS is used only to find the other player;
// by default it uses the free public PeerJS service. For testing, ?peerHost=&peerPort=&peerPath=
// &peerSecure=0|1 point it at another PeerJS server.
// TURN: players on strict networks (school, office, mobile, hotel) often cannot connect directly
// and need a relay. Set at build time (see README):
//   VITE_TURN_URLS        comma-separated, e.g. turns:turn.example.com:443?transport=tcp
//   VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL
//   VITE_TURN_CREDENTIALS_URL  optional; a URL that returns a JSON array of iceServers (fetched once)
// Without them, PeerJS's own defaults (Google STUN + free PeerJS TURN on port 3478) are used.
import { Peer } from 'peerjs';
import { createRoomState, joinRoomState, updatePlayer, requestRematch, tick, findPlayer, randomCode } from './roomlogic.js';

const PREFIX = 'birdy-pulse-tag-';
const CONNECT_TIMEOUT = 15000;
const SILENCE_LIMIT = 4000; // no messages for this long = connection lost
const PING_EVERY = 1000;    // keep-alive, so a player who left is noticed even between matches
const REJOIN_FOR = 30000;   // how long a dropped ant player keeps trying to get back in
const REJOIN_RETRY = 2000;  // pause between rejoin attempts
const REJOIN_ATTEMPT = 6000; // one rejoin attempt gives up after this long

// PeerJS 1.5 defaults, kept so an extra TURN server is added rather than replacing them
const DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
const env = import.meta.env || {};
let fetchedIce = null;

async function iceServers() {
  const servers = [...DEFAULT_ICE];
  const urls = String(env.VITE_TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (urls.length) servers.push({ urls, username: env.VITE_TURN_USERNAME || '', credential: env.VITE_TURN_CREDENTIAL || '' });
  if (env.VITE_TURN_CREDENTIALS_URL) {
    try {
      fetchedIce ??= await fetch(env.VITE_TURN_CREDENTIALS_URL).then((r) => (r.ok ? r.json() : []));
      if (Array.isArray(fetchedIce)) servers.push(...fetchedIce);
    } catch { fetchedIce = null; } // relay unavailable: fall back to the defaults, try again next time
  }
  return servers;
}

async function peerOptions() {
  const q = new URLSearchParams(location.search);
  const config = { iceServers: await iceServers() };
  if (!q.get('peerHost')) return { debug: 0, config };
  return { host: q.get('peerHost'), port: Number(q.get('peerPort') || 9000), path: q.get('peerPath') || '/', secure: q.get('peerSecure') === '1', debug: 0, config };
}

const friendly = (error) => new Error(
  error?.type === 'network' || error?.type === 'server-error' || error?.type === 'socket-error'
    ? 'Could not reach the connection service. Check your internet connection and try again.'
    : error?.type === 'browser-incompatible' ? 'This browser does not support direct connections (WebRTC).'
    : error?.message || 'Could not connect.');

async function openPeer(id) {
  const options = await peerOptions();
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, options) : new Peer(options);
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
    this.code = null;      // guest only: room code, for rejoining
    this.playerId = null;  // guest only: own player id, for rejoining
    this.rejoining = false; // guest only: trying to get back into the room
    this.gaveUp = false;   // guest only: rejoin failed for good
  }

  // Robot player: create a room and wait for the ant player
  async createRoom(name, daySpeed = 1) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(PREFIX + code);
      } catch (error) {
        if (error?.type === 'unavailable-id') continue; // code in use, pick another
        throw friendly(error);
      }
      this.isHost = true;
      this.room = createRoomState(code, name, Date.now(), daySpeed);
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
      if (conn === this.guest || msg?.type === 'join' || msg?.type === 'rejoin') this.lastHeard = performance.now();
      if (msg?.type === 'rejoin') {
        // The ant player dropped and came back: give it its slot again on the new connection
        const player = findPlayer(this.room, String(msg.playerId || ''));
        if (!player || player.slot !== 1) { conn.send({ type: 'error', error: 'You are no longer in this room.', final: true }); setTimeout(() => conn.close(), 500); return; }
        player.connected = true;
        conn.playerId = player.id;
        const old = this.guest;
        this.guest = conn;
        if (old && old !== conn) old.close();
        this.keepAlive(conn);
        conn.send({ type: 'joined', playerId: player.id, state: tick(this.room) });
      } else if (msg?.type === 'join') {
        const result = joinRoomState(this.room, String(msg.name || ''));
        if (result.error) { conn.send({ type: 'error', error: result.error }); setTimeout(() => conn.close(), 500); return; }
        conn.playerId = result.player.id;
        this.guest = conn;
        this.keepAlive(conn);
        conn.send({ type: 'joined', playerId: result.player.id, state: tick(this.room) });
      } else if (msg?.type === 'move' && conn === this.guest) {
        updatePlayer(this.room, findPlayer(this.room, conn.playerId), msg);
        conn.send({ type: 'state', state: tick(this.room) });
      } else if (msg?.type === 'rematch' && conn === this.guest) {
        requestRematch(this.room, findPlayer(this.room, conn.playerId));
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
        if (msg?.type === 'joined' && !settled) {
          settled = true; clearTimeout(timer);
          this.code = code; this.playerId = msg.playerId;
          this.useHost(conn, msg.state);
          this.watchHost();
          resolve({ playerId: msg.playerId, state: msg.state });
        } else if (msg?.type === 'error') fail(msg.error);
      });
    });
  }

  // Guest: make this the live connection to the host
  useHost(conn, state) {
    this.conn = conn; this.latest = state; this.lost = false;
    conn.on('data', (msg) => {
      if (conn !== this.conn) return;
      this.lastHeard = performance.now();
      if (msg?.type === 'state') this.latest = msg.state;
    });
    conn.on('close', () => { if (conn === this.conn) this.lost = true; });
    this.keepAlive(conn);
  }

  // Guest: when the host goes quiet or the connection closes, try to rejoin the same room
  watchHost() {
    clearInterval(this.watcher);
    this.watcher = setInterval(() => {
      if (!this.rejoining && !this.gaveUp && this.linkDown) this.rejoin();
    }, 500);
  }

  async rejoin() {
    this.rejoining = true;
    const until = performance.now() + REJOIN_FOR;
    try { this.conn?.close(); } catch { /* already closed */ }
    while (performance.now() < until) {
      try { await this.rejoinOnce(); this.rejoining = false; return; }
      catch (error) { if (error?.final) break; }
      await new Promise((r) => setTimeout(r, REJOIN_RETRY));
    }
    clearInterval(this.watcher);
    this.rejoining = false; this.gaveUp = true; this.lost = true;
  }

  async rejoinOnce() {
    // A guest that lost the connection service gets a fresh peer (its own id does not matter)
    if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
      this.peer?.destroy();
      this.peer = await openPeer();
      this.peer.on('error', () => {}); // a failed attempt times out below and is retried
    }
    await new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
      const timer = setTimeout(() => { conn.close(); reject(new Error('Rejoin timed out')); }, REJOIN_ATTEMPT);
      conn.on('open', () => conn.send({ type: 'rejoin', playerId: this.playerId }));
      conn.on('data', (msg) => {
        if (msg?.type === 'joined') { clearTimeout(timer); this.lastHeard = performance.now(); this.useHost(conn, msg.state); resolve(); }
        else if (msg?.type === 'error') { clearTimeout(timer); reject(Object.assign(new Error(msg.error), { final: Boolean(msg.final) })); }
      });
    });
  }

  keepAlive(conn) {
    this.lastHeard = performance.now();
    clearInterval(this.pinger);
    this.pinger = setInterval(() => { if (conn.open) conn.send({ type: 'ping' }); }, PING_EVERY);
  }

  // The link to the other player is down right now (it may still come back)
  get linkDown() {
    const silent = performance.now() - this.lastHeard > SILENCE_LIMIT;
    if (this.isHost) return this.room?.players.length === 2 && (this.room.players[1].connected === false || silent);
    return Boolean(this.conn) && (this.lost || silent);
  }

  // The ant player is trying to get back into the room
  get reconnecting() {
    if (this.isHost) return this.linkDown && performance.now() - this.lastHeard < SILENCE_LIMIT + REJOIN_FOR;
    return this.rejoining || (this.linkDown && !this.gaveUp);
  }

  // The other player is gone for good
  get connectionLost() {
    if (this.isHost) return this.linkDown && !this.reconnecting;
    return this.gaveUp;
  }

  // Send this player's update; resolves with the newest room state
  async move(payload) {
    if (this.isHost) {
      updatePlayer(this.room, this.room.players[0], payload);
      const state = tick(this.room);
      if (this.guest?.open) this.guest.send({ type: 'state', state });
      return { state };
    }
    if (!this.conn?.open) {
      if (this.gaveUp) throw new Error('Lost connection to the other player.');
      return { state: this.latest }; // rejoining: keep the last state until the host is back
    }
    this.conn.send({ type: 'move', ...payload });
    return { state: this.latest };
  }

  // Ask for a rematch in the same room; it starts once both players have asked
  async rematch() {
    if (this.isHost) {
      requestRematch(this.room, this.room.players[0]);
      const state = tick(this.room);
      if (this.guest?.open) this.guest.send({ type: 'state', state });
      return { state };
    }
    if (!this.conn?.open) throw new Error('Lost connection to the other player.');
    this.conn.send({ type: 'rematch' });
    return { state: this.latest };
  }

  async poll() {
    if (this.isHost) return { state: tick(this.room) };
    if (this.gaveUp) throw new Error('Lost connection to the other player.');
    return { state: this.latest };
  }
}
