// Jelly Jungle — main: renderer, scene, cameras, game loop, state machine.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ISLANDS, starsFor } from './course.js';
import { Game, STEP } from './physics.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { registry } from './assets.js';
import * as W from './world.js';
import { getPrompt } from './prompt.js';

/* ================= setup ================= */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCF includes soft filtering

const scene = new THREE.Scene();
const sky = W.makeSky();
scene.background = sky.background;
scene.fog = sky.fog;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 400);

// Subtle environment reflection for glossy materials
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.25).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
}

// Lights
const hemi = new THREE.HemisphereLight(0xeaf6e4, 0xb9a98c, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.9);
sun.position.set(14, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
const SH = 24;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

/* ================= world build ================= */

W.makeClouds(scene);
W.makeDecorIslands(scene);

const islands = ISLANDS.map((isl, i) => W.buildIsland(scene, isl, i));
const banner = W.buildBanner(scene, ISLANDS[0]);
const portal = W.buildPortal(scene, ISLANDS[12]);
for (const idx of [4, 8]) W.buildFlag(scene, ISLANDS[idx]); // checkpoints 05 & 09

const spinners = [];
for (let i = 0; i < ISLANDS.length; i++) {
  if (ISLANDS[i].type === 'spinner') spinners.push({ idx: i, ...W.buildSpinner(scene, ISLANDS[i], ISLANDS[i].id === 8) });
}

const springs = [];
for (let i = 0; i < ISLANDS.length; i++) {
  if (ISLANDS[i].type === 'spring') springs.push({ idx: i, ...W.buildSpringMushroom(scene, ISLANDS[i]) });
}

const trees = [];
for (let i = 0; i < ISLANDS.length; i++) {
  const isl = ISLANDS[i];
  // Start island: two big palms flanking the jelly, clear of banner & path
  const spots = isl.type === 'start' ? [[-3.7, 1.2, 1.2], [3.7, 0.9, 1.1]] : W.treeSpotsFor(isl, i);
  trees.push(...W.buildTrees(scene, isl, i, spots));
}

// Waterfall sheets on camp islands + finish
const waterfalls = [];
for (const idx of [4, 8, 12]) {
  const isl = ISLANDS[idx];
  const mat = new THREE.MeshBasicMaterial({ color: 0xd9f1f5, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  for (let k = 0; k < 2; k++) {
    const a = idx * 1.3 + k * 2.1;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 3.4), mat);
    sheet.position.set(isl.x + Math.cos(a) * isl.r * 0.98, isl.y - 1.7, isl.z + Math.sin(a) * isl.r * 0.98);
    sheet.rotation.y = a;
    scene.add(sheet);
    waterfalls.push(sheet);
  }
}

const crystals = W.buildCrystals(scene);
const jellyAnchor = W.buildJelly(scene, ISLANDS[0]);
const particles = W.makeParticles(scene);

// Crumble island: private materials so it can fade
const crumbleIdx = ISLANDS.findIndex((i) => i.type === 'crumble');
if (crumbleIdx >= 0) {
  const g = islands[crumbleIdx];
  g.grass.material = g.grass.material.clone();
  g.decor.material = g.decor.material.clone();
  g.group.children.forEach((c) => { c.material.transparent = true; });
}

/* ================= game state ================= */

const game = new Game();
game.springCapTop = registry.capTop('mushroom');
const ui = new UI();
let state = 'title'; // title | playing | paused | finished
let camMode = 'title'; // title | fly | follow
let flyT = 0;
const flyFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookSmoothing = new THREE.Vector3(0, 1.5, -5);

const TITLE_CAM = () => {
  const mobile = window.innerWidth < 720;
  if (mobile) return { pos: new THREE.Vector3(9.5, 12.5, 16.5), target: new THREE.Vector3(-1.5, 4.2, -7.5) };
  return { pos: new THREE.Vector3(13, 20, 25), target: new THREE.Vector3(-5, 1.5, -5) };
};

function setCamTitle() {
  const c = TITLE_CAM();
  camera.position.copy(c.pos);
  camera.lookAt(c.target);
  camPos.copy(c.pos);
  lookSmoothing.copy(c.target);
}
setCamTitle();

/* ================= input & actions ================= */

const input = new Input((action) => {
  if (action === 'mute') { audio.toggle(); ui.setMutedIcon(audio.muted); }
  else if (action === 'help') { ui.dialogVisible('dialogHelp') ? ui.hideHelp() : ui.showHelp(); }
  else if (action === 'pause') togglePause();
  else if (action === 'return' && state === 'playing') {
    game.returnToCheckpoint(perfT);
    ui.toast('Back to checkpoint');
  }
});

function startRun() {
  audio.click();
  state = 'playing';
  camMode = 'fly';
  flyT = 0;
  flyFrom.pos.copy(camera.position);
  flyFrom.target.copy(lookSmoothing);
  ui.startRunUI();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    const statText = `Draw calls ${stats.calls} · Triangles ${(stats.tris / 1000).toFixed(1)}k · ${(1000 / Math.max(1, stats.ms)).toFixed(0)} fps`;
    ui.showPause(statText);
  } else if (state === 'paused') {
    state = 'playing';
    ui.hidePause();
  }
}

