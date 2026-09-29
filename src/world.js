// World construction: sky, clouds, course islands, decorations, crystals,
// banner and finish portal. Repeated static scenery is merged/instanced to
// keep draw calls low.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, crystalSpots } from './course.js';
import { registry, buildJellyClassic, MUSHROOM_CAP_TOP } from './assets.js';

/* ---------- helpers ---------- */

/** Merge geometries, normalising index presence (Polyhedron geoms are non-indexed). */
export function mergeAll(geos) {
  const anyIndexed = geos.some((g) => g.index !== null);
  const anyNonIndexed = geos.some((g) => g.index === null);
  if (anyIndexed && anyNonIndexed) {
    geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  }
  return mergeGeometries(geos);
}

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function xform(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s)
  );
  geo.applyMatrix4(m);
  return geo;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- palette ---------- */
const C = {
  grass: 0xb7d493, grassLip: 0xa3c881, cream: 0xeef0dc,
  rock: 0xb3aca1, rockDark: 0x9d968a,
  vine: 0x6fae72, pebble: 0xf4efe2, tuft: 0x8fbf70,
  flowerA: 0xef7d96, flowerB: 0xf2c14e, stemGreen: 0x5f9e63,
  miniMushCap: 0xf2a0b5, miniMushStem: 0xf7ecd9,
  cloud: 0xffffff, crystal: 0xffd45e,
};

/* ---------- sky & fog ---------- */

