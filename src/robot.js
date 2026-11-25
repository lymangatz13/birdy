import * as THREE from 'three';

export const L1 = 5, L2 = 5;          // upper arm and forearm length (voxels, 10 cm each)
export const MAX_REACH = 20;          // the forearm telescopes out to this total reach (downwards only)
export const DROP_SIDE = 11;          // furthest the hand aims horizontally from the robot's centre
export const PICK_SIDE = 15;          // furthest an item can be picked up from (covers sliding off a desk edge)
const TURN_RATE = 1.6, LOOK_RATE = 1.2, HAND_SPEED = 10, GRAB_DIST = 0.8;
const UP = new THREE.Vector3(0, 1, 0);

// How far the arm reaches in a direction: normal length at or above shoulder height,
// telescoping out to MAX_REACH when reaching down towards the floor
export function reachLimit(dir) {
  const down = Math.min(1, Math.max(0, -dir.y / 0.3));
  return L1 + L2 - 0.01 + (MAX_REACH - (L1 + L2 - 0.01)) * down;
}

// Two-bone IK: shoulder S reaching for target T. The elbow bends towards `pole`.
// Beyond L1 + L2 the arm goes straight and the forearm telescopes; beyond reachLimit
// the hand stops at full extension along the same direction.
export function solveArm(S, T, pole) {
  const dir = T.clone().sub(S);
  let d = dir.length();
  if (d < 1e-6) dir.set(0, -1, 0); else dir.divideScalar(d);
  d = Math.min(Math.max(d, 1), reachLimit(dir));
  const hand = S.clone().addScaledVector(dir, d);
  if (d >= L1 + L2 - 0.01) {
    return { elbow: S.clone().addScaledVector(dir, L1), hand, foreLen: d - L1 };
  }
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0).addScaledVector(dir, -dir.y);
  p.normalize();
  const elbow = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
  return { elbow, hand, foreLen: L2 };
}

// Keep a hand target within `limit` horizontally of the robot's centre C, so anything dropped
// lands where an arm can still reach it on the floor
export function clampSide(C, T, limit) {
  const dx = T.x - C.x, dz = T.z - C.z, r = Math.hypot(dx, dz);
  if (r > limit) { T.x = C.x + (dx * limit) / r; T.z = C.z + (dz * limit) / r; }
  return T;
}

// Stretch a unit-height box between points a and b
function segment(mesh, a, b) {
  const v = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(v, 0.5);
  mesh.scale.set(1, v.length(), 1);
  mesh.quaternion.setFromUnitVectors(UP, v.normalize());
}

const METAL = 0x8d99a6, SLIDE = 0xc5ccd3, DARK = 0x4b5563, ACTIVE = 0xffb020;

export class Robot {
  constructor(scene, eye, yaw) {
    this.eye = eye.clone();
    this.yaw = yaw;
    this.pitch = -0.45;
    this.active = 1; // 0 = left arm, 1 = right arm

    const metal = new THREE.MeshLambertMaterial({ color: METAL });
    const dark = new THREE.MeshLambertMaterial({ color: DARK });
    const slide = new THREE.MeshLambertMaterial({ color: SLIDE });
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(5.4, 7, 3), metal);
    this.base = new THREE.Mesh(new THREE.BoxGeometry(3, this.eye.y - 9.5, 3), dark);
    scene.add(this.torso, this.base);