function restartRun() {
  game.reset();
  game.springCapTop = registry.capTop('mushroom');
  // reset crumble visuals
  const g = islands[crumbleIdx];
  if (g) g.group.children.forEach((c) => { c.material.opacity = 1; c.visible = true; });
  state = 'playing';
  camMode = 'fly';
  flyT = 0;
  flyFrom.pos.copy(camera.position);
  flyFrom.target.copy(lookSmoothing);
  ui.hidePause();
  ui.hideFinish();
  ui.startRunUI();
}

function doFinish() {
  state = 'finished';
  audio.finish();
  const bestRaw = localStorage.getItem('jellyJungle.bestTime');
  const prevBest = bestRaw ? parseFloat(bestRaw) : null;
  const isBest = prevBest === null || game.time < prevBest;
  if (isBest) localStorage.setItem('jellyJungle.bestTime', String(game.time));
  const best = isBest ? game.time : prevBest;
  setTimeout(() => {
    ui.showFinish({
      time: game.time, falls: game.falls, crystals: game.crystalCount, total: game.crystalTotal,
      stars: starsFor(game.crystalCount), best,
    });
    ui.endRunUI();
  }, 700);
}

/* ================= UI wiring ================= */

document.getElementById('btn-start').addEventListener('click', startRun);
document.getElementById('btn-help').addEventListener('click', () => { audio.click(); ui.showHelp(); });
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { audio.click(); ui.hideHelp(); }));
document.getElementById('btn-pause').addEventListener('click', () => { audio.click(); togglePause(); });
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); togglePause(); });
document.getElementById('btn-restart-1').addEventListener('click', () => { audio.click(); restartRun(); });
document.getElementById('btn-replay').addEventListener('click', () => { audio.click(); restartRun(); });
document.getElementById('btn-sound').addEventListener('click', () => { const m = audio.toggle(); ui.setMutedIcon(m); if (!m) audio.click(); });

// ---------- prompt popup (footer button → formatted brief) ----------
const promptDialog = document.getElementById('dialog-prompt');
const promptBody = document.getElementById('prompt-body');
let promptLoaded = false;
function showPrompt() {
  if (!promptLoaded) { promptBody.innerHTML = getPrompt().html; promptLoaded = true; }
  promptDialog.classList.remove('hidden');
}
function hidePrompt() { promptDialog.classList.add('hidden'); }
document.getElementById('btn-prompt').addEventListener('click', () => { audio.click(); showPrompt(); });
document.getElementById('btn-prompt-close').addEventListener('click', () => { audio.click(); hidePrompt(); });
document.getElementById('btn-prompt-done').addEventListener('click', () => { audio.click(); hidePrompt(); });
document.getElementById('btn-prompt-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(getPrompt().raw); ui.toast('Prompt copied to clipboard'); }
  catch { ui.toast('Copy failed — select the text manually'); }
});

