import { describe, it, expect } from 'vitest';
import {
  createRoomState, joinRoomState, updatePlayer, tick, findPlayer, randomCode, MATCH_MS, CATCHES_TO_WIN,
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
});
