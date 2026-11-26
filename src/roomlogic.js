// Match rules for Jack and the Giant Slayer. Runs in the room creator's (giant player's) browser,
// which acts as the host for both players. No DOM, network or three.js here.

export const MATCH_MS = 180000;     // Jack wins by not being held for 10 seconds before time runs out
export const HOLD_MS = 10000;       // the giant wins by holding Jack this long
export const STRUGGLE_TO_ESCAPE = 40;
export const STRUGGLE_DECAY = 2;    // struggle points lost per second
export const FREE_MS = 2500;        // after wriggling free, Jack cannot be grabbed again for this long
// How far the giant can grab, measured from its feet: horizontal distance and height
export const GRAB_RANGE = { side: 12.5, top: 24 };
// Where Jack can be (the room's interior, voxel units) and how fast he can move
export const JACK_AREA = { x0: 1.3, x1: 55.7, y0: 1, y1: 28, z0: 1.3, z1: 51.7 };
const JACK_SPEED = 7, JACK_FALL = 40;

const GIANT_START = { x: 12, z: 42, yaw: 2.2 }; // same as room.js, facing the beanstalk
const JACK_START = { x: 24.5, y: 9, z: 8 };

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function randomCode() {
  return Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
}

export function inGrabRange(giant, jack) {
  return Math.hypot(jack.x - giant.x, jack.z - giant.z) <= GRAB_RANGE.side && jack.y <= GRAB_RANGE.top;
}

const startGiant = () => ({ ...GIANT_START, pitch: -0.25, crouch: false, reach: null, hand: { x: GIANT_START.x, y: 6, z: GIANT_START.z } });
const startJack = () => ({ ...JACK_START, yaw: 0, speed: 0, air: false });

// daySpeed: how fast the day/night cycle runs; both players see the host's sky clock
export function createRoomState(code, name, now = Date.now(), daySpeed = 1) {
  const player = { id: newId(), name: String(name || 'Giant').slice(0, 16), role: 'giant', color: '#60f5c3', slot: 0, connected: true, rematch: false };
  return {
    code, players: [player], status: 'waiting', winner: null, winnerRole: null, endAt: 0, createdAt: now, daySpeed,
    jackMoveAt: now, tickAt: now, event: null, hold: null, freeUntil: 0,
    giant: startGiant(), jack: startJack(),
  };
}

// Adds Jack's player and starts the match. Returns { player } or { error }.
export function joinRoomState(room, name, now = Date.now()) {
  if (room.players.length >= 2) return { error: 'This room already has two players.' };
  const player = { id: newId(), name: String(name || 'Jack').slice(0, 16), role: 'jack', color: '#ff4d6d', slot: 1, connected: true, rematch: false };
  room.players.push(player);
  room.status = 'playing';
  room.endAt = now + MATCH_MS;
  room.jackMoveAt = now;
  room.tickAt = now;
  return { player };
}

export const findPlayer = (room, id) => room.players.find((p) => p.id === id);

export function clean(room, now = Date.now()) {
  return {
    code: room.code, status: room.status,
    timeLeft: room.status === 'playing' ? Math.max(0, Math.ceil((room.endAt - now) / 1000)) : MATCH_MS / 1000,
    winner: room.winner, winnerRole: room.winnerRole,
    players: room.players.map((p) => ({ id: p.id, name: p.name, role: p.role, slot: p.slot, color: p.color, connected: p.connected, rematch: p.rematch })),
    giant: room.giant, jack: room.jack, event: room.event,
    hold: room.hold ? { held: (now - room.hold.since) / 1000, struggle: room.hold.struggle / STRUGGLE_TO_ESCAPE } : null,
    free: room.freeUntil > now,
    createdAt: room.createdAt, daySpeed: room.daySpeed, clock: now, // shared sky clock
  };
}

function end(room, role, now, type) {
  room.status = 'ended';
  room.winnerRole = role;
  room.winner = room.players[role === 'giant' ? 0 : 1].name;
  room.hold = null;
  room.event = { type, at: now };
}

// Runs the clocks (match time, hold time, struggle), then returns the shareable state
export function tick(room, now = Date.now()) {
  const dt = Math.max(0, (now - (room.tickAt || now)) / 1000);
  room.tickAt = now;
  if (room.status === 'playing') {
    if (room.hold) {
      room.hold.struggle = Math.max(0, room.hold.struggle - STRUGGLE_DECAY * dt);
      if (now - room.hold.since >= HOLD_MS) end(room, 'giant', now, 'squashed');
    }
    if (room.status === 'playing' && now >= room.endAt) end(room, 'jack', now, 'escape');
  }
  return clean(room, now);
}

