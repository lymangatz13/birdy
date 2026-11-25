import * as THREE from 'three';

export const L1 = 5, L2 = 5;          // upper arm and forearm length (voxels, 10 cm each)
const TURN_RATE = 1.6, LOOK_RATE = 1.2, HAND_SPEED = 10;
const UP = new THREE.Vector3(0, 1, 0);

// Two-bone IK: shoulder S reaching for target T. The elbow bends towards `pole`.
// Out-of-reach targets are clamped to full arm length along the same direction.
export function solveArm(S, T, pole) {
  const dir = T.clone().sub(S);
  let d = dir.length();
  if (d < 1e-6) dir.set(0, -1, 0); else dir.divideScalar(d);
  d = Math.min(Math.max(d, 1), L1 + L2 - 0.01);
  const hand = S.clone().addScaledVector(dir, d);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0).addScaledVector(dir, -dir.y);
  p.normalize();
  const elbow = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
  return { elbow, hand };
}

// Stretch a unit-height box between points a and b
function segment(mesh, a, b) {
  const v = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(v, 0.5);
  mesh.scale.set(1, v.length(), 1);
  mesh.quaternion.setFromUnitVectors(UP, v.normalize());
}

const METAL = 0x8d99a6, DARK = 0x4b5563, ACTIVE = 0xffb020;

export class Robot {
  constructor(scene, eye, yaw) {
    this.eye = eye.clone();
    this.yaw = yaw;
    this.pitch = -0.45;
    this.active = 1; // 0 = left arm, 1 = right arm

    const metal = new THREE.MeshLambertMaterial({ color: METAL });
    const dark = new THREE.MeshLambertMaterial({ color: DARK });
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
        shoulderBall: new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), joint),
        elbowBall: new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), dark),
        gripper: new THREE.Group(),
        fingers: [new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.9), dark), new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.9), dark)],
        hand: new THREE.Vector3(),
        target: new THREE.Vector3(),
        held: null,
      };
      const palm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.1), joint);
      arm.gripper.add(palm, ...arm.fingers);
      scene.add(arm.upper, arm.fore, arm.shoulderBall, arm.elbowBall, arm.gripper);
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
      arm.hand.lerp(arm.target, Math.min(1, HAND_SPEED * dt));
      const S = this.shoulder(arm.side);
      const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, arm.side * 0.8).addScaledVector(forward, -0.3);
      const { elbow, hand } = solveArm(S, arm.hand, pole);
      arm.hand.copy(hand);
      segment(arm.upper, S, elbow);
      segment(arm.fore, elbow, hand);
      arm.shoulderBall.position.copy(S);
      arm.shoulderBall.rotation.set(0, this.yaw, 0);
      arm.elbowBall.position.copy(elbow);
      arm.gripper.position.copy(hand);
      arm.gripper.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), hand.clone().sub(elbow).normalize());
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
