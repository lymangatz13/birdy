import * as THREE from 'three';

// A solid object on the desk (the laptop and the mug). pos is the bottom-centre of its box;
// w is its x size, d its z size, h its height. Jack can bump into and climb onto them.
// parts: [x0, y0, z0, x1, y1, z1, color, glow?] in local units relative to pos.
export class Item {
  constructor(name, w, d, h, parts) {
    this.name = name;
    this.w = w; this.d = d; this.h = h;
    this.pos = new THREE.Vector3();
    this.group = new THREE.Group();
    this.glowMats = [];
    for (const [x0, y0, z0, x1, y1, z1, color, glow] of parts) {
      const mat = glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
      if (glow) { mat.userData.base = new THREE.Color(color); this.glowMats.push(mat); }
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
  }
  place(x, y, z) { this.pos.set(x, y, z); this.group.position.copy(this.pos); return this; }
  // Quarter turns; swaps the footprint so the box still matches the model
  turn(quarters) {
    this.group.rotation.y = (quarters * Math.PI) / 2;
    if (quarters % 2) [this.w, this.d] = [this.d, this.w];
    return this;
  }
  get box() {
    return { x0: this.pos.x - this.w / 2, x1: this.pos.x + this.w / 2, y0: this.pos.y, y1: this.pos.y + this.h, z0: this.pos.z - this.d / 2, z1: this.pos.z + this.d / 2 };
  }
  setNight(night) {
    for (const m of this.glowMats) m.color.copy(m.userData.base).multiplyScalar(0.55 + 0.45 * night);
  }
}

export const makeMug = () => new Item('mug', 1.2, 1.2, 1.6, [
  [-0.6, 0, -0.6, 0.6, 1.6, 0.6, 0xe85d5d],
  [-0.45, 1.45, -0.45, 0.45, 1.62, 0.45, 0x5a2a1a], // coffee
  [-0.95, 0.4, -0.15, -0.6, 1.2, 0.15, 0xe85d5d],    // handle
]);

// Screen on the +x side, facing -x
export const makeLaptop = () => new Item('laptop', 4, 6, 4.4, [
  [-2, 0, -3, 2, 0.4, 3, 0x9aa0a6],
  [-1.6, 0.4, -2.5, 0.9, 0.5, 2.5, 0x5f666d],          // keyboard
  [1.6, 0.4, -3, 2, 4.4, 3, 0x9aa0a6],                 // lid
  [1.5, 0.8, -2.7, 1.6, 4.1, 2.7, 0x3a7bd5, true],     // screen
]);

// The laptop and mug on the desk, where they always start
export function deskItems(desk) {
  return [
    makeLaptop().turn(1).place(26, desk.top, 4),  // screen at the back, facing the room
    makeMug().place(21.5, desk.top, 6.5),
  ];
}
