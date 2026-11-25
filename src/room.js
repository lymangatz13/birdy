import * as THREE from 'three';

// Bedroom built from voxels. 1 voxel = 10 cm. Walls, floor and ceiling are 1 voxel thick.
// Interior spans x 1..40 (4 m), y 1..26 (2.6 m), z 1..36 (3.6 m).
export const SX = 42, SY = 28, SZ = 38;

export const AIR = 0, WALL = 1, FLOOR = 2, FLOOR2 = 3, CEIL = 4, BASE = 5, WOOD = 6, DARKWOOD = 7,
  MATTRESS = 8, BLANKET = 9, PILLOW = 10, FRAME = 11, GLASS = 12, RUG = 13, RUGEDGE = 14, DOOR = 15,
  METAL = 16, SHADE = 17, SCREEN = 18, LIGHT = 19, POT = 20, LEAF = 21, MUG = 22, PIC_SKY = 23,
  PIC_SUN = 24, PIC_HILL = 25, BOOK_R = 26, BOOK_G = 27, BOOK_B = 28, BOOK_Y = 29;

const COLORS = [
  0, 0xdfe6ec, 0xb07a4a, 0xa06d40, 0xf4f4f2, 0xfafafa, 0xa8764a, 0x6b4423,
  0xf2efe6, 0x3f6fb5, 0xffffff, 0xf7f7f7, 0, 0xa8323a, 0xe8c27a, 0xc9a77c,
  0x9aa0a6, 0xffd9a0, 0x3a7bd5, 0xfff6e0, 0xc0603a, 0x3f8f3f, 0xe85d5d, 0x8fc9f0,
  0xffd23f, 0x5fae3c, 0xc0392b, 0x27ae60, 0x2e86c1, 0xf1c40f,
];

// Blocks that light up at night
export const GLOW = new Set([SHADE, SCREEN, LIGHT]);

// Where the robot stands: in front of the desk, eyes at 1.4 m, facing the window (+x)
export const ROBOT_EYE = new THREE.Vector3(30.5, 15, 19.5);
export const ROBOT_YAW = -Math.PI / 2;

// Desk top surface: x 33..41, z 13..27, walking height y = 9
export const DESK = { x0: 33, x1: 41, z0: 13, z1: 27, top: 9 };

const idx = (x, y, z) => (x * SY + y) * SZ + z;

export function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildRoom() {
  const g = new Uint8Array(SX * SY * SZ);
  const fill = (x0, x1, y0, y1, z0, z1, b) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
      if (x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ) g[idx(x, y, z)] = b;
  };

  // Shell: walls, wood plank floor, ceiling, baseboards
  fill(0, SX - 1, 0, SY - 1, 0, SZ - 1, WALL);
  fill(1, SX - 2, 1, SY - 2, 1, SZ - 2, AIR);
  for (let z = 0; z < SZ; z++) fill(0, SX - 1, 0, 0, z, z, Math.floor(z / 3) % 2 ? FLOOR2 : FLOOR);
  fill(0, SX - 1, SY - 1, SY - 1, 0, SZ - 1, CEIL);
  fill(0, SX - 1, 1, 1, 0, 0, BASE);
  fill(0, SX - 1, 1, 1, SZ - 1, SZ - 1, BASE);
  fill(0, 0, 1, 1, 0, SZ - 1, BASE);
  fill(SX - 1, SX - 1, 1, 1, 0, SZ - 1, BASE);

  // Window on the east wall (x = 41), two-by-two panes with a sill
  fill(41, 41, 11, 22, 12, 27, FRAME);
  fill(41, 41, 12, 21, 13, 26, GLASS);
  fill(41, 41, 12, 21, 19, 20, FRAME);
  fill(41, 41, 16, 17, 13, 26, FRAME);
  fill(40, 40, 10, 10, 11, 28, FRAME);

  // Door on the front wall (z = 37) with white trim and a knob
  fill(25, 34, 1, 21, 37, 37, FRAME);
  fill(26, 33, 1, 20, 37, 37, DOOR);
  fill(27, 27, 10, 10, 36, 36, METAL);

  // Bed against the back wall
  fill(3, 17, 1, 3, 1, 20, WOOD);
  fill(3, 17, 4, 5, 2, 20, MATTRESS);
  fill(3, 17, 6, 6, 8, 20, BLANKET);
  fill(3, 3, 3, 5, 8, 20, BLANKET);
  fill(17, 17, 3, 5, 8, 20, BLANKET);
  fill(3, 17, 3, 5, 20, 20, BLANKET);
  fill(4, 9, 6, 7, 2, 5, PILLOW);
  fill(11, 16, 6, 7, 2, 5, PILLOW);
  fill(3, 17, 1, 11, 1, 1, DARKWOOD);

  // Nightstand with a lamp
  fill(19, 23, 1, 6, 1, 5, WOOD);
  fill(19, 23, 4, 4, 5, 5, DARKWOOD);
  fill(20, 22, 7, 7, 2, 4, METAL);
  fill(21, 21, 8, 9, 3, 3, METAL);
  fill(20, 22, 10, 12, 2, 4, SHADE);

  // Desk under the window (the laptop and mug are movable items, see items.js)
  fill(DESK.x0, DESK.x1 - 1, DESK.top - 1, DESK.top - 1, DESK.z0, DESK.z1 - 1, WOOD);
  for (const [x, z] of [[33, 13], [33, 26], [40, 13], [40, 26]]) fill(x, x, 1, 7, z, z, DARKWOOD);

  // Wardrobe on the front wall
  fill(3, 14, 1, 22, 32, 36, WOOD);
  fill(8, 9, 2, 21, 32, 32, DARKWOOD);
  fill(7, 7, 11, 12, 31, 31, METAL);
  fill(10, 10, 11, 12, 31, 31, METAL);

  // Bookshelf on the west wall with books on each shelf
  fill(1, 3, 1, 18, 23, 30, DARKWOOD);
  fill(2, 3, 2, 17, 24, 29, AIR);
  const BOOKS = [BOOK_R, BOOK_G, BOOK_B, BOOK_Y];
  for (const shelf of [6, 12]) fill(2, 3, shelf, shelf, 24, 29, DARKWOOD);
  for (const base of [2, 7, 13]) for (let z = 24; z <= 29; z++) {
    const h = 2 + Math.floor(hash(base, z, 7) * 3);
    fill(2, 3, base, base + h - 1, z, z, BOOKS[Math.floor(hash(z, base, 3) * 4)]);
  }

  // Framed picture on the west wall: sun over hills
  fill(1, 1, 13, 19, 7, 15, DARKWOOD);
  fill(1, 1, 14, 18, 8, 14, PIC_SKY);
  fill(1, 1, 14, 15, 8, 14, PIC_HILL);
  fill(1, 1, 16, 16, 10, 12, PIC_HILL);
  fill(1, 1, 17, 18, 12, 13, PIC_SUN);

  // Rug with a border
  fill(8, 26, 1, 1, 22, 31, RUGEDGE);
  fill(9, 25, 1, 1, 23, 30, RUG);

  // Ceiling light
  fill(18, 23, 26, 26, 16, 21, LIGHT);

  // Potted plant in the corner
  fill(37, 39, 1, 4, 32, 35, POT);
  fill(38, 38, 5, 6, 33, 34, LEAF);
  for (let x = 36; x <= 40; x++) for (let y = 6; y <= 10; y++) for (let z = 31; z <= 36; z++) {
    const dx = x - 38, dy = y - 8, dz = z - 33.5;
    if (dx * dx + dy * dy * 1.5 + dz * dz < 7 && hash(x, y, z) > 0.25 && z < SZ - 1 && x < SX - 1) g[idx(x, y, z)] = LEAF;
  }

  return g;
}