export function makeSky() {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#8fc79b');
  g.addColorStop(0.45, '#a9d4ae');
  g.addColorStop(0.75, '#c4e0c4');
  g.addColorStop(1.0, '#dcebd6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { background: tex, fog: new THREE.Fog(0xc4ddc4, 45, 170) };
}

/* ---------- clouds (one instanced mesh) ---------- */

export function makeClouds(scene) {
  const rnd = mulberry32(42);
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: C.cloud, roughness: 1, flatShading: false });
  const puffs = [];
  // Cloud sea below the course + scattered around
  for (let i = 0; i < 26; i++) {
    const cx = (rnd() - 0.5) * 190;
    const cz = -rnd() * 170 + 20;
    const cy = -4 + rnd() * 8;
    const n = 3 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++) {
      puffs.push({
        p: [cx + (rnd() - 0.5) * 9, cy + (rnd() - 0.5) * 1.2, cz + (rnd() - 0.5) * 7],
        s: [2.6 + rnd() * 3.4, 1.1 + rnd() * 0.9, 2 + rnd() * 2.4],
      });
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
  const m4 = new THREE.Matrix4();
  puffs.forEach((pf, i) => {
    m4.compose(new THREE.Vector3(...pf.p), new THREE.Quaternion(), new THREE.Vector3(...pf.s));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

/* ---------- decorative background islands (merged, static) ---------- */

export function makeDecorIslands(scene) {
  const rnd = mulberry32(7);
  const geos = [];
  const spots = [];
  for (let i = 0; i < 26; i++) {
    // scatter around the course, avoiding the play path
    let x, z, y, ok = false;
    for (let tries = 0; tries < 24 && !ok; tries++) {
      const side = rnd() < 0.5 ? -1 : 1;
      x = side * (16 + rnd() * 55);
      z = -rnd() * 150 + 10;
      y = -5 + rnd() * 14;
      ok = true;
      for (const isl of ISLANDS) {
        if (Math.hypot(x - isl.x, z - isl.z) < isl.r + 9) { ok = false; break; }
      }
    }
    if (!ok) continue;
    const r = 1.6 + rnd() * 2.6;
    spots.push({ x, y, z, r });
    // grass disc
    geos.push(colorize(xform(new THREE.CylinderGeometry(r, r, 0.5, 10), { p: [x, y - 0.25, z] }), C.grass));
    // rock cone
    geos.push(colorize(xform(new THREE.ConeGeometry(r * 0.9, r * 1.3, 6).rotateX(Math.PI), { p: [x, y - 0.55 - r * 0.65, z], r: [0, rnd() * Math.PI, 0] }), C.rock));
    // little tree blob
    if (rnd() < 0.8) {
      const tx = x + (rnd() - 0.5) * r * 0.7, tz = z + (rnd() - 0.5) * r * 0.7;
      geos.push(colorize(xform(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6), { p: [tx, y + 0.6, tz] }), 0xcf9a6b));
      geos.push(colorize(xform(new THREE.SphereGeometry(0.85, 8, 6).scale(1.4, 0.7, 1.2), { p: [tx, y + 1.5, tz] }), rnd() < 0.5 ? C.grassLip : 0x7fc9d6));
    }
  }
  const merged = mergeAll(geos);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const mesh = new THREE.Mesh(merged, mat);
  scene.add(mesh);
  return mesh;
}

/* ---------- per-island decoration batch (vertex-colored, one draw call) ---------- */

function islandDecor(isl, rnd) {
  const geos = [];
  // rock cone underside + hanging chunks (below landing plane only)
  const coneH = isl.r * 1.25;
  geos.push(colorize(xform(new THREE.ConeGeometry(isl.r * 0.94, coneH, 7).rotateX(Math.PI), { p: [0, -0.55 - coneH / 2 + 0.3, 0], r: [0, rnd() * Math.PI, 0] }), C.rock));
  const nChunks = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < nChunks; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = isl.r * (0.55 + rnd() * 0.35);
    const s = 0.5 + rnd() * 0.8;
    geos.push(colorize(xform(new THREE.IcosahedronGeometry(s, 0), {
      p: [Math.cos(a) * rr, -0.7 - rnd() * isl.r * 0.5, Math.sin(a) * rr],
      r: [rnd() * 3, rnd() * 3, rnd() * 3],
    }), rnd() < 0.5 ? C.rock : C.rockDark));
  }
  // trailing vine bead chains from the lip
  const nVines = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nVines; i++) {
    const a = rnd() * Math.PI * 2;
    const len = 4 + Math.floor(rnd() * 4);
    for (let j = 1; j <= len; j++) {
      const droop = j * (0.22 + rnd() * 0.1);
      geos.push(colorize(xform(new THREE.SphereGeometry(0.055, 6, 5), {
        p: [Math.cos(a) * (isl.r - 0.12 + Math.sin(j * 1.3) * 0.06), -droop, Math.sin(a) * (isl.r - 0.12)],
      }), C.vine));
    }
  }
  // grass tufts on the ring
  const nTufts = Math.floor(isl.r * 2.4);
  for (let i = 0; i < nTufts; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = isl.r * (0.68 + rnd() * 0.28);
    geos.push(colorize(xform(new THREE.ConeGeometry(0.07, 0.3 + rnd() * 0.15, 5), {
      p: [Math.cos(a) * rr, 0.14, Math.sin(a) * rr], r: [(rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4],
    }), C.tuft));
  }
  // pebbles
  const nPeb = Math.floor(isl.r * 1.2);
  for (let i = 0; i < nPeb; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = isl.r * (0.6 + rnd() * 0.34);
    geos.push(colorize(xform(new THREE.SphereGeometry(0.09 + rnd() * 0.08, 6, 5).scale(1, 0.7, 1), {
      p: [Math.cos(a) * rr, 0.05, Math.sin(a) * rr],
    }), C.pebble));
  }
  // flowers (stem + petal head)
  const nFl = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < nFl; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = isl.r * (0.72 + rnd() * 0.22);
    const fx = Math.cos(a) * rr, fz = Math.sin(a) * rr;
    geos.push(colorize(xform(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), { p: [fx, 0.15, fz] }), C.stemGreen));
    geos.push(colorize(xform(new THREE.SphereGeometry(0.09, 6, 5), { p: [fx, 0.32, fz] }), rnd() < 0.5 ? C.flowerA : C.flowerB));
  }
  // tiny decorative mushrooms (procedural family, small scale)
  const nMini = Math.floor(isl.r * 0.9);
  for (let i = 0; i < nMini; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = isl.r * (0.78 + rnd() * 0.16);
    const mx = Math.cos(a) * rr, mz = Math.sin(a) * rr;
    const s = 0.35 + rnd() * 0.25;
    geos.push(colorize(xform(new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 0.3 * s, 8), { p: [mx, 0.15 * s, mz] }), C.miniMushStem));
    geos.push(colorize(xform(new THREE.SphereGeometry(0.3 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), { p: [mx, 0.28 * s, mz] }), C.miniMushCap));
  }
  return mergeAll(geos);
}

/* ---------- course island builder ---------- */

const MATS = {
  grass: new THREE.MeshStandardMaterial({ color: C.grass, roughness: 0.9 }),
  lip: new THREE.MeshStandardMaterial({ color: C.grassLip, roughness: 0.9 }),
  cream: new THREE.MeshStandardMaterial({ color: C.cream, roughness: 0.95 }),
  decor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
};

