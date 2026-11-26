import * as THREE from 'three';
import { Room, DESK, GIANT_START, JACK_START, SY } from './room.js';
import { Sky, hours, sunDir, smoothstep } from './sky.js';
import { GiantModel, GIANT, stepGiant, canStand, holdPoint } from './giant.js';
import { JackModel, JACK, stepJack, jackBlocked } from './jack.js';
import { inGrabRange, HOLD_MS } from './roomlogic.js';
import { deskItems } from './items.js';
import { Net } from './net.js';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const playerName = $('playerName'), roomCodeInput = $('roomCode');
let code = null, playerId = null, mine = null, state = null, renderer, scene, camera, room, sky, items, giantModel, jackModel;
let active = false, lastTime = 0, lastSend = 0, lastPoll = 0, eventAt = 0, hintUntil = 0, hint = '', moveBusy = false, pollBusy = false;
let clockOffset = 0, rematchAsked = false;
const keys = new Set();
// The giant (local when playing the giant, otherwise shown from the host's state)
const giant = { x: GIANT_START.x, z: GIANT_START.z, yaw: GIANT_START.yaw, pitch: -0.25, crouch: false, speed: 0 };
let reachTarget = null, reachUntil = 0, grabAsk = false, lastGrab = 0;
// Jack (local when playing Jack)
const jack = { x: JACK_START.x, y: JACK_START.y, z: JACK_START.z, vy: 0, grounded: true, yaw: 0, speed: 0 };
let jackCam = { yaw: 0, pitch: -0.3 }, presses = 0, wasHeld = false;
const shownJack = new THREE.Vector3(JACK_START.x, JACK_START.y, JACK_START.z), shownGiant = new THREE.Vector3(GIANT_START.x, 0, GIANT_START.z);
let shownGiantYaw = GIANT_START.yaw, shownJackYaw = 0;
const daySpeed = Number(query.get('speed')) || 1;

// Player names shown as "NAME · ROLE", or just the role when the name is the default
const label = (player, role) => {
  const name = (player?.name || '').trim();
  return !name || name.toLowerCase() === role.toLowerCase() ? role.toUpperCase() : `${name.toUpperCase()} · ${role.toUpperCase()}`;
};
const FOOTERS = {
  giant: '<span>MOUSE LOOK</span><span><kbd>W</kbd>/<kbd>S</kbd> WALK</span><span><kbd>A</kbd>/<kbd>D</kbd> STEP</span><span><kbd>C</kbd> CROUCH</span><span>CLICK GRAB</span><span class="tip">Find Jack, grab him and hold on for 10 seconds.</span>',
  jack: '<span>MOUSE LOOK</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> RUN</span><span><kbd>SPACE</kbd> JUMP</span><span>HELD: MASH <kbd>SPACE</kbd></span><span class="tip">Hide from the giant until time runs out.</span>',
};

