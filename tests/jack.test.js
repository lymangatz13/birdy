import { describe, it, expect } from 'vitest';
import { stepJack, jackBlocked, JACK } from '../src/jack.js';

// A flat floor at y = 0 (top surface y = 1), a wall at x >= 10, and a 3-high box at x 5..6
const solidAt = (x, y, z) => y < 1 || x >= 10 || x < 0 || (x >= 5 && x < 7 && y < 4 && z >= 0 && z < 3);
const run = (s, move, jump, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) stepJack(s, move, jump && t === 0, 1 / 60, solidAt); return s; };

describe('Jack', () => {
  it('is 1/10 of the giant', () => expect(JACK.height).toBe(2));
  it('falls and lands on the floor', () => {
    const s = run({ x: 2, y: 6, z: 8, vy: 0, grounded: false }, { x: 0, z: 0 }, false, 2);
    expect(s.y).toBeCloseTo(1, 1);
    expect(s.grounded).toBe(true);
  });
  it('runs at his speed and stops at walls', () => {
    const s = run({ x: 1, y: 1, z: 8, vy: 0, grounded: true }, { x: 1, z: 0 }, false, 1);
    expect(s.x).toBeCloseTo(1 + JACK.speed, 0);
    run(s, { x: 1, z: 0 }, false, 2);
    expect(s.x).toBeLessThanOrEqual(10 - JACK.radius + 1e-6);
  });
  it('jumps about 3.6 voxels high', () => {
    const s = { x: 2, y: 1, z: 8, vy: 0, grounded: true };
    let top = 1;
    for (let t = 0; t < 1.5; t += 1 / 120) { stepJack(s, { x: 0, z: 0 }, t === 0, 1 / 120, solidAt); top = Math.max(top, s.y); }
    expect(top - 1).toBeGreaterThan(3.3);
    expect(top - 1).toBeLessThan(4);
  });
  it('jumps onto a box he cannot walk onto', () => {
    const s = run({ x: 3.5, y: 1, z: 1.5, vy: 0, grounded: true }, { x: 1, z: 0 }, false, 1);
    expect(s.x).toBeLessThan(5);
    s.x = 4.2;
    run(s, { x: 1, z: 0 }, true, 0.6);
    expect(s.y).toBeCloseTo(4, 1);
  });
  it('walks up one-voxel ledges but not two', () => {
    const ledge = (x, y, z) => y < 1 || (x >= 3 && y < 2) || (x >= 6 && y < 4);
    const s = { x: 1, y: 1, z: 1, vy: 0, grounded: true };
    for (let i = 0; i < 90; i++) stepJack(s, { x: 1, z: 0 }, false, 1 / 60, ledge);
    expect(s.x).toBeGreaterThan(3);
    expect(s.y).toBeCloseTo(2, 1);
    expect(s.x).toBeLessThan(6);
  });
  it('bumps into solid objects like the laptop', () => {
    const box = { x0: 4, x1: 6, y0: 1, y1: 2.5, z0: 0, z1: 20 };
    expect(jackBlocked(3.8, 1, 8, () => false, [box])).toBe(true);
    expect(jackBlocked(3.6, 1, 8, () => false, [box])).toBe(false);
  });
});