export function buildIsland(scene, isl, idx) {
  const rnd = mulberry32(idx * 131 + 7);
  const group = new THREE.Group();
  group.position.set(isl.x, isl.y, isl.z);
  group.userData.islandIndex = idx;

  // grass disc + rounded lip + cream centre
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 0.985, 0.55, 40), MATS.grass);
  grass.position.y = -0.275;
  grass.receiveShadow = true;
  group.add(grass);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(isl.r - 0.1, 0.16, 10, 48), MATS.lip);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.02;
  group.add(lip);
  const cream = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.6, isl.r * 0.6, 0.07, 32), MATS.cream);
  cream.position.y = 0.035;
  cream.receiveShadow = true;
  group.add(cream);

  // merged decoration batch
  const decor = new THREE.Mesh(islandDecor(isl, rnd), MATS.decor);
  group.add(decor);

  scene.add(group);
  return { isl, idx, group, grass, decor };
}

/* ---------- special features ---------- */

export function buildBanner(scene, isl) {
  const g = new THREE.Group();
  // posts + board (merged, one draw call)
  const postGeo = (x) => xform(new THREE.CylinderGeometry(0.055, 0.07, 2.0, 8), { p: [x, 1.0, 0] });
  const board = xform(new THREE.BoxGeometry(3.4, 0.72, 0.12), { p: [0, 1.95, 0] });
  const merged = mergeAll([colorize(postGeo(-1.55), 0xcf9a6b), colorize(postGeo(1.55), 0xcf9a6b), colorize(board, 0xf7ecd9)]);
  g.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  // text plane
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 104;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f7ecd9'; ctx.fillRect(0, 0, 512, 104);
  ctx.fillStyle = '#2c5140';
  ctx.font = '700 64px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('JELLY JUNGLE', 256, 56);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const text = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 0.62), new THREE.MeshBasicMaterial({ map: tex }));
  text.position.set(0, 1.95, 0.07);
  g.add(text);
  const back = text.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.07;
  g.add(back);
  g.position.set(isl.x + 0.4, isl.y, isl.z - isl.r * 0.62); // back edge, clear of the jelly
  scene.add(g);
  return g;
}

export function buildPortal(scene, isl) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.22, 14, 48),
    new THREE.MeshStandardMaterial({ color: 0xe8b64c, roughness: 0.3, metalness: 0.35, emissive: 0x7a5a14, emissiveIntensity: 0.35 })
  );
  ring.position.y = 2.1;
  ring.castShadow = true;
  g.add(ring);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.y = 2.1;
  g.add(glow);
  // base stones
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.3, 8), MATS.decor.clone());
  base.material.vertexColors = false;
  base.material.color.set(0xcfc8ba);
  base.position.y = 0.15;
  g.add(base);
  g.position.set(isl.x, isl.y, isl.z - 0.5);
  scene.add(g);
  return { group: g, ring, glow };
}

export function buildFlag(scene, isl) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.6 }));
  pole.position.y = 1.6;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ color: C.flowerA, side: THREE.DoubleSide, roughness: 0.7 }));
  flag.position.set(0.62, 2.85, 0);
  g.add(flag);
  g.position.set(isl.x - isl.r * 0.45, isl.y, isl.z + isl.r * 0.3);
  scene.add(g);
  return g;
}

/* ---------- spinner (turntable + candy bars) ---------- */

export function buildSpinner(scene, isl, double) {
  const g = new THREE.Group();
  // turntable disc (a low platform the player can stand on; carries them)
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(isl.r * 0.52, isl.r * 0.56, 0.24, 28),
    new THREE.MeshStandardMaterial({ color: 0xf2a0b5, roughness: 0.5 })
  );
  table.position.y = 0.12;
  table.receiveShadow = true;
  g.add(table);
  const ringMark = new THREE.Mesh(
    new THREE.TorusGeometry(isl.r * 0.4, 0.035, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xfdf3e3, roughness: 0.6 })
  );
  ringMark.rotation.x = Math.PI / 2;
  ringMark.position.y = 0.245;
  g.add(ringMark);

  // candy bars
  const bars = [];
  const nBars = double ? 2 : 1;
  for (let b = 0; b < nBars; b++) {
    const barG = new THREE.Group();
    const half = isl.r * 0.86;
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, half * 2 - 0.34, 6, 12), new THREE.MeshStandardMaterial({ color: b ? 0xf2c14e : 0xef7d96, roughness: 0.45 }));
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    barG.add(bar);
    for (const sx of [-1, 1]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), new THREE.MeshStandardMaterial({ color: 0xe8b64c, roughness: 0.35, metalness: 0.3 }));
      ball.position.x = sx * half;
      barG.add(ball);
    }
    barG.position.y = 0.62;
    barG.rotation.y = b * Math.PI / 2;
    g.add(barG);
    bars.push({ group: barG, half });
  }
  g.position.set(isl.x, isl.y, isl.z);
  scene.add(g);
  return { group: g, table, bars, omega: double ? 1.5 : 1.15 };
}

