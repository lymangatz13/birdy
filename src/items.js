import * as THREE from 'three';

const GRAVITY = 60;

// A movable object. pos is the bottom-centre of its box; w is its x size, d its z size, h its height.
// parts: [x0, y0, z0, x1, y1, z1, color, glow?] in local units relative to pos.
export class Item {
  constructor(name, w, d, h, parts) {
    this.name = name;
    this.w = w; this.d = d; this.h = h;
    this.pos = new THREE.Vector3();
    this.vy = 0;
    this.held = null; // the arm holding it
    this.group = new THREE.Group();
    this.glowMats = [];
    for (const [x0, y0, z0, x1, y1, z1, color, glow] of parts) {
      const mat = glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
      if (glow) { mat.userData.base = new THREE.Color(color); this.glowMats.push(mat); }
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.userData.item = this;
      this.group.add(m);
    }
  }
  place(x, y, z) { this.pos.set(x, y, z); this.sync(); return this; }
  sync() { this.group.position.copy(this.pos); }
  setNight(night) {
    for (const m of this.glowMats) m.color.copy(m.userData.base).multiplyScalar(0.55 + 0.45 * night);
  }
}

export const makeMug = () => new Item('mug', 1.2, 1.2, 1.6, [
  [-0.6, 0, -0.6, 0.6, 1.6, 0.6, 0xe85d5d],
  [-0.45, 1.45, -0.45, 0.45, 1.62, 0.45, 0x5a2a1a], // coffee
  [-0.95, 0.4, -0.15, -0.6, 1.2, 0.15, 0xe85d5d],    // handle
]);

// Screen on the +x side, facing -x (towards the robot)
export const makeLaptop = () => new Item('laptop', 4, 6, 4.4, [
  [-2, 0, -3, 2, 0.4, 3, 0x9aa0a6],
  [-1.6, 0.4, -2.5, 0.9, 0.5, 2.5, 0x5f666d],          // keyboard
  [1.6, 0.4, -3, 2, 4.4, 3, 0x9aa0a6],                 // lid
  [1.5, 0.8, -2.7, 1.6, 4.1, 2.7, 0x3a7bd5, true],     // screen
]);

const overlaps = (a, b) =>
  Math.abs(a.pos.x - b.pos.x) < (a.w + b.w) / 2 - 0.01 && Math.abs(a.pos.z - b.pos.z) < (a.d + b.d) / 2 - 0.01;

// Highest surface below the item: room voxels or the top of another resting item
export function supportHeight(it, items, solidAt) {
  const x0 = Math.floor(it.pos.x - it.w / 2 + 0.01), x1 = Math.floor(it.pos.x + it.w / 2 - 0.01);
  const z0 = Math.floor(it.pos.z - it.d / 2 + 0.01), z1 = Math.floor(it.pos.z + it.d / 2 - 0.01);
  const top = Math.floor(it.pos.y + 0.001);
  let best = 0;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++)
    for (let y = top; y >= 0; y--) if (solidAt(x, y, z)) { best = Math.max(best, y + 1); break; }
  for (const o of items)
    if (o !== it && !o.held && overlaps(it, o) && o.pos.y + o.h <= it.pos.y + 0.01) best = Math.max(best, o.pos.y + o.h);
  return best;
}

function columnTop(x, z, top, solidAt) {
  for (let y = top; y >= 0; y--) if (solidAt(x, y, z)) return y + 1;
  return 0;
}

// Room surface height under each footprint cell, plus the height under the item's centre
function footprint(it, solidAt) {
  const top = Math.floor(it.pos.y + 0.001);
  const cells = [];
  for (let x = Math.floor(it.pos.x - it.w / 2 + 0.01); x <= Math.floor(it.pos.x + it.w / 2 - 0.01); x++)
    for (let z = Math.floor(it.pos.z - it.d / 2 + 0.01); z <= Math.floor(it.pos.z + it.d / 2 - 0.01); z++)
      cells.push({ x, z, h: columnTop(x, z, top, solidAt) });
  const center = columnTop(Math.floor(it.pos.x), Math.floor(it.pos.z), top, solidAt);
  return { cells, center, max: Math.max(...cells.map((c) => c.h)) };
}

// On release: if the item's centre hangs past an edge, slide it off that edge so it falls
// instead of balancing on a corner
export function slideOffEdges(it, solidAt) {
  for (let i = 0; i < 80; i++) {
    const { cells, center, max } = footprint(it, solidAt);
    if (center >= max - 0.01) return;
    const high = cells.filter((c) => c.h > center + 0.01);
    const cx = high.reduce((s, c) => s + c.x + 0.5, 0) / high.length;
    const cz = high.reduce((s, c) => s + c.z + 0.5, 0) / high.length;
    const dir = new THREE.Vector2(it.pos.x - cx, it.pos.z - cz);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0);
    dir.normalize().multiplyScalar(0.25);
    it.pos.x += dir.x;
    it.pos.z += dir.y;
  }
}

// Loose items fall until they rest on something
export function stepItems(dt, items, solidAt) {
  for (const it of items) {
    if (it.held) continue;
    const floor = supportHeight(it, items, solidAt);
    if (it.pos.y > floor + 1e-3) {
      it.vy -= GRAVITY * dt;
      it.pos.y = Math.max(floor, it.pos.y + it.vy * dt);
      if (it.pos.y === floor) it.vy = 0;
    } else {
      it.pos.y = floor;
      it.vy = 0;
    }
    it.sync();
  }
}