// Players connect directly to each other; the room creator's browser hosts the match (net.js)
const net = new Net();
let connecting = false;
function showError(message) { $('error').textContent = message || ''; }
function connect(result) {
  playerId = result.playerId;
  state = result.state;
  mine = state.players.find((p) => p.id === playerId);
  code = state.code;
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomLabel').textContent = code;
  $('bigCode').textContent = code;
  $('gameFooter').innerHTML = FOOTERS[mine.role];
  $('giantControls').classList.toggle('hidden', mine.role !== 'giant');
  $('jackControls').classList.toggle('hidden', mine.role !== 'jack');
  $('crosshair').classList.toggle('hidden', mine.role !== 'giant');
  buildScene();
  resetPositions();
  updateHud();
  active = true;
  lastTime = performance.now();
  requestAnimationFrame(frame);
}
$('createBtn').onclick = async () => {
  if (connecting) return;
  connecting = true; showError('Creating room…');
  try { const result = await net.createRoom(playerName.value.trim() || 'Giant', daySpeed); showError(''); connect(result); }
  catch (error) { showError(error.message); }
  finally { connecting = false; }
};
$('joinBtn').onclick = async () => {
  showError('');
  const codeValue = roomCodeInput.value.trim().toUpperCase();
  if (codeValue.length !== 4) return showError('Enter the 4-character room code.');
  if (connecting) return;
  connecting = true; showError('Connecting to room…');
  try { const result = await net.joinRoom(codeValue, playerName.value.trim() || 'Jack'); showError(''); connect(result); }
  catch (error) { showError(error.message); }
  finally { connecting = false; }
};
roomCodeInput.oninput = () => { roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-F0-9]/g, ''); };
roomCodeInput.onkeydown = (event) => { if (event.key === 'Enter') $('joinBtn').click(); };
if (query.has('room')) roomCodeInput.value = query.get('room').toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 4);
// Rematch in the same room; once the rival has left, start a new room instead
$('rematchBtn').onclick = async () => {
  if (net.connectionLost) { location.href = location.pathname; return; }
  if (rematchAsked) return;
  rematchAsked = true;
  try { const result = await net.rematch(); acceptState(result.state); updateHud(); }
  catch { rematchAsked = false; }
};
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 110, 260);
  camera = new THREE.PerspectiveCamera(70, host.clientWidth / Math.max(1, host.clientHeight), 0.05, 1000);
  room = new Room(scene);
  sky = new Sky(scene);
  sky.hemi.groundColor.set(0xd8c8b4);
  items = deskItems(DESK);
  for (const item of items) scene.add(item.group);
  giantModel = new GiantModel(scene);
  jackModel = new JackModel(scene);
  const canvas = renderer.domElement;
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', updateHud);
  host.addEventListener('touchstart', onTouch, { passive: false });
  host.addEventListener('touchmove', onTouch, { passive: false });
  host.addEventListener('touchend', onTouchEnd);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());
  bindMobileControls();
}
function resize() {
  if (!renderer) return;
  const host = $('scene');
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
}

// ---- Input -------------------------------------------------------------------------------
const locked = () => document.pointerLockElement === renderer?.domElement;
function look(dx, dy) {
  if (mine.role === 'giant') {
    giant.yaw -= dx * 0.0026;
    giant.pitch = THREE.MathUtils.clamp(giant.pitch - dy * 0.0022, -1.25, 0.9);
  } else {
    jackCam.yaw -= dx * 0.0026;
    jackCam.pitch = THREE.MathUtils.clamp(jackCam.pitch - dy * 0.0022, -1.2, 1.0);
  }
}
function onCanvasClick() {
  if (!locked()) { renderer.domElement.requestPointerLock?.(); return; }
  if (mine.role === 'giant') tryGrab();
}
function onMouseMove(event) { if (locked()) look(event.movementX, event.movementY); }
// Touch: drag on the room to look around; a quick tap grabs (giant)
let touchStart = null, touchLast = null;
function onTouch(event) {
  if (event.target.closest('button')) return;
  event.preventDefault();
  const t = event.changedTouches[0];
  if (event.type === 'touchstart') { touchStart = { x: t.clientX, y: t.clientY, at: performance.now() }; touchLast = { x: t.clientX, y: t.clientY }; return; }
  if (!touchLast) return;
  look((t.clientX - touchLast.x) * 1.6, (t.clientY - touchLast.y) * 1.6);
  touchLast = { x: t.clientX, y: t.clientY };
}
function onTouchEnd(event) {
  const t = event.changedTouches[0];
  if (touchStart && t && performance.now() - touchStart.at < 250 && Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) < 12 && mine?.role === 'giant') tryGrab();
  touchStart = touchLast = null;
}
function bindMobileControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add(key); onPress(key); button.setPointerCapture(event.pointerId); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => keys.delete(key));
  });
  $('grabControl').addEventListener('pointerdown', (event) => { event.preventDefault(); tryGrab(); });
}
function onKeyDown(event) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (!event.repeat) onPress(event.code);
  keys.add(event.code);
}
function onKeyUp(event) { keys.delete(event.code); }
// Each fresh press of Space while held is one struggle
function onPress(code) { if (code === 'Space' && mine?.role === 'jack' && state?.hold) presses++; }
const axis = (plus, minus) => (keys.has(plus[0]) || keys.has(plus[1]) ? 1 : 0) - (keys.has(minus[0]) || keys.has(minus[1]) ? 1 : 0);

