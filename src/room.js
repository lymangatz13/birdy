import * as THREE from 'three';

// Attic bedroom built from voxels, at the giant's scale: 1 voxel = 10 cm, the giant is about
// 20 voxels tall and Jack about 2. Walls, floor and ceiling are 1 voxel thick.
// Interior spans x 1..56, y 1..30, z 1..52. The ceiling slopes down towards the north wall (z = 0).
// A giant beanstalk grows from the middle of the floor up through a hole in the ceiling.
export const SX = 58, SY = 32, SZ = 54;

export const AIR = 0, WALL = 1, FLOOR = 2, FLOOR2 = 3, CEIL = 4, BASE = 5, WOOD = 6, DARKWOOD = 7,
  MATTRESS = 8, BLANKET = 9, PILLOW = 10, FRAME = 11, GLASS = 12, RUG = 13, RUGEDGE = 14, DOOR = 15,
  METAL = 16, SHADE = 17, SCREEN = 18, LIGHT = 19, POT = 20, LEAF = 21, PAPER = 22, PIC_SKY = 23,
  PIC_SUN = 24, PIC_HILL = 25, BOOK_R = 26, BOOK_G = 27, BOOK_B = 28, BOOK_Y = 29,
  STALK = 30, STALK2 = 31, BEANLEAF = 32, BEANLEAF2 = 33, BLACK = 34, WHITE = 35, BLIND = 36,
  REDFRAME = 37, INK = 38, GREYCLOTH = 39, FLOWER_P = 40, FLOWER_O = 41, FLOWER_R = 42, FRIDGE = 43,
  FRIDGE_LED = 44, GUITAR = 45, GUITAR2 = 46, RED = 47, BASKET = 48, LAUNDRY = 49, PLASTIC = 50, SLOPE = 51;

const COLORS = [
  0, 0xe9e7d8, 0xb9824e, 0xa8743f, 0xf4f4f2, 0xfafafa, 0xa8764a, 0x5e3a1f,
  0xf2f0ea, 0x8c929b, 0xd9dadf, 0xf7f7f7, 0, 0xa8323a, 0xe8c27a, 0xc9a77c,
  0x9aa0a6, 0xffe6b0, 0x3a7bd5, 0xfff6e0, 0xc0603a, 0x3f8f3f, 0xf3ecd6, 0x8fc9f0,
  0xffd23f, 0x5fae3c, 0xc0392b, 0x27ae60, 0x2e86c1, 0xf1c40f,
  0x4c8c2b, 0x3b7322, 0x6cc04a, 0x58a83a, 0x1d1f22, 0xf2f2f0, 0xe6e4dc,
  0x7a1e22, 0x3a3a3a, 0x6f7480, 0xe89ab8, 0xf0a04b, 0xb8324a, 0x9ea3a8,
  0x3d6bff, 0xd9a441, 0x2a1a10, 0xd8343f, 0xf4f4f4, 0xcfd2d6, 0xffffff, 0xdcd8c6,
];

// Blocks that light up at night
export const GLOW = new Set([SHADE, SCREEN, LIGHT, FRIDGE_LED]);

// Ceiling height at a given z: a knee wall 13 voxels high at the north wall, sloping up to the flat ceiling
export const ceilingAt = (z) => Math.min(SY - 1, 13 + z);

// Desk that keeps the laptop and mug, on the north wall under the slope
export const DESK = { x0: 18, x1: 31, z0: 1, z1: 10, top: 9 };

// Beanstalk: centre line wobbles in a slow spiral around (BEAN.x, BEAN.z)
export const BEAN = { x: 26, z: 30, wobble: 2.2, radius: 2.4 };
export const beanCenter = (y) => ({
  x: BEAN.x + BEAN.wobble * Math.sin(y * 0.22),
  z: BEAN.z + BEAN.wobble * Math.cos(y * 0.22),
});
// Leaves the beanstalk grows, as climbing platforms: [height, angle, length]
export const BEAN_LEAVES = [];
for (let i = 0; i < 9; i++) BEAN_LEAVES.push([3 + i * 3, i * 1.35, 7 + (i % 3)]);

// Start spots
export const GIANT_START = { x: 12, z: 42, yaw: 2.2 };
export const JACK_START = { x: 24.5, y: DESK.top, z: 8 };

