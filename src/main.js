import * as THREE from 'three';
import { Room, ROBOT_EYE, ROBOT_YAW } from './room.js';
import { Sky, hours, sunDir, smoothstep } from './sky.js';
import { Robot, PICK_SIDE, reachLimit } from './robot.js';
import { makeMug, makeLaptop, stepItems, slideOffEdges } from './items.js';
import { Colony, AntView } from './ants.js';

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

// 100 ants wandering the desk at random speeds
const colony = new Colony(100, items);
const antView = new AntView(scene, colony);

// ---------- Input ----------
const keys = new Set();
let pressMouse = false; // right mouse button held: press the active gripper down onto the surface
addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyQ') robot.active = 0;
  if (e.code === 'KeyE') robot.active = 1;
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); pressMouse = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const mouse = new THREE.Vector2(0, -0.2);
addEventListener('mousemove', (e) => mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
addEventListener('contextmenu', (e) => e.preventDefault());

const raycaster = new THREE.Raycaster();
const downRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const aimTargets = () => [room.mesh, room.glow, ...items.filter((it) => !it.held).map((it) => it.group)];

let hint = '', hintUntil = 0;

// Click: drop what the active hand holds, or reach for the item under the cursor / nearest the hand
addEventListener('mouseup', (e) => { if (e.button === 2) pressMouse = false; });
addEventListener('mousedown', (e) => {
  if (e.button === 2) pressMouse = true;
  if (e.button !== 0) return;
  const arm = robot.activeArm;
  if (arm.reachFor) { arm.reachFor = null; return; }
  if (arm.held) {
    arm.held.held = null;
    arm.held.vy = 0;
    slideOffEdges(arm.held, room.solidAt);
    arm.held = null;
    return;
  }
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(aimTargets(), true)[0];
  const top = (it) => it.pos.clone().setY(it.pos.y + it.h + 0.4);
  const near = (it) => top(it).distanceTo(arm.hand);
  const S = robot.shoulder(arm.side);
  const reachable = (it) => {
    const v = top(it).sub(S);
    return v.length() <= reachLimit(v.clone().normalize()) &&
      Math.hypot(it.pos.x - robot.eye.x, it.pos.z - robot.eye.z) <= PICK_SIDE;
  };
  let pick = hit && hit.object.userData.item;
  if (pick && (pick.held || !reachable(pick))) {
    if (!pick.held) { hint = `${pick.name} is out of reach`; hintUntil = performance.now() + 1500; }
    pick = null;
  }
  if (!pick) pick = items.filter((it) => !it.held && near(it) < 2.5).sort((a, b) => near(a) - near(b))[0];
  if (pick) arm.reachFor = pick;
});

// Active hand follows the surface point under the cursor, hovering just above it
function aimActiveHand() {
  const arm = robot.activeArm;
  if (arm.reachFor) return; // the hand is on its way to an item
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(aimTargets(), true)[0];
  const pressing = pressMouse || keys.has('Space');
  const point = hit
    ? hit.point.clone().addScaledVector(hit.face.normal, pressing ? 0.1 : 0.9)
    : raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 9);
  if (!pressing) {
    // Hover clear of whatever is directly below (aiming at a side face would otherwise dip the hand)
    downRay.set(new THREE.Vector3(point.x, point.y + 0.5, point.z), DOWN);
    const below = downRay.intersectObjects(aimTargets(), true)[0];
    if (below) point.y = Math.max(point.y, below.point.y + 0.9);
  }
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
  colony.step(dt, items, robot.arms.map((a) => ({ hand: a.hand, tip: a.tip })));
  antView.update();

  const h = hours(t);
  sky.update(h, camera.position);
  const night = 1 - smoothstep(-0.1, 0.3, sunDir(h).y);
  room.update(night);
  for (const it of items) it.setNight(night);

  const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  const arm = robot.activeArm;
  const status = arm.held ? ' holding ' + arm.held.name : arm.reachFor ? ' reaching for ' + arm.reachFor.name : '';
  const note = performance.now() < hintUntil ? '  (' + hint + ')' : '';
  hud.textContent = `${hh}:${mm}  ${robot.active ? 'Right' : 'Left'} arm${status}${note}\n` +
    'Mouse: aim hand  Click: grab/drop  Right-click or Space (hold): press down\n' +
    'Q/E: left/right arm  A/D: turn  W/S: look up/down';
  renderer.render(scene, camera);
});
