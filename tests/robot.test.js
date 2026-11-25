import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { solveArm, clampSide, L1, L2, MAX_REACH, DROP_SIDE, PICK_SIDE } from '../src/robot.js';
import { makeMug, makeLaptop } from '../src/items.js';
import { ROBOT_EYE } from '../src/room.js';

const S = new Vector3(0, 10, 0);
const pole = new Vector3(0, -1, 0);

describe('arm IK', () => {
  it('reaches a target within range exactly, keeping bone lengths', () => {
    const T = new Vector3(4, 6, -3);
    const { elbow, hand, foreLen } = solveArm(S, T, pole);
    expect(hand.distanceTo(T)).toBeLessThan(1e-6);
    expect(elbow.distanceTo(S)).toBeCloseTo(L1);
    expect(hand.distanceTo(elbow)).toBeCloseTo(L2);
    expect(foreLen).toBe(L2);
  });
  it('telescopes the forearm to reach past normal arm length', () => {
    const T = new Vector3(8, 0, -6); // ~14 away
    const { elbow, hand, foreLen } = solveArm(S, T, pole);
    expect(hand.distanceTo(T)).toBeLessThan(1e-6);
    expect(elbow.distanceTo(S)).toBeCloseTo(L1);
    expect(foreLen).toBeCloseTo(T.distanceTo(S) - L1);
    expect(foreLen).toBeGreaterThan(L2);
  });
  it('does not telescope at shoulder height: clamps to normal arm length', () => {
    const { hand, foreLen } = solveArm(S, new Vector3(30, 10, 0), pole);
    expect(hand.distanceTo(S)).toBeCloseTo(L1 + L2, 1);
    expect(hand.y).toBeCloseTo(10);
    expect(foreLen).toBeLessThanOrEqual(L2);
  });
  it('clamps a far downward target to MAX_REACH in the same direction', () => {
    const T = new Vector3(0, -30, 5);
    const { hand } = solveArm(S, T, pole);
    expect(hand.distanceTo(S)).toBeCloseTo(MAX_REACH);
    expect(hand.clone().sub(S).normalize().distanceTo(T.clone().sub(S).normalize())).toBeLessThan(1e-6);
  });
  it('bends the elbow towards the pole', () => {
    const { elbow } = solveArm(S, new Vector3(6, 10, 0), pole);
    expect(elbow.y).toBeLessThan(10);
  });
});

describe('floor reach', () => {
  it('clampSide limits horizontal distance and keeps height', () => {
    const T = clampSide(S, new Vector3(20, 3, 0), DROP_SIDE);
    expect(Math.hypot(T.x - S.x, T.z - S.z)).toBeCloseTo(DROP_SIDE);
    expect(T.y).toBe(3);
  });
  it('items can be dropped no further than they can be picked up, with room to slide off an edge', () => {
    expect(PICK_SIDE - DROP_SIDE).toBeGreaterThanOrEqual(Math.max(makeLaptop().d, makeMug().d) / 2 + 0.5);
  });
  it('either arm, at any turn angle, reaches any floor item within PICK_SIDE', () => {
    const C = ROBOT_EYE;
    for (const it of [makeMug(), makeLaptop()]) {
      for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
        const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        for (const side of [-1, 1]) {
          const shoulder = C.clone().addScaledVector(right, side * 2.6).addScaledVector(forward, 0.2).add(new Vector3(0, -2.6, 0));
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) for (let r = 0; r <= PICK_SIDE; r += 1.5) {
            const T = new Vector3(C.x + Math.cos(a) * r, 1 + it.h + 0.4, C.z + Math.sin(a) * r);
            const { hand } = solveArm(shoulder, T, pole);
            expect(hand.distanceTo(T)).toBeLessThan(1e-6);
          }
        }
      }
    }
  });
});
