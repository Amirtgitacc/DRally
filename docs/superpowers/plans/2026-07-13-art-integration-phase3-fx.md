# Art Integration Phase 3 (FX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap four procedural combat FX for authored WebP art — bullet tracer and muzzle flash as clean key swaps, explosion and mine blast as an added authored-fireball layer.

**Architecture:** Reuse the existing swap seam (optimizer → `public/assets/fx/*.webp` → `LOADED_FX_TEXTURES` → `BootScene.preload` auto-loop). Bullet loads under the existing `bullet` key (zero game-code change). Muzzle repoints one line. Explosion/mine layer an authored fireball inside the shared `blastEffects(x, y, scale, blastKey)` helper — DRYer than the spec's per-call-site approach, identical behavior (`explosion` for wrecks, `mine-blast` for mines).

**Tech Stack:** TypeScript (strict), Phaser 3, sharp (asset optimizer), Vite, Vitest.

## Global Constraints

- FX are Phaser-bound; **no new unit tests** (spec §7). Per-task automated gate is `npm test` (257 green, regression only), `npm run build` (strict TS + prod build clean), `git diff --check` (whitespace).
- Optimizer rows use `fit:'inside'` + `trim:true` (single sprites, preserve alpha).
- Muzzle/tracer stay **ADD** blend (hot light). Explosion/mine authored fireball uses **NORMAL** blend (baked fireball carries its own dark smoke); ADD is the tuning fallback only.
- Explosion/mine fireball layer sits at **depth ~7.15** (between the `blastEffects` bloom at 7.1 and ring at 7.2; above cars ~5). No new full-screen flash → `reducedShake`/`reducedFlash` behavior unchanged.
- Every world-space FX image must call `this.cameras.cameras[1]?.ignore(img)` so it stays off the minimap (established pattern).
- Do NOT commit unless the user has asked; the user reviews and commits. Per-task commits below are the *recommended* boundaries — follow the project's standing "don't commit unless asked" rule and stage/pause instead if unsure.
- Never let a browser-verification race *complete* — it mutates the local `deathrally-career-v2` dev save.

---

### Task 1: Optimize the four FX PNGs to WebP

**Files:**
- Modify: `scripts/optimize-assets.mjs` (JOBS array, after the current FX rows ~line 22)
- Create (via `npm run assets`): `public/assets/fx/tracer.webp`, `muzzle.webp`, `explosion.webp`, `mine-blast.webp`

**Interfaces:**
- Consumes: nothing.
- Produces: four committed WebP files at `public/assets/fx/{tracer,muzzle,explosion,mine-blast}.webp`, consumed by Tasks 2–3 via `loadedAssets.ts`.

- [ ] **Step 1: Add four JOBS rows**

In `scripts/optimize-assets.mjs`, immediately after the `fx/smoke.webp` row (currently line 22), add:

```js
  { src: 'fx_bullet_tracer.png', out: 'fx/tracer.webp',     w: 48,  fit: 'inside', q: 85, trim: true },
  { src: 'fx_muzzle_flash.png',  out: 'fx/muzzle.webp',     w: 128, fit: 'inside', q: 85, trim: true },
  { src: 'fx_explosion.png',     out: 'fx/explosion.webp',  w: 256, fit: 'inside', q: 85, trim: true },
  { src: 'fx_mine_blast.png',    out: 'fx/mine-blast.webp', w: 256, fit: 'inside', q: 85, trim: true },
```

- [ ] **Step 2: Generate the assets**

Run: `npm run assets`
Expected: console prints `wrote public/assets/fx/tracer.webp` … `mine-blast.webp` and `done: N assets` (N = previous count + 4). No sharp errors.

- [ ] **Step 3: Confirm the four files exist and are small**

Run: `ls -la public/assets/fx/`
Expected: `tracer.webp`, `muzzle.webp`, `explosion.webp`, `mine-blast.webp` present, each a few KB–low tens of KB (like the existing `spark.webp`/`smoke.webp`).

- [ ] **Step 4: Regression gate**

Run: `npm test`
Expected: 257 passing (no source changed yet).

