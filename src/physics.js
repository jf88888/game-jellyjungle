// Fixed-timestep player physics + course systems (springs, spinners, moving
// islands, crumbles, checkpoints, crystals, finish).

import * as THREE from 'three';
import { ISLANDS, CRYSTALS_PER_ISLAND, TOTAL_CRYSTALS } from './course.js';

export const STEP = 1 / 120;
export const GRAVITY = 22;
export const MOVE_SPEED = 8.8;
const GROUND_ACCEL = 72;
const AIR_ACCEL = 26;
export const JUMP_V = 9.2;
export const AIR_JUMP_V = 8.5;
export const SPRING_V = 16;
export const IMMUNITY_TIME = 1.7;
export const PLAYER_R = 0.45;

const LANDING_EPS = 0.42;   // max fall-through per step window for landing
const EDGE_MARGIN = 0.3;    // generous island edge

export class Game {
  constructor() {
    this.springCapTop = 1.34; // kept in sync with the active mushroom model
    this.reset();
  }

  reset() {
    const start = ISLANDS[0];
    this.pos = new THREE.Vector3(start.x, start.y + 0.02, start.z + 1.5); // feet position
    this.vel = new THREE.Vector3();
    this.onGround = false;
    this.groundIndex = -1;
    this.jumpsLeft = 3;
    this.immunity = 0;
    this.time = 0;           // run time (s)
    this.falls = 0;
    this.checkpoint = 0;     // island index
    this.progressIsland = 0; // furthest island landed on
    this.finished = false;
    this.collected = new Array(TOTAL_CRYSTALS).fill(false);
    this.crystalCount = 0;
    // per-island dynamic state
    this.crumble = ISLANDS.map(() => ({ state: 'idle', t: 0 }));
    this.springCd = ISLANDS.map(() => 0);      // retrigger cooldown timer
    this.springAnim = ISLANDS.map(() => 0);    // squash animation phase (0 = rest)
    this.landingFxT = -1;                      // for jelly squash fx
  }

  get crystalTotal() { return TOTAL_CRYSTALS; }

  islandCenter(i, t) {
    const isl = ISLANDS[i];
    let x = isl.x, z = isl.z;
    if (isl.type === 'moving') {
      const off = 2.6 * Math.sin((t / 6) * Math.PI * 2 + i * 1.3);
      x += off; // oscillate along X
    }
    return { x, z, y: isl.y };
  }

  /** One fixed physics step. `input`: {mx, my, jump} — jump is an edge flag. */
  step(input, t) {
    if (this.finished) return;
    this.time += STEP;
    if (this.immunity > 0) this.immunity = Math.max(0, this.immunity - STEP);

    // ---- horizontal movement (world axes: W=-Z forward, S=+Z, A=-X, D=+X)
    let ix = input.mx, iz = input.my;
    const ilen = Math.hypot(ix, iz);
    if (ilen > 1) { ix /= ilen; iz /= ilen; }
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const targetVx = ix * MOVE_SPEED;
    const targetVz = iz * MOVE_SPEED;
    const k = 1 - Math.exp(-accel * STEP / MOVE_SPEED);
    this.vel.x += (targetVx - this.vel.x) * k;
    this.vel.z += (targetVz - this.vel.z) * k;
    if (ilen < 0.05 && this.onGround) {
      const f = Math.exp(-14 * STEP);
      this.vel.x *= f; this.vel.z *= f;
    }

    // ---- jumping (edge-triggered, max three before landing)
    if (input.jump && !this.finished) {
      if (this.onGround) {
        this.vel.y = JUMP_V;
        this.jumpsLeft = 2;
        this.onGround = false;
        this.groundIndex = -1;
        this.landingFxT = -1;
        return 'jump';
      } else if (this.jumpsLeft > 0) {
        this.vel.y = AIR_JUMP_V;
        this.jumpsLeft--;
        this.landingFxT = -1;
        return 'airjump';
      }
    }

    // ---- gravity
    this.vel.y -= GRAVITY * STEP;
    if (this.vel.y < -32) this.vel.y = -32;

    // ---- moving platform carry: apply island displacement to grounded player
    if (this.onGround && this.groundIndex >= 0) {
      const isl = ISLANDS[this.groundIndex];
      if (isl.type === 'moving') {
        const prev = this.islandCenter(this.groundIndex, t - STEP);
        const cur = this.islandCenter(this.groundIndex, t);
        this.pos.x += cur.x - prev.x;
        this.pos.z += cur.z - prev.z;
      }
    }

    // ---- integrate
    this.pos.addScaledVector(this.vel, STEP);

    // ---- platform collisions
    let landed = null;
    const feetY = this.pos.y;
    for (let i = 0; i < ISLANDS.length; i++) {
      const isl = ISLANDS[i];
      // crumble: hidden platforms do not collide
      if (isl.type === 'crumble' && this.crumble[i].state === 'hidden') continue;

      const c = this.islandCenter(i, t);
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);

      // turntable top (spinner islands): a small raised platform
      let topY = c.y;
      if (isl.type === 'spinner' && d < isl.r * 0.52 + 0.1) topY = c.y + 0.24;

      const margin = EDGE_MARGIN;
      if (d < isl.r + margin && this.vel.y <= 0.01 && feetY > topY - LANDING_EPS && feetY <= topY + 0.35) {
        // land on the highest valid surface under us
        if (!landed || topY > landed.topY) landed = { i, topY };
      }
    }

