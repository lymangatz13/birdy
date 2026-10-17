import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export const CHUNK = 16, HEIGHT = 64, WATER = 20, R = 8;
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, WATER_B = 5, WOOD = 6, LEAVES = 7;
const COLORS = [0, 0x5fae3c, 0x8b5a2b, 0x888888, 0xe0d090, 0x3a6fd8, 0x6b4423, 0x2f7d32];
const P = CHUNK + 2;

// Seeded PRNG (mulberry32)
export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Terrain {
  constructor(seed) {
    const r = rng(seed);
    this.seed = seed;
    this.n1 = createNoise2D(r);
    this.n2 = createNoise2D(r);
    this.n3 = createNoise2D(r);
  }
  height(x, z) {
    const h = this.n1(x / 120, z / 120) * 0.6 + this.n2(x / 40, z / 40) * 0.3 + this.n3(x / 12, z / 12) * 0.1;
    const m = (this.n2(x / 400, z / 400) + 1) / 2; // mountain factor
    return Math.max(1, Math.min(HEIGHT - 10, Math.floor(WATER + 2 + h * (8 + m * 24))));
  }
  isTree(x, z) {
    return hash(x, z, this.seed) < 0.012;
  }
}

const idx = (x, y, z) => ((x + 1) * P + (z + 1)) * HEIGHT + y;

// Padded block data: x,z in -1..CHUNK
export function generateChunk(t, cx, cz) {
  const d = new Uint8Array(P * P * HEIGHT);
  const set = (x, y, z, b) => {
    if (x < -1 || x > CHUNK || z < -1 || z > CHUNK || y < 0 || y >= HEIGHT) return;
    if (d[idx(x, y, z)] === AIR) d[idx(x, y, z)] = b;
  };
  for (let x = -1; x <= CHUNK; x++) for (let z = -1; z <= CHUNK; z++) {
    const h = t.height(cx * CHUNK + x, cz * CHUNK + z);
    for (let y = 0; y <= h; y++)
      d[idx(x, y, z)] = y === h ? (h <= WATER + 1 ? SAND : GRASS) : y > h - 3 ? DIRT : STONE;
    for (let y = h + 1; y <= WATER; y++) d[idx(x, y, z)] = WATER_B;
  }
  for (let x = -3; x <= CHUNK + 2; x++) for (let z = -3; z <= CHUNK + 2; z++) {
    const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
    if (!t.isTree(wx, wz)) continue;
    const h = t.height(wx, wz);
    if (h <= WATER + 1) continue;
    for (let y = h + 1; y <= h + 4; y++) set(x, y, z, WOOD);
    for (let y = h + 3; y <= h + 6; y++) {
      const r = y === h + 6 ? 1 : 2;
      for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++)
        if (Math.abs(i) + Math.abs(k) < r * 2 || r === 1) set(x + i, y, z + k, LEAVES);
    }
  }
  return d;
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

export function buildGeometry(d, seed) {
  const pos = [], nor = [], col = [], ind = [];
  const c = new THREE.Color();
  for (let x = 0; x < CHUNK; x++) for (let z = 0; z < CHUNK; z++) for (let y = 0; y < HEIGHT; y++) {
    const b = d[idx(x, y, z)];
    if (b === AIR) continue;
    c.setHex(COLORS[b]).multiplyScalar(0.9 + hash(x * 31 + y, z * 17 - y, seed) * 0.2);
    for (const [n, corners] of FACES) {
      const ny = y + n[1];
      if (ny < 0) continue;
      if (ny < HEIGHT && d[idx(x + n[0], ny, z + n[2])] !== AIR) continue;
      const v = pos.length / 3;
      for (const k of corners) {
        pos.push(x + k[0], y + k[1], z + k[2]);
        nor.push(...n);
        col.push(c.r, c.g, c.b);
      }
      ind.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(ind, 1));
  return g;
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.terrain = new Terrain(seed);
    this.chunks = new Map();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  update(p, budget = 2) {
    const pcx = Math.floor(p.x / CHUNK), pcz = Math.floor(p.z / CHUNK);
    for (const [k, ch] of this.chunks) {
      const dx = ch.cx - pcx, dz = ch.cz - pcz;
      if (dx * dx + dz * dz > (R + 1) ** 2) {
        this.scene.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        this.chunks.delete(k);
      }
    }
    const todo = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++)
      if (dx * dx + dz * dz <= R * R && !this.chunks.has(`${pcx + dx},${pcz + dz}`))
        todo.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
    todo.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of todo.slice(0, budget)) {
      const data = generateChunk(this.terrain, cx, cz);
      const mesh = new THREE.Mesh(buildGeometry(data, this.terrain.seed), this.mat);
      mesh.position.set(cx * CHUNK, 0, cz * CHUNK);
      this.scene.add(mesh);
      this.chunks.set(`${cx},${cz}`, { cx, cz, data, mesh });
    }
  }
  // Top surface y at world x,z (includes trees and water)
  heightAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = this.chunks.get(`${cx},${cz}`);
    if (!ch) return Math.max(this.terrain.height(x, z), WATER) + 1;
    const lx = Math.floor(x) - cx * CHUNK, lz = Math.floor(z) - cz * CHUNK;
    for (let y = HEIGHT - 1; y >= 0; y--) if (ch.data[idx(lx, y, lz)] !== AIR) return y + 1;
    return 0;
  }
}
