// Model fitting & validation for imported GLB assets.
import * as THREE from 'three';

/**
 * Validate a loaded gltf scene: finite bounds, visible geometry, embedded resources.
 * Returns { ok, reason }.
 */
export function validateModel(scene) {
  let meshes = 0;
  let bad = false;
  scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const g = o.geometry;
      if (!g || !g.attributes || !g.attributes.position) { bad = true; return; }
      const pos = g.attributes.position;
      for (let i = 0; i < Math.min(pos.count, 64); i++) {
        if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) { bad = true; return; }
      }
    }
  });
  if (bad) return { ok: false, reason: 'non-finite or missing geometry' };
  if (meshes === 0) return { ok: false, reason: 'no visible meshes' };
  const box = new THREE.Box3().setFromObject(scene);
  if (!isFinite(box.min.x) || !isFinite(box.max.z) || box.isEmpty()) return { ok: false, reason: 'invalid bounds' };
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 1e-4 || size.y < 1e-4 || size.z < 1e-4) return { ok: false, reason: 'degenerate bounds' };
  // Embedded resources: all materials should be present (GLTFLoader inlines textures).
  let matOk = true;
  scene.traverse((o) => { if (o.isMesh && (!o.material || o.material.length === 0)) matOk = false; });
  if (!matOk) return { ok: false, reason: 'missing materials' };
  return { ok: true };
}

/**
 * Fit a gltf scene into an UNSCALED wrapper group:
 *  - wrapper.scale stays (1,1,1)
 *  - inner mesh is scaled so the model's height equals targetHeight
 *  - feet/base rest at local y = 0, centred on x/z
 */
export function fitModel(scene, targetHeight) {
  const wrapper = new THREE.Group();
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = targetHeight / Math.max(1e-6, size.y);

  const inner = new THREE.Group();
  inner.add(scene);
  // Reposition so bottom-centre lands at origin, then scale.
  scene.position.set(-center.x, -box.min.y, -center.z);
  inner.scale.setScalar(s);
  wrapper.add(inner);
  return { wrapper, scale: s, height: targetHeight };
}

/** Depth-first dispose of a subtree's GPU resources. */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (m[key]) m[key].dispose();
      }
      m.dispose();
    }
  });
}