function wireModePill(id, mode) {
  document.getElementById(id).addEventListener('click', () => switchMode(mode));
}
wireModePill('pill-tripo', 'imported');
wireModePill('pill-classic', 'classic');
document.getElementById('mode-compare').addEventListener('click', (e) => {
  e.preventDefault();
  switchMode(registry.mode === 'imported' ? 'classic' : 'imported');
});

function switchMode(mode) {
  audio.click();
  registry.setMode(mode); // swaps every instance in place — state preserved
  game.springCapTop = registry.capTop('mushroom');
  ui.setMode(mode, registry.report());
}
ui.setMode(registry.mode, registry.report());

// Hidden-tab recovery: auto-pause + clear input
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (state === 'title' || camMode === 'title') setCamTitle();
});

/* ================= background asset import ================= */

registry.loadAll().then(() => {
  ui.setMode(registry.mode, registry.report());
  game.springCapTop = registry.capTop('mushroom');
});

/* ================= animation helpers ================= */

let perfT = 0; // global perf time (s) — drives spinners/sway regardless of pause

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _lookAhead = new THREE.Vector3();

function followPose(outPos, outTarget) {
  const p = game.pos;
  outPos.set(p.x, p.y + 8.8, p.z + 15.3);
  const speed = Math.hypot(game.vel.x, game.vel.z);
  if (speed > 1.2) {
    _lookAhead.set(game.vel.x / speed, 0, game.vel.z / speed).multiplyScalar(5.8);
  } else {
    _lookAhead.set(0, 0, -5.8);
  }
  outTarget.copy(p).add(_lookAhead);
  outTarget.y = p.y + 1.2;
}

function updateJellyVisual(dt) {
  const a = jellyAnchor;
  a.position.set(game.pos.x, game.pos.y, game.pos.z);
  // facing
  const speed = Math.hypot(game.vel.x, game.vel.z);
  let targetAng = Math.PI; // face -Z when idle
  if (speed > 0.6) targetAng = Math.atan2(game.vel.x, game.vel.z);
  let da = targetAng - a.rotation.y;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  a.rotation.y += da * Math.min(1, dt * 10);

  // squash & stretch (pivot at feet)
  let sy = 1, sxz = 1;
  if (!game.onGround) {
    const st = THREE.MathUtils.clamp(1 + Math.abs(game.vel.y) * 0.013, 1, 1.26);
    sy = st; sxz = 1 / Math.sqrt(st);
  } else {
    sy = 1 + Math.sin(perfT * 2.4) * 0.018; // breathing
    sxz = 1 - Math.sin(perfT * 2.4) * 0.012;
  }
  if (game.landingFxT > 0 && perfT - game.landingFxT < 0.2) {
    const p = (perfT - game.landingFxT) / 0.2;
    const s = Math.sin(p * Math.PI);
    sy *= 1 - 0.28 * s;
    sxz *= 1 + 0.2 * s;
  }
  a.scale.set(sxz, sy, sxz);
  a.visible = !(game.immunity > 0 && Math.floor(perfT * 14) % 2 === 0);
}