const idx = (x, y, z) => (x * SY + y) * SZ + z;

export function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildRoom() {
  const g = new Uint8Array(SX * SY * SZ);
  const inside = (x, y, z) => x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ;
  const set = (x, y, z, b) => { if (inside(x, y, z)) g[idx(x, y, z)] = b; };
  const get = (x, y, z) => (inside(x, y, z) ? g[idx(x, y, z)] : WALL);
  const fill = (x0, x1, y0, y1, z0, z1, b) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, b);
  };

  // Shell: walls, wood plank floor, ceiling, baseboards
  fill(0, SX - 1, 0, SY - 1, 0, SZ - 1, WALL);
  fill(1, SX - 2, 1, SY - 2, 1, SZ - 2, AIR);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) set(x, 0, z, (Math.floor(z / 3) + (Math.floor((x + (Math.floor(z / 3) % 2) * 7) / 14))) % 2 ? FLOOR2 : FLOOR);
  fill(0, SX - 1, SY - 1, SY - 1, 0, SZ - 1, CEIL);
  // Sloped ceiling over the north side
  for (let z = 1; z < SZ - 1; z++) for (let y = ceilingAt(z) + 1; y < SY - 1; y++) fill(1, SX - 2, y, y, z, z, SLOPE);
  fill(0, SX - 1, 1, 1, SZ - 1, SZ - 1, BASE);
  fill(0, 0, 1, 1, 0, SZ - 1, BASE);
  fill(SX - 1, SX - 1, 1, 1, 0, SZ - 1, BASE);
  fill(0, SX - 1, 1, 1, 0, 0, BASE);

  // Window on the east wall (x = 57) with white trim, half-open blinds and an air conditioner in it
  fill(57, 57, 10, 25, 21, 35, FRAME);
  fill(57, 57, 11, 24, 22, 34, GLASS);
  fill(56, 56, 10, 10, 20, 36, FRAME); // sill
  for (let y = 17; y <= 24; y++) if (y % 2) fill(56, 56, y, y, 22, 34, BLIND);
  fill(56, 56, 24, 24, 22, 34, WHITE);
  fill(53, 56, 11, 14, 23, 33, WHITE); // AC unit
  for (let z = 24; z <= 32; z += 2) fill(53, 53, 12, 13, z, z, PLASTIC);

  // Two framed diplomas above the window
  fill(56, 56, 25, 30, 20, 27, REDFRAME);
  fill(56, 56, 26, 29, 21, 26, PAPER);
  fill(56, 56, 28, 28, 22, 25, INK); fill(56, 56, 27, 27, 22, 24, INK);
  fill(56, 56, 25, 29, 29, 34, BLACK);
  fill(56, 56, 26, 28, 30, 33, PAPER);
  fill(56, 56, 27, 27, 30, 32, INK);

  // Bug-zapper racket hanging on the wall left of the window, and a wall vase of flowers below it
  for (let y = 21; y <= 28; y++) for (let z = 15; z <= 20; z++) {
    const dy = y - 24.5, dz = z - 17.5;
    if (dy * dy / 12.5 + dz * dz / 9 <= 1) set(56, y, z, dy * dy / 12.5 + dz * dz / 9 > 0.6 ? WHITE : METAL);
  }
  fill(56, 56, 15, 20, 17, 18, WHITE);
  fill(55, 56, 11, 14, 17, 18, METAL);
  for (let y = 15; y <= 19; y++) for (let z = 15; z <= 20; z++) for (let x = 54; x <= 55; x++)
    if (hash(x, y, z) > 0.35) set(x, y, z, [FLOWER_P, FLOWER_O, FLOWER_R, LEAF, LEAF][Math.floor(hash(z, x, y) * 5)]);

  // Bed by the window: dark wood frame raised on legs (there is a gap under it to hide in),
  // white sheets, grey pillows and a rumpled blanket
  fill(40, 56, 3, 3, 37, 46, DARKWOOD);
  for (const [x, z] of [[40, 37], [40, 46], [56, 37], [56, 46], [48, 37], [48, 46]]) fill(x, x, 1, 2, z, z, DARKWOOD);
  fill(55, 56, 4, 13, 37, 46, DARKWOOD); // headboard
  fill(40, 54, 4, 6, 37, 46, MATTRESS);
  fill(50, 54, 7, 8, 38, 41, PILLOW); fill(50, 54, 7, 8, 42, 45, GREYCLOTH);
  fill(41, 49, 7, 7, 38, 45, MATTRESS);
  for (let x = 41; x <= 48; x++) for (let z = 38; z <= 46; z++) if (hash(x, 7, z) > 0.55) set(x, 7, z, BLANKET);
  // Blanket slumped off the side onto the floor in folds: a way up for Jack
  fill(39, 39, 1, 4, 40, 44, BLANKET);
  fill(38, 38, 1, 2, 40, 44, BLANKET);

  // Nightstand with a lamp, a printer, a red cup and a toilet roll
  fill(50, 56, 1, 9, 47, 52, DARKWOOD);
  fill(50, 50, 5, 5, 48, 51, WOOD);
  fill(53, 56, 10, 12, 47, 51, WHITE);           // printer
  fill(54, 55, 13, 13, 48, 50, BLACK);
  fill(51, 51, 10, 11, 48, 48, RED);             // cup
  fill(51, 52, 10, 11, 50, 51, WHITE);           // toilet roll
  fill(55, 55, 13, 18, 52, 52, BLACK);           // lamp arm
  fill(53, 55, 18, 20, 50, 52, SHADE);

  // Black radiator in front of the nightstand
  for (let x = 44; x <= 49; x++) fill(x, x, 1, 9, 49, 52, x % 2 ? BLACK : 0);
  fill(44, 49, 9, 9, 49, 52, BLACK);
  fill(44, 49, 1, 1, 49, 52, BLACK);

  // North wall, under the slope, from the west: dresser, mini fridge, the desk, white desk, guitar
  fill(2, 10, 1, 12, 1, 8, WOOD);
  for (const y of [3, 6, 9]) { fill(2, 10, y, y, 8, 8, DARKWOOD); fill(4, 4, y + 1, y + 1, 9, 9, METAL); fill(8, 8, y + 1, y + 1, 9, 9, METAL); }
  fill(2, 10, 12, 12, 1, 8, DARKWOOD);
  fill(3, 5, 13, 16, 3, 5, PAPER); fill(3, 5, 16, 16, 3, 5, RED);   // wipes canister
  fill(7, 9, 13, 14, 2, 6, GREYCLOTH);                               // hat
  fill(12, 16, 1, 9, 1, 6, FRIDGE);
  fill(12, 16, 9, 9, 1, 6, BLACK);
  fill(12, 12, 2, 3, 2, 5, FRIDGE_LED);
  fill(13, 15, 10, 13, 2, 4, WHITE);                                 // kettle

  // The desk (laptop and mug are separate objects, see items.js), with drawers and clutter
  fill(DESK.x0, DESK.x1 - 1, DESK.top - 1, DESK.top - 1, DESK.z0, DESK.z1 - 1, WOOD);
  fill(DESK.x0, DESK.x0 + 3, 1, DESK.top - 2, DESK.z0, DESK.z1 - 2, WOOD);       // drawer column
  for (const y of [2, 4, 6]) fill(DESK.x0, DESK.x0 + 3, y, y, DESK.z1 - 2, DESK.z1 - 2, DARKWOOD);
  for (const x of [DESK.x1 - 1]) for (const z of [DESK.z0, DESK.z1 - 1]) fill(x, x, 1, DESK.top - 2, z, z, DARKWOOD);
  fill(DESK.x0 + 1, DESK.x0 + 2, 9, 12, 2, 2, WHITE);     // pen cup
  fill(DESK.x0 + 1, DESK.x0 + 1, 13, 14, 2, 2, RED);
  fill(29, 30, 9, 10, 7, 8, WHITE); fill(29, 30, 11, 11, 7, 8, RED); // pill bottles

  // White desk with two monitors, a keyboard and an amp under it
  fill(32, 44, 8, 8, 1, 9, WHITE);
  for (const x of [32, 44]) fill(x, x, 1, 7, 1, 9, WHITE);
  fill(33, 38, 10, 15, 2, 2, BLACK); fill(34, 37, 11, 14, 3, 3, SCREEN); fill(35, 36, 9, 9, 2, 3, BLACK);
  fill(39, 43, 10, 14, 2, 2, BLACK); fill(39, 43, 9, 9, 2, 3, BLACK);
  fill(35, 41, 9, 9, 5, 6, BLACK);
  fill(39, 42, 1, 5, 2, 6, BLACK); fill(40, 41, 3, 4, 7, 7, METAL);

  // Electric guitar leaning on the wall
  fill(47, 49, 1, 5, 2, 3, GUITAR2); fill(48, 48, 3, 3, 4, 4, WHITE);
  fill(47, 49, 6, 6, 2, 3, BLACK);
  fill(48, 48, 7, 14, 2, 2, GUITAR);
  fill(48, 48, 15, 15, 2, 2, BLACK);

  // Gaming chair in front of the white desk, facing it: wheels, seat, armrests, tall striped back
  for (const [x, z] of [[35, 13], [41, 13], [38, 11], [38, 17], [35, 17], [41, 17]]) set(x, 1, z, BLACK);
  fill(37, 39, 2, 3, 13, 15, METAL);
  fill(35, 41, 4, 5, 11, 16, BLACK);
  fill(36, 40, 5, 5, 12, 15, WHITE);
  fill(35, 35, 6, 7, 12, 15, BLACK); fill(41, 41, 6, 7, 12, 15, BLACK);
  fill(35, 41, 6, 18, 16, 17, BLACK);
  for (let y = 6; y <= 18; y++) { set(36, y, 16, WHITE); set(40, y, 16, WHITE); }
  fill(37, 39, 14, 17, 16, 16, WHITE);

  // Bookshelf on the west wall
  fill(1, 3, 1, 18, 28, 35, DARKWOOD);
  fill(2, 3, 2, 17, 29, 34, AIR);
  const BOOKS = [BOOK_R, BOOK_G, BOOK_B, BOOK_Y];
  for (const shelf of [6, 12]) fill(2, 3, shelf, shelf, 29, 34, DARKWOOD);
  for (const base of [2, 7, 13]) for (let z = 29; z <= 34; z++) {
    const h = 2 + Math.floor(hash(base, z, 7) * 3);
    fill(2, 3, base, base + h - 1, z, z, BOOKS[Math.floor(hash(z, base, 3) * 4)]);
  }

  // Framed picture on the west wall: sun over hills
  fill(1, 1, 17, 23, 16, 24, DARKWOOD);
  fill(1, 1, 18, 22, 17, 23, PIC_SKY);
  fill(1, 1, 18, 19, 17, 23, PIC_HILL);
  fill(1, 1, 20, 20, 19, 21, PIC_HILL);
  fill(1, 1, 21, 22, 21, 22, PIC_SUN);

  // Door on the west wall with a light switch beside it
  fill(0, 0, 1, 22, 40, 50, FRAME);
  fill(0, 0, 1, 21, 41, 49, DOOR);
  set(1, 10, 42, METAL);
  fill(1, 1, 12, 14, 38, 38, WHITE);

  // Rug
  fill(10, 34, 1, 1, 20, 40, RUGEDGE);
  fill(11, 33, 1, 1, 21, 39, RUG);

  // Laundry basket with clothes spilling out, and a pair of shoes
  for (let x = 30; x <= 36; x++) for (let z = 44; z <= 50; z++) for (let y = 1; y <= 8; y++) {
    const edge = x === 30 || x === 36 || z === 44 || z === 50;
    if (edge) set(x, y, z, (y + x + z) % 3 === 0 ? AIR : BASKET);
    else if (y === 1) set(x, y, z, BASKET);
  }
  for (let x = 30; x <= 36; x++) for (let z = 44; z <= 50; z++) if (hash(x, 9, z) > 0.3) set(x, 9, z, LAUNDRY);
  fill(31, 35, 2, 8, 45, 49, LAUNDRY);
  fill(28, 29, 1, 1, 43, 47, LAUNDRY);
  fill(36, 37, 1, 1, 30, 33, BLACK); fill(39, 40, 1, 1, 31, 34, BLACK);
  // Cardboard box beside the gaming chair (Jack's step up to the seat and the desks)
  fill(31, 34, 1, 3, 12, 15, PAPER);
  fill(31, 34, 3, 3, 13, 13, WOOD);

  // Potted plant in the corner
  fill(2, 4, 1, 4, 48, 51, POT);
  fill(3, 3, 5, 6, 49, 50, LEAF);
  for (let x = 1; x <= 6; x++) for (let y = 6; y <= 10; y++) for (let z = 46; z <= 52; z++) {
    const dx = x - 3, dy = y - 8, dz = z - 49.5;
    if (dx * dx + dy * dy * 1.5 + dz * dz < 7 && hash(x, y, z) > 0.25) set(x, y, z, LEAF);
  }

  // Ceiling light
  fill(40, 44, 30, 30, 28, 32, LIGHT);

  // The giant beanstalk: a striped stalk that wobbles up through a hole in the ceiling, with big
  // leaves spiralling around it that Jack can climb
  for (let y = 1; y < SY; y++) {
    const c = beanCenter(y), r = BEAN.radius - y * 0.015;
    for (let x = Math.floor(c.x - r - 1); x <= c.x + r + 1; x++) for (let z = Math.floor(c.z - r - 1); z <= c.z + r + 1; z++) {
      const dx = x + 0.5 - c.x, dz = z + 0.5 - c.z;
      if (dx * dx + dz * dz <= r * r) set(x, y, z, (Math.floor(Math.atan2(dz, dx) * 2.5 + y * 0.3) % 2) ? STALK : STALK2);
    }
    if (y === SY - 1) {
      const hole = r + 2.2; // ragged hole the stalk broke through
      for (let x = Math.floor(c.x - hole - 1); x <= c.x + hole + 1; x++) for (let z = Math.floor(c.z - hole - 1); z <= c.z + hole + 1; z++) {
        const dx = x + 0.5 - c.x, dz = z + 0.5 - c.z, d = Math.hypot(dx, dz);
        if (d > r && d <= hole + hash(x, 0, z) * 1.2) set(x, y, z, AIR);
      }
    }
  }
  for (const [y, angle, length] of BEAN_LEAVES) {
    const c = beanCenter(y), ux = Math.cos(angle), uz = Math.sin(angle);
    for (let x = Math.floor(c.x - 14); x <= c.x + 14; x++) for (let z = Math.floor(c.z - 14); z <= c.z + 14; z++) {
      const dx = x + 0.5 - c.x, dz = z + 0.5 - c.z;
      const along = dx * ux + dz * uz - BEAN.radius + 0.6, across = -dx * uz + dz * ux;
      const halfWidth = 2.1 * Math.sin(Math.PI * Math.min(1, Math.max(0, along / length)));
      if (along >= 0 && along <= length && Math.abs(across) <= halfWidth && get(x, y, z) === AIR)
        set(x, y, z, Math.abs(across) < 0.6 ? BEANLEAF2 : BEANLEAF);
    }
  }

  return g;
}

