import * as THREE from 'three';

// Jack: a tiny red stick figure, 1/10 of the giant's height. He can run anywhere in the room,
// step up small ledges and jump onto furniture and the beanstalk's leaves.
export const JACK = {
  height: 2,          // the giant is 20
  radius: 0.3,
  speed: 7,           // voxels per second
  jumpSpeed: 17,      // jumps about 3.6 voxels high
  gravity: 40,
  step: 1.05,         // ledges up to one voxel high are walked up without jumping
  maxY: 28,           // top of the room for Jack (he cannot climb out through the hole in the roof)
};

// Does Jack's box at (x, y, z) (feet centre) overlap anything solid?
export function jackBlocked(x, y, z, solidAt, boxes = []) {
  const r = JACK.radius, h = JACK.height - 0.1;
  for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
    for (let cy = Math.floor(y + 0.001); cy <= Math.floor(y + h); cy++)
      for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++)
        if (solidAt(cx, cy, cz)) return true;
  for (const b of boxes)
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 && y + 0.001 < b.y1) return true;
  return false;
}

// One physics step. s = { x, y, z, vy, grounded }; move = world direction {x, z} (length <= 1);
// jump = true to jump when standing. Movement is split into small sub-steps so Jack never tunnels.
export function stepJack(s, move, jump, dt, solidAt, boxes = []) {
  const blocked = (x, y, z) => jackBlocked(x, y, z, solidAt, boxes);
  if (jump && s.grounded) { s.vy = JACK.jumpSpeed; s.grounded = false; }
  s.vy = Math.max(-40, s.vy - JACK.gravity * dt);
  const dx = move.x * JACK.speed * dt, dz = move.z * JACK.speed * dt, dy = s.vy * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy)) / 0.1));
  let grounded = false;
  for (let i = 0; i < n; i++) {
    for (const [ax, d] of [['x', dx / n], ['z', dz / n]]) {
      if (!d) continue;
      const nx = ax === 'x' ? s.x + d : s.x, nz = ax === 'z' ? s.z + d : s.z;
      if (!blocked(nx, s.y, nz)) { s.x = nx; s.z = nz; continue; }
      // Walk up a small ledge
      if (s.grounded || s.vy <= 0) {
        for (let i = 1; i * 0.1 <= JACK.step + 1e-6; i++) {
          const up = i * 0.1;
          if (!blocked(nx, s.y + up, nz) && !blocked(s.x, s.y + up, s.z)) { s.x = nx; s.z = nz; s.y += up; break; }
        }
      }
    }
    const ny = Math.min(JACK.maxY, s.y + dy / n);
    if (!blocked(s.x, ny, s.z)) s.y = ny;
    else {
      if (dy < 0) { grounded = true; s.y = settle(s, blocked); }
      s.vy = 0;
    }
  }
  // Still standing on something (walking along a surface)?
  if (!grounded && s.vy <= 0 && blocked(s.x, s.y - 0.05, s.z)) grounded = true;
  s.grounded = grounded;
  if (grounded && s.vy < 0) s.vy = 0;
  return s;
}

// Move down onto the surface below as closely as possible
function settle(s, blocked) {
  let y = s.y;
  for (let i = 0; i < 10 && !blocked(s.x, y - 0.01, s.z); i++) y -= 0.01;
  return y;
}

const RED = 0xe0262b;

// Stick figure model following the uploaded drawing: oval head with a cross, straight limbs,
// little joint rings, oval hands and wedge feet. All painted red.
export class JackModel {
  constructor(scene) {
    const mat = new THREE.MeshLambertMaterial({ color: RED });
    const line = (len, r = 0.045) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat); m.position.y = -len / 2; return m; };
    const joint = () => new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12), mat);
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.group = new THREE.Group();
    this.body = pivot(this.group, 0, 1.02, 0);
    // Spine, hip and shoulder bars
    const spine = line(0.5); spine.position.y = 0.25; this.body.add(spine);
    const hipBar = line(0.3); hipBar.rotation.z = Math.PI / 2; hipBar.position.set(0, 0, 0); this.body.add(hipBar);
    const shoulderBar = line(0.42); shoulderBar.rotation.z = Math.PI / 2; shoulderBar.position.set(0, 0.5, 0); this.body.add(shoulderBar);
    const neck = line(0.12); neck.position.y = 0.56; this.body.add(neck);
    // Head: oval outline with a cross, like the drawing
    const head = new THREE.Group(); head.position.y = 0.82; this.body.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 20), mat); ring.scale.y = 1.35; head.add(ring);
    const ring2 = ring.clone(); ring2.rotation.y = Math.PI / 2; head.add(ring2);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55 }));
    face.scale.y = 1.35; head.add(face);
    const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 4), mat); h1.rotation.z = Math.PI / 2; h1.position.z = 0.15; head.add(h1);
    const h2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 4), mat); h2.position.z = 0.15; head.add(h2);
    this.limbs = {};
    for (const side of [-1, 1]) {
      // Legs: hip joint, thigh, knee joint, shin, foot
      const hip = pivot(this.body, side * 0.15, 0, 0); hip.add(joint());
      hip.add(line(0.5));
      const knee = pivot(hip, 0, -0.5, 0); knee.add(joint());
      knee.add(line(0.47));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.1, 4), mat);
      foot.position.set(0, -0.5, 0.04); foot.rotation.y = Math.PI / 4; knee.add(foot);
      // Arms: shoulder joint, upper arm, elbow joint, forearm, oval hand
      const shoulder = pivot(this.body, side * 0.21, 0.5, 0); shoulder.add(joint());
      shoulder.add(line(0.36));
      const elbow = pivot(shoulder, 0, -0.36, 0); elbow.add(joint());
      elbow.add(line(0.34));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
      hand.scale.y = 1.5; hand.position.y = -0.41; elbow.add(hand);
      shoulder.rotation.z = side * 0.18;
      this.limbs[side] = { hip, knee, shoulder, elbow };
    }
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.phase = 0;
    scene.add(this.group);
  }
  // pose: { x, y, z, yaw, speed (0..1), air (bool), held (bool) }
  update(dt, pose) {
    this.group.position.set(pose.x, pose.y, pose.z);
    this.group.rotation.y = pose.yaw;
    this.phase += dt * 13 * Math.max(0.15, pose.speed);
    const swing = pose.held ? 0 : Math.sin(this.phase) * 0.8 * pose.speed;
    const kick = pose.held ? Math.sin(performance.now() * 0.03) * 0.9 : 0;
    for (const side of [-1, 1]) {
      const l = this.limbs[side];
      const s = swing * side;
      l.hip.rotation.x = pose.air ? -0.6 : s + kick * side;
      l.knee.rotation.x = pose.air ? 0.9 : Math.max(0, -s) * 1.1 + Math.abs(kick) * 0.4;
      l.shoulder.rotation.x = pose.held ? Math.PI * 0.85 + kick * side * 0.4 : -s * 0.9;
      l.elbow.rotation.x = pose.held ? 0.3 : -0.35 - Math.abs(s) * 0.4;
    }
    this.body.position.y = 1.02 + (pose.air || pose.held ? 0 : Math.abs(Math.sin(this.phase)) * 0.06 * pose.speed);
  }
}
