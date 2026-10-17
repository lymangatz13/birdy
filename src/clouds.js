import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { rng } from './world.js';

const S = 8, N = 36, Y = 90, WIND = 3;

export class Clouds {
  constructor(scene, seed) {
    this.noise = createNoise2D(rng(seed + 1));
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(S, 4, S),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      N * N
    );
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    scene.add(this.group);
    this.wind = 0;
    this.key = '';
  }
  update(dt, p, color) {
    this.mesh.material.color.copy(color);
    this.wind += dt * WIND;
    this.group.position.x = this.wind;
    const gx0 = Math.floor((p.x - this.wind) / S) - N / 2, gz0 = Math.floor(p.z / S) - N / 2;
    const key = `${gx0},${gz0}`;
    if (key === this.key) return;
    this.key = key;
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const gx = gx0 + i, gz = gz0 + j;
      if (this.noise(gx / 8, gz / 8) * 0.7 + this.noise(gx / 3, gz / 3) * 0.3 > 0.35) {
        m.makeTranslation((gx + 0.5) * S, Y, (gz + 0.5) * S);
        this.mesh.setMatrixAt(k++, m);
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
