import * as THREE from 'three';

const MAX_TILT = 0.5, TILT_RATE = 3, YAW_RATE = 1.8, ACCEL = 40, LIFT = 15, DRAG = 1.2, EYE = 1.5, CEILING = 200;

// Mode 2: W/S throttle, A/D yaw, Up/Down pitch, Left/Right roll
export class Drone {
  constructor(pos) {
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0; // + = nose down (forward)
    this.roll = 0;  // + = right side down
  }
  update(dt, keys, groundAt) {
    const ax = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
    const approach = (v, target) => v + (target - v) * Math.min(1, TILT_RATE * dt);
    this.pitch = approach(this.pitch, ax('ArrowUp', 'ArrowDown') * MAX_TILT);
    this.roll = approach(this.roll, ax('ArrowRight', 'ArrowLeft') * MAX_TILT);
    this.yaw += ax('KeyA', 'KeyD') * YAW_RATE * dt;

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const fx = -s, fz = -c, rx = c, rz = -s;
    const fp = Math.sin(this.pitch) * ACCEL, rp = Math.sin(this.roll) * ACCEL;
    this.vel.x += (fx * fp + rx * rp) * dt;
    this.vel.z += (fz * fp + rz * rp) * dt;
    this.vel.y += ax('KeyW', 'KeyS') * LIFT * dt;
    this.vel.multiplyScalar(Math.exp(-DRAG * dt));
    this.pos.addScaledVector(this.vel, dt);

    const g = groundAt(this.pos.x, this.pos.z) + EYE;
    if (this.pos.y < g) { this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > CEILING) { this.pos.y = CEILING; this.vel.y = Math.min(0, this.vel.y); }
  }
  applyTo(cam) {
    cam.position.copy(this.pos);
    cam.rotation.set(-this.pitch * 0.4, this.yaw, -this.roll * 0.5, 'YXZ');
  }
}
