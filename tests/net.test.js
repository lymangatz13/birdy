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
class FakePeer extends Emitter {
  constructor(id, options) {
    super();
    if (typeof id === 'object') { options = id; id = undefined; }
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
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }); peers.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a dropped Jack player rejoins the same room and keeps its slot', async () => {
    const host = new Net(), guest = new Net();
    const { state } = await host.createRoom('giant');
    const joined = await guest.joinRoom(state.code, 'jack');
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

    const before = host.room.jack.x;
    await guest.move({ jack: { x: before + 0.1, y: host.room.jack.y, z: host.room.jack.z, yaw: 0 } });
    await settle(50);
    expect(host.room.jack.x).not.toBe(before);
  });

  it('the Jack player gives up when the host is gone for good', async () => {
    const host = new Net(), guest = new Net();
    const { state } = await host.createRoom('giant');
    await guest.joinRoom(state.code, 'jack');
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
