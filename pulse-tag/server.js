const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 4173);
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const ANT_SPAWNS = [{ x: 35.5, z: 15.5 }, { x: 39.5, z: 24.5 }, { x: 35.5, z: 24.5 }, { x: 39.5, z: 15.5 }];
const ROBOT_EYE = { x: 30.5, y: 15, z: 19.5 };
function antBlocked(room, x, z) {
  return room.objects.some((object) => Math.abs(x - object.x) < object.w / 2 + 0.35 && Math.abs(z - object.z) < object.d / 2 + 0.35);
}

function clean(room) {
  return {
    code: room.code, status: room.status, score: room.score, timeLeft: room.status === 'playing' ? Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000)) : 180,
    winner: room.winner, players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role, slot: p.slot, color: p.color, connected: p.connected })),
    robot: room.robot, ant: room.ant, objects: room.objects, event: room.event
  };
}
function tick(room) {
  if (room.status === 'playing' && Date.now() >= room.endAt) {
    room.status = 'ended';
    room.winner = room.players[1].name;
    room.event = { type: 'escape', at: Date.now() };
  }
  return clean(room);
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function body(req) {
  return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } }); });
}
function respawnAnt(room) {
  const spawn = ANT_SPAWNS[(room.score[0] - 1) % ANT_SPAWNS.length];
  room.ant = { x: spawn.x, z: spawn.z, angle: Math.random() * Math.PI * 2 };
}
function catchAnt(room) {
  room.score[0]++;
  room.event = { type: 'caught', at: Date.now(), score: room.score[0] };
  if (room.score[0] >= 3) {
    room.status = 'ended';
    room.winner = room.players[0].name;
  } else respawnAnt(room);
}
function updatePlayer(room, player, data) {
  if (room.status !== 'playing') return;
  if (player.slot === 0 && data.robot && typeof data.robot === 'object') {
    const { yaw, pitch, active, pressing, tip } = data.robot;
    if (Number.isFinite(Number(yaw))) room.robot.yaw = Number(yaw);
    if (Number.isFinite(Number(pitch))) room.robot.pitch = Math.max(-1.25, Math.min(0.6, Number(pitch)));
    if (Number.isFinite(Number(active))) room.robot.active = Number(active) === 0 ? 0 : 1;
    room.robot.pressing = Boolean(pressing);
    if (Array.isArray(data.robot.hands)) room.robot.hands = data.robot.hands.slice(0, 2).map((h, i) => {
      if (![h?.x, h?.y, h?.z, h?.tipX, h?.tipY, h?.tipZ].every(v => Number.isFinite(Number(v)))) return room.robot.hands[i];
      return { x: Number(h.x), y: Number(h.y), z: Number(h.z), tipX: Number(h.tipX), tipY: Number(h.tipY), tipZ: Number(h.tipZ) };
    });
    if (Array.isArray(data.robot.objects)) room.objects = data.robot.objects.slice(0, 2).map((object, i) => {
      if (![object?.x, object?.y, object?.z, object?.w, object?.d, object?.h].every(v => Number.isFinite(Number(v)))) return room.objects[i];
      return { x: Number(object.x), y: Number(object.y), z: Number(object.z), w: Number(object.w), d: Number(object.d), h: Number(object.h), held: Boolean(object.held) };
    });
    const objectHit = room.objects.some((object) => {
      const isActive = object.held || object.y > 9.08;
      const overlapsAnt = Math.abs(object.x - room.ant.x) < object.w / 2 + 0.28 && Math.abs(object.z - room.ant.z) < object.d / 2 + 0.28;
      const overlapsHeight = object.y <= 9.25 && object.y + object.h >= 9.0;
      return isActive && overlapsAnt && overlapsHeight;
    });
    if (objectHit && Date.now() - room.lastCatchAt > 1100) {
      room.lastCatchAt = Date.now();
      catchAnt(room);
    }
  } else if (player.slot === 1 && data.ant && typeof data.ant === 'object') {
    const x = Number(data.ant.x), z = Number(data.ant.z), angle = Number(data.ant.angle);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const now = Date.now(), dt = Math.max(0.02, Math.min(0.35, (now - room.antMoveAt) / 1000));
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const data = await body(req);
      let code;
      do { code = crypto.randomBytes(2).toString('hex').toUpperCase(); } while (rooms.has(code));
      const player = { id: crypto.randomUUID(), name: String(data.name || 'player 1green').slice(0, 16), role: 'robot', color: '#60f5c3', slot: 0, connected: true };
      const room = {
        code, players: [player], score: [0, 0], status: 'waiting', winner: null, endAt: 0, createdAt: Date.now(), lastCatchAt: 0, antMoveAt: Date.now(), event: null,
        robot: { ...ROBOT_EYE, yaw: -Math.PI / 2, pitch: -0.45, active: 1, pressing: false, hands: [{ x: 35, y: 10, z: 18, tipX: 35, tipY: 9, tipZ: 18 }, { x: 35, y: 10, z: 21, tipX: 35, tipY: 9, tipZ: 21 }] },
        objects: [
          { x: 37, y: 9, z: 19.5, w: 4, d: 6, h: 4.4, held: false },
          { x: 34.5, y: 9, z: 24.5, w: 1.2, d: 1.2, h: 1.6, held: false }
        ],
        ant: { ...ANT_SPAWNS[0], angle: 0 }
      };
      rooms.set(code, room);
      return send(res, 201, { playerId: player.id, state: clean(room) });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/rooms/')) {
      const code = url.pathname.split('/')[3]?.toUpperCase();
      const room = rooms.get(code); if (!room) return send(res, 404, { error: 'Room not found. Check the code and try again.' });
      const data = await body(req);
      if (url.pathname.endsWith('/join')) {
        if (room.players.length >= 2) return send(res, 409, { error: 'This room already has two players.' });
        const player = { id: crypto.randomUUID(), name: String(data.name || 'player 1red').slice(0, 16), role: 'ant', color: '#ff4d6d', slot: 1, connected: true };
        room.players.push(player); room.status = 'playing'; room.endAt = Date.now() + 180000; room.antMoveAt = Date.now();
        return send(res, 200, { playerId: player.id, state: clean(room) });
      }
      const player = room.players.find(p => p.id === data.playerId);
      if (!player) return send(res, 403, { error: 'Player session not found.' });
      if (url.pathname.endsWith('/move')) updatePlayer(room, player, data);
      return send(res, 200, { state: tick(room) });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/rooms/')) {
      const code = url.pathname.split('/')[3]?.toUpperCase();
      const room = rooms.get(code); if (!room) return send(res, 404, { error: 'Room not found.' });
      return send(res, 200, { state: tick(room) });
    }
    const filePath = path.normalize(path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(filePath, (error, file) => {
      if (error) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(file);
    });
  } catch { send(res, 400, { error: 'Could not process that request.' }); }
});

setInterval(() => {
  for (const [code, room] of rooms) if (room.status === 'ended' && Date.now() - (room.endAt || Date.now()) > 600000) rooms.delete(code);
}, 60000).unref();
server.listen(PORT, '0.0.0.0', () => console.log(`Pulse Tag ready at http://localhost:${PORT}`));
