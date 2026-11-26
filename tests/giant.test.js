import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stepGiant, giantBlocked, canStand, reachArm, GiantModel, GIANT, holdPoint } from '../src/giant.js';
import { buildRoom, giantSolidAt, GIANT_START, ceilingAt } from '../src/room.js';

const g = buildRoom();
const solid = (x, y, z) => giantSolidAt(g, x, y, z);

describe('giant', () => {
  it('walks forward in the direction it faces', () => {
    const s = { x: 20, z: 45, yaw: Math.PI / 2 }; // facing +x
    for (let i = 0; i < 30; i++) stepGiant(s, { forward: 1, strafe: 0 }, false, 1 / 60, solid);
    expect(s.x).toBeCloseTo(20 + GIANT.walk * 0.5, 0);
    expect(s.z).toBeCloseTo(45, 3);
  });
  it('steps sideways with strafe', () => {
    const s = { x: 20, z: 45, yaw: 0 }; // facing +z, right is -x
    for (let i = 0; i < 30; i++) stepGiant(s, { forward: 0, strafe: 1 }, false, 1 / 60, solid);
    expect(s.x).toBeLessThan(17);
  });
  it('cannot walk through the beanstalk or the walls', () => {
    const s = { x: 26, z: 45, yaw: Math.PI }; // facing -z, towards the beanstalk
    for (let i = 0; i < 300; i++) stepGiant(s, { forward: 1, strafe: 0 }, false, 1 / 60, solid);
    expect(giantBlocked(s.x, s.z, false, solid)).toBe(false);
    expect(s.z).toBeGreaterThan(30);
    const w = { x: 20, z: 45, yaw: -Math.PI / 2 };
    for (let i = 0; i < 600; i++) stepGiant(w, { forward: 1, strafe: 0 }, false, 1 / 60, solid);
    expect(w.x).toBeGreaterThanOrEqual(1 + GIANT.radius - 0.01);
  });
  it('brushes through beanstalk leaves, steps over the rug and has to crouch to go further under the sloped ceiling', () => {
    expect(giantBlocked(20, 25, false, solid)).toBe(false); // standing on the rug
    const z = 6; // ceiling here is lower than the giant
    expect(ceilingAt(z)).toBeLessThan(GIANT.height);
    expect(giantBlocked(53, z, false, solid)).toBe(true);
    expect(giantBlocked(53, z, true, solid)).toBe(false);
    expect(canStand({ x: GIANT_START.x, z: GIANT_START.z }, solid)).toBe(true);
  });
  it('the arm reaches a target within its length exactly', () => {
    const S = new THREE.Vector3(0, 15, 0), T = new THREE.Vector3(3, 9, 4);
    const { elbow, hand } = reachArm(S, T, new THREE.Vector3(1, 0, 0));
    expect(hand.distanceTo(T)).toBeLessThan(1e-6);
    expect(elbow.distanceTo(S)).toBeCloseTo(GIANT.upperArm);
    expect(elbow.distanceTo(hand)).toBeCloseTo(GIANT.foreArm);
  });
  it('the model is about 20 voxels tall and bends down to reach the floor', () => {
    const scene = new THREE.Scene();
    const model = new GiantModel(scene);
    model.update(1 / 60, { x: 10, z: 10, yaw: 0, speed: 0, crouch: false, reach: null });
    const box = new THREE.Box3().setFromObject(model.group);
    expect(box.max.y).toBeGreaterThan(18.5);
    expect(box.max.y).toBeLessThan(23);
    const target = new THREE.Vector3(10.5, 1.5, 16);
    for (let i = 0; i < 60; i++) model.update(1 / 60, { x: 10, z: 10, yaw: 0, speed: 0, crouch: true, reach: target });
    expect(model.handPos.distanceTo(target)).toBeLessThan(2.5);
  });
  it('holds Jack up in front of its face', () => {
    const p = holdPoint({ x: 10, z: 10, yaw: 0 }, false);
    expect(p.z).toBeGreaterThan(12);
    expect(p.y).toBeGreaterThan(12);
  });
});
