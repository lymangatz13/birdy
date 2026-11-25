import * as THREE from '../vendor/three.module.js';
import { Room, ROBOT_EYE, ROBOT_YAW, DESK } from './room.js';
import { Sky, hours, sunDir, smoothstep } from './sky.js';
import { Robot, PICK_SIDE, reachLimit } from './robot.js';
import { makeMug, makeLaptop, stepItems, slideOffEdges } from './items.js';
import { Colony, AntView } from './ants.js';
import { Net } from './net.js';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const playerName = $('playerName'), roomCodeInput = $('roomCode');
let code = null, playerId = null, mine = null, state = null, renderer, scene, camera, room, sky, robot, colony, antView, humanAnt, items;
let active = false, lastTime = 0, lastSend = 0, lastPoll = 0, antPos = { x: 35.5, z: 15.5, angle: 0 }, antSpeed = 0, displayedAnt = new THREE.Vector3(35.5, 9.03, 15.5);
let keys = new Set(), mouse = new THREE.Vector2(0, -0.2), pressMouse = false, eventAt = 0, hintUntil = 0, hint = '', moveBusy = false, pollBusy = false;

// Players connect directly to each other; the room creator's browser hosts the match (net.js)
const net = new Net();
let connecting = false;
function showError(message) { $('error').textContent = message || ''; }
function connect(result) {
  playerId = result.playerId;
  state = result.state;
  mine = state.players.find((p) => p.id === playerId);
  code = state.code;
  antPos = { x: state.ant.x, z: state.ant.z, angle: state.ant.angle };
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomLabel').textContent = code;
  $('bigCode').textContent = code;
  $('antControls').classList.toggle('hidden', mine.role !== 'ant');
  $('robotControls').classList.toggle('hidden', mine.role !== 'robot');
  buildScene();
  updateHud();
  active = true;
  lastTime = performance.now();
  requestAnimationFrame(frame);
}
$('createBtn').onclick = async () => {
  if (connecting) return;
  connecting = true; showError('Creating room…');
  try { const result = await net.createRoom(playerName.value.trim() || 'player 1green'); showError(''); connect(result); }
  catch (error) { showError(error.message); }
  finally { connecting = false; }
};
$('joinBtn').onclick = async () => {
  showError('');
  const codeValue = roomCodeInput.value.trim().toUpperCase();
  if (codeValue.length !== 4) return showError('Enter the 4-character room code.');
  if (connecting) return;
  connecting = true; showError('Connecting to room…');
  try { const result = await net.joinRoom(codeValue, playerName.value.trim() || 'player 1red'); showError(''); connect(result); }
  catch (error) { showError(error.message); }
  finally { connecting = false; }
};
roomCodeInput.oninput = () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-F0-9]/g, '');
  if (roomCodeInput.value && playerName.value.toLowerCase() === 'player 1green') playerName.value = 'player 1red';
};
roomCodeInput.onkeydown = (event) => { if (event.key === 'Enter') $('joinBtn').click(); };
if (query.has('room')) { roomCodeInput.value = query.get('room').toUpperCase(); playerName.value = 'player 1red'; }
$('copyCode').onclick = async () => {
  try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${code}`); $('copyCode').textContent = 'COPIED'; setTimeout(() => $('copyCode').textContent = 'COPY LINK', 1300); }
  catch { $('copyCode').textContent = `CODE ${code}`; }
};

function buildScene() {
  const host = $('scene');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 70, 128);
  camera = new THREE.PerspectiveCamera(70, host.clientWidth / Math.max(1, host.clientHeight), 0.05, 1000);
  room = new Room(scene);
  sky = new Sky(scene);
  sky.hemi.groundColor.set(0xd8c8b4);
  items = [makeLaptop().place(37, DESK.top, 19.5), makeMug().place(34.5, DESK.top, 24.5)];
  for (const item of items) scene.add(item.group);
  robot = new Robot(scene, ROBOT_EYE, ROBOT_YAW);
  colony = new Colony(100, items);
  antView = new AntView(scene, colony);
  humanAnt = new THREE.Mesh(antView.mesh.geometry, new THREE.MeshLambertMaterial({ color: 0xff4d6d }));
  humanAnt.visible = mine.role !== 'ant';
  humanAnt.frustumCulled = false;
  scene.add(humanAnt);
  $('scene').addEventListener('mousemove', onMouseMove);
  $('scene').addEventListener('pointermove', onMouseMove);
  $('scene').addEventListener('touchstart', onTouchAim, { passive: false });
  $('scene').addEventListener('touchmove', onTouchAim, { passive: false });
  $('scene').addEventListener('mousedown', onMouseDown);
  $('scene').addEventListener('mouseup', onMouseUp);
  $('scene').addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { keys.clear(); pressMouse = false; });
  bindMobileControls();
  syncAntMesh();
}
function resize() {
  if (!renderer) return;
  const host = $('scene');
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
}
function onMouseMove(event) {
  const rect = $('scene').getBoundingClientRect();
  mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
}
function onTouchAim(event) {
  event.preventDefault();
  const touch = event.touches[0] || event.changedTouches[0];
  if (touch) onMouseMove(touch);
  if (event.type === 'touchstart' && mine?.role === 'robot') onMouseDown({ button: 0 });
}
function bindMobileControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add(key); button.setPointerCapture(event.pointerId); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => keys.delete(key));
  });
  document.querySelectorAll('[data-arm]').forEach((button) => button.addEventListener('pointerdown', (event) => {
    event.preventDefault(); if (mine?.role === 'robot') robot.active = Number(button.dataset.arm);
  }));
  const press = $('pressControl');
  press.addEventListener('pointerdown', (event) => { event.preventDefault(); pressMouse = true; press.setPointerCapture(event.pointerId); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) press.addEventListener(name, () => pressMouse = false);
}
function onKeyDown(event) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (mine?.role === 'robot') {
    if (event.code === 'KeyQ') robot.active = 0;
    if (event.code === 'KeyE') robot.active = 1;
  }
}
function onKeyUp(event) { keys.delete(event.code); }
const raycaster = new THREE.Raycaster();
const downRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const aimTargets = () => [room.mesh, room.glow, humanAnt, ...items.filter((item) => !item.held).map((item) => item.group)];
function onMouseDown(event) {
  if (mine?.role !== 'robot') return;
  if (event.button === 2) { pressMouse = true; return; }
  if (event.button !== 0) return;
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
  const top = (item) => item.pos.clone().setY(item.pos.y + item.h + 0.4);
  const near = (item) => top(item).distanceTo(arm.hand);
  const shoulder = robot.shoulder(arm.side);
  const reachable = (item) => {
    const v = top(item).sub(shoulder);
    return v.length() <= reachLimit(v.clone().normalize()) && Math.hypot(item.pos.x - robot.eye.x, item.pos.z - robot.eye.z) <= PICK_SIDE;
  };
  let pick = hit?.object.userData.item;
  if (pick && (pick.held || !reachable(pick))) {
    if (!pick.held) { hint = `${pick.name} is out of reach`; hintUntil = performance.now() + 1500; }
    pick = null;
  }
  if (!pick) pick = items.filter((item) => !item.held && near(item) < 2.5).sort((a, b) => near(a) - near(b))[0];
  if (pick) arm.reachFor = pick;
}
function onMouseUp(event) { if (event.button === 2) pressMouse = false; }

function aimActiveHand() {
  const arm = robot.activeArm;
  if (arm.reachFor) return;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(aimTargets(), true)[0];
  const pressing = pressMouse || keys.has('Space');
  const point = hit
    ? hit.point.clone().addScaledVector(hit.face.normal, pressing ? 0.1 : 0.9)
    : raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 9);
  if (!pressing) {
    downRay.set(new THREE.Vector3(point.x, point.y + 0.5, point.z), DOWN);
    const below = downRay.intersectObjects(aimTargets(), true)[0];
    if (below) point.y = Math.max(point.y, below.point.y + 0.9);
  }
  if (arm.held) point.y += arm.held.h;
  arm.target.copy(point).add(new THREE.Vector3(0, 0.4, 0));
}

function localRobotSync() {
  return {
    yaw: robot.yaw, pitch: robot.pitch, active: robot.active, pressing: pressMouse || keys.has('Space'),
    hands: robot.arms.map((arm) => ({ x: arm.hand.x, y: arm.hand.y, z: arm.hand.z, tipX: arm.tip.x, tipY: arm.tip.y, tipZ: arm.tip.z })),
    objects: items.map((item) => ({ x: item.pos.x, y: item.pos.y, z: item.pos.z, w: item.w, d: item.d, h: item.h, held: Boolean(item.held) }))
  };
}
function applyRemoteRobot() {
  if (!state?.robot || mine.role === 'robot') return;
  robot.yaw = state.robot.yaw;
  robot.pitch = state.robot.pitch;
  robot.active = state.robot.active;
  for (const [i, hand] of state.robot.hands.entries()) {
    const arm = robot.arms[i];
    if (arm && hand) arm.target.set(hand.x, hand.y, hand.z);
  }
}
function stepAnt(dt) {
  if (mine.role !== 'ant' || state.status !== 'playing') return;
  const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const turn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const step = Math.min(dt, 0.05);
  antSpeed = THREE.MathUtils.clamp(antSpeed + throttle * 10 * step, -3.2, 6.8);
  if (!throttle) antSpeed *= Math.exp(-1.25 * step);
  antPos.angle += turn * 2.5 * step * (antSpeed < -0.1 ? -1 : 1);
  const nextX = THREE.MathUtils.clamp(antPos.x + Math.cos(antPos.angle) * antSpeed * step, DESK.x0 + 0.35, DESK.x1 - 0.35);
  const nextZ = THREE.MathUtils.clamp(antPos.z + Math.sin(antPos.angle) * antSpeed * step, DESK.z0 + 0.35, DESK.z1 - 0.35);
  const blocked = (x, z) => items.some((item) => Math.abs(x - item.pos.x) < item.w / 2 + 0.35 && Math.abs(z - item.pos.z) < item.d / 2 + 0.35);
  if (!blocked(nextX, nextZ)) { antPos.x = nextX; antPos.z = nextZ; }
  else antSpeed *= -0.2;
}
function syncAntMesh() {
  if (!state?.ant || !humanAnt) return;
  const target = state.ant;
  displayedAnt.lerp(new THREE.Vector3(target.x, DESK.top + 0.03, target.z), 0.35);
  humanAnt.position.copy(displayedAnt);
  humanAnt.rotation.y = -(target.angle || 0);
  humanAnt.position.y += Math.abs(Math.sin(performance.now() * 0.012)) * 0.035;
}
function updateCamera() {
  if (mine.role === 'robot') {
    robot.applyTo(camera);
  } else {
    camera.position.set(antPos.x, DESK.top + 0.32, antPos.z);
    camera.rotation.set(-0.035, -antPos.angle - Math.PI / 2, 0, 'YXZ');
  }
}
function updateHud() {
  if (!state || !mine) return;
  const robotPlayer = state.players.find((player) => player.role === 'robot');
  const antPlayer = state.players.find((player) => player.role === 'ant');
  $('name0').textContent = `${(robotPlayer?.name || 'player 1green').toUpperCase()} · ROBOT`;
  $('name1').textContent = `${(antPlayer?.name || 'player 1red').toUpperCase()} · ANT`;
  $('score0').textContent = `${state.score[0]} / 3`;
  $('score1').textContent = state.status === 'waiting' ? 'JOIN TO PLAY' : 'SURVIVE';
  const seconds = state.timeLeft ?? 180;
  $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('matchStatus').textContent = state.status === 'playing' ? (mine.role === 'robot' ? 'CATCH THE ANT' : 'DODGE THE GRIPPER') : state.status === 'ended' ? 'MATCH COMPLETE' : 'WAITING FOR ANT PLAYER';
  $('connectionText').textContent = net.connectionLost ? 'CONNECTION LOST' : state.status === 'playing' ? 'LIVE CHASE' : 'ROOM OPEN';
  $('waiting').classList.toggle('hidden', state.status !== 'waiting');
  if (state.event?.at && state.event.at !== eventAt) {
    eventAt = state.event.at;
    hint = state.event.type === 'caught' ? `ANT CAUGHT  ${state.event.score}/3` : 'THE ANT ESCAPED';
    hintUntil = performance.now() + 1800;
    $('toast').textContent = hint;
    $('toast').classList.remove('show'); void $('toast').offsetWidth; $('toast').classList.add('show');
  }
  if (state.status === 'ended') {
    $('result').classList.remove('hidden');
    const won = state.winner === mine.name;
    $('resultTitle').textContent = won ? 'YOU WIN' : 'YOU LOSE';
    $('resultTitle').style.color = won ? 'var(--mint)' : 'var(--coral)';
    $('resultScore').textContent = state.winner === robotPlayer?.name ? 'Robot caught the ant three times.' : 'The ant survived the full three minutes.';
  }
  $('hud').textContent = mine.role === 'robot'
    ? `ROBOT  ·  ${mine.name.toUpperCase()}\nClick an object to grab/drop  ·  Mouse aim  ·  Q/E arms\n${performance.now() < hintUntil ? hint : 'Hit the red ant with the mug or laptop.'}`
    : `ANT  ·  ${mine.name.toUpperCase()}  ·  SPEED ${Math.abs(antSpeed).toFixed(1)}\nW accelerate  ·  S brake/reverse  ·  A/D steer\n${performance.now() < hintUntil ? hint : 'Stay out of the robot’s moving objects.'}`;
}
function acceptState(next) {
  const newCatch = next.event?.type === 'caught' && next.event.at !== state?.event?.at;
  state = next;
  if (mine?.role === 'ant' && newCatch && state.ant) {
    antPos = { ...state.ant };
    antSpeed = 0;
  }
}
function syncRemoteObjects() {
  if (mine.role !== 'ant' || !state?.objects) return;
  for (const [i, object] of state.objects.entries()) {
    const item = items[i];
    if (!item || !object) continue;
    item.pos.set(object.x, object.y, object.z);
    item.vy = 0;
    item.held = object.held ? robot.arms[0] : null;
    item.sync();
  }
}

async function sendMove() {
  if (moveBusy || state?.status !== 'playing') return;
  moveBusy = true;
  const payload = { playerId };
  if (mine.role === 'robot') payload.robot = localRobotSync();
  else payload.ant = antPos;
  try { const result = await net.move(payload); acceptState(result.state); updateHud(); }
  catch { $('connectionText').textContent = 'CONNECTION LOST'; }
  finally { moveBusy = false; }
}
async function poll() {
  if (pollBusy || !code) return;
  pollBusy = true;
  try { const result = await net.poll(); acceptState(result.state); updateHud(); }
  catch { $('connectionText').textContent = 'CONNECTION LOST'; }
  finally { pollBusy = false; }
}
function frame(now) {
  if (!active) return;
  const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
  if (mine.role === 'robot') {
    robot.applyTo(camera);
    if (state.status === 'playing') aimActiveHand();
    robot.update(dt, keys);
  } else {
    stepAnt(dt);
    applyRemoteRobot();
    robot.update(dt, new Set());
    updateCamera();
  }
  if (mine.role === 'robot') stepItems(dt, items, room.solidAt);
  else syncRemoteObjects();
  colony.step(dt, items, robot.arms.map((arm) => ({ hand: arm.hand, tip: arm.tip })));
  antView.update();
  syncAntMesh();
  if (mine.role === 'ant') updateCamera();
  const gameHours = hours((now / 1000) * (Number(query.get('speed')) || 1));
  const night = 1 - smoothstep(-0.1, 0.3, sunDir(gameHours).y);
  sky.update(gameHours, camera.position);
  room.update(night);
  for (const item of items) item.setNight(night);
  if (now - lastSend > 90) { lastSend = now; sendMove(); }
  if (now - lastPoll > 220) { lastPoll = now; poll(); }
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
