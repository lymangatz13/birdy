import * as THREE from 'three';

const MAX_TILT = 0.5, TILT_RATE = 3, YAW_RATE = 1.8;
const DEFAULTS = { accel: 40, lift: 15, drag: 1.2, eye: 1.5, ceiling: 200, radius: 0.35 };

// Mode 2: W/S throttle, A/D yaw, Up/Down pitch, Left/Right roll
export class Drone {
  constructor(pos, opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0; // + = nose down (forward)
    this.roll = 0;  // + = right side down
  }
  // groundAt(x, z) -> surface height, or null to skip. solidAt(x, y, z) -> true if blocked, optional.
  update(dt, keys, groundAt, solidAt) {
    const { accel, lift, drag, eye, ceiling, radius } = this.o;
    const ax = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
    const approach = (v, target) => v + (target - v) * Math.min(1, TILT_RATE * dt);
    this.pitch = approach(this.pitch, ax('ArrowUp', 'ArrowDown') * MAX_TILT);
    this.roll = approach(this.roll, ax('ArrowRight', 'ArrowLeft') * MAX_TILT);
    this.yaw += ax('KeyA', 'KeyD') * YAW_RATE * dt;

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const fx = -s, fz = -c, rx = c, rz = -s;
    const fp = Math.sin(this.pitch) * accel, rp = Math.sin(this.roll) * accel;
    this.vel.x += (fx * fp + rx * rp) * dt;
    this.vel.z += (fz * fp + rz * rp) * dt;
    this.vel.y += ax('KeyW', 'KeyS') * lift * dt;
    this.vel.multiplyScalar(Math.exp(-drag * dt));

    if (solidAt) {
      // Move one axis at a time; cancel the move and that velocity component on contact
      for (const a of ['x', 'y', 'z']) {
        const prev = this.pos[a];
        this.pos[a] += this.vel[a] * dt;
        if (boxHits(this.pos, radius, solidAt)) { this.pos[a] = prev; this.vel[a] = 0; }
      }
    } else {
      this.pos.addScaledVector(this.vel, dt);
    }

    if (groundAt) {
      const g = groundAt(this.pos.x, this.pos.z) + eye;
      if (this.pos.y < g) { this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); }
    }
    if (this.pos.y > ceiling) { this.pos.y = ceiling; this.vel.y = Math.min(0, this.vel.y); }
  }
  applyTo(cam) {
    cam.position.copy(this.pos);
    cam.rotation.set(-this.pitch * 0.4, this.yaw, -this.roll * 0.5, 'YXZ');
  }
}

// True if a cube of half-size r centred on p overlaps any solid cell
export function boxHits(p, r, solidAt) {
  for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++)
    for (let y = Math.floor(p.y - r); y <= Math.floor(p.y + r); y++)
      for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++)
        if (solidAt(x, y, z)) return true;
  return false;
}
