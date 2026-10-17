import * as THREE from 'three';
import { World, WATER } from './world.js';
import { Clouds } from './clouds.js';
import { Sky, hours } from './sky.js';
import { Drone } from './drone.js';

const q = new URLSearchParams(location.search);
const seed = Number(q.get('seed')) || Math.floor(Math.random() * 1e9);
const speed = Number(q.get('speed')) || 1;

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0, 70, 128);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);

const world = new World(scene, seed);
const clouds = new Clouds(scene, seed);
const sky = new Sky(scene);
const drone = new Drone(new THREE.Vector3(8, Math.max(world.terrain.height(8, 8), WATER) + 20, 8));
world.update(drone.pos, 30);

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
  drone.update(dt, keys, (x, z) => world.heightAt(x, z));
  drone.applyTo(camera);
  world.update(drone.pos);
  const h = hours(t);
  clouds.update(dt, drone.pos, sky.update(h, camera.position));
  const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  hud.textContent = `${hh}:${mm}  alt ${Math.round(drone.pos.y)}  seed ${seed}\nW/S throttle  A/D yaw  arrows pitch/roll`;
  renderer.render(scene, camera);
});