// ---- Giant -------------------------------------------------------------------------------
const giantEye = () => GIANT.eye + (GIANT.crouchEye - GIANT.eye) * giantModel.crouch;
const giantForward = () => new THREE.Vector3(Math.sin(giant.yaw) * Math.cos(giant.pitch), Math.sin(giant.pitch), Math.cos(giant.yaw) * Math.cos(giant.pitch));
const raycaster = new THREE.Raycaster();
function aimHit() {
  raycaster.set(camera.position, giantForward());
  raycaster.far = 80;
  const hit = raycaster.intersectObjects([room.mesh, ...items.map((i) => i.group), jackModel.group], true)[0];
  if (!hit) return { point: camera.position.clone().addScaledVector(giantForward(), 20), jack: false };
  let o = hit.object, isJack = false;
  while (o) { if (o === jackModel.group) isJack = true; o = o.parent; }
  return { point: hit.point, jack: isJack };
}
// Reach for whatever is under the crosshair; it is a catch if that is Jack and he is within reach
function tryGrab() {
  if (mine?.role !== 'giant' || state?.status !== 'playing' || state.hold) return;
  const now = performance.now();
  if (now - lastGrab < 700) return;
  lastGrab = now;
  const aim = aimHit();
  reachTarget = aim.point;
  reachUntil = now + 450;
  const inReach = inGrabRange(giant, state.jack);
  if (aim.jack && inReach && !state.free) grabAsk = true;
  else if (aim.jack && !inReach) { hint = 'Jack is out of reach. Get closer.'; hintUntil = now + 1500; }
  else if (aim.jack && state.free) { hint = 'Jack is too slippery right now!'; hintUntil = now + 1200; }
}
function stepLocalGiant(dt) {
  const wantCrouch = keys.has('KeyC') || keys.has('ControlLeft');
  giant.crouch = wantCrouch || !canStand(giant, room.giantSolidAt);
  const before = { x: giant.x, z: giant.z };
  stepGiant(giant, { forward: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']), strafe: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) }, giant.crouch, dt, room.giantSolidAt);
  giant.speed = Math.min(1, Math.hypot(giant.x - before.x, giant.z - before.z) / dt / GIANT.walk);
  if (state.hold) reachTarget = holdPoint(giant, giant.crouch);
  else if (performance.now() > reachUntil) reachTarget = null;
}
function giantCamera() {
  const pivot = new THREE.Vector3(shownGiant.x, giantEye() + 0.6, shownGiant.z);
  const f = giantForward();
  const right = new THREE.Vector3(-Math.cos(giant.yaw), 0, Math.sin(giant.yaw));
  // Over the right shoulder, a little above the head, so the crosshair is not behind the giant
  const shoulder = clearPath(pivot, pivot.clone().addScaledVector(right, 5).add(new THREE.Vector3(0, 2.5, 0)), 0.5);
  camera.position.copy(clearPath(shoulder, shoulder.clone().addScaledVector(f, -10), 0.5));
  camera.lookAt(camera.position.clone().add(f));
  // In tight spots the camera ends up close to the giant; hide the body so it does not block the view
  giantModel.group.visible = camera.position.distanceTo(pivot) > 5.5;
}

// ---- Jack --------------------------------------------------------------------------------
const boxes = () => items.map((i) => i.box);
function stepLocalJack(dt) {
  if (state.hold) {
    jack.x = state.jack.x; jack.y = state.jack.y; jack.z = state.jack.z; jack.vy = 0; jack.speed = 0;
    wasHeld = true;
    return;
  }
  if (wasHeld) { wasHeld = false; dropFree(); }
  if (state.status !== 'playing') { jack.speed = 0; return; }
  const f = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']), s = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
  const fx = Math.sin(jackCam.yaw), fz = Math.cos(jackCam.yaw);
  const move = new THREE.Vector2(fx * f - fz * s, fz * f + fx * s);
  if (move.lengthSq() > 1) move.normalize();
  const before = { x: jack.x, z: jack.z };
  stepJack(jack, { x: move.x, z: move.y }, keys.has('Space'), dt, room.solidAt, boxes());
  jack.speed = Math.min(1, Math.hypot(jack.x - before.x, jack.z - before.z) / dt / JACK.speed);
  if (move.lengthSq() > 0.01) jack.yaw = lerpAngle(jack.yaw, Math.atan2(move.x, move.y), Math.min(1, dt * 14));
}
// Dropped from the giant's fist: find open space nearby so Jack does not end up inside furniture
function dropFree() {
  jack.vy = 0; jack.grounded = false;
  for (let up = 0; up < 12; up++) if (!jackBlocked(jack.x, jack.y + up * 0.5, jack.z, room.solidAt, boxes())) { jack.y += up * 0.5; return; }
  Object.assign(jack, { x: state.giant.x, y: 1, z: state.giant.z });
}
function jackCamera() {
  const pivot = new THREE.Vector3(shownJack.x, shownJack.y + 1.7, shownJack.z);
  const f = new THREE.Vector3(Math.sin(jackCam.yaw) * Math.cos(jackCam.pitch), Math.sin(jackCam.pitch), Math.cos(jackCam.yaw) * Math.cos(jackCam.pitch));
  const want = pivot.clone().addScaledVector(f, state?.hold ? -9 : -4.2).add(new THREE.Vector3(0, 0.4, 0));
  camera.position.copy(clearPath(pivot, want, 0.25));
  camera.lookAt(pivot.clone().addScaledVector(f, 2));
}

// Walk from a towards b through the voxels, stopping short of the first solid block
function clearPath(a, b, margin) {
  const d = b.clone().sub(a), len = d.length(), step = 0.1;
  d.normalize();
  let t = 0;
  for (; t <= len; t += step) {
    const p = a.clone().addScaledVector(d, t);
    if (room.solidAt(p.x, p.y, p.z) || p.y > SY - 1.2) break;
  }
  return a.clone().addScaledVector(d, Math.max(0, Math.min(len, t - margin)));
}
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ---- Syncing ------------------------------------------------------------------------------
function resetPositions() {
  Object.assign(giant, { x: state.giant.x, z: state.giant.z, yaw: state.giant.yaw, pitch: state.giant.pitch, crouch: false });
  Object.assign(jack, { x: state.jack.x, y: state.jack.y, z: state.jack.z, vy: 0, grounded: true, yaw: state.jack.yaw });
  jackCam = { yaw: state.jack.yaw, pitch: -0.3 };
  shownJack.set(jack.x, jack.y, jack.z);
  shownGiant.set(giant.x, 0, giant.z);
  shownGiantYaw = giant.yaw;
  reachTarget = null; grabAsk = false; wasHeld = false;
}
function updateModels(dt) {
  // Giant
  let reach = null, crouch, speed;
  if (mine.role === 'giant') {
    shownGiant.set(giant.x, 0, giant.z); shownGiantYaw = giant.yaw;
    reach = reachTarget; crouch = giant.crouch; speed = giant.speed;
  } else {
    const g = state.giant, before = shownGiant.clone();
    shownGiant.lerp(new THREE.Vector3(g.x, 0, g.z), Math.min(1, dt * 12));
    shownGiantYaw = lerpAngle(shownGiantYaw, g.yaw, Math.min(1, dt * 12));
    speed = Math.min(1, before.distanceTo(shownGiant) / Math.max(dt, 1e-3) / GIANT.walk);
    reach = g.reach ? new THREE.Vector3(g.reach.x, g.reach.y, g.reach.z) : null;
    crouch = g.crouch;
  }
  giantModel.update(dt, { x: shownGiant.x, z: shownGiant.z, yaw: shownGiantYaw, speed, crouch, reach });
  // Jack: the giant's own fist holds him on the giant's screen
  const held = Boolean(state.hold);
  if (mine.role === 'jack' && !held) { shownJack.set(jack.x, jack.y, jack.z); shownJackYaw = jack.yaw; }
  else {
    const target = held && mine.role === 'giant' ? giantModel.fist : new THREE.Vector3(state.jack.x, state.jack.y, state.jack.z);
    shownJack.lerp(target, held && mine.role === 'giant' ? 1 : Math.min(1, dt * 14));
    shownJackYaw = held ? shownGiantYaw + Math.PI : lerpAngle(shownJackYaw, state.jack.yaw, Math.min(1, dt * 12));
  }
  const jackSpeed = mine.role === 'jack' ? jack.speed : state.jack.speed;
  const air = mine.role === 'jack' ? !jack.grounded : state.jack.air;
  jackModel.update(dt, { x: shownJack.x, y: shownJack.y, z: shownJack.z, yaw: shownJackYaw, speed: jackSpeed || 0, air, held });
}
function localSync() {
  if (mine.role === 'giant') {
    const hand = giantModel.handPos, fist = giantModel.fist;
    const data = {
      x: giant.x, z: giant.z, yaw: giant.yaw, pitch: giant.pitch, crouch: giant.crouch, grab: grabAsk,
      reach: reachTarget ? { x: reachTarget.x, y: reachTarget.y, z: reachTarget.z } : null,
      hand: { x: hand.x, y: hand.y, z: hand.z }, fist: { x: fist.x, y: fist.y, z: fist.z },
    };
    grabAsk = false;
    return { giant: data };
  }
  return { jack: { x: jack.x, y: jack.y, z: jack.z, yaw: jack.yaw, speed: jack.speed, air: !jack.grounded, presses } };
}

// ---- HUD ---------------------------------------------------------------------------------
function updateHud() {
  if (!state || !mine) return;
  const giantPlayer = state.players.find((player) => player.role === 'giant');
  const jackPlayer = state.players.find((player) => player.role === 'jack');
  $('name0').textContent = label(giantPlayer, 'Giant');
  $('name1').textContent = label(jackPlayer, 'Jack');
  const hold = state.hold;
  $('score0').textContent = hold ? `HOLD ${Math.min(10, hold.held).toFixed(1)}s` : 'SEEK';
  $('score1').textContent = state.status === 'waiting' ? 'JOIN TO PLAY' : hold ? 'WRIGGLE!' : 'HIDE';
  const seconds = state.timeLeft ?? 180;
  $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('matchStatus').textContent = state.status === 'playing'
    ? (hold ? (mine.role === 'giant' ? 'HOLD ON TIGHT' : 'MASH SPACE TO BREAK FREE') : mine.role === 'giant' ? 'FIND AND GRAB JACK' : 'HIDE FROM THE GIANT')
    : state.status === 'ended' ? 'MATCH COMPLETE' : 'WAITING FOR JACK TO JOIN';
  $('connectionText').textContent = net.connectionLost ? 'CONNECTION LOST' : state.status === 'playing' ? 'LIVE CHASE' : 'ROOM OPEN';
  $('waiting').classList.toggle('hidden', state.status !== 'waiting');
  $('lockHint').classList.toggle('hidden', !renderer || locked() || state.status === 'ended');
  $('holdMeter').classList.toggle('hidden', !hold);
  if (hold) {
    $('holdLabel').textContent = `JACK HELD  ${Math.max(0, HOLD_MS / 1000 - hold.held).toFixed(1)}s LEFT`;
    $('holdBar').style.width = `${Math.min(100, (hold.held * 1000 / HOLD_MS) * 100)}%`;
    $('struggleBar').style.width = `${Math.min(100, hold.struggle * 100)}%`;
  }
  if (state.event?.at && state.event.at !== eventAt) {
    eventAt = state.event.at;
    hint = { grabbed: 'JACK GRABBED!', wriggle: 'JACK WRIGGLED FREE', squashed: 'THE GIANT WINS', escape: 'TIME UP · JACK ESCAPED', rematch: 'REMATCH  ·  GO!' }[state.event.type] || '';
    hintUntil = performance.now() + 1800;
    $('toast').textContent = hint;
    $('toast').classList.remove('show'); void $('toast').offsetWidth; $('toast').classList.add('show');
  }
  $('result').classList.toggle('hidden', state.status !== 'ended');
  if (state.status === 'ended') {
    if (locked()) document.exitPointerLock();
    const won = state.winnerRole === mine.role;
    $('resultTitle').textContent = won ? 'YOU WIN' : 'YOU LOSE';
    $('resultTitle').style.color = won ? 'var(--mint)' : 'var(--coral)';
    const rival = state.players.find((player) => player.id !== mine.id);
    const outcome = state.winnerRole === 'giant' ? 'The giant held Jack for 10 seconds.' : 'Jack stayed free until time ran out.';
    $('resultScore').textContent = outcome + (rival?.rematch && !rematchAsked ? '  Your rival wants a rematch.' : '');
    $('rematchBtn').innerHTML = net.connectionLost ? 'NEW ROOM <span>↗</span>' : rematchAsked ? 'WAITING FOR RIVAL…' : 'REMATCH <span>↗</span>';
  }
  const tip = performance.now() < hintUntil ? hint : null;
  $('hud').textContent = mine.role === 'giant'
    ? `${label(mine, 'Giant')}${giant.crouch ? '  ·  CROUCHING' : ''}\nMouse look  ·  W/S walk  ·  A/D step  ·  C crouch  ·  Click grab\n${tip || 'Put the crosshair on Jack and click to grab him.'}`
    : `${label(mine, 'Jack')}\nMouse look  ·  WASD run  ·  Space jump  ·  Held: mash Space\n${tip || 'Hide under furniture, climb the beanstalk, stay out of reach.'}`;
}
function acceptState(next) {
  if (!next) return;
  const newMatch = next.event?.type === 'rematch' && next.event.at !== state?.event?.at;
  if (Number.isFinite(next.clock)) clockOffset = next.clock - Date.now();
  state = next;
  if (newMatch) { rematchAsked = false; hintUntil = 0; resetPositions(); }
}

async function sendMove() {
  if (moveBusy || state?.status !== 'playing') return;
  moveBusy = true;
  try { const result = await net.move({ playerId, ...localSync() }); acceptState(result.state); }
  catch { $('connectionText').textContent = 'CONNECTION LOST'; }
  finally { moveBusy = false; }
}
async function poll() {
  if (pollBusy || !code) return;
  pollBusy = true;
  try { const result = await net.poll(); acceptState(result.state); }
  catch { $('connectionText').textContent = 'CONNECTION LOST'; }
  finally { pollBusy = false; }
}
function frame(now) {
  if (!active) return;
  const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
  if (mine.role === 'giant') stepLocalGiant(dt);
  else stepLocalJack(dt);
  updateModels(dt);
  if (mine.role === 'giant') giantCamera(); else jackCamera();
  // Both players use the host's sky clock, so they see the same time of day
  const skySeconds = state.createdAt ? (Date.now() + clockOffset - state.createdAt) / 1000 : now / 1000;
  const gameHours = hours(skySeconds * (state.daySpeed || 1));
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
