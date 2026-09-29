// Asset registry: stable slots for replaceable model families.
// Each slot has a procedural "classic" builder and an optional imported GLB.
// Instances share one variant per slot; mode switching swaps children in place,
// preserving world transforms (and therefore game state).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { validateModel, fitModel, disposeObject } from './fitting.js';

/** Merge same-material geoms (normalising index presence) into one mesh. */
function mergedMesh(geos, material) {
  const anyIndexed = geos.some((g) => g.index !== null);
  const anyNon = geos.some((g) => g.index === null);
  if (anyIndexed && anyNon) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  return new THREE.Mesh(mergeGeometries(geos), material);
}

function place(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s)
  );
  geo.applyMatrix4(m);
  return geo;
}

/* ================= Classic procedural builders ================= */

const M = {
  jellyBody: new THREE.MeshPhysicalMaterial({ color: 0xf6b9cb, roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.4 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x3a2e35, roughness: 0.4 }),
  highlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  cheek: new THREE.MeshStandardMaterial({ color: 0xf79ab0, roughness: 0.6 }),
  sprout: new THREE.MeshStandardMaterial({ color: 0x79c9a2, roughness: 0.5 }),
  stem: new THREE.MeshStandardMaterial({ color: 0xe8b583, roughness: 0.6 }),
  mushCap: new THREE.MeshStandardMaterial({ color: 0xf2919f, roughness: 0.45 }),
  mushSpot: new THREE.MeshStandardMaterial({ color: 0xfdf3e3, roughness: 0.5 }),
  mushStem: new THREE.MeshStandardMaterial({ color: 0xf7ecd9, roughness: 0.6 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0xcf9a6b, roughness: 0.7 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7fc9d6, roughness: 0.55 }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0xa5dcc3, roughness: 0.55 }),
  fruit: new THREE.MeshStandardMaterial({ color: 0xf2b08a, roughness: 0.5 }),
};

export function buildJellyClassic() {
  const g = new THREE.Group();
  g.name = 'jelly-classic';
  // Body + arms + feet (one material, merged)
  const bodyGeos = [place(new THREE.SphereGeometry(0.8, 32, 24), { p: [0, 0.76, 0], s: [1, 0.95, 0.96] })];
  for (const sx of [-1, 1]) {
    bodyGeos.push(place(new THREE.SphereGeometry(0.16, 12, 10), { p: [0.74 * sx, 0.6, 0.05], s: [1, 0.85, 0.85] }));
    bodyGeos.push(place(new THREE.SphereGeometry(0.2, 12, 10), { p: [0.34 * sx, 0.1, 0.18], s: [1, 0.6, 1.15] }));
  }
  const body = mergedMesh(bodyGeos, M.jellyBody);
  body.castShadow = true;
  g.add(body);
  // Eyes + smile (dark material, merged)
  const eyeGeos = [place(new THREE.TorusGeometry(0.11, 0.024, 8, 20, Math.PI * 0.9), { p: [0, 0.76, 0.7], r: [0, 0, Math.PI + Math.PI * 0.05] })];
  for (const sx of [-1, 1]) eyeGeos.push(place(new THREE.SphereGeometry(0.14, 16, 12), { p: [0.3 * sx, 0.92, 0.62], s: [0.85, 1.35, 0.55] }));
  g.add(mergedMesh(eyeGeos, M.eye));
  // Highlights
  const hlGeos = [];
  for (const sx of [-1, 1]) hlGeos.push(place(new THREE.SphereGeometry(0.045, 8, 8), { p: [0.33 * sx, 1.0, 0.72] }));
  g.add(mergedMesh(hlGeos, M.highlight));
  // Cheeks
  const cheekGeos = [];
  for (const sx of [-1, 1]) cheekGeos.push(place(new THREE.SphereGeometry(0.11, 12, 8), { p: [0.5 * sx, 0.72, 0.55], s: [1, 0.6, 0.4] }));
  g.add(mergedMesh(cheekGeos, M.cheek));
  // Mint sprout (stem + two leaves), top ~1.65
  const sproutGeos = [place(new THREE.CylinderGeometry(0.035, 0.05, 0.24, 8), { p: [0, 1.5, 0] })];
  for (const sx of [-1, 1]) sproutGeos.push(place(new THREE.SphereGeometry(0.16, 12, 8), { p: [0.13 * sx, 1.62, 0], r: [0, 0, -0.7 * sx], s: [1.25, 0.32, 0.55] }));
  g.add(mergedMesh(sproutGeos, M.sprout));
  return g;
}

