import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory stand-in for PeerJS: peers find each other by id, connections pair up
const peers = new Map();
class Emitter {
  constructor() { this.handlers = {}; }
  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this; }
  off(event, fn) { this.handlers[event] = (this.handlers[event] || []).filter((f) => f !== fn); return this; }
  emit(event, ...args) { for (const fn of [...(this.handlers[event] || [])]) fn(...args); }
}
class FakeConn extends Emitter {
  constructor() { super(); this.open = false; this.other = null; }
  send(msg) { if (this.open) { const other = this.other; queueMicrotask(() => other.open && other.emit('data', structuredClone(msg))); } }
  close() {
    if (!this.open) return;
    this.open = false; this.emit('close');
    if (this.other.open) { this.other.open = false; this.other.emit('close'); }
  }
}
let nextId = 0;
const lastOptions = [];
class FakePeer extends Emitter {
  constructor(id, options) {
    super();
    if (typeof id === 'object') { options = id; id = undefined; }
    lastOptions.push(options);
    this.id = id || `guest-${nextId++}`; this.destroyed = false; this.disconnected = false;
    peers.set(this.id, this);
    queueMicrotask(() => this.emit('open', this.id));
  }
  connect(id) {
    const mine = new FakeConn(), theirs = new FakeConn();
    mine.other = theirs; theirs.other = mine;
    const target = peers.get(id);
    queueMicrotask(() => {
      if (!target || target.destroyed) { this.emit('error', { type: 'peer-unavailable' }); return; }
      mine.open = theirs.open = true;
      target.emit('connection', theirs);
      theirs.emit('open'); mine.emit('open');
    });
    return mine;
  }
  reconnect() { this.disconnected = false; }
  destroy() { this.destroyed = true; peers.delete(this.id); }
}
vi.mock('peerjs', () => ({ Peer: FakePeer }));
globalThis.location = { search: '' };

const { Net } = await import('../src/net.js');
const settle = async (ms) => { await vi.advanceTimersByTimeAsync(ms); };

describe('net', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }); peers.clear(); lastOptions.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the PeerJS default STUN/TURN servers when no TURN is configured', async () => {
    const host = new Net();
    await host.createRoom('robo');
    const ice = lastOptions[0].config.iceServers;
    expect(ice.some((s) => String(s.urls).includes('stun.l.google.com'))).toBe(true);
    expect(ice.some((s) => String(s.urls).includes('turn.peerjs.com'))).toBe(true);
  });

  it('adds a configured TURN server on port 443 to the defaults', async () => {
    vi.stubEnv('VITE_TURN_URLS', 'turns:turn.example.com:443?transport=tcp');
    vi.stubEnv('VITE_TURN_USERNAME', 'u');
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'p');
    try {
      await new Net().createRoom('robo');
      const ice = lastOptions[0].config.iceServers;
      expect(ice).toContainEqual({ urls: ['turns:turn.example.com:443?transport=tcp'], username: 'u', credential: 'p' });
      expect(ice.some((s) => String(s.urls).includes('stun.l.google.com'))).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });

  it('a dropped ant player rejoins the same room and keeps its slot', async () => {
    const host = new Net(), guest = new Net();
    const { state } = await host.createRoom('robo');
    const joined = await guest.joinRoom(state.code, 'anty');
    expect(host.room.players).toHaveLength(2);

    guest.conn.close(); // network blip
    await settle(100);
    expect(host.room.players[1].connected).toBe(false);
    expect(guest.reconnecting).toBe(true);
    expect(guest.connectionLost).toBe(false);

    await settle(1000);
    expect(guest.reconnecting).toBe(false);
    expect(guest.connectionLost).toBe(false);
    expect(guest.conn.open).toBe(true);
    expect(host.room.players).toHaveLength(2);
    expect(host.room.players[1].id).toBe(joined.playerId);
    expect(host.room.players[1].connected).toBe(true);
    expect(host.connectionLost).toBe(false);

    await guest.move({ ant: { x: 36, z: 16, angle: 0 } });
    await settle(50);
    expect(host.room.ant.x).not.toBe(35.5);
  });

  it('the ant player gives up when the host is gone for good', async () => {
    const host = new Net(), guest = new Net();
    const { state } = await host.createRoom('robo');
    await guest.joinRoom(state.code, 'anty');
    host.peer.destroy();
    guest.conn.close();
    await settle(5000);
    expect(guest.reconnecting).toBe(true);
    await settle(40000);
    expect(guest.reconnecting).toBe(false);
    expect(guest.connectionLost).toBe(true);
    await expect(guest.poll()).rejects.toThrow(/Lost connection/);
  });
});
