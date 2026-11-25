import * as THREE from 'three';
import { Room, ROBOT_EYE, ROBOT_YAW } from './room.js';
import { Sky, hours, sunDir, smoothstep } from './sky.js';
import { Robot } from './robot.js';
import { makeMug, makeLaptop, stepItems, slideOffEdges } from './items.js';

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

// Movable items on the desk (desk top is at y = 9)
const items = [makeLaptop().place(37, 9, 19.5), makeMug().place(34.5, 9, 24.5)];
for (const it of items) scene.add(it.group);

const robot = new Robot(scene, ROBOT_EYE, ROBOT_YAW);

// ---------- Input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyQ') robot.active = 0;
  if (e.code === 'KeyE') robot.active = 1;
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const mouse = new THREE.Vector2(0, -0.2);
addEventListener('mousemove', (e) => mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
addEventListener('contextmenu', (e) => e.preventDefault());

const raycaster = new THREE.Raycaster();
const aimTargets = () => [room.mesh, room.glow, ...items.filter((it) => !it.held).map((it) => it.group)];

// Click: drop what the active hand holds, or grab the item under the cursor / nearest the hand
addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const arm = robot.activeArm;
  if (arm.held) {
    arm.held.held = null;
    arm.held.vy = 0;
    slideOffEdges(arm.held, room.solidAt);
    arm.held = null;
    return;
  }
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(aimTargets(), true)[0];
  let pick = hit && hit.object.userData.item;
  const near = (it) => it.pos.clone().setY(it.pos.y + it.h).distanceTo(arm.hand);
  if (!pick || near(pick) > 3) {
    pick = items.filter((it) => !it.held && near(it) < 2.5).sort((a, b) => near(a) - near(b))[0];
  }
  if (pick && !pick.held) { pick.held = arm; arm.held = pick; }
});

// Active hand follows the surface point under the cursor, hovering just above it
function aimActiveHand() {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(aimTargets(), true)[0];
  const arm = robot.activeArm;
  const point = hit
    ? hit.point.clone().addScaledVector(hit.face.normal, 0.6)
    : raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 9);
  if (arm.held) point.y += arm.held.h;
  arm.target.copy(point).add(new THREE.Vector3(0, 0.4, 0));
}

// ---------- Loop ----------
const hud = document.getElementById('hud');
const clock = new THREE.Clock();
let t = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt * speed;
  robot.applyTo(camera);
  aimActiveHand();
  robot.update(dt, keys);
  robot.applyTo(camera);
  stepItems(dt, items, room.solidAt);

  const h = hours(t);
  sky.update(h, camera.position);
  const night = 1 - smoothstep(-0.1, 0.3, sunDir(h).y);
  room.update(night);
  for (const it of items) it.setNight(night);

  const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  const arm = robot.activeArm;
  hud.textContent = `${hh}:${mm}  ${robot.active ? 'Right' : 'Left'} arm${arm.held ? ' holding ' + arm.held.name : ''}\n` +
    'Mouse: aim hand  Click: grab/drop  Q/E: left/right arm  A/D: turn  W/S: look up/down';
  renderer.render(scene, camera);
});