/* ---------- spring mushroom (asset slot instance) ---------- */

export function buildSpringMushroom(scene, isl, anchorOffset = [0, 0, 0]) {
  const anchor = new THREE.Group();
  anchor.position.set(isl.x + anchorOffset[0], isl.y, isl.z + anchorOffset[2]);
  registry.registerInstance('mushroom', anchor);
  scene.add(anchor);
  return { anchor, capTop: () => isl.y + registry.capTop('mushroom') };
}

/* ---------- course trees (asset slot instances, sway) ---------- */

export function buildTrees(scene, isl, idx, spots) {
  const trees = [];
  for (const [fx, fz, s] of spots) {
    const anchor = new THREE.Group();
    anchor.position.set(isl.x + fx, isl.y, isl.z + fz);
    anchor.scale.setScalar(s);
    anchor.rotation.y = (idx * 2.3 + fx) % (Math.PI * 2);
    registry.registerInstance('tree', anchor);
    scene.add(anchor);
    trees.push({ anchor, phase: idx * 1.7 + fx });
  }
  return trees;
}

// Tree placement per island type — kept clear of the landing centre and path.
export function treeSpotsFor(isl, idx) {
  const rnd = mulberry32(idx * 53 + 3);
  const spots = [];
  const n = isl.r > 4 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    // back half of the island (+z side faces the approach) and edges
    const a = Math.PI * (0.15 + rnd() * 0.7); // 0..~2.8 rad → biased to sides/back
    const rr = isl.r * (0.62 + rnd() * 0.24);
    spots.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.9 + isl.r * 0.15, 0.85 + rnd() * 0.35]);
  }
  return spots;
}

/* ---------- crystals (single instanced mesh, per-frame world update) ---------- */

export function buildCrystals(scene) {
  const geo = new THREE.OctahedronGeometry(0.34, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: C.crystal, roughness: 0.25, metalness: 0.4,
    emissive: 0xb98a1e, emissiveIntensity: 0.55, flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, ISLANDS.length * 3);
  mesh.castShadow = false;
  scene.add(mesh);
  return mesh;
}

/* ---------- jelly character (asset slot instance) ---------- */

export function buildJelly(scene, startIsland) {
  const anchor = new THREE.Group();
  anchor.position.set(startIsland.x, startIsland.y + 0.02, startIsland.z + 1.5);
  registry.registerInstance('jelly', anchor);
  scene.add(anchor);
  return anchor;
}

/* ---------- particle bursts (single Points pool) ---------- */

export function makeParticles(scene, count = 96) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < count; i++) parts.push({ alive: false, life: 0, vel: new THREE.Vector3() });
  let cursor = 0;
  return {
    points,
    burst(p, color, n = 14, speed = 3) {
      const c = new THREE.Color(color);
      for (let k = 0; k < n; k++) {
        const i = cursor; cursor = (cursor + 1) % count;
        const pt = parts[i];
        pt.alive = true;
        pt.life = 0.55 + Math.random() * 0.25;
        pt.vel.set((Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.4, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.6 + Math.random() * 0.8));
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
    },
    update(dt) {
      for (let i = 0; i < count; i++) {
        const pt = parts[i];
        if (!pt.alive) continue;
        pt.life -= dt;
        if (pt.life <= 0) { pos[i * 3 + 1] = -9999; pt.alive = false; continue; }
        pt.vel.y -= 9 * dt;
        pos[i * 3] += pt.vel.x * dt;
        pos[i * 3 + 1] += pt.vel.y * dt;
        pos[i * 3 + 2] += pt.vel.z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
