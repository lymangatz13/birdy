import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { Colony, ANT_COUNT, MIN_SPEED, MAX_SPEED } from '../src/ants.js';
import { DESK, buildRoom, solidAt } from '../src/room.js';
import { makeMug, makeLaptop } from '../src/items.js';

const g = buildRoom();
const onDesk = (a) => a.x > DESK.x0 && a.x < DESK.x1 && a.z > DESK.z0 && a.z < DESK.z1;
const under = (a, it) => Math.abs(a.x - it.pos.x) < it.w / 2 && Math.abs(a.z - it.pos.z) < it.d / 2;
const run = (colony, secs, items = [], grippers = []) => {
  let squished = 0;
  for (let i = 0; i < secs * 60; i++) squished += colony.step(1 / 60, items, grippers);
  return squished;
};

describe('ants', () => {
  it('there are 100 ants with random speeds in range', () => {
    const c = new Colony();
    expect(c.ants.length).toBe(ANT_COUNT);
    expect(ANT_COUNT).toBe(100);
    for (const a of c.ants) {
      expect(a.speed).toBeGreaterThanOrEqual(MIN_SPEED);
      expect(a.speed).toBeLessThanOrEqual(MAX_SPEED);
    }
    expect(new Set(c.ants.map((a) => a.speed)).size).toBeGreaterThan(90);
  });
  it('desk bounds match the desk in the room', () => {
    expect(solidAt(g, DESK.x0, DESK.top - 1, DESK.z0)).toBe(true);
    expect(solidAt(g, DESK.x1 - 1, DESK.top - 1, DESK.z1 - 1)).toBe(true);
    expect(solidAt(g, DESK.x0 + 3, DESK.top, DESK.z0 + 3)).toBe(false);
  });
  it('ants move and always stay on the desk', () => {
    const c = new Colony();
    const start = c.ants.map((a) => [a.x, a.z]);
    for (let s = 0; s < 20; s++) {
      run(c, 1);
      for (const a of c.ants) expect(onDesk(a)).toBe(true);
    }
    const moved = c.ants.filter((a, i) => Math.hypot(a.x - start[i][0], a.z - start[i][1]) > 0.5).length;
    expect(moved).toBeGreaterThan(80);
  });
  it('ants walk around items resting on the desk', () => {
    const items = [makeLaptop().place(37, 9, 19.5), makeMug().place(34.5, 9, 24.5)];
    const c = new Colony(100, items);
    for (let s = 0; s < 20; s++) {
      expect(run(c, 1, items)).toBe(0);
      for (const a of c.ants) for (const it of items) expect(under(a, it)).toBe(false);
    }
  });
  it('an item put down on ants squishes them and new ants keep the count at 100', () => {
    const c = new Colony();
    const laptop = makeLaptop().place(37, 9, 19.5); // dropped onto the desk after the ants spawned
    const below = c.ants.filter((a) => under(a, laptop)).length;
    expect(below).toBeGreaterThan(0);
    expect(c.step(1 / 60, [laptop])).toBe(below);
    expect(c.ants.length).toBe(100);
    for (const a of c.ants) expect(under(a, laptop)).toBe(false);
  });
  it('a held item above the desk does not squish or block ants', () => {
    const c = new Colony();
    const mug = makeMug().place(36, 9, 20);
    mug.held = {};
    expect(run(c, 2, [mug])).toBe(0);
  });
  it('a gripper touching the desk squishes the ant under it', () => {
    const c = new Colony(1);
    const a = c.ants[0];
    a.x = 36; a.z = 20; a.speed = 0;
    const gripper = { hand: new Vector3(36, 10.2, 20), tip: new Vector3(36, 9.05, 20) };
    expect(c.step(1 / 60, [], [gripper])).toBe(1);
    expect(c.ants.length).toBe(1);
    expect(onDesk(c.ants[0])).toBe(true);
  });
  it('a gripper hovering with fingers pointing down does not squish', () => {
    const c = new Colony(1);
    const a = c.ants[0];
    a.x = 36; a.z = 20; a.speed = 0;
    const gripper = { hand: new Vector3(36, 10.3, 20), tip: new Vector3(36, 9.15, 20) };
    expect(c.step(1 / 60, [], [gripper])).toBe(0);
  });
  it('a palm pressed onto the desk squishes the ant under it', () => {
    const c = new Colony(1);
    const a = c.ants[0];
    a.x = 36; a.z = 20; a.speed = 0;
    const gripper = { hand: new Vector3(36.2, 9.5, 20), tip: new Vector3(37.3, 9.3, 20) };
    expect(c.step(1 / 60, [], [gripper])).toBe(1);
  });
  it('a gripper down at the floor under the desk does not squish ants on the desk', () => {
    const c = new Colony(1);
    const a = c.ants[0];
    a.x = 36; a.z = 20; a.speed = 0;
    const gripper = { hand: new Vector3(36, 2.3, 20), tip: new Vector3(36, 1.15, 20) };
    expect(c.step(1 / 60, [], [gripper])).toBe(0);
  });
  it('a gripper held above the desk does not squish', () => {
    const c = new Colony(1);
    const a = c.ants[0];
    a.x = 36; a.z = 20; a.speed = 0;
    const gripper = { hand: new Vector3(36, 12, 20), tip: new Vector3(36, 10.9, 20) };
    expect(c.step(1 / 60, [], [gripper])).toBe(0);
  });
});