    this.arms = [-1, 1].map((side) => {
      const joint = new THREE.MeshLambertMaterial({ color: DARK });
      const arm = {
        side,
        joint,
        upper: new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), metal),
        fore: new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8), metal),
        slide: new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), slide), // telescoping inner forearm
        shoulderBall: new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), joint),
        elbowBall: new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), dark),
        gripper: new THREE.Group(),
        fingers: [new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.9), dark), new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.9), dark)],
        hand: new THREE.Vector3(),
        target: new THREE.Vector3(),
        held: null,
        reachFor: null, // item the hand is moving to grab
      };
      const palm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.1), joint);
      arm.gripper.add(palm, ...arm.fingers);
      scene.add(arm.upper, arm.fore, arm.slide, arm.shoulderBall, arm.elbowBall, arm.gripper);
      const { forward, right } = this.basis();
      arm.hand.copy(this.shoulder(side)).addScaledVector(forward, 5).addScaledVector(right, side).add(new THREE.Vector3(0, -2.5, 0));
      arm.target.copy(arm.hand);
      return arm;
    });
    this.update(0, new Set());
  }

  basis() {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { forward, right };
  }

  shoulder(side) {
    const { forward, right } = this.basis();
    return this.eye.clone().addScaledVector(right, side * 2.6).addScaledVector(forward, 0.2).add(new THREE.Vector3(0, -2.6, 0));
  }

  get activeArm() { return this.arms[this.active]; }

  update(dt, keys) {
    const ax = (a, b) => (a.some((k) => keys.has(k)) ? 1 : 0) - (b.some((k) => keys.has(k)) ? 1 : 0);
    this.yaw += ax(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) * TURN_RATE * dt;
    this.pitch = Math.min(0.6, Math.max(-1.25, this.pitch + ax(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) * LOOK_RATE * dt));

    const { forward, right } = this.basis();
    this.torso.position.copy(this.eye).addScaledVector(forward, -1.2).add(new THREE.Vector3(0, -6, 0));
    this.torso.rotation.set(0, this.yaw, 0);
    this.base.position.set(this.torso.position.x, 1 + (this.eye.y - 9.5) / 2, this.torso.position.z);
    this.base.rotation.set(0, this.yaw, 0);

    for (const [i, arm] of this.arms.entries()) {
      const S = this.shoulder(arm.side);
      if (arm.reachFor) {
        const it = arm.reachFor;
        if (it.held) arm.reachFor = null; // the other arm took it
        else arm.target.set(it.pos.x, it.pos.y + it.h + 0.4, it.pos.z);
      }
      clampSide(this.eye, arm.target, arm.reachFor ? PICK_SIDE : DROP_SIDE);
      arm.hand.lerp(arm.target, Math.min(1, HAND_SPEED * dt));
      const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, arm.side * 0.8).addScaledVector(forward, -0.3);
      const { elbow, hand, foreLen } = solveArm(S, arm.hand, pole);
      arm.hand.copy(hand);
      if (arm.reachFor && hand.distanceTo(arm.target) < GRAB_DIST) {
        arm.held = arm.reachFor;
        arm.held.held = arm;
        arm.reachFor = null;
      }
      segment(arm.upper, S, elbow);
      const foreDir = hand.clone().sub(elbow).normalize();
      if (foreLen > L2) {
        segment(arm.fore, elbow, elbow.clone().addScaledVector(foreDir, L2));
        segment(arm.slide, elbow.clone().addScaledVector(foreDir, L2 - 0.3), hand);
        arm.slide.visible = true;
      } else {
        segment(arm.fore, elbow, hand);
        arm.slide.visible = false;
      }
      arm.shoulderBall.position.copy(S);
      arm.shoulderBall.rotation.set(0, this.yaw, 0);
      arm.elbowBall.position.copy(elbow);
      arm.gripper.position.copy(hand);
      arm.tip = hand.clone().addScaledVector(foreDir, 1.15); // finger tips
      arm.gripper.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), foreDir);
      const spread = arm.held ? 0.38 : 0.6;
      arm.fingers[0].position.set(-spread, -0.6, 0);
      arm.fingers[1].position.set(spread, -0.6, 0);
      arm.joint.color.setHex(i === this.active ? ACTIVE : DARK);
      if (arm.held) {
        arm.held.pos.set(hand.x, hand.y - arm.held.h + 0.2, hand.z);
        arm.held.sync();
      }
    }
  }

  applyTo(cam) {
    cam.position.copy(this.eye);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