function updateWorldVisuals(dt) {
  // moving islands
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    if (isl.type !== 'moving') continue;
    const c = game.islandCenter(i, perfT);
    islands[i].group.position.x = c.x;
  }
  // crumble shake + fade
  if (crumbleIdx >= 0) {
    const st = game.crumble[crumbleIdx];
    const g = islands[crumbleIdx];
    const baseY = ISLANDS[crumbleIdx].y;
    if (st.state === 'armed') {
      const s = Math.sin(perfT * 46) * 0.05 + Math.sin(perfT * 31) * 0.04;
      g.group.position.x = ISLANDS[crumbleIdx].x + s;
      g.group.position.z = ISLANDS[crumbleIdx].z + Math.cos(perfT * 39) * 0.05;
      const fade = st.t > 1.2 ? (1.5 - st.t) / 0.3 : 1;
      g.group.children.forEach((c) => { c.material.opacity = fade; });
    } else if (st.state === 'hidden') {
      g.group.visible = false;
    } else {
      g.group.visible = true;
      g.group.position.x = ISLANDS[crumbleIdx].x;
      g.group.position.z = ISLANDS[crumbleIdx].z;
      g.group.children.forEach((c) => { c.material.opacity = 1; });
    }
    void baseY;
  }
  // spinners
  for (const sp of spinners) {
    const omega = sp.omega;
    sp.table.rotation.y = perfT * omega;
    sp.bars.forEach((b, bi) => { b.group.rotation.y = perfT * omega + bi * Math.PI / 2; });
  }
  // spring mushroom squash/rebound
  for (const sp of springs) {
    const a = game.springAnim[sp.idx];
    if (a > 0) {
      const e = Math.exp(-6.5 * a);
      const w = Math.cos(15 * a);
      sp.anchor.scale.set(1 + 0.22 * e * w, 1 - 0.45 * e * w, 1 + 0.22 * e * w);
      game.springAnim[sp.idx] = Math.max(0, a - dt * 1.6);
    } else {
      sp.anchor.scale.set(1, 1, 1);
    }
  }
  // trees sway
  for (const t of trees) {
    t.anchor.rotation.z = Math.sin(perfT * 0.9 + t.phase) * 0.035;
    t.anchor.rotation.x = Math.cos(perfT * 0.7 + t.phase * 1.3) * 0.02;
  }
  // crystals
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const c = game.islandCenter(i, perfT);
    for (let j = 0; j < 3; j++) {
      const gi = i * 3 + j;
      if (game.collected[gi]) { m4.makeScale(0, 0, 0); crystals.setMatrixAt(gi, m4); continue; }
      const a = isl.id * 1.7 + 0.6 + (j * Math.PI * 2) / 3;
      const ringR = isl.r * 0.55;
      const x = c.x + Math.cos(a) * ringR;
      const z = c.z + Math.sin(a) * ringR;
      const y = c.y + 1.15 + Math.sin(perfT * 2 + gi) * 0.12;
      eu.set(0, perfT * 1.6 + gi, 0);
      q.setFromEuler(eu);
      m4.compose(_v2.set(x, y, z), q, _v1.set(1, 1, 1));
      crystals.setMatrixAt(gi, m4);
    }
  }
  crystals.instanceMatrix.needsUpdate = true;
  // portal
  portal.ring.rotation.y = perfT * 0.8;
  portal.glow.material.opacity = 0.3 + Math.sin(perfT * 2.2) * 0.12;
  particles.update(dt);
}

/* ================= main loop ================= */

