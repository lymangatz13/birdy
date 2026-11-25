import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESK } from './room.js';

export const ANT_COUNT = 100;
export const MIN_SPEED = 0.3, MAX_SPEED = 1.6; // voxels per second (3 to 16 cm/s)
const MARGIN = 0.3;      // keep ants this far inside the desk edge
const SQUISH_DIST = 0.6;  // horizontal radius of a gripper's contact with the desk
const TIP_TOUCH = 0.1;    // finger tips this close to the desk surface are touching it
const PALM_TOUCH = 0.6;   // palm centre this close (half the palm plus a little) is pressing on it
const rand = (a, b) => a + Math.random() * (b - a);

const onDesk = (it) => !it.held && Math.abs(it.pos.y - DESK.top) < 0.05;
const inside = (x, z, it, pad = 0) =>
  Math.abs(x - it.pos.x) < it.w / 2 + pad && Math.abs(z - it.pos.z) < it.d / 2 + pad;

// Where a gripper touches the desk top, if it does: the finger tips, else the palm
// (only at desk-top height, so a gripper down by the floor under the desk doesn't count)
function contact({ hand, tip }) {
  if (tip.y <= DESK.top + TIP_TOUCH && tip.y >= DESK.top - 0.6) return tip;
  if (hand.y <= DESK.top + PALM_TOUCH && hand.y >= DESK.top - 0.3) return hand;
  return null;
}

// Ant simulation, independent of rendering
export class Colony {
  constructor(count = ANT_COUNT, items = []) {
    this.ants = [];
    for (let i = 0; i < count; i++) this.ants.push(this.spawn({}, items));
  }

  spawn(ant, items) {
    for (let tries = 0; tries < 50; tries++) {
      ant.x = rand(DESK.x0 + MARGIN, DESK.x1 - MARGIN);
      ant.z = rand(DESK.z0 + MARGIN, DESK.z1 - MARGIN);
      if (!items.some((it) => onDesk(it) && inside(ant.x, ant.z, it, 0.2))) break;
    }
    ant.heading = rand(0, Math.PI * 2);
    ant.speed = rand(MIN_SPEED, MAX_SPEED);
    ant.turnIn = rand(0.5, 2.5);
    ant.phase = rand(0, Math.PI * 2);
    return ant;
  }

  // items: movable items; grippers: [{ hand, tip }] finger segments of the robot's arms.
  // Returns how many ants were squished this step.
  step(dt, items = [], grippers = []) {
    let squished = 0;
    const resting = items.filter(onDesk);
    const touches = grippers.map(contact).filter(Boolean);
    for (const a of this.ants) {
      // Squish: an item has landed on the ant, or a gripper touches the desk on it
      if (resting.some((it) => inside(a.x, a.z, it)) || touches.some((c) => Math.hypot(c.x - a.x, c.z - a.z) < SQUISH_DIST)) {
        this.spawn(a, items);
        squished++;
        continue;
      }

      // Wander: small constant wobble plus an occasional bigger turn
      a.heading += (Math.random() - 0.5) * 2 * dt;
      if ((a.turnIn -= dt) <= 0) { a.heading += rand(-1.2, 1.2); a.turnIn = rand(0.5, 2.5); }
      a.phase += a.speed * dt * 12;

      const nx = a.x + Math.cos(a.heading) * a.speed * dt;
      const nz = a.z + Math.sin(a.heading) * a.speed * dt;
      // Turn back at the desk edges
      if (nx < DESK.x0 + MARGIN || nx > DESK.x1 - MARGIN) { a.heading = Math.PI - a.heading; continue; }
      if (nz < DESK.z0 + MARGIN || nz > DESK.z1 - MARGIN) { a.heading = -a.heading; continue; }
      // Walk around items on the desk
      const block = resting.find((it) => inside(nx, nz, it, 0.15));
      if (block) {
        a.heading = Math.atan2(a.z - block.pos.z, a.x - block.pos.x) + rand(-0.8, 0.8);
        continue;
      }
      a.x = nx;
      a.z = nz;
    }
    return squished;
  }
}

// One ant mesh (head, thorax, abdomen, six legs), facing +x, about 0.6 voxels (6 cm) long
function antGeometry() {
  const S = 1.8;
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w * S, h * S, d * S).translate(x * S, y * S, z * S);
  const parts = [
    box(0.16, 0.11, 0.12, -0.13, 0.08, 0),  // abdomen
    box(0.09, 0.07, 0.07, 0, 0.07, 0),      // thorax
    box(0.08, 0.08, 0.08, 0.1, 0.08, 0),    // head
  ];
  for (const x of [-0.05, 0, 0.05]) parts.push(box(0.02, 0.02, 0.24, x, 0.03, 0));
  parts.push(box(0.08, 0.015, 0.015, 0.17, 0.11, 0.03), box(0.08, 0.015, 0.015, 0.17, 0.11, -0.03)); // antennae
  return mergeGeometries(parts);
}

// Draws the colony with one instanced mesh
export class AntView {
  constructor(scene, colony) {
    this.colony = colony;
    this.mesh = new THREE.InstancedMesh(antGeometry(), new THREE.MeshLambertMaterial({ color: 0x2a1a12 }), colony.ants.length);
    this.mesh.frustumCulled = false;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    scene.add(this.mesh);
    this.update();
  }
  update() {
    this.colony.ants.forEach((a, i) => {
      this.q.setFromAxisAngle(this.up, -a.heading + Math.sin(a.phase) * 0.12);
      this.v.set(a.x, DESK.top + 0.01 + Math.abs(Math.sin(a.phase)) * 0.02, a.z);
      this.mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.one));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
