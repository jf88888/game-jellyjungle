# Quantumflare — Jelly Jungle 🍮

A third-person platformer in a soft, sculpted toy world. Guide a little pink jelly across 13 floating islands with triple jumps and spring mushrooms.

**Live (temporary preview):** <https://jelly-jungle.hungry-path.workers.dev> · Permanent deploys go to `https://jelly-jungle.<your-subdomain>.workers.dev` — see [Deploy](#deploy-cloudflare-workers).

Built by **Quantumflare** (<https://quantumflare.ai>) with Vite + Three.js + vanilla JS. No game engine, no build-time assets — the whole world is procedural so it runs instantly, and every repeated model family (jelly, mushroom, tree) can be swapped for a richer AI-generated GLB without touching gameplay code.

> The full design brief ships in-game: click **The prompt** on the title screen to read or copy it.

## Run it

```bash
npm install
npm run dev        # local dev server (vite; port 5173 by default — this workspace used 5199)
npm run build      # production bundle in dist/
npm run preview    # serve the production build locally
npm run cf:dev     # wrangler dev — the real Worker serving dist/ at http://localhost:8787
```

Headless Playwright tests (Chromium + SwiftShader software GL):

```bash
node scripts/smoke.mjs      # boot, title, jump, mobile shots → /tmp/jj-shots
node scripts/accept2.mjs    # triple jump / spring / spinner / crumble / checkpoint / finish
JJ_URL=https://… node scripts/deploy-check.mjs   # verify a deployed URL boots
```

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move (camera-relative) |
| Space / tap Bounce | Jump — press again mid-air for 2 extra jumps |
| R | Restart run |
| P / Esc | Pause |
| H | Help |
| M | Sound (off by default) |

Touch: left joystick + right **Bounce** button appear automatically on coarse-pointer devices.

## Course & rules

13 islands, 39 crystals: start → plain → **spring** (launch v≈16, recharges jumps) → **spinner** (rotating candy bar, knockback + i-frames) → **checkpoint** → moving island → spring → double spinner → checkpoint → **crumble** (vanishes ~1.5 s after you land — keep moving!) → moving island → spring → finish portal.

Fixed 120 Hz physics step, gravity 22 u/s², triple jump. Falling respawns at the last checkpoint with a fall counter. Stars on the finish card: time + falls + crystals (3★ ≥ 30, 2★ ≥ 18).

## Architecture

```
src/
  main.js     orchestrator: renderer, camera (title/fly-in/follow), loop, state machine,
              prompt popup wiring, debug hook window.__JJ
  physics.js  fixed-step Game class — movement, collisions, springs, spinners, crumble, checkpoints
  world.js    scene build: sky/fog, clouds, decorative islands, course islands, banner, portal,
              trees, crystals (InstancedMesh), jelly, particles. Static scenery merged per-island.
  course.js   island table + crystal placement + star rating
  assets.js   AssetRegistry — slots {jelly, mushroom, tree}, classic procedural builders,
              GLB load/validate/fit pipeline, mode switching that preserves instance transforms
  fitting.js  GLB validation (size/tris) + fit-to-target-height wrapper
  input.js    keyboard + touch joystick with pointer capture
  ui.js       HUD, dialogs, mode switch, toasts
  audio.js    Web Audio synth SFX (no audio files)
  prompt.js   renders the verbatim build brief (index.html #prompt-source) into the popup

scripts/      headless Playwright checks (smoke.mjs, accept2.mjs are canonical; the rest are debug aids)
wrangler.jsonc  Cloudflare Worker config — serves dist/ as static assets
```

## Deploy: Cloudflare Workers

The game is a pure static site served by a **Cloudflare Worker with Static Assets** (`wrangler.jsonc`, worker name `jelly-jungle`). The production build is fully self-contained (HTML/JS/CSS/fonts local, ~190 kB gzipped).

```bash
npm run deploy     # = vite build + wrangler deploy  →  https://jelly-jungle.<subdomain>.workers.dev
npm run cf:dev     # local Worker preview at http://localhost:8787 (no auth needed)
npx wrangler deploy --temporary   # instant no-auth preview URL (ephemeral — how the link above was made)
```

Authentication for permanent deploys: `npx wrangler login` (browser OAuth) **or** set `CLOUDFLARE_API_TOKEN` (a token with *Edit Cloudflare Workers* permission). The temporary-preview URL in this file expires; re-run `npm run deploy` once authenticated to pin a permanent one.

## Swapping in Tripo AI assets

Three slots, each with a procedural "classic" fallback:

| Slot | File | Target height | Notes |
|---|---|---|---|
| Jelly character | `assets/jelly.glb` | 1.65 u | Feet at y=0, face toward +Z |
| Spring mushroom | `assets/mushroom.glb` | cap top at 1.34 u | Physics reads the fitted bounding-box top, so any shape works — springs auto-align |
| Tree | `assets/tree.glb` | 3.4 u | Base at y=0 |

**Workflow:** drop a `.glb` into `assets/`, reload. The registry validates (finite size, sane tri count), fits it to the target height, and every in-world instance swaps live — mid-run if you like. If a file is missing or invalid, that slot silently keeps its procedural model and the mode pill reports "Classic fallback" / "N of 3 imported".

The **Tripo AI / Classic** switch (top-right) re-parents a fresh clone of each slot's active model into every anchor, preserving positions/scales — so comparing worlds is one click.

### First replacement: the jelly character

Paste this into Tripo AI (text-to-3D):

> A cute round pink jelly character, glossy translucent gelatin body like a soft sculpted toy, plump rounded blob shape, big dark oval eyes with white highlights, rosy blush cheeks, tiny happy smile, stubby little arms and short feet, small mint-green sprout with two leaves on top of its head, pastel colors, smooth PBR material, high detail, full body, centered, plain background

Then: export GLB → save as `assets/jelly.glb` → reload. The face should read from behind the follow camera; if Tripo's eyes land off-center, nudge with a quick re-prompt ("eyes centered on front of face").

Suggested next prompts:

- **Mushroom:** "A plump coral-pink spring mushroom with a broad rounded cap, raised cream-colored spots, short thick ivory stem, soft sculpted toy style, glossy PBR, full body, centered, plain background"
- **Tree:** "A whimsical floating-island palm tree, curved tan trunk, oversized rounded teal drooping fronds forming a plump crown, small peach fruit clusters, soft sculpted toy style, smooth PBR, full tree, base at bottom, centered, plain background"

## Acceptance checklist (verified headless)

- [x] Title screen matches reference layout (desktop + mobile)
- [x] Triple jump: 3 charges, meter drains, recharge on ground/spring/checkpoint
- [x] Spring launch ≈ v16 with squash animation + particle puff
- [x] Spinner bar contact → knockback + immunity window
- [x] Crumble island arms on landing, shakes, fades, drops player
- [x] Checkpoints activate on landing; falls respawn there
- [x] Finish portal → win dialog with time/falls/crystals/stars
- [x] Mode switch swaps all instances in place, preserves transforms
- [x] Touch controls appear on mobile; pause/help dialogs work
- [x] Prompt popup renders the full brief (table, links, code) + copy-to-clipboard
- [x] Cloudflare Worker deploy boots clean on the edge (zero console errors)

## Built with

This game was designed and coded by **Quantumflare** (<https://quantumflare.ai>) on a local LLM inference stack — no cloud API calls:

| Component | Detail |
|---|---|
| Coding harness | [Pi](https://pi.dev) (coding hardness: PI) |
| Inference engine | [Unsloth](https://unsloth.ai/download/windows) — GGUF runtime |
| Model | `Qwen3.8-27B-GGUF` · quant `UD-Q4_K_XL` |
| GPU | NVIDIA RTX 5090 |

### Inference settings

| Setting | Value |
|---|---|
| Context length | ~128K tokens |
| KV cache dtype | `q8_0` |
| Speculative decoding | MTP (multi-token prediction) |
| VRAM budget | 95% — capped so it won't crash other running applications |
| Estimated GPU memory | ≈ 25.5 GB |

Get Unsloth: <https://unsloth.ai/download/windows>

## Credits

- Branding & platform: [Quantumflare](https://quantumflare.ai) — RTX 5090 · `Qwen3.8-27B-GGUF` (UD-Q4_K_XL) via Unsloth, coded with [Pi](https://pi.dev)
- Design brief source: [Jelly Jungle — 3D browser game · Tripo 3D Prompts](https://www.tripo3d.ai/3d-prompts/jelly-jungle-3d-browser-game-2081024333188)