Run: `npm run build`
Expected: clean (no TS errors).

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize-assets.mjs public/assets/fx/tracer.webp public/assets/fx/muzzle.webp public/assets/fx/explosion.webp public/assets/fx/mine-blast.webp
git commit -m "Phase 3: optimize bullet/muzzle/explosion/mine-blast FX to WebP"
```

---

### Task 2: Wire bullet + muzzle-flash swaps

**Files:**
- Modify: `src/game/textures/loadedAssets.ts` (`LOADED_FX_TEXTURES`, after the `smoke` row ~line 45)
- Modify: `src/game/scenes/BootScene.ts` (delete `paintBulletTexture` call ~line 48 and its named import ~line 8)
- Modify: `src/game/scenes/RaceScene.ts` (muzzle flash key ~line 697)

**Interfaces:**
- Consumes: `public/assets/fx/tracer.webp`, `public/assets/fx/muzzle.webp` (Task 1).
- Produces: nothing new for later tasks (Task 3 adds its own keys independently).

**Why bullet key + paint deletion must land together:** `BootScene.preload()` will `load.image('bullet', …)` and `BootScene.create()` currently calls `paintBulletTexture()` which does `createCanvas('bullet', …)`. Two textures under one key collide. Adding the `bullet` load and deleting the paint call in the *same* task closes that window.

- [ ] **Step 1: Add the two FX keys**

In `src/game/textures/loadedAssets.ts`, inside `LOADED_FX_TEXTURES`, after `{ key: 'smoke', url: 'assets/fx/smoke.webp' },` add:

```ts
  { key: 'bullet', url: 'assets/fx/tracer.webp' },
  { key: 'muzzle', url: 'assets/fx/muzzle.webp' },
```

(The tracer art deliberately loads under the existing `bullet` key so `RaceScene.ts:683` picks it up unchanged. Key names need not match filenames.)

- [ ] **Step 2: Delete the procedural bullet painter call + import**

In `src/game/scenes/BootScene.ts`:
- Remove the line `paintBulletTexture(this)` (currently line 48).
- Remove `paintBulletTexture,` from the `combatTextures` named import (currently line 8), leaving:

```ts
import {
  paintEdgeFlashTexture,
  paintFlameConeTexture,
  paintMineTexture,
  paintRingTexture,
  paintScorchTexture,
} from '../textures/combatTextures'
```

(`paintBulletTexture` stays *defined and exported* in `combatTextures.ts` — an unused export is not a build error. Do not delete the function.)

- [ ] **Step 3: Repoint the muzzle flash key**

In `src/game/scenes/RaceScene.ts`, in `tryFire`, change the muzzle-flash image (currently line 697) from:

```ts
      .image(mx, my, 'spark')
```

to:

```ts
      .image(mx, my, 'muzzle')
```

Leave `.setScale(0.8)`, `.setDepth(6)`, ADD blend, and the 70ms tween unchanged.

- [ ] **Step 4: Build gate (catches the key-collision / unused-import cases)**

Run: `npm run build`
Expected: clean. In particular no "unused import `paintBulletTexture`" and no TS error.

Run: `npm test`
Expected: 257 passing.

Run: `git diff --check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/textures/loadedAssets.ts src/game/scenes/BootScene.ts src/game/scenes/RaceScene.ts
git commit -m "Phase 3: swap bullet tracer + muzzle flash to authored FX"
```

---

### Task 3: Layer authored fireball into blast FX (explosion + mine)

**Files:**
- Modify: `src/game/textures/loadedAssets.ts` (`LOADED_FX_TEXTURES`, after the `muzzle` row from Task 2)
- Modify: `src/game/scenes/RaceScene.ts` (`blastEffects` ~line 632; its two callers ~lines 549 and 810)

**Interfaces:**
- Consumes: `public/assets/fx/explosion.webp`, `public/assets/fx/mine-blast.webp` (Task 1); the `LOADED_FX_TEXTURES` array (Task 2 left it well-formed).
- Produces: `blastEffects(x: number, y: number, scale: number, blastKey: string): void` — new required 4th parameter naming the authored fireball texture key.

- [ ] **Step 1: Add the two blast FX keys**

In `src/game/textures/loadedAssets.ts`, inside `LOADED_FX_TEXTURES`, after the `{ key: 'muzzle', … }` row add:

```ts
  { key: 'explosion',  url: 'assets/fx/explosion.webp' },
  { key: 'mine-blast', url: 'assets/fx/mine-blast.webp' },
