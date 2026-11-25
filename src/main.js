import * as THREE from 'three';
import { Room, START } from './room.js';
import { Sky, hours, sunDir, smoothstep } from './sky.js';
import { Drone } from './drone.js';

const q = new URLSearchParams(location.search);
const speed = Number(q.get('speed')) || 1;

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0, 70, 128);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1000);

const room = new Room(scene);
const sky = new Sky(scene);
sky.hemi.groundColor.set(0xd8c8b4); // indoor bounce light off the wood floor, not grass
// Bird-sized flight tuned for a room (1 unit = 10 cm)
const drone = new Drone(START, { accel: 14, lift: 8, ceiling: Infinity, radius: 0.35 });

const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const hud = document.getElementById('hud');
const clock = new THREE.Clock();
let t = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt * speed;
  drone.update(dt, keys, null, room.solidAt);
  drone.applyTo(camera);
  const h = hours(t);
  sky.update(h, camera.position);
  room.update(1 - smoothstep(-0.1, 0.3, sunDir(h).y));
  const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  hud.textContent = `${hh}:${mm}  height ${((drone.pos.y - 1) / 10).toFixed(1)} m\nW/S throttle  A/D yaw  arrows pitch/roll`;
  renderer.render(scene, camera);
});