    if (landed) {
      const wasAir = !this.onGround;
      this.pos.y = landed.topY;
      this.vel.y = 0;
      this.onGround = true;
      this.groundIndex = landed.i;
      if (wasAir) {
        this.jumpsLeft = 3; // landing recharges all three
        this.landingFxT = this.time;
        const isl = ISLANDS[landed.i];
        // checkpoint pickup
        if ((isl.type === 'checkpoint') && landed.i > this.checkpoint) {
          this.checkpoint = landed.i;
          return 'checkpoint';
        }
        // crumble arming
        if (isl.type === 'crumble' && this.crumble[landed.i].state === 'idle') {
          this.crumble[landed.i] = { state: 'armed', t: 0 };
        }
        // progress
        if (landed.i > this.progressIsland) this.progressIsland = landed.i;
        return 'land';
      }
    } else if (this.onGround) {
      // walked off the edge → airborne
      const c = this.islandCenter(this.groundIndex, t);
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
      if (d > ISLANDS[this.groundIndex].r + EDGE_MARGIN) {
        this.onGround = false;
        this.groundIndex = -1;
      } else if (ISLANDS[this.groundIndex].type === 'crumble' && this.crumble[this.groundIndex].state === 'hidden') {
        this.onGround = false;
        this.groundIndex = -1;
      }
    }

    // ---- crumble timeline
    for (let i = 0; i < ISLANDS.length; i++) {
      const st = this.crumble[i];
      if (st.state === 'armed') {
        st.t += STEP;
        if (st.t >= 1.5) st.state = 'hidden';
      } else if (st.state === 'hidden') {
        st.t += STEP;
        if (st.t >= 1.5 + 4.0) st.state = 'idle';
      }
    }

    // ---- spring mushrooms
    for (let i = 0; i < ISLANDS.length; i++) {
      const isl = ISLANDS[i];
      if (isl.type !== 'spring') continue;
      this.springCd[i] = Math.max(0, this.springCd[i] - STEP);
      const c = this.islandCenter(i, t);
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
      const capTop = c.y + this.springCapTop;
      if (d < 1.05 && this.vel.y <= 0.01 && feetY > capTop - LANDING_EPS && feetY <= capTop + 0.35 && this.springCd[i] <= 0) {
        this.pos.y = capTop;
        this.vel.y = SPRING_V;
        this.jumpsLeft = 3; // springs recharge jumps
        this.onGround = false;
        this.groundIndex = -1;
        this.springCd[i] = 0.9;
        this.springAnim[i] = 1;
        if (i > this.progressIsland) this.progressIsland = i;
        return 'spring';
      }
    }

