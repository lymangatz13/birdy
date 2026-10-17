import * as THREE from 'three';

export const DAY_SECONDS = 24 * 60; // real seconds per game day
export const START_HOUR = 6;

export const hours = (t) => ((t / DAY_SECONDS) * 24 + START_HOUR) % 24;

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Sun rises east (+x) at 6:00, overhead at 12:00, sets west at 18:00
export function sunDir(h) {
  const a = ((h - 6) / 24) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), Math.sin(a), 0.25).normalize();
}

const WHITE = new THREE.Color(0xffffff), NIGHT = new THREE.Color(0x0b1026), DAY = new THREE.Color(0x87ceeb), DUSK = new THREE.Color(0xff8c42);

export class Sky {
  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445522, 0.5);
    this.sunLight = new THREE.DirectionalLight(0xfff2d0, 1);
    this.moonLight = new THREE.DirectionalLight(0x8899ff, 0.2);
    this.sun = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0xffdd55, fog: false }));
    this.moon = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0xe8e8f0, fog: false }));
    const s = [];
    for (let i = 0; i < 1000; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(450);
      if (v.y > -50) s.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false }));
    scene.add(this.hemi, this.sunLight, this.sunLight.target, this.moonLight, this.moonLight.target, this.sun, this.moon, this.stars);
  }
  update(h, center) {
    const s = sunDir(h), m = s.clone().negate();
    const d = smoothstep(-0.1, 0.3, s.y);
    const sky = NIGHT.clone().lerp(DAY, d).lerp(DUSK, Math.max(0, 1 - Math.abs(s.y) / 0.25) * 0.5);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.sun.position.copy(s).multiplyScalar(400).add(center);
    this.moon.position.copy(m).multiplyScalar(400).add(center);
    this.sun.lookAt(center);
    this.moon.lookAt(center);
    this.sunLight.position.copy(s).multiplyScalar(100).add(center);
    this.moonLight.position.copy(m).multiplyScalar(100).add(center);
    this.sunLight.target.position.copy(center);
    this.moonLight.target.position.copy(center);
    this.sunLight.intensity = d * 1.2;
    this.moonLight.intensity = m.y > 0 ? (1 - d) * 0.3 : 0;
    this.hemi.intensity = 0.08 + 0.57 * d;
    this.stars.position.copy(center);
    this.stars.material.opacity = 1 - smoothstep(-0.35, -0.1, s.y);
    this.stars.visible = s.y < 0;
    return sky.lerp(WHITE, 0.04 + 0.86 * d); // cloud color
  }
}
