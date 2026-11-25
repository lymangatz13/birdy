import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { buildRoom, buildGeometry, solidAt, START, SX, SY, SZ, GLASS } from '../src/room.js';
import { Drone, boxHits } from '../src/drone.js';

const g = buildRoom();
const solid = (x, y, z) => solidAt(g, x, y, z);
const ROOM_OPTS = { accel: 14, lift: 8, ceiling: Infinity, radius: 0.35 };
const fly = (keys, secs) => {
  const d = new Drone(START, ROOM_OPTS);
  for (let i = 0; i < secs * 60; i++) d.update(1 / 60, new Set(keys), null, solid);
  return d;
};

describe('room', () => {
  it('builds a non-empty mesh', () => {
    expect(buildGeometry(g).getAttribute('position').count).toBeGreaterThan(0);
  });
  it('is enclosed: outside and shell are solid', () => {
    expect(solid(-1, 5, 5)).toBe(true);
    expect(solid(SX, 5, 5)).toBe(true);
    expect(solid(5, SY, 5)).toBe(true);
    expect(solid(5, 5, SZ)).toBe(true);
    expect(solid(20, 0, 20)).toBe(true);      // floor
    expect(solid(20, SY - 1, 20)).toBe(true); // ceiling
  });
  it('window glass blocks the bird', () => {
    expect(g[(41 * SY + 14) * SZ + 15]).toBe(GLASS);
    expect(solid(41, 14, 15)).toBe(true);
  });
  it('bird starts in open air', () => {
    expect(boxHits(START, ROOM_OPTS.radius, solid)).toBe(false);
  });
  it('flying forward stops at the back wall', () => {
    const d = fly(['ArrowUp'], 15);
    expect(d.pos.z).toBeGreaterThan(1.3);
    expect(d.pos.z).toBeLessThan(3);
  });
  it('descending stops on the floor', () => {
    const d = new Drone(new Vector3(20.5, 10, 15), ROOM_OPTS);
    for (let i = 0; i < 600; i++) d.update(1 / 60, new Set(['KeyS']), null, solid);
    expect(d.pos.y).toBeGreaterThan(1.3);
    expect(d.pos.y).toBeLessThan(2);
  });
});