// After a match, each player asks for a rematch; when both have, the same room starts over
export function requestRematch(room, player, now = Date.now()) {
  if (!player || room.status !== 'ended') return;
  player.rematch = true;
  if (room.players.length < 2 || !room.players.every((p) => p.rematch && p.connected)) return;
  for (const p of room.players) p.rematch = false;
  Object.assign(room, {
    status: 'playing', winner: null, winnerRole: null, endAt: now + MATCH_MS, jackMoveAt: now, tickAt: now,
    hold: null, freeUntil: 0, giant: startGiant(), jack: startJack(), event: { type: 'rematch', at: now },
  });
}

const num = (v) => Number.isFinite(Number(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const point = (p) => (p && [p.x, p.y, p.z].every(num) ? { x: Number(p.x), y: Number(p.y), z: Number(p.z) } : null);

// Applies one player's update.
// The giant reports its pose and hand, and asks to grab; the host checks Jack is in reach.
// Jack reports where he wants to be (limited to a believable speed and the room), or, while held,
// how many times he has pressed to struggle.
export function updatePlayer(room, player, data, now = Date.now()) {
  if (!player || room.status !== 'playing') return;
  if (player.slot === 0 && data.giant && typeof data.giant === 'object') {
    const g = data.giant;
    if (num(g.x)) room.giant.x = clamp(Number(g.x), 1, 56);
    if (num(g.z)) room.giant.z = clamp(Number(g.z), 1, 52);
    if (num(g.yaw)) room.giant.yaw = Number(g.yaw);
    if (num(g.pitch)) room.giant.pitch = clamp(Number(g.pitch), -1.4, 1.2);
    room.giant.crouch = Boolean(g.crouch);
    room.giant.reach = point(g.reach);
    room.giant.hand = point(g.hand) || room.giant.hand;
    if (g.grab && !room.hold && now >= room.freeUntil && inGrabRange(room.giant, room.jack)) {
      room.hold = { since: now, struggle: 0, presses: null };
      room.jack.speed = 0;
      room.jack.air = false;
      room.event = { type: 'grabbed', at: now };
    }
    // A held Jack goes wherever the giant's fist goes
    const fist = point(g.fist);
    if (room.hold && fist) Object.assign(room.jack, { x: fist.x, y: fist.y, z: fist.z });
  } else if (player.slot === 1 && data.jack && typeof data.jack === 'object') {
    const j = data.jack;
    if (room.hold) {
      const presses = Number(j.presses);
      if (Number.isFinite(presses)) {
        const dt = Math.max(0.05, Math.min(1, (now - room.jackMoveAt) / 1000));
        if (room.hold.presses !== null) room.hold.struggle += clamp(presses - room.hold.presses, 0, 10 * dt + 1);
        room.hold.presses = presses;
      }
      room.jackMoveAt = now;
      if (room.hold.struggle >= STRUGGLE_TO_ESCAPE) {
        room.hold = null;
        room.freeUntil = now + FREE_MS;
        room.event = { type: 'wriggle', at: now };
      }
      return;
    }
    if (![j.x, j.y, j.z].every(num)) return;
    const dt = Math.max(0.02, Math.min(0.35, (now - room.jackMoveAt) / 1000));
    const dx = Number(j.x) - room.jack.x, dz = Number(j.z) - room.jack.z, dy = Number(j.y) - room.jack.y;
    const distance = Math.hypot(dx, dz), limit = JACK_SPEED * 1.25 * dt + 0.3;
    const scale = distance > limit ? limit / distance : 1;
    const vLimit = JACK_FALL * dt + 0.6;
    room.jack.x = clamp(room.jack.x + dx * scale, JACK_AREA.x0, JACK_AREA.x1);
    room.jack.z = clamp(room.jack.z + dz * scale, JACK_AREA.z0, JACK_AREA.z1);
    room.jack.y = clamp(room.jack.y + clamp(dy, -vLimit, vLimit), JACK_AREA.y0, JACK_AREA.y1);
    if (num(j.yaw)) room.jack.yaw = Number(j.yaw);
    room.jack.speed = num(j.speed) ? clamp(Number(j.speed), 0, 1) : 0;
    room.jack.air = Boolean(j.air);
    room.jackMoveAt = now;
  }
}
