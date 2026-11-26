import { describe, it, expect } from 'vitest';
import {
  createRoomState, joinRoomState, updatePlayer, requestRematch, tick, findPlayer, randomCode, inGrabRange,
  MATCH_MS, HOLD_MS, STRUGGLE_TO_ESCAPE, FREE_MS, JACK_AREA,
} from '../src/roomlogic.js';

const T0 = 1_000_000;
const started = () => {
  const room = createRoomState('AB12', 'big', T0);
  joinRoomState(room, 'tiny', T0);
  return room;
};
// Put the giant right next to Jack and grab
const grab = (room, now) => {
  updatePlayer(room, room.players[0], { giant: { x: room.jack.x + 3, z: room.jack.z, yaw: 0, grab: true, fist: { x: 5, y: 15, z: 5 } } }, now);
};
const struggle = (room, from, count, start) => {
  let now = start;
  for (let i = 1; i <= count; i++) { now += 100; updatePlayer(room, room.players[1], { jack: { presses: from + i } }, now); tick(room, now); }
  return now;
};

describe('match rules', () => {
  it('room codes are 4 hex characters', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^[0-9A-F]{4}$/);
  });
  it('the creator is the giant; the room waits for Jack', () => {
    const room = createRoomState('AB12', 'big', T0);
    expect(room.players[0].role).toBe('giant');
    expect(tick(room, T0).status).toBe('waiting');
  });
  it('joining plays Jack, starts a 3 minute match, and a third player is refused', () => {
    const room = started();
    expect(room.players[1].role).toBe('jack');
    expect(tick(room, T0).timeLeft).toBe(MATCH_MS / 1000);
    expect(joinRoomState(room, 'third', T0).error).toMatch(/two players/);
  });
  it('default names are Giant and Jack', () => {
    const room = createRoomState('AB12', '', T0);
    joinRoomState(room, '', T0);
    expect(room.players.map((p) => p.name)).toEqual(['Giant', 'Jack']);
  });
  it('Jack cannot move faster than allowed or leave the room', () => {
    const room = started();
    const jack = room.players[1];
    const start = { ...room.jack };
    updatePlayer(room, jack, { jack: { x: start.x + 50, y: start.y, z: start.z } }, T0 + 100);
    expect(room.jack.x - start.x).toBeLessThanOrEqual(7 * 1.25 * 0.1 + 0.3 + 1e-9);
    for (let i = 1; i <= 300; i++) updatePlayer(room, jack, { jack: { x: 100, y: 100, z: 100 } }, T0 + 100 + i * 100);
    expect(room.jack.x).toBe(JACK_AREA.x1);
    expect(room.jack.y).toBe(JACK_AREA.y1);
    expect(room.jack.z).toBe(JACK_AREA.z1);
  });
  it('the giant can only grab Jack within reach', () => {
    const room = started();
    expect(inGrabRange({ x: 0, z: 0 }, { x: 12, y: 1, z: 0 })).toBe(true);
    expect(inGrabRange({ x: 0, z: 0 }, { x: 13, y: 1, z: 0 })).toBe(false);
    updatePlayer(room, room.players[0], { giant: { x: room.jack.x + 20, z: room.jack.z, grab: true } }, T0 + 100);
    expect(room.hold).toBeNull();
    grab(room, T0 + 200);
    expect(room.hold).not.toBeNull();
    expect(room.event.type).toBe('grabbed');
  });
  it('a held Jack moves with the giant\'s fist and cannot run', () => {
    const room = started();
    grab(room, T0 + 100);
    expect(room.jack).toMatchObject({ x: 5, y: 15, z: 5 });
    updatePlayer(room, room.players[1], { jack: { x: 20, y: 1, z: 20 } }, T0 + 200);
    expect(room.jack).toMatchObject({ x: 5, y: 15, z: 5 });
  });
  it('holding Jack for 10 seconds wins for the giant', () => {
    const room = started();
    grab(room, T0 + 1000);
    expect(tick(room, T0 + 1000 + HOLD_MS - 100).status).toBe('playing');
    const state = tick(room, T0 + 1000 + HOLD_MS);
    expect(state.status).toBe('ended');
    expect(state.winnerRole).toBe('giant');
    expect(state.winner).toBe('big');
  });
  it('Jack wriggles free by mashing, resetting the hold, and cannot be grabbed again straight away', () => {
    const room = started();
    grab(room, T0 + 1000);
    updatePlayer(room, room.players[1], { jack: { presses: 0 } }, T0 + 1000);
    const now = struggle(room, 0, STRUGGLE_TO_ESCAPE + 15, T0 + 1000);
    expect(room.hold).toBeNull();
    expect(room.event.type).toBe('wriggle');
    expect(tick(room, now).free).toBe(true);
    grab(room, now + 100);
    expect(room.hold).toBeNull();
    grab(room, now + FREE_MS + 100);
    expect(room.hold).not.toBeNull();
  });
  it('struggle presses are rate limited, so a fake huge count does not free Jack', () => {
    const room = started();
    grab(room, T0 + 1000);
    updatePlayer(room, room.players[1], { jack: { presses: 0 } }, T0 + 1000);
    updatePlayer(room, room.players[1], { jack: { presses: 9999 } }, T0 + 1100);
    expect(room.hold).not.toBeNull();
  });
  it('Jack wins when time runs out', () => {
    const room = started();
    const state = tick(room, T0 + MATCH_MS);
    expect(state.status).toBe('ended');
    expect(state.winnerRole).toBe('jack');
    expect(state.winner).toBe('tiny');
  });
  it('the winner is decided by role, so equal names cannot both win', () => {
    const room = createRoomState('AB12', 'Sam', T0);
    joinRoomState(room, 'Sam', T0);
    expect(tick(room, T0 + MATCH_MS).winnerRole).toBe('jack');
  });
  it('players cannot act for each other', () => {
    const room = started();
    const before = { ...room.jack };
    updatePlayer(room, room.players[0], { jack: { x: before.x + 0.5, y: before.y, z: before.z } }, T0 + 100);
    expect(room.jack.x).toBe(before.x);
    updatePlayer(room, room.players[1], { giant: { x: 30, z: 30, grab: true } }, T0 + 100);
    expect(room.giant.x).not.toBe(30);
    expect(findPlayer(room, 'nope')).toBeUndefined();
  });
  it('a rematch starts only when both players ask, and resets the match in the same room', () => {
    const room = started();
    grab(room, T0 + 100);
    tick(room, T0 + 100 + HOLD_MS);
    expect(room.status).toBe('ended');
    requestRematch(room, room.players[0], T0 + 20000);
    expect(room.status).toBe('ended');
    requestRematch(room, room.players[1], T0 + 20100);
    const state = tick(room, T0 + 20100);
    expect(state.status).toBe('playing');
    expect(state.code).toBe('AB12');
    expect(state.hold).toBeNull();
    expect(state.winnerRole).toBeNull();
    expect(state.timeLeft).toBe(MATCH_MS / 1000);
    expect(state.event.type).toBe('rematch');
    expect(state.jack).toMatchObject({ x: 24.5, y: 9, z: 8 });
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
    const room = createRoomState('AB12', 'big', T0, 60);
    const state = tick(room, T0 + 5000);
    expect(state.createdAt).toBe(T0);
    expect(state.clock).toBe(T0 + 5000);
    expect(state.daySpeed).toBe(60);
  });
});
