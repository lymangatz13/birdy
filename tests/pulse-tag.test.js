import { describe, it, expect } from 'vitest';
import {
  createRoomState, joinRoomState, updatePlayer, requestRematch, respawnAnt, tick, findPlayer, randomCode, MATCH_MS, CATCHES_TO_WIN, ANT_AREA,
} from '../src/roomlogic.js';

const T0 = 1_000_000;
const started = () => {
  const room = createRoomState('AB12', 'robo', T0);
  joinRoomState(room, 'anty', T0);
  return room;
};
const robotHits = (room, now) =>
  updatePlayer(room, room.players[0], { robot: { objects: [{ x: room.ant.x, y: 9.1, z: room.ant.z, w: 1.2, d: 1.2, h: 1.6, held: true }] } }, now);

describe('pulse tag room rules', () => {
  it('room codes are 4 hex characters', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^[0-9A-F]{4}$/);
  });
  it('creator is the robot; the room waits for a second player', () => {
    const room = createRoomState('AB12', 'robo', T0);
    expect(room.players[0].role).toBe('robot');
    expect(tick(room, T0).status).toBe('waiting');
  });
  it('joining makes the ant player, starts a 3 minute match, and a third player is refused', () => {
    const room = started();
    expect(room.players[1].role).toBe('ant');
    expect(tick(room, T0).timeLeft).toBe(MATCH_MS / 1000);
    expect(joinRoomState(room, 'third', T0).error).toMatch(/two players/);
  });
  it('the ant cannot move faster than allowed or leave the desk', () => {
    const room = started();
    const ant = room.players[1];
    const start = { ...room.ant };
    updatePlayer(room, ant, { ant: { x: start.x + 50, z: start.z, angle: 0 } }, T0 + 100);
    expect(room.ant.x - start.x).toBeLessThanOrEqual(7 * 0.1 + 0.18 + 1e-9);
    for (let i = 1; i <= 200; i++) updatePlayer(room, ant, { ant: { x: 100, z: 100, angle: 0 } }, T0 + 100 + i * 100);
    expect(room.ant.x).toBeLessThanOrEqual(40.65);
    expect(room.ant.z).toBeLessThanOrEqual(26.65);
  });
  it('a held object on the ant is a catch; three catches win for the robot', () => {
    const room = started();
    let now = T0;
    for (let i = 1; i <= CATCHES_TO_WIN; i++) {
      now += 2000;
      robotHits(room, now);
      expect(room.score[0]).toBe(i);
    }
    expect(room.status).toBe('ended');
    expect(room.winner).toBe('robo');
  });
  it('catches have a short cooldown', () => {
    const room = started();
    robotHits(room, T0 + 2000);
    robotHits(room, T0 + 2500);
    expect(room.score[0]).toBe(1);
  });
  it('the ant wins when time runs out', () => {
    const room = started();
    const state = tick(room, T0 + MATCH_MS);
    expect(state.status).toBe('ended');
    expect(state.winner).toBe('anty');
  });
  it('players cannot act for each other', () => {
    const room = started();
    const before = { ...room.ant };
    updatePlayer(room, room.players[0], { ant: { x: before.x + 0.5, z: before.z, angle: 0 } }, T0 + 100);
    expect(room.ant.x).toBe(before.x);
    expect(findPlayer(room, 'nope')).toBeUndefined();
  });
  it('default names are Robot and Ant', () => {
    const room = createRoomState('AB12', '', T0);
    joinRoomState(room, '', T0);
    expect(room.players.map((p) => p.name)).toEqual(['Robot', 'Ant']);
  });
  it('the winner is decided by role, so equal names cannot both win', () => {
    const room = createRoomState('AB12', 'Sam', T0);
    joinRoomState(room, 'Sam', T0);
    expect(tick(room, T0 + MATCH_MS).winnerRole).toBe('ant');
  });
  it('a rematch starts only when both players ask, and resets the match in the same room', () => {
    const room = started();
    let now = T0;
    for (let i = 0; i < CATCHES_TO_WIN; i++) { now += 2000; robotHits(room, now); }
    expect(room.status).toBe('ended');
    requestRematch(room, room.players[0], now + 100);
    expect(room.status).toBe('ended');
    expect(tick(room, now + 100).players[0].rematch).toBe(true);
    requestRematch(room, room.players[1], now + 200);
    const state = tick(room, now + 200);
    expect(state.status).toBe('playing');
    expect(state.code).toBe('AB12');
    expect(state.score).toEqual([0, 0]);
    expect(state.winnerRole).toBeNull();
    expect(state.timeLeft).toBe(MATCH_MS / 1000);
    expect(state.event.type).toBe('rematch');
    expect(state.players.every((p) => !p.rematch)).toBe(true);
  });
  it('no rematch while a match is running or after the rival has left', () => {
    const room = started();
    requestRematch(room, room.players[0], T0 + 10);
    expect(room.players[0].rematch).toBe(false);
    tick(room, T0 + MATCH_MS);
    room.players[1].connected = false;
    requestRematch(room, room.players[0], T0 + MATCH_MS + 10);
    requestRematch(room, room.players[1], T0 + MATCH_MS + 20);
    expect(room.status).toBe('ended');
  });
  it('the state carries the host sky clock so both players see the same time of day', () => {
    const room = createRoomState('AB12', 'robo', T0, 60);
    const state = tick(room, T0 + 5000);
    expect(state.createdAt).toBe(T0);
    expect(state.clock).toBe(T0 + 5000);
    expect(state.daySpeed).toBe(60);
  });
  it('the ant moves freely under a resting object, and a resting object does not catch it', () => {
    const room = started();
    const laptop = room.objects[0]; // resting on the desk at x 37, z 19.5, 4 x 6
    let now = T0;
    room.ant = { x: 34.5, z: 19.5, angle: 0 };
    for (let i = 0; i < 30; i++) { now += 100; updatePlayer(room, room.players[1], { ant: { x: 37, z: 19.5, angle: 0 } }, now); }
    expect(room.ant.x).toBeCloseTo(laptop.x);
    expect(room.ant.z).toBeCloseTo(laptop.z);
    now += 2000;
    updatePlayer(room, room.players[0], { robot: { objects: room.objects } }, now);
    expect(room.score[0]).toBe(0);
  });
  it('after a catch the ant respawns at a random spot on the desk, away from the catch and not under an object', () => {
    const spots = new Set();
    for (let i = 0; i < 20; i++) {
      const room = started();
      room.ant = { x: 36, z: 15, angle: 0 };
      robotHits(room, T0 + 2000);
      expect(room.score[0]).toBe(1);
      const { x, z } = room.ant;
      expect(x).toBeGreaterThanOrEqual(ANT_AREA.x0); expect(x).toBeLessThanOrEqual(ANT_AREA.x1);
      expect(z).toBeGreaterThanOrEqual(ANT_AREA.z0); expect(z).toBeLessThanOrEqual(ANT_AREA.z1);
      expect(Math.hypot(x - 36, z - 15)).toBeGreaterThanOrEqual(3);
      for (const o of room.objects) expect(Math.abs(x - o.x) < o.w / 2 + 0.35 && Math.abs(z - o.z) < o.d / 2 + 0.35).toBe(false);
      spots.add(`${x.toFixed(2)},${z.toFixed(2)}`);
    }
    expect(spots.size).toBeGreaterThan(15);
  });
  it('respawn uses the given random source', () => {
    const room = started();
    room.ant = { x: 40, z: 26, angle: 0 };
    respawnAnt(room, () => 0);
    expect(room.ant.x).toBeCloseTo(ANT_AREA.x0);
    expect(room.ant.z).toBeCloseTo(ANT_AREA.z0);
  });
});