// Classic mushroom: cap top (local) at CAP_TOP_Y — spring collision uses this.
export const MUSHROOM_CAP_TOP = 1.34;

export function buildMushroomClassic() {
  const g = new THREE.Group();
  g.name = 'mushroom-classic';
  // Stem + cream gills (merged)
  const stemGeos = [
    place(new THREE.CylinderGeometry(0.34, 0.46, 0.5, 20), { p: [0, 0.25, 0] }),
    place(new THREE.CylinderGeometry(1.06, 1.14, 0.1, 24), { p: [0, 0.5, 0] }),
  ];
  const stem = mergedMesh(stemGeos, M.mushStem);
  stem.castShadow = true;
  g.add(stem);
  // Broad coral dome (base y=0.5, top = 0.5 + 0.84)
  const cap = new THREE.Mesh(place(new THREE.SphereGeometry(1.2, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, 0.5, 0], s: [1, 0.7, 1] }), M.mushCap);
  cap.castShadow = true;
  g.add(cap);
  // Raised ivory spots on the dome surface (merged)
  const spotGeos = [];
  const spots = [
    [0, 1.35, Math.PI / 2], [0.7, 0.9, Math.PI / 2 - 0.55], [-0.65, 1.0, Math.PI / 2 + 0.5],
    [0.45, 1.15, Math.PI / 2 - 0.35 + 2.2], [-0.4, 1.2, Math.PI / 2 + 0.4 + 2.2],
    [0.9, 0.72, Math.PI / 2 - 0.85], [-0.95, 0.75, Math.PI / 2 + 0.9],
  ];
  spots.forEach(([x, y, phi], i) => {
    const r = Math.sqrt(Math.max(0, 1.44 - (y - 0.5) * (y - 0.5) / 0.49)); // on dome surface
    spotGeos.push(place(new THREE.SphereGeometry(0.14, 12, 10), { p: [x * (r / 1.2), y, Math.cos(phi) * r], s: [1 + ((i * 37) % 25) / 100, 1 + ((i * 37) % 25) / 100, 1 + ((i * 37) % 25) / 100] }));
  });
  g.add(mergedMesh(spotGeos, M.mushSpot));
  return g;
}

export function buildTreeClassic(seed = 0) {
  const g = new THREE.Group();
  g.name = 'tree-classic';
  const rnd = mulberry32(seed * 97 + 13);
  // Curved trunk via tube along a gentle curve
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.1, 0.9, 0.06),
    new THREE.Vector3(0.28, 1.8, -0.05),
    new THREE.Vector3(0.34, 2.5, 0.02),
  ]);
  const trunkGeos = [
    new THREE.TubeGeometry(curve, 10, 0.24, 8),
    place(new THREE.ConeGeometry(0.5, 0.7, 8), { p: [0, 0.3, 0] }),
  ];
  const trunk = mergedMesh(trunkGeos, M.trunk);
  trunk.castShadow = true;
  g.add(trunk);
  // Oversized rounded palm fronds drooping from the crown (merged)
  const top = curve.getPoint(1);
  const frondGeos = [];
  const nFronds = 8;
  for (let i = 0; i < nFronds; i++) {
    const a = (i / nFronds) * Math.PI * 2 + rnd() * 0.5;
    const len = 1.05 + rnd() * 0.45;
    // long axis radial, drooping down: R = Ry(-a) · Rz(-droop)
    frondGeos.push(place(new THREE.SphereGeometry(1, 12, 8), {
      p: [top.x + Math.cos(a) * len * 0.5, top.y + 0.16 - (i % 3) * 0.07, top.z + Math.sin(a) * len * 0.5],
      r: [0, -a, -(0.62 + rnd() * 0.3)],
      s: [len, len * 0.13, len * 0.2],
    }));
  }
  frondGeos.push(place(new THREE.SphereGeometry(0.78, 14, 10), { p: [top.x, top.y + 0.32, top.z] }));
  const fronds = mergedMesh(frondGeos, M.leaf);
  fronds.castShadow = true;
  g.add(fronds);
  // Peach fruit clusters (merged)
  const fruitGeos = [];
  for (let c = 0; c < 3; c++) {
    const a = rnd() * Math.PI * 2;
    const fx = top.x + Math.cos(a) * 0.5, fz = top.z + Math.sin(a) * 0.5;
    for (let f = 0; f < 3; f++) {
      fruitGeos.push(place(new THREE.SphereGeometry(0.14, 10, 8), {
        p: [fx + (rnd() - 0.5) * 0.25, top.y - 0.15 + (rnd() - 0.5) * 0.2, fz + (rnd() - 0.5) * 0.25],
      }));
    }
  }
  g.add(mergedMesh(fruitGeos, M.fruit));
  return g;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= Registry ================= */

