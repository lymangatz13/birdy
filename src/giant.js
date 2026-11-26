import * as THREE from 'three';
import { SY } from './room.js';
export { GRAB_RANGE, inGrabRange } from './roomlogic.js';

// The giant: an ugly 3D figure built from a jointed skeleton (hips, spine, neck, head, shoulders,
// elbows, hips, knees). It walks on the floor with WASD, crouches, and reaches out to grab Jack.
export const GIANT = {
  height: 20,
  radius: 2.2,          // body radius for bumping into furniture
  walk: 9,              // voxels per second
  crouchWalk: 4,
  eye: 18.4,            // eye height standing
  crouchEye: 10.5,
  shoulder: 15.5,
  upperArm: 4.6, foreArm: 4.4,
};

// Height the giant's body takes up when standing or crouching; anything solid in it blocks walking
const bodyTop = (crouch) => (crouch ? 13 : GIANT.height - 1);

export function giantBlocked(x, z, crouch, solidAt) {
  const r = GIANT.radius;
  for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
    for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
      const nx = Math.max(cx, Math.min(x, cx + 1)), nz = Math.max(cz, Math.min(z, cz + 1));
      if ((nx - x) ** 2 + (nz - z) ** 2 > r * r) continue;
      // Floor-level clutter one voxel high (rug, wheels, clothes) is stepped over
      for (let cy = 2; cy <= bodyTop(crouch); cy++) if (solidAt(cx, cy, cz)) return true;
    }
  return false;
}

// One movement step. s = { x, z, yaw }; input = { forward, strafe } each -1..1; crouch = bool
export function stepGiant(s, input, crouch, dt, solidAt) {
  const speed = crouch ? GIANT.crouchWalk : GIANT.walk;
  let f = input.forward, r = input.strafe;
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);  // facing direction
  const rx = -fz, rz = fx;                           // to the right
  const dx = (fx * f + rx * r) * speed * dt, dz = (fz * f + rz * r) * speed * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.2));
  for (let i = 0; i < n; i++) {
    if (!giantBlocked(s.x + dx / n, s.z, crouch, solidAt)) s.x += dx / n;
    if (!giantBlocked(s.x, s.z + dz / n, crouch, solidAt)) s.z += dz / n;
  }
  return s;
}

// Can the giant stand up here (nothing over its head)?
export const canStand = (s, solidAt) => !giantBlocked(s.x, s.z, false, solidAt);

const DOWN = new THREE.Vector3(0, -1, 0);
const SKIN = 0x8b9a55, SKIN_DARK = 0x6d7a3d, WART = 0x5d6a2e, TUNIC = 0x6b4a2b, BELT = 0x3a2614, NAIL = 0xd8cf9a;

// Two-bone reach: shoulder S to target T, elbow bending towards `pole`. Returns elbow and hand points.
export function reachArm(S, T, pole, L1 = GIANT.upperArm, L2 = GIANT.foreArm) {
  const dir = T.clone().sub(S);
  let d = dir.length();
  if (d < 1e-6) dir.copy(DOWN); else dir.divideScalar(d);
  d = Math.min(Math.max(d, 1.5), L1 + L2 - 0.01);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, 1, 0).addScaledVector(dir, -dir.y);
  p.normalize();
  const elbow = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
  return { elbow, hand: S.clone().addScaledVector(dir, d) };
}

