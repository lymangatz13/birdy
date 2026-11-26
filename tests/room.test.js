import { describe, it, expect } from 'vitest';
import { buildRoom, buildGeometry, solidAt, SX, SY, SZ, GLASS, DESK, BEAN, BEAN_LEAVES, beanCenter, ceilingAt, GIANT_START, JACK_START } from '../src/room.js';
import { jackBlocked, JACK } from '../src/jack.js';
import { giantBlocked } from '../src/giant.js';
import { deskItems } from '../src/items.js';

const g = buildRoom();
const solid = (x, y, z) => solidAt(g, x, y, z);

describe('room', () => {
  it('builds a non-empty mesh', () => {
    expect(buildGeometry(g).getAttribute('position').count).toBeGreaterThan(0);
  });
  it('is enclosed: walls, floor and ceiling are solid', () => {
    expect(solid(-1, 5, 5)).toBe(true);
    expect(solid(SX, 5, 5)).toBe(true);
    expect(solid(5, 5, SZ)).toBe(true);
    expect(solid(20, 0, 20)).toBe(true);      // floor
    expect(solid(10, SY - 1, 45)).toBe(true); // ceiling
  });
  it('window glass is solid', () => {
    expect(g[(57 * SY + 15) * SZ + 28]).toBe(GLASS);
    expect(solid(57, 15, 28)).toBe(true);
  });
  it('the ceiling slopes down towards the north wall', () => {
    expect(ceilingAt(1)).toBe(14);
    expect(solid(45, ceilingAt(5) + 1, 5)).toBe(true);
    expect(solid(45, ceilingAt(5), 5)).toBe(false);
  });
  it('the beanstalk grows from the floor through a hole in the ceiling', () => {
    for (const y of [1, 10, 20, SY - 2]) {
      const c = beanCenter(y);
      expect(solid(c.x, y, c.z)).toBe(true);
    }
    const top = beanCenter(SY - 1);
    const holeOpen = [[BEAN.radius + 1, 0], [-BEAN.radius - 1, 0], [0, BEAN.radius + 1], [0, -BEAN.radius - 1]]
      .filter(([dx, dz]) => !solid(top.x + dx, SY - 1, top.z + dz)).length;
    expect(holeOpen).toBeGreaterThanOrEqual(3);
  });
  it('the desk top is clear for the laptop and mug', () => {
    for (const item of deskItems(DESK)) {
      const b = item.box;
      for (let x = Math.floor(b.x0); x < b.x1; x++) for (let z = Math.floor(b.z0); z < b.z1; z++) {
        expect(solid(x, DESK.top - 1, z)).toBe(true);
        expect(solid(x, DESK.top, z)).toBe(false);
      }
    }
  });
  it('both players start in open space', () => {
    expect(giantBlocked(GIANT_START.x, GIANT_START.z, false, solid)).toBe(false);
    expect(jackBlocked(JACK_START.x, JACK_START.y, JACK_START.z, solid, deskItems(DESK).map((i) => i.box))).toBe(false);
    expect(jackBlocked(JACK_START.x, JACK_START.y - 0.05, JACK_START.z, solid)).toBe(true); // standing on the desk
  });
  it('there is room to hide under the bed', () => {
    expect(jackBlocked(48.5, 1, 41.5, solid)).toBe(false);
    expect(solid(48, 3, 41)).toBe(true);
  });

  // Every spot Jack can stand on, and which ones he can get to by walking, stepping up, jumping
  // (up to 3 voxels up, up to 2 across) and dropping down
  it('Jack can climb from the floor to the top leaf of the beanstalk and onto the bed and desk', () => {
    const fits = (x, y, z) => !jackBlocked(x + 0.5, y, z + 0.5, solid);
    const stands = (x, y, z) => solid(x, y - 1, z) && fits(x, y, z);
    const key = (x, y, z) => `${x},${y},${z}`;
    const start = [10, 1, 45];
    expect(stands(...start)).toBe(true);
    const seen = new Set([key(...start)]), queue = [start];
    while (queue.length) {
      const [x, y, z] = queue.shift();
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (!dx && !dz) continue;
        const far = Math.abs(dx) > 1 || Math.abs(dz) > 1;
        for (let ny = y + 3; ny >= 1; ny--) {
          if (ny > y && !fits(x, ny, z)) continue; // headroom to jump
          const nx = x + dx, nz = z + dz;
          if (!stands(nx, ny, nz)) continue;
          if (far && ny < y - 4) continue;
          const k = key(nx, ny, nz);
          if (!seen.has(k)) { seen.add(k); queue.push([nx, ny, nz]); }
          break;
        }
      }
    }
    const reached = (test) => [...seen].some((k) => test(...k.split(',').map(Number)));
    const [topY] = BEAN_LEAVES[BEAN_LEAVES.length - 1];
    expect(reached((x, y) => y === topY + 1)).toBe(true);
    expect(reached((x, y, z) => y === DESK.top && x >= DESK.x0 && x < DESK.x1 && z < DESK.z1)).toBe(true);
    expect(reached((x, y, z) => y >= 7 && y <= 9 && x > 41 && x < 50 && z > 37 && z < 46)).toBe(true); // on the bed
    expect(JACK.jumpSpeed ** 2 / (2 * JACK.gravity)).toBeGreaterThan(3.3);
  });
});