// Outside the room counts as solid, so nothing can leave it
export function solidAt(g, x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  if (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ) return true;
  return g[idx(x, y, z)] !== AIR;
}

// [normal, 4 corners] CCW from outside
const FACES = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

// Meshes the blocks that pass `include`. Glass is never meshed (it is drawn as one transparent pane).
export function buildGeometry(g, include = () => true) {
  const pos = [], nor = [], col = [], ind = [];
  const c = new THREE.Color();
  const open = (x, y, z) => {
    if (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ) return false;
    const b = g[idx(x, y, z)];
    return b === AIR || b === GLASS;
  };
  for (let x = 0; x < SX; x++) for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) {
    const b = g[idx(x, y, z)];
    if (b === AIR || b === GLASS || !include(b)) continue;
    c.setHex(COLORS[b]).multiplyScalar(0.93 + hash(x, y, z) * 0.14);
    for (const [n, corners] of FACES) {
      if (!open(x + n[0], y + n[1], z + n[2])) continue;
      const v = pos.length / 3;
      for (const k of corners) {
        pos.push(x + k[0], y + k[1], z + k[2]);
        nor.push(...n);
        col.push(c.r, c.g, c.b);
      }
      ind.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(new THREE.Uint32BufferAttribute(ind, 1));
  return geo;
}

export class Room {
  constructor(scene) {
    this.grid = buildRoom();
    this.solidAt = (x, y, z) => solidAt(this.grid, x, y, z);

    this.mesh = new THREE.Mesh(
      buildGeometry(this.grid, (b) => !GLOW.has(b)),
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    this.glow = new THREE.Mesh(
      buildGeometry(this.grid, (b) => GLOW.has(b)),
      new THREE.MeshBasicMaterial({ vertexColors: true })
    );

    // Window glass: one faint pane over the glass cells (x = 41, y 12..21, z 13..26)
    this.glass = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 10),
      new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    this.glass.rotation.y = -Math.PI / 2;
    this.glass.position.set(41.5, 17, 20);

    // Bedside lamp light, on at night
    this.lamp = new THREE.PointLight(0xffc27a, 0, 0, 1);
    this.lamp.position.set(21.5, 10, 3.5);

    // Daylight from the window, spread around the room
    this.daylight = new THREE.AmbientLight(0xfff4e6, 0);

    scene.add(this.mesh, this.glow, this.glass, this.lamp, this.daylight);
  }
  // night: 0 = full day, 1 = full night
  update(night) {
    this.daylight.intensity = 0.05 + 0.6 * (1 - night);
    this.lamp.intensity = 22 * night;
    this.glow.material.color.setScalar(0.55 + 0.45 * night);
  }
}