```

- [ ] **Step 2: Parameterize `blastEffects` and layer the authored fireball**

In `src/game/scenes/RaceScene.ts`, change the signature (currently line 632) from:

```ts
  private blastEffects(x: number, y: number, scale: number) {
```

to:

```ts
  private blastEffects(x: number, y: number, scale: number, blastKey: string) {
```

Then, just before the closing `}` of `blastEffects` (after the existing `glow-soft` fireball bloom tween, currently ending line 662), add the authored fireball layer:

```ts
    // authored fireball art layered over the procedural bloom (NORMAL blend:
    // the baked art carries its own dark smoke; ADD is the tuning fallback)
    const boom = this.add
      .image(x, y, blastKey)
      .setScale(0.5 * scale)
      .setDepth(7.15)
      .setBlendMode(Phaser.BlendModes.NORMAL)
    this.cameras.cameras[1]?.ignore(boom)
    this.tweens.add({
      targets: boom,
      scale: 1.2 * scale,
      alpha: 0,
      duration: 280,
      ease: 'quad.out',
      onComplete: () => boom.destroy(),
    })
```

- [ ] **Step 3: Pass the blast key from both callers**

In `detonateMine` (currently line 549), change:

```ts
    this.blastEffects(mine.x, mine.y, 1)
```

to:

```ts
    this.blastEffects(mine.x, mine.y, 1, 'mine-blast')
```

In `wreckCar` (currently line 810), change:

```ts
    this.blastEffects(car.state.x, car.state.y, 1.6)
```

to:

```ts
    this.blastEffects(car.state.x, car.state.y, 1.6, 'explosion')
```

- [ ] **Step 4: Build + regression gate**

Run: `npm run build`
Expected: clean (TS confirms both callers pass the required 4th arg; no other callers exist).

Run: `npm test`
Expected: 257 passing.

Run: `git diff --check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/textures/loadedAssets.ts src/game/scenes/RaceScene.ts
git commit -m "Phase 3: layer authored explosion + mine-blast fireball into blastEffects"
```

---

### Task 4: Browser verify + tuning pass (controller-only)

**Files:**
- Possibly modify: `src/game/scenes/RaceScene.ts` and/or `src/game/textures/loadedAssets.ts` (tuning only — scale/alpha/blend/duration)
- Update: `.superpowers/sdd/progress.md` (ledger)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: shipped-vs-tuned report in the ledger.

**Note:** This task is **controller-only** — a subagent cannot drive Chrome. The controller runs it directly.

- [ ] **Step 1: Launch dev with debug hooks**

Run: `npm run dev` and open `http://localhost:5199/?debug=1`.

- [ ] **Step 2: Drive into a live weapons-on fight**

Using `window.__game` (see handover §5 recipe): Menu → Garage (tile 6 = RACE) → SignUp confirm → PrepareRace ENTER, pumping `g.loop.step(performance.now()+i*16)` between async transitions. Choose a **DEATH-tier** weapons-on race.

- [ ] **Step 3: Trigger and eyeball each FX**

- **Muzzle + tracer:** fire the player gun; confirm the tracer sprite aims down the shot line (art is +x oriented) and the muzzle flash reads as a flash, not a washed square.
- **Explosion:** wreck a rival (drive into them repeatedly, or use `?debug` hooks); confirm the fireball reads as fire, not a white bloom or a blown-out frame.
- **Mine blast:** detonate a mine; confirm the `mine-blast` art layer.
- Confirm: no depth flicker, framerate unaffected, and the screen edge-flash still calms under `reducedFlash` in Settings.
- **Do NOT let the race finish** (protects the dev save) — abandon via pause when done.

Inspect sprites directly if needed: `race.children.list.filter(o => o.texture?.key === 'explosion')` etc.

- [ ] **Step 4: One tuning pass**

For any FX that looks worse than the procedural version, adjust only presentation values:
- tracer: `w` in optimizer (re-run `npm run assets`) or nothing (game code unchanged).
- muzzle: `.setScale(...)` / tween duration at the muzzle site.
- explosion/mine: `boom` `.setScale`, tween `scale`/`duration`, or flip `Phaser.BlendModes.NORMAL` → `ADD` if the NORMAL fireball reads flat.

Keep the rest. If any single FX is clearly worse and untunable, revert just that asset per the spec's per-asset revert notes (§5).

- [ ] **Step 5: Record shipped-vs-tuned state**

Append to `.superpowers/sdd/progress.md`: which of the 4 FX shipped as-is, which were tuned (and how), which (if any) reverted.

- [ ] **Step 6: Final verification + commit any tuning**

Run: `npm test` · `npm run build` · `git diff --check` — all clean.

```bash
git add -A
git commit -m "Phase 3: FX tuning pass + ledger"
```

(Only if tuning changed files. Follow the standing don't-commit-without-asking rule.)

---

## Self-Review

- **Spec coverage:** §4 optimizer rows → Task 1. §4 keys → Tasks 2–3 (added where consumed, avoiding the `bullet` key collision). §5.1 bullet → Task 2. §5.2 muzzle → Task 2. §5.3 explosion + §5.4 mine → Task 3 (via parameterized `blastEffects`, a DRY refinement of the spec's per-call-site wording; same textures, same depth band). §6 depth/accessibility → Global Constraints + Task 3. §8 verify → Task 4. §9 risks → covered by NORMAL-first blend + Task 4 tuning/revert. All spec sections mapped.
- **Placeholder scan:** none — every code step shows exact code; every command shows expected output.
- **Type consistency:** `blastEffects` gains `blastKey: string` in Task 3 and both (only) callers are updated in the same task; no other callers exist (grep-confirmed). Key strings (`bullet`, `muzzle`, `explosion`, `mine-blast`) are consistent between `loadedAssets.ts` and their consume sites.
