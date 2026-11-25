// Match rules for Pulse Tag. Runs in the room creator's (robot player's) browser, which acts
// as the host for both players. No DOM or network here.

export const MATCH_MS = 180000;
export const CATCHES_TO_WIN = 3;
const ANT_SPAWNS = [{ x: 35.5, z: 15.5 }, { x: 39.5, z: 24.5 }, { x: 35.5, z: 24.5 }, { x: 39.5, z: 15.5 }];
const ROBOT_EYE = { x: 30.5, y: 15, z: 19.5 };

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function randomCode() {
  return Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
}

export function createRoomState(code, name, now = Date.now()) {
  const player = { id: newId(), name: String(name || 'player 1green').slice(0, 16), role: 'robot', color: '#60f5c3', slot: 0, connected: true };
  return {
    code, players: [player], score: [0, 0], status: 'waiting', winner: null, endAt: 0, createdAt: now, lastCatchAt: 0, antMoveAt: now, event: null,
    robot: { ...ROBOT_EYE, yaw: -Math.PI / 2, pitch: -0.45, active: 1, pressing: false, hands: [{ x: 35, y: 10, z: 18, tipX: 35, tipY: 9, tipZ: 18 }, { x: 35, y: 10, z: 21, tipX: 35, tipY: 9, tipZ: 21 }] },
    objects: [
      { x: 37, y: 9, z: 19.5, w: 4, d: 6, h: 4.4, held: false },
      { x: 34.5, y: 9, z: 24.5, w: 1.2, d: 1.2, h: 1.6, held: false },
    ],
    ant: { ...ANT_SPAWNS[0], angle: 0 },
  };
}

// Adds the ant player and starts the match. Returns { player } or { error }.
export function joinRoomState(room, name, now = Date.now()) {
  if (room.players.length >= 2) return { error: 'This room already has two players.' };
  const player = { id: newId(), name: String(name || 'player 1red').slice(0, 16), role: 'ant', color: '#ff4d6d', slot: 1, connected: true };
  room.players.push(player);
  room.status = 'playing';
  room.endAt = now + MATCH_MS;
  room.antMoveAt = now;
  return { player };
}

export const findPlayer = (room, id) => room.players.find((p) => p.id === id);

export function clean(room, now = Date.now()) {
  return {
    code: room.code, status: room.status, score: room.score,
    timeLeft: room.status === 'playing' ? Math.max(0, Math.ceil((room.endAt - now) / 1000)) : MATCH_MS / 1000,
    winner: room.winner,
    players: room.players.map((p) => ({ id: p.id, name: p.name, role: p.role, slot: p.slot, color: p.color, connected: p.connected })),
    robot: room.robot, ant: room.ant, objects: room.objects, event: room.event,
  };
}

// Ends the match when time runs out, then returns the shareable state
export function tick(room, now = Date.now()) {
  if (room.status === 'playing' && now >= room.endAt) {
    room.status = 'ended';
    room.winner = room.players[1].name;
    room.event = { type: 'escape', at: now };
  }
  return clean(room, now);
}

function antBlocked(room, x, z) {
  return room.objects.some((o) => Math.abs(x - o.x) < o.w / 2 + 0.35 && Math.abs(z - o.z) < o.d / 2 + 0.35);
}

function respawnAnt(room) {
  const spawn = ANT_SPAWNS[(room.score[0] - 1) % ANT_SPAWNS.length];
  room.ant = { x: spawn.x, z: spawn.z, angle: Math.random() * Math.PI * 2 };
}

function catchAnt(room, now) {
  room.score[0]++;
  room.event = { type: 'caught', at: now, score: room.score[0] };
  if (room.score[0] >= CATCHES_TO_WIN) {
    room.status = 'ended';
    room.winner = room.players[0].name;
  } else respawnAnt(room);
}

const num = (v) => Number.isFinite(Number(v));

// Applies one player's update. The robot reports its arms and objects; the ant reports where it
// wants to be, and is limited to a believable speed, the desk and the space around objects.
export function updatePlayer(room, player, data, now = Date.now()) {
  if (!player || room.status !== 'playing') return;
  if (player.slot === 0 && data.robot && typeof data.robot === 'object') {
    const { yaw, pitch, active, pressing } = data.robot;
    if (num(yaw)) room.robot.yaw = Number(yaw);
    if (num(pitch)) room.robot.pitch = Math.max(-1.25, Math.min(0.6, Number(pitch)));
    if (num(active)) room.robot.active = Number(active) === 0 ? 0 : 1;
    room.robot.pressing = Boolean(pressing);
    if (Array.isArray(data.robot.hands)) room.robot.hands = data.robot.hands.slice(0, 2).map((h, i) => {
      if (![h?.x, h?.y, h?.z, h?.tipX, h?.tipY, h?.tipZ].every(num)) return room.robot.hands[i];
      return { x: Number(h.x), y: Number(h.y), z: Number(h.z), tipX: Number(h.tipX), tipY: Number(h.tipY), tipZ: Number(h.tipZ) };
    });
    if (Array.isArray(data.robot.objects)) room.objects = data.robot.objects.slice(0, 2).map((o, i) => {
      if (![o?.x, o?.y, o?.z, o?.w, o?.d, o?.h].every(num)) return room.objects[i];
      return { x: Number(o.x), y: Number(o.y), z: Number(o.z), w: Number(o.w), d: Number(o.d), h: Number(o.h), held: Boolean(o.held) };
    });
    const objectHit = room.objects.some((o) => {
      const moving = o.held || o.y > 9.08;
      const overlapsAnt = Math.abs(o.x - room.ant.x) < o.w / 2 + 0.28 && Math.abs(o.z - room.ant.z) < o.d / 2 + 0.28;
      const overlapsHeight = o.y <= 9.25 && o.y + o.h >= 9.0;
      return moving && overlapsAnt && overlapsHeight;
    });
    if (objectHit && now - room.lastCatchAt > 1100) {
      room.lastCatchAt = now;
      catchAnt(room, now);
    }
  } else if (player.slot === 1 && data.ant && typeof data.ant === 'object') {
    const x = Number(data.ant.x), z = Number(data.ant.z), angle = Number(data.ant.angle);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const dt = Math.max(0.02, Math.min(0.35, (now - room.antMoveAt) / 1000));
    const dx = x - room.ant.x, dz = z - room.ant.z, distance = Math.hypot(dx, dz), limit = 7 * dt + 0.18;
    const scale = distance > limit ? limit / distance : 1;
    const nextX = Math.max(33.35, Math.min(40.65, room.ant.x + dx * scale));
    const nextZ = Math.max(13.35, Math.min(26.65, room.ant.z + dz * scale));
    if (!antBlocked(room, nextX, nextZ)) { room.ant.x = nextX; room.ant.z = nextZ; }
    else if (!antBlocked(room, nextX, room.ant.z)) room.ant.x = nextX;
    else if (!antBlocked(room, room.ant.x, nextZ)) room.ant.z = nextZ;
    if (Number.isFinite(angle)) room.ant.angle = angle;
    room.antMoveAt = now;
  }
}