export class GiantModel {
  constructor(scene) {
    const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const skin = mat(SKIN), skinDark = mat(SKIN_DARK), wart = mat(WART), tunic = mat(TUNIC), belt = mat(BELT), nail = mat(NAIL);
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const add = (parent, geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
    };
    // Lumpy sphere for an uneven, ugly look
    const lumpy = (r, seed, detail = 1) => {
      const geo = new THREE.IcosahedronGeometry(r, detail);
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const k = 1 + 0.09 * Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) + 0.05 * Math.sin(v.z * 5 + seed * 2);
        v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const limb = (parent, len, r0, r1, m) => add(parent, new THREE.CylinderGeometry(r0, r1, len, 7), m, 0, -len / 2, 0);

    this.group = new THREE.Group();
    this.hips = pivot(this.group, 0, 9, 0);
    this.spine = pivot(this.hips, 0, 0, 0);
    // Pot belly, ragged tunic, rope belt, sloping shoulders
    add(this.spine, lumpy(3.1, 1), tunic, 0, 1.4, 0.2, 1, 0.9, 0.95);
    add(this.spine, lumpy(3.0, 2), skin, 0, 2.8, 1.1, 0.95, 0.85, 0.9);
    add(this.spine, new THREE.CylinderGeometry(3.25, 3.4, 0.6, 9), belt, 0, 1.6, 0.25);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      add(this.spine, new THREE.ConeGeometry(0.7, 1.6 + (i % 3) * 0.5, 4), tunic, Math.sin(a) * 2.9, -0.4, Math.cos(a) * 2.9, 1, -1, 1);
    }
    this.chest = pivot(this.spine, 0, 5.2, 0);
    add(this.chest, lumpy(2.9, 3), tunic, 0, 0.3, -0.1, 1.25, 0.85, 0.85);
    add(this.chest, lumpy(1.5, 4), skin, 0, 0.9, 0.8, 1.4, 0.6, 0.8);
    // Head on a thick short neck, pushed forward (hunched)
    add(this.chest, new THREE.CylinderGeometry(0.9, 1.2, 1.4, 7), skin, 0, 1.8, 0.4);
    this.head = pivot(this.chest, 0, 3.6, 0.9);
    add(this.head, lumpy(1.85, 5, 2), skin, 0, 0, 0, 1, 1.12, 1);
    add(this.head, lumpy(1.2, 6), skin, 0, -1.2, 0.55, 1.05, 0.7, 0.9);          // heavy jaw
    add(this.head, new THREE.SphereGeometry(0.7, 8, 6), mat(0xb3705a), 0.15, -0.15, 1.85, 1, 0.9, 1.1); // bulbous nose
    add(this.head, new THREE.SphereGeometry(0.16, 5, 4), wart, 0.55, 0.15, 2.3);
    add(this.head, new THREE.SphereGeometry(0.2, 5, 4), wart, -0.9, 0.9, 1.45);
    add(this.head, new THREE.SphereGeometry(0.14, 5, 4), wart, 1.1, -0.9, 1.3);
    // Uneven eyes: one big and bulging, one small and squinting
    add(this.head, new THREE.SphereGeometry(0.42, 8, 6), mat(0xeee3a6), -0.68, 0.45, 1.45);
    add(this.head, new THREE.SphereGeometry(0.2, 6, 5), mat(0x2a1606), -0.66, 0.42, 1.84);
    add(this.head, new THREE.SphereGeometry(0.26, 8, 6), mat(0xe2d48e), 0.75, 0.3, 1.55);
    add(this.head, new THREE.SphereGeometry(0.13, 6, 5), mat(0x2a1606), 0.78, 0.27, 1.79);
    add(this.head, new THREE.BoxGeometry(2.4, 0.32, 0.45), mat(0x2d2414), 0, 0.95, 1.5).rotation.z = 0.12; // unibrow
    // Wide crooked mouth with snaggle teeth
    add(this.head, new THREE.BoxGeometry(1.7, 0.32, 0.4), mat(0x3a1414), 0, -0.95, 1.55).rotation.z = -0.1;
    add(this.head, new THREE.BoxGeometry(0.26, 0.45, 0.2), nail, -0.45, -0.75, 1.72);
    add(this.head, new THREE.BoxGeometry(0.22, 0.32, 0.2), nail, 0.3, -1.1, 1.72);
    add(this.head, new THREE.BoxGeometry(0.2, 0.38, 0.2), nail, 0.62, -0.8, 1.68).rotation.z = 0.3;
    // Big flappy ears and a few stringy hairs
    for (const s of [-1, 1]) add(this.head, lumpy(0.75, 7 + s), skinDark, s * 1.9, 0.1, 0.1, 0.4, 1.1, 0.8).rotation.z = s * 0.3;
    for (let i = 0; i < 6; i++) {
      const hair = add(this.head, new THREE.CylinderGeometry(0.04, 0.06, 1.4, 3), mat(0x2b2418), -0.6 + i * 0.25, 2.2, -0.2 + (i % 2) * 0.4);
      hair.rotation.z = (i - 2.5) * 0.25;
    }

    this.arms = {};
    for (const side of [-1, 1]) {
      const shoulder = pivot(this.chest, side * 3.4, 0.6, 0);
      add(shoulder, lumpy(1.25, 9 + side), tunic, 0, 0, 0);
      limb(shoulder, GIANT.upperArm, 1.0, 0.85, skin);
      const elbow = pivot(shoulder, 0, -GIANT.upperArm, 0);
      add(elbow, new THREE.SphereGeometry(0.85, 7, 5), skinDark, 0, 0, 0);
      limb(elbow, GIANT.foreArm, 0.85, 0.75, skin);
      const hand = pivot(elbow, 0, -GIANT.foreArm, 0);
      add(hand, lumpy(1.0, 11 + side), skin, 0, -0.6, 0, 1.1, 1.0, 0.7);
      for (let f = 0; f < 4; f++) {
        const finger = add(hand, new THREE.CylinderGeometry(0.2, 0.17, 1.1, 5), skin, (f - 1.5) * 0.42, -1.6, 0.15);
        finger.rotation.x = 0.35;
      }
      add(hand, new THREE.CylinderGeometry(0.22, 0.2, 0.9, 5), skin, side * -0.95, -0.9, 0.35).rotation.z = side * 0.7;
      shoulder.rotation.z = side * 0.12;
      this.arms[side] = { shoulder, elbow, hand };
    }

