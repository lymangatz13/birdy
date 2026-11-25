import { describe, it, expect } from 'vitest';
import { buildRoom, buildGeometry, solidAt, ROBOT_EYE, SX, SY, SZ, GLASS } from '../src/room.js';

const g = buildRoom();
const solid = (x, y, z) => solidAt(g, x, y, z);

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
  it('window glass is solid', () => {
    expect(g[(41 * SY + 14) * SZ + 15]).toBe(GLASS);
    expect(solid(41, 14, 15)).toBe(true);
  });
  it('robot spot in front of the desk is clear floor to eye height', () => {
    for (let y = 1; y <= ROBOT_EYE.y; y++)
      for (const [dx, dz] of [[-1, -2], [-1, 2], [0, 0], [0, -2], [0, 2]])
        expect(solid(ROBOT_EYE.x + dx, y, ROBOT_EYE.z + dz)).toBe(false);
  });
  it('desk top is clear for movable items', () => {
    expect(solid(36, 8, 20)).toBe(true);
    expect(solid(36, 9, 20)).toBe(false);
    expect(solid(34, 9, 24)).toBe(false);
  });
});
