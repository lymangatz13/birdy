import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { solveArm, L1, L2 } from '../src/robot.js';

const S = new Vector3(0, 10, 0);
const pole = new Vector3(0, -1, 0);

describe('arm IK', () => {
  it('reaches a target within range exactly, keeping bone lengths', () => {
    const T = new Vector3(4, 6, -3);
    const { elbow, hand } = solveArm(S, T, pole);
    expect(hand.distanceTo(T)).toBeLessThan(1e-6);
    expect(elbow.distanceTo(S)).toBeCloseTo(L1);
    expect(hand.distanceTo(elbow)).toBeCloseTo(L2);
  });
  it('clamps an out-of-range target to full arm length in the same direction', () => {
    const T = new Vector3(30, 10, 0);
    const { hand } = solveArm(S, T, pole);
    expect(hand.distanceTo(S)).toBeCloseTo(L1 + L2, 1);
    expect(hand.y).toBeCloseTo(10);
    expect(hand.x).toBeGreaterThan(9.9);
  });
  it('bends the elbow towards the pole', () => {
    const { elbow } = solveArm(S, new Vector3(6, 10, 0), pole);
    expect(elbow.y).toBeLessThan(10);
  });
});