    this.legs = {};
    for (const side of [-1, 1]) {
      const hip = pivot(this.hips, side * 1.6, 0, 0);
      limb(hip, 4.6, 1.3, 1.0, skin);
      const knee = pivot(hip, 0, -4.6, 0);
      add(knee, new THREE.SphereGeometry(1.05, 7, 5), skinDark, 0, 0, 0.15);
      limb(knee, 4.4, 1.0, 0.85, skin);
      const foot = pivot(knee, 0, -4.4, 0);
      add(foot, lumpy(0.9, 13 + side), skin, 0, -0.1, 0.8, 1.15, 0.55, 1.9);
      for (let t = 0; t < 4; t++) add(foot, new THREE.SphereGeometry(0.25, 5, 4), nail, (t - 1.5) * 0.36, -0.2, 2.35 - Math.abs(t - 1.5) * 0.12);
      this.legs[side] = { hip, knee, foot };
    }
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.phase = 0;
    this.crouch = 0;
    this.lean = 0;
    this.reach = 0;
    this.handTarget = new THREE.Vector3();
    this.handPos = new THREE.Vector3();
    scene.add(this.group);
  }

  // pose: { x, z, yaw, speed (0..1), crouch (bool), reach: Vector3 | null, holding (bool) }
  update(dt, pose) {
    const ease = (from, to, rate) => from + (to - from) * Math.min(1, dt * rate);
    this.group.position.set(pose.x, 0, pose.z);
    this.group.rotation.y = pose.yaw;
    this.crouch = ease(this.crouch, pose.crouch ? 1 : 0, 8);
    this.reach = ease(this.reach, pose.reach ? 1 : 0, 14);
    if (pose.reach) this.handTarget.copy(pose.reach);

    // Bend over further the lower the target is
    const local = this.group.worldToLocal(this.handTarget.clone());
    const low = pose.reach ? THREE.MathUtils.clamp((GIANT.shoulder - 5 * this.crouch - local.y) / 12, 0, 1) : 0;
    this.lean = ease(this.lean, 0.18 + 0.25 * this.crouch + 0.75 * low * this.reach, 8);

    // Walking legs; crouching folds the knees and drops the hips
    this.phase += dt * 7 * Math.max(0.1, pose.speed);
    const swing = Math.sin(this.phase) * 0.55 * pose.speed;
    const a = 1.05 * this.crouch;
    this.hips.position.y = 9 * Math.cos(a) + Math.abs(Math.cos(this.phase)) * 0.35 * pose.speed;
    for (const side of [-1, 1]) {
      const l = this.legs[side], s = swing * side;
      l.hip.rotation.x = -a - s;
      l.knee.rotation.x = 2 * a + Math.max(0, s) * 0.9;
      l.foot.rotation.x = -a + Math.min(0, s) * 0.3;
    }
    this.spine.rotation.x = this.lean;
    this.spine.rotation.z = Math.sin(this.phase) * 0.04 * pose.speed;
    this.head.rotation.x = -this.lean * 0.6;

    // Free arm swings; the right arm (side -1, on the giant's right) reaches and holds
    for (const side of [-1, 1]) {
      const arm = this.arms[side];
      arm.shoulder.quaternion.identity();
      arm.shoulder.rotation.set(swing * side * 0.8 - this.lean * 0.6, 0, side * 0.12);
      arm.elbow.rotation.set(-0.3 - Math.abs(swing) * 0.3, 0, 0);
    }
    this.group.updateMatrixWorld(true);
    if (this.reach > 0.01) this.aimArm(this.arms[-1], -1);
    this.arms[-1].hand.getWorldPosition(this.handPos);
  }

  // Point the arm at the target with two-bone IK, blended in by this.reach
  aimArm(arm, side) {
    const S = arm.shoulder.getWorldPosition(new THREE.Vector3());
    const yaw = this.group.rotation.y;
    const outward = new THREE.Vector3(Math.cos(yaw) * side * -1, 0.4, -Math.sin(yaw) * side * -1);
    const { elbow, hand } = reachArm(S, this.handTarget, outward);
    const parentQ = arm.shoulder.parent.getWorldQuaternion(new THREE.Quaternion());
    const upperWorld = new THREE.Quaternion().setFromUnitVectors(DOWN, elbow.clone().sub(S).normalize());
    const upperLocal = parentQ.clone().invert().multiply(upperWorld);
    arm.shoulder.quaternion.slerp(upperLocal, this.reach);
    arm.shoulder.updateMatrixWorld(true);
    const elbowParentQ = arm.shoulder.getWorldQuaternion(new THREE.Quaternion());
    const E = arm.elbow.getWorldPosition(new THREE.Vector3());
    const foreWorld = new THREE.Quaternion().setFromUnitVectors(DOWN, hand.clone().sub(E).normalize());
    arm.elbow.quaternion.slerp(elbowParentQ.invert().multiply(foreWorld), this.reach);
    arm.elbow.updateMatrixWorld(true);
  }

  // Where a held Jack sits: in the giant's fist
  get fist() { return this.handPos.clone().add(new THREE.Vector3(0, -1.6, 0)); }
}

// The point the giant holds Jack up to: in front of its face, so it can gloat
export function holdPoint(s, crouch) {
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  return new THREE.Vector3(s.x + fx * 4 - fz * 1.5, Math.min(SY - 3, (crouch ? 9 : 15.5)), s.z + fz * 4 + fx * 1.5);
}
