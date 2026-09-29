# AGENTS.md — Jelly Jungle (Quantumflare)

Operating notes for AI agents working in this repo. Read `README.md` for user-facing docs; this file is for getting work done correctly and fast.

## What this is

A complete, playable third-person platformer ("Jelly Jungle"): a pink jelly crosses 13 floating islands using triple jumps and spring mushrooms. **Vite + Three.js (r186) + vanilla JS/HTML/CSS.** No game engine, no framework, no audio/image files — everything is procedural or Web-Audio-synthesized so the build is fully self-contained.

The project is **feature-complete and deployed**. Treat changes as polish/maintenance unless asked otherwise. Do not add dependencies without a strong reason.

## Commands

```bash
npm install
npm run dev        # vite dev server (port 5173 default; this workspace has used 5199 — check the printed URL)
npm run build      # → dist/
npm run preview    # serve dist/ locally
npm run cf:dev     # wrangler dev — Worker serving dist/ at http://localhost:8787 (no auth needed)
npm run deploy     # vite build + wrangler deploy → https://jelly-jungle.<subdomain>.workers.dev
npx wrangler deploy --temporary   # ephemeral no-auth preview URL
```

### Headless testing (the only way to verify visuals/physics here)

Playwright Chromium with **SwiftShader** software GL. Exact invocation that works in this environment:

```js
chromium.launch({
  executablePath: '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader'],   // ONLY this flag
});
```

- ⚠️ Do **not** use `--use-gl=angle --use-angle=swiftshader` — it breaks input timing (keys get dropped).
- Tests read the target from `process.env.JJ_URL || 'http://localhost:5199/'`. Point `JJ_URL` at a deployed URL to test the edge.
- First boot under SwiftShader is slow (~2–6 s); **poll** for `window.__JJ` instead of using a fixed short timeout.

Canonical scripts:

| Script | Purpose |
|---|---|
| `scripts/smoke.mjs` | Boot, title/play screenshots (desktop+mobile), jump press, console-error check → `/tmp/jj-shots/` |
| `scripts/accept2.mjs` | Mechanics acceptance: triple jump, spring vy≈14.3 measured, spinner knockback, crumble drop, checkpoint respawn, crystals, finish dialog, mode switch, dialogs, touch |
| `scripts/deploy-check.mjs` | Boot-verify a deployed URL (`JJ_URL`) |
| `scripts/prompt-check.mjs`, `credit-check.mjs`, `ui-check.mjs` | UI feature checks (prompt popup, branding/links) |
| `scripts/debug-*.mjs`, `quick.mjs`, `smoke2.mjs` | One-off debug aids — not part of the acceptance suite |

## Debug hook

`window.__JJ` (set in `src/main.js`) is the test/inspection surface:

```js
window.__JJ = { game, input, registry, ui, camera, renderer, scene, state: () => state, stats, teleport(i) }
```

- `state()` → `'title' | 'playing' | 'paused' | 'finished'`
- `stats` → object `{ ms, calls, tris }` (NOT a function — older scripts may assume otherwise)
- `teleport(i)` → places player on island i (test hook only; **never** use teleport to prove course reachability in acceptance tests)
- `game.pos/vel/onGround/jumpsLeft/groundIndex`, `registry` (asset slots), `ui` (dialogs/toasts)

## Architecture map

```
src/main.js     orchestrator: renderer, cameras (title/fly-in/follow), rAF loop w/ fixed-step accumulator,
                state machine, dialog wiring (incl. prompt popup), window.__JJ
src/physics.js  Game class — the ONLY place gameplay rules live. Fixed step STEP=1/120.
src/world.js    scene construction: sky/fog/clouds, decorative + course islands, banner, portal,
                trees, crystals (InstancedMesh), jelly, particles. Static scenery merged per-island.
src/course.js   ISLANDS table (13 rows) + crystal placement + starsFor()
src/assets.js   AssetRegistry: slots {jelly,mushroom,tree}; classic procedural builders;
                GLB load→validate→fit pipeline; mode switching (imported/classic)
src/fitting.js  GLB validation (finite bounds, tri cap) + fit-to-target-height wrapper
src/input.js    keyboard + touch joystick (pointer capture); action-edge detection for jumps
src/ui.js       HUD chips, jump meter, dialogs, toasts, mode switch
src/audio.js    Web Audio synth SFX; muted by default
src/prompt.js   renders #prompt-source (verbatim brief in index.html) into the prompt dialog
index.html      all UI markup + <script type="text/plain" id="prompt-source"> with the full brief
wrangler.jsonc  Cloudflare Worker: static assets from ./dist, name "jelly-jungle"
```