// Outside the room counts as solid, except straight up through the hole in the ceiling
export function solidAt(g, x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  if (x < 0 || x >= SX || z < 0 || z >= SZ || y < 0) return true;
  if (y >= SY) return false;
  return g[idx(x, y, z)] !== AIR;
}

// What blocks the giant: like solidAt, but the giant brushes through the beanstalk's leaves
export function giantSolidAt(g, x, y, z) {
  if (!solidAt(g, x, y, z)) return false;
  if (y >= SY || y < 0) return true;
  const b = g[idx(Math.floor(x), Math.floor(y), Math.floor(z))];
  return b !== BEANLEAF && b !== BEANLEAF2;
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
const AO = [0.5, 0.68, 0.84, 1];

// Meshes the blocks that pass `include`, with soft ambient occlusion in corners.
// Glass is never meshed (it is drawn as one transparent pane).
export function buildGeometry(g, include = () => true) {
  const pos = [], nor = [], col = [], ind = [];
  const c = new THREE.Color();
  const block = (x, y, z) => (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ ? AIR : g[idx(x, y, z)]);
  const open = (x, y, z) => { const b = block(x, y, z); return b === AIR || b === GLASS; };
  const occ = (x, y, z) => (open(x, y, z) ? 0 : 1);
  for (let x = 0; x < SX; x++) for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) {
    const b = g[idx(x, y, z)];
    if (b === AIR || b === GLASS || !include(b)) continue;
    const shade = 0.93 + hash(x, y, z) * 0.14;
    for (const [n, corners] of FACES) {
      const ox = x + n[0], oy = y + n[1], oz = z + n[2];
      if (!open(ox, oy, oz)) continue;
      const v = pos.length / 3;
      const ao = [];
      for (const k of corners) {
        // The two tangent axes of this face; step towards the corner along each
        const t = [0, 1, 2].filter((a) => n[a] === 0);
        const s = t.map((a) => (k[a] ? 1 : -1));
        const d1 = [0, 0, 0], d2 = [0, 0, 0];
        d1[t[0]] = s[0]; d2[t[1]] = s[1];
        const s1 = occ(ox + d1[0], oy + d1[1], oz + d1[2]);
        const s2 = occ(ox + d2[0], oy + d2[1], oz + d2[2]);
        const cc = occ(ox + d1[0] + d2[0], oy + d1[1] + d2[1], oz + d1[2] + d2[2]);
        const level = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
        ao.push(level);
        c.setHex(COLORS[b]).multiplyScalar(shade * AO[level]);
        pos.push(x + k[0], y + k[1], z + k[2]);
        nor.push(...n);
        col.push(c.r, c.g, c.b);
      }
      // Flip the quad's diagonal so the darker corners blend evenly
      if (ao[0] + ao[2] < ao[1] + ao[3]) ind.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
      else ind.push(v, v + 1, v + 2, v, v + 2, v + 3);
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
    this.giantSolidAt = (x, y, z) => giantSolidAt(this.grid, x, y, z);

    this.mesh = new THREE.Mesh(
      buildGeometry(this.grid, (b) => !GLOW.has(b)),
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.glow = new THREE.Mesh(
      buildGeometry(this.grid, (b) => GLOW.has(b)),
      new THREE.MeshBasicMaterial({ vertexColors: true })
    );

    // Window glass: one faint pane over the glass cells (x = 57, y 11..24, z 22..34)
    this.glass = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 14),
      new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    this.glass.rotation.y = -Math.PI / 2;
    this.glass.position.set(57.5, 18, 28.5);

    // The beanstalk keeps growing above the roof, towards the sky
    this.stalkTop = new THREE.Group();
    const stalkMat = new THREE.MeshLambertMaterial({ color: 0x4c8c2b });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x6cc04a, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const y = SY + i * 6, c = beanCenter(y);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(BEAN.radius * 0.9 - i * 0.06, BEAN.radius * 0.9 - i * 0.05, 6.2, 10), stalkMat);
      seg.position.set(c.x, y + 3, c.z);
      this.stalkTop.add(seg);
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(3, 8), leafMat);
      leaf.scale.set(1.8, 0.8, 1);
      leaf.rotation.set(-Math.PI / 2 + 0.3, 0, i * 1.35);
      leaf.position.set(c.x + Math.cos(i * 1.35) * 4.5, y + 2, c.z + Math.sin(i * 1.35) * 4.5);
      this.stalkTop.add(leaf);
    }

    // Ceiling light, bedside lamp and the fridge's blue light; the ceiling light casts shadows
    this.ceilingLight = new THREE.PointLight(0xfff1d6, 0, 0, 1.1);
    this.ceilingLight.position.set(42.5, 28.5, 30.5);
    this.ceilingLight.castShadow = true;
    this.ceilingLight.shadow.mapSize.set(1024, 1024);
    this.ceilingLight.shadow.bias = -0.004;
    this.ceilingLight.shadow.camera.near = 0.5;
    this.ceilingLight.shadow.camera.far = 90;
    this.lamp = new THREE.PointLight(0xffc27a, 0, 0, 1.2);
    this.lamp.position.set(54, 17, 51);
    this.fridgeGlow = new THREE.PointLight(0x3d6bff, 6, 10, 1.5);
    this.fridgeGlow.position.set(11, 2.5, 3.5);

    // Daylight from the window, spread around the room
    this.daylight = new THREE.AmbientLight(0xfff4e6, 0);

    scene.add(this.mesh, this.glow, this.glass, this.stalkTop, this.ceilingLight, this.lamp, this.fridgeGlow, this.daylight);
  }
  // night: 0 = full day, 1 = full night
  update(night) {
    this.daylight.intensity = 0.25 + 0.55 * (1 - night);
    this.ceilingLight.intensity = 30 + 50 * night;
    this.lamp.intensity = 6 + 18 * night;
    this.glow.material.color.setScalar(0.6 + 0.4 * night);
  }
}
