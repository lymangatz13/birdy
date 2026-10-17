import { describe, it, expect } from 'vitest';
import { hours, sunDir, DAY_SECONDS } from '../src/sky.js';

describe('sky', () => {
  it('starts at 06:00 and wraps after a day', () => {
    expect(hours(0)).toBe(6);
    expect(hours(DAY_SECONDS / 4)).toBeCloseTo(12);
    expect(hours(DAY_SECONDS)).toBeCloseTo(6);
  });
  it('sun at horizon 6/18, up at noon, down at midnight', () => {
    expect(sunDir(6).y).toBeCloseTo(0);
    expect(sunDir(18).y).toBeCloseTo(0);
    expect(sunDir(12).y).toBeGreaterThan(0.9);
    expect(sunDir(0).y).toBeLessThan(-0.9);
    expect(sunDir(6).x).toBeGreaterThan(0);
    expect(sunDir(18).x).toBeLessThan(0);
  });
});