**Dependency direction:** `main.js` composes everything; `physics.js` is pure logic (no DOM); `world.js` builds visuals from `course.js` data + `assets.js` registry. Keep it that way — physics must stay deterministic and DOM-free.

## Physics invariants (do not casually change)

- Fixed timestep `STEP = 1/120`, accumulator in the rAF loop; gravity `22 u/s²`; move speed ≈ `8.8 u/s`.
- Triple jump: initial vy ≈ `9.2`, two air jumps ≈ `8.5`; holding never re-triggers (edge detection); landing recharges all 3.
- Springs: launch vy ≈ `16` (`SPRING_V`), recharge jumps, squash/rebound anim + retrigger cooldown.
- Spinners: rotating candy bars; knockback only on segment contact with vertical overlap; ~1.7 s i-frames after a hit.
- Moving islands: horizontal oscillation ±2.6 u; grounded players carried by island displacement.
- Crumble: arms 1.5 s after landing → shake → vanish; recovers after ~4 s; hidden platforms don't collide.
- Checkpoints on islands 4 and 8 (0-based); falls respawn there keeping crystals, incrementing fall count. `R` = manual restart (no fall penalty).
- Course (index → type): 0 start · 1 plain · 2 spring · 3 spinner · 4 checkpoint · 5 moving · 6 spring · 7 spinner(double) · 8 checkpoint · 9 crumble · 10 moving · 11 spring · 12 finish.
- Asset fit targets: jelly 1.65 u (feet y=0), mushroom cap-top 1.34 u, tree 3.4 u (base y=0). Physics reads the **fitted bounding box**, so swapping GLBs never breaks collisions.

## Hard-won gotchas (learned the expensive way)

1. **three.js r186:** `THREE.PCFSoftShadowMap` is deprecated → use `PCFShadowMap` (soft filtering is included). Don't "fix" it back.
2. **`mergeGeometries` index compatibility:** mixing indexed + non-indexed geometries (e.g. `PolyhedronGeometry` is non-indexed) throws/mis-merges. Use the local `mergeAll()` helper in `world.js`/`assets.js`, which normalizes everything to non-indexed first.
3. **Object3D has exactly one parent.** Sharing a model Object3D across multiple anchors renders only the last. `registerInstance()` clones per anchor with `.clone(true)` (shares geometry/materials — cheap). Never re-introduce shared parents.
4. **Scratch-vector aliasing:** `followPose()` previously used global `_v1` as scratch while its output was also `_v1`, destroying the camera look target. It now uses a dedicated `_lookAhead`. When adding math in `main.js`/`world.js`, use fresh local vectors or the existing named scratches — never reuse an output parameter as scratch.
5. **Tree frond Euler order:** drooping palm fronds use `[0, -a, -(0.62+rnd*0.3)]` (XYZ: Rz tip-down first, then Ry radial). "Improving" this to a different order flattens the canopy.
6. **Default mode is `'imported'`** (Tripo AI) with silent classic fallback when no GLB exists — that matches the reference UI ("Classic fallback" badge). Don't flip the default.
7. **Prompt source of truth** is `<script type="text/plain" id="prompt-source">` in `index.html` (kept as a text tag so backticks/quotes need no escaping). `src/prompt.js` renders it; "Copy full prompt" copies the raw text. If you edit the brief, edit that tag.
8. **Vite has no config file** — defaults: base `/`, outDir `dist/`. Keep absolute `/assets/…` paths (Cloudflare serves at domain root).

## Conventions

- Vanilla ES modules only; no new runtime deps without explicit approval.
- UI text stays English. Branding is **Quantumflare** (header links to https://quantumflare.ai); footer credit line "built with RTX 5090 · Qwen3.8-27B" must stay next to the prompt button.
- Colors: mint/sage/cream/turquoise/coral-pink/warm-gold palette in `src/style.css` CSS vars (`--ink`, `--forest-btn`, `--panel-line`, …). Reuse the vars, don't hardcode new hex values casually.
- Performance budget: ~160 draw calls / ~143k tris at boot (measured via `window.__JJ.stats`). Merge/instance any new repeated scenery; cap DPR at 1.5.
- Every visual/mechanics change must be verified headless (smoke + accept2) before claiming done — screenshots land in `/tmp/jj-shots/`.

## Deployment notes

- Permanent deploy needs Cloudflare auth: `npx wrangler login` **or** `CLOUDFLARE_API_TOKEN` env var (token with *Edit Cloudflare Workers*).
- The temporary preview URL currently cited in README.md (`jelly-jungle.hungry-path.workers.dev`) is ephemeral; after a permanent deploy, update the link at the top of README.md.
- After any change that ships: `npm run deploy`, then verify with `JJ_URL=<new-url> node scripts/deploy-check.mjs` (polls for boot, checks console errors).