    // ---- spinner bars: segment contact with vertical overlap
    for (let i = 0; i < ISLANDS.length; i++) {
      const isl = ISLANDS[i];
      if (isl.type !== 'spinner') continue;
      const c = this.islandCenter(i, t);
      const baseY = c.y;
      const feetBottom = feetY;
      const feetTop = feetY + 1.65;
      // bar vertical band: baseY+0.45 .. baseY+0.8
      if (feetTop < baseY + 0.42 || feetBottom > baseY + 0.85) continue;
      const nBars = isl.id === 8 ? 2 : 1;
      for (let b = 0; b < nBars; b++) {
        const ang = t * (isl.id === 8 ? 1.5 : 1.15) + b * Math.PI / 2;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const half = isl.r * 0.86;
        // closest point on segment [-half*d, +half*d] to player (XZ)
        const px = this.pos.x - c.x, pz = this.pos.z - c.z;
        const proj = THREE.MathUtils.clamp(px * dx + pz * dz, -half, half);
        const cxp = c.x + dx * proj, czp = c.z + dz * proj;
        const dist = Math.hypot(this.pos.x - cxp, this.pos.z - czp);
        if (dist < PLAYER_R + 0.24) {
          // knockback away from the contact point
          let nx = this.pos.x - cxp, nz = this.pos.z - czp;
          const nl = Math.hypot(nx, nz) || 1;
          nx /= nl; nz /= nl;
          this.vel.x = nx * 7.5;
          this.vel.z = nz * 7.5;
          this.vel.y = Math.max(this.vel.y, 4.6);
          this.onGround = false;
          if (this.immunity <= 0) {
            this.immunity = IMMUNITY_TIME;
            return 'hit';
          }
        }
      }
    }

    // ---- turntable carry: grounded players on the disc get tangential push
    for (let i = 0; i < ISLANDS.length; i++) {
      const isl = ISLANDS[i];
      if (isl.type !== 'spinner' || !this.onGround) continue;
      const c = this.islandCenter(i, t);
      const px = this.pos.x - c.x, pz = this.pos.z - c.z;
      const d = Math.hypot(px, pz);
      if (d < isl.r * 0.52 && d > 0.15) {
        const omega = isl.id === 8 ? 1.5 : 1.15;
        // tangent direction (perpendicular to radius), scaled by radius
        const tx = -pz / d, tz = px / d;
        this.vel.x += tx * omega * d * STEP * 6;
        this.vel.z += tz * omega * d * STEP * 6;
      }
    }

    // ---- crystals
    for (let i = 0; i < ISLANDS.length; i++) {
      const isl = ISLANDS[i];
      const c = this.islandCenter(i, t);
      for (let j = 0; j < CRYSTALS_PER_ISLAND; j++) {
        const gi = i * CRYSTALS_PER_ISLAND + j;
        if (this.collected[gi]) continue;
        const a = isl.id * 1.7 + 0.6 + (j * Math.PI * 2) / CRYSTALS_PER_ISLAND;
        const ringR = isl.r * 0.55;
        const cxp = c.x + Math.cos(a) * ringR;
        const czp = c.z + Math.sin(a) * ringR;
        const cyp = c.y + 1.15;
        const dx = this.pos.x - cxp, dy = (this.pos.y + 0.825) - cyp, dz = this.pos.z - czp;
        if (dx * dx + dy * dy + dz * dz < 1.15) {
          this.collected[gi] = true;
          this.crystalCount++;
          return 'crystal';
        }
      }
    }

    // ---- finish portal
    const fin = ISLANDS[12];
    const fc = this.islandCenter(12, t);
    const fd = Math.hypot(this.pos.x - (fc.x), this.pos.z - (fc.z - 0.5));
    if (fd < 1.6 && Math.abs(this.pos.y - fin.y) < 3 && !this.finished) {
      this.finished = true;
      return 'finish';
    }

    // ---- fall detection
    const cpIsland = ISLANDS[this.checkpoint];
    if (this.pos.y < Math.min(cpIsland.y - 14, -6)) {
      this.falls++;
      const c = this.islandCenter(this.checkpoint, t);
      this.pos.set(c.x, c.y + 0.05, c.z);
      this.vel.set(0, 0, 0);
      this.onGround = true;
      this.groundIndex = this.checkpoint;
      this.jumpsLeft = 3;
      return 'fall';
    }

    return null;
  }

  /** Manual return to checkpoint (no fall penalty). */
  returnToCheckpoint(t) {
    const c = this.islandCenter(this.checkpoint, t);
    this.pos.set(c.x, c.y + 0.05, c.z);
    this.vel.set(0, 0, 0);
    this.onGround = true;
    this.groundIndex = this.checkpoint;
    this.jumpsLeft = 3;
    return 'return';
  }

  /** Island index under the player (for HUD), else last progress. */
  currentIsland() {
    if (this.onGround && this.groundIndex >= 0) return this.groundIndex;
    // nearest island within a generous radius, else progress
    let best = -1, bd = Infinity;
    for (let i = 0; i < ISLANDS.length; i++) {
      const c = this.islandCenter(i, this.time);
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
      if (d < ISLANDS[i].r + 2.5 && d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? best : this.progressIsland;
  }
}