const SLOT_DEFS = {
  jelly:    { file: 'assets/jelly.glb',    targetHeight: 1.65, buildClassic: () => buildJellyClassic() },
  mushroom: { file: 'assets/mushroom.glb', targetHeight: MUSHROOM_CAP_TOP, buildClassic: () => buildMushroomClassic(), capTopLocal: MUSHROOM_CAP_TOP },
  tree:     { file: 'assets/tree.glb',     targetHeight: 3.4, buildClassic: (seed) => buildTreeClassic(seed) },
};

export class AssetRegistry {
  constructor() {
    this.loader = new GLTFLoader();
    this.slots = {};          // name -> { classic, imported, status, capTop }
    this.instances = [];      // { slot, anchor } — anchors with one swappable child
    this.mode = 'imported';   // 'classic' | 'imported' — Tripo AI is the default presentation
    this.generation = 0;      // invalidates stale async loads
    for (const [name, def] of Object.entries(SLOT_DEFS)) {
      const classic = def.buildClassic(1);
      this.slots[name] = { ...def, classic, imported: null, status: 'classic', capTop: def.capTopLocal ?? null };
    }
  }

  /** Attempt to load all GLB replacements. Non-blocking; safe to call repeatedly. */
  async loadAll() {
    const gen = ++this.generation;
    await Promise.all(Object.entries(this.slots).map(async ([name, slot]) => {
      try {
        const gltf = await this.loader.loadAsync(slot.file);
        if (gen !== this.generation) { disposeObject(gltf.scene); return; } // stale
        const v = validateModel(gltf.scene);
        if (!v.ok) throw new Error(v.reason);
        const { wrapper, scale } = fitModel(gltf.scene, slot.targetHeight);
        if (slot.imported) disposeObject(slot.imported);
        slot.imported = wrapper;
        // Cap top for springs: use the fitted bounding box top (numerically aligned).
        const box = new THREE.Box3().setFromObject(wrapper);
        slot.capTop = box.max.y;
        slot.status = 'imported';
      } catch (err) {
        if (gen === this.generation) slot.status = 'classic'; // keep procedural fallback
      }
    }));
    return this.report();
  }

  report() {
    const names = Object.keys(this.slots);
    const loaded = names.filter((n) => this.slots[n].status === 'imported');
    if (loaded.length === names.length) return 'Rich detail';
    if (loaded.length > 0) return `${loaded.length} of ${names.length} imported`;
    return 'Classic fallback';
  }

  /** Register an in-scene anchor whose single child is a clone of the slot's model.
   *  (A three.js Object3D has one parent, so every instance needs its own clone; geometry & materials stay shared.) */
  registerInstance(slotName, anchor) {
    const current = this.activeModel(slotName);
    anchor.clear();
    anchor.add(current.clone(true));
    this.instances.push({ slot: slotName, anchor });
    return anchor;
  }

  activeModel(slotName) {
    const slot = this.slots[slotName];
    if (this.mode === 'imported' && slot.imported) return slot.imported;
    return slot.classic;
  }

  /** Switch art mode in place. Preserves every instance's transform. */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const gen = ++this.generation; // supersede in-flight loads for old context
    void gen;
    for (const inst of this.instances) {
      const model = this.activeModel(inst.slot);
      inst.anchor.clear();
      inst.anchor.add(model.clone(true));
    }
  }

  capTop(slotName) {
    return this.slots[slotName].capTop ?? MUSHROOM_CAP_TOP;
  }
}

export const registry = new AssetRegistry();