const stats = { ms: 16, calls: 0, tris: 0 };
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1; // hidden-tab / hiccup clamp
  perfT += dt;

  if (state === 'playing') {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      const jump = input.consumeJump();
      const ev = game.step({ mx: input.mx, my: input.my, jump }, perfT);
      onEvent(ev);
      acc -= STEP;
      steps++;
    }
    if (steps === 12) acc = 0; // avoid spiral of death

    // HUD
    const islIdx = game.currentIsland();
    ui.hud({
      time: game.time, crystals: game.crystalCount, total: game.crystalTotal,
      islandIdx: islIdx, islandName: ISLANDS[islIdx].name,
      progress: game.progressIsland / (ISLANDS.length - 1), jumps: game.jumpsLeft,
    });
  } else {
    acc = 0;
  }

  // camera
  if (camMode === 'fly') {
    flyT += dt / 0.9;
    const k = THREE.MathUtils.smoothstep(Math.min(1, flyT), 0, 1);
    followPose(_v1, _v2);
    camPos.lerpVectors(flyFrom.pos, _v1, k);
    lookSmoothing.lerpVectors(flyFrom.target, _v2, k);
    if (flyT >= 1) camMode = 'follow';
  } else if (camMode === 'follow' && state !== 'title') {
    followPose(_v1, _v2);
    const kp = 1 - Math.exp(-5 * dt);
    const kl = 1 - Math.exp(-7.5 * dt);
    camPos.lerp(_v1, kp);
    lookSmoothing.lerp(_v2, kl);
  } else {
    // title: gentle drift
    const c = TITLE_CAM();
    camPos.copy(c.pos);
    lookSmoothing.copy(c.target);
    lookSmoothing.x += Math.sin(perfT * 0.25) * 0.6;
    lookSmoothing.y += Math.cos(perfT * 0.2) * 0.3;
  }
  camera.position.copy(camPos);
  camera.lookAt(lookSmoothing);

  // visuals
  if (state !== 'title') updateJellyVisual(dt);
  else {
    jellyAnchor.position.set(ISLANDS[0].x, ISLANDS[0].y + 0.02, ISLANDS[0].z + 1.5);
    const b = Math.sin(perfT * 2.4) * 0.02;
    jellyAnchor.scale.set(1 - b, 1 + b, 1 - b);
    jellyAnchor.rotation.y = perfT * 0.15;
  }
  updateWorldVisuals(dt);

  // shadow light follows player (useful ground shadow)
  const focus = state === 'title' ? _v2.set(0, 1.2, -4) : game.pos;
  sun.position.set(focus.x + 14, focus.y + 26, focus.z + 10);
  sun.target.position.copy(focus);

  renderer.render(scene, camera);

  // stats (real camera frame)
  stats.ms = stats.ms * 0.95 + dt * 1000 * 0.05;
  stats.calls = renderer.info.render.calls;
  stats.tris = renderer.info.render.triangles;
}

function onEvent(ev) {
  if (!ev) return;
  switch (ev) {
    case 'jump': audio.jump(); break;
    case 'airjump': audio.airJump(); break;
    case 'land': audio.land(); break;
    case 'spring': {
      audio.spring();
      const sp = springs.find((s) => s.idx === game.progressIsland);
      const isl = ISLANDS[game.progressIsland];
      particles.burst(_v1.set(isl.x, isl.y + 1.6, isl.z), 0xf6b9cb, 18, 4);
      void sp;
      break;
    }
    case 'hit':
      audio.hit();
      ui.toast('Ouch! The candy bar got you');
      particles.burst(_v1.copy(game.pos).add(_v2.set(0, 0.8, 0)), 0xef7d96, 12, 3);
      break;
    case 'checkpoint':
      audio.checkpoint();
      ui.toast('Checkpoint reached!');
      particles.burst(_v1.copy(game.pos).add(_v2.set(0, 1.4, 0)), 0xffd45e, 20, 3.5);
      break;
    case 'crystal':
      audio.crystal();
      particles.burst(_v1.copy(game.pos).add(_v2.set(0, 1, 0)), 0xffd45e, 14, 3);
      break;
    case 'fall':
      audio.fall();
      ui.toast('Back to your last checkpoint');
      break;
    case 'finish': doFinish(); break;
  }
}

requestAnimationFrame(frame);

/* ================= debug / acceptance hooks ================= */

window.__JJ = {
  game, input, registry, ui, camera, renderer, scene, state: () => state,
  stats,
  /** TEST HOOK ONLY — not gameplay. Places the player on an island. */
  teleport(i) {
    const c = game.islandCenter(i, perfT);
    game.pos.set(c.x, c.y + 0.05, c.z);
    game.vel.set(0, 0, 0);
    game.onGround = true;
    game.groundIndex = i;
    game.jumpsLeft = 3;
  },
};
