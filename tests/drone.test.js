import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { Drone } from '../src/drone.js';

const run = (keys, secs = 2, ground = () => 0) => {
  const d = new Drone(new Vector3(0, 50, 0));
  for (let i = 0; i < secs * 60; i++) d.update(1 / 60, new Set(keys), ground);
  return d;
};

describe('drone (mode 2)', () => {
  it('hovers with no input', () => {
    const d = run([]);
    expect(d.pos.y).toBe(50);
    expect(d.pos.length()).toBeCloseTo(50);
  });
  it('W climbs, S descends', () => {
    expect(run(['KeyW']).pos.y).toBeGreaterThan(55);
    expect(run(['KeyS']).pos.y).toBeLessThan(45);
  });
  it('A/D yaw left/right', () => {
    expect(run(['KeyA']).yaw).toBeGreaterThan(0);
    expect(run(['KeyD']).yaw).toBeLessThan(0);
  });
  it('Up pitches forward (-z), Right rolls right (+x)', () => {
    expect(run(['ArrowUp']).pos.z).toBeLessThan(-5);
    expect(run(['ArrowDown']).pos.z).toBeGreaterThan(5);
    expect(run(['ArrowRight']).pos.x).toBeGreaterThan(5);
    expect(run(['ArrowLeft']).pos.x).toBeLessThan(-5);
  });
  it('auto-levels when released', () => {
    const d = run(['ArrowUp']);
    for (let i = 0; i < 120; i++) d.update(1 / 60, new Set(), () => 0);
    expect(Math.abs(d.pitch)).toBeLessThan(0.01);
  });
  it('cannot go below ground', () => {
    expect(run(['KeyS'], 5, () => 48).pos.y).toBeCloseTo(49.5);
  });
});
