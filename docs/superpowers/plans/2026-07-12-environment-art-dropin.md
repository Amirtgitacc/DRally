# Environment Art Drop-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace procedural placeholder textures with the already-generated authored art for every asset that maps 1:1 onto an existing Phaser texture key, without touching game logic.

**Architecture:** `BootScene` is the swap seam. A one-shot Node script optimizes the raw PNGs from `Cars/output/generated/` into small WebP files under `public/assets/`. A new `loadedAssets.ts` module lists the key→URL mapping. `BootScene.preload()` loads those WebPs under the existing texture keys; `BootScene.create()` stops painting the procedural versions of exactly those keys and keeps painting everything else. RaceScene and all other game code are unchanged — they still reference `'asphalt'`, `'pk-cash'`, `'tire-wall'`, etc.

**Tech Stack:** TypeScript (strict), Phaser 3, Vite, `sharp` (new devDependency for the offline optimize script), WebP output.

## Global Constraints

- `src/core/` boundary is untouched; this is `src/game/` + build tooling only.
- Do NOT copy original art/branding/names — these are original generated assets; safe.
- Cars/vehicle sprites stay procedural (`paintCarTexture`). Out of scope.
- Deferred (do NOT wire): markings, kerbs, start/finish, decal/furniture atlases, concrete surface, jersey barrier, wreck, and blend/non-1:1 FX (explosion, mine blast, muzzle, tracer, damage smoke, headlight cone).
- `PickupType` = `'ammo' | 'turbo' | 'repair' | 'cash' | 'trap'` (five). `pickup_mine.png` has no pickup type and is left unused. The in-world `mine` key stays procedural.
- Raw sources in `Cars/` are local/untracked — do NOT commit them. Commit only the optimized `public/assets/**` + the script.
- Verification for this feature is **build + test suite + browser smoke** (asset wiring has no unit-test surface). Do not fabricate unit tests for rendering.
- Every task ends: `npm run build` passes, `npm test` passes, `git diff --check` clean, then commit.

---

### Task 1: Asset optimize script + generated WebP outputs

**Files:**
- Create: `scripts/optimize-assets.mjs`
- Modify: `package.json` (add `sharp` devDependency + `assets` script)
- Create (generated, committed): `public/assets/env/*.webp`, `public/assets/pickups/*.webp`, `public/assets/fx/*.webp`

**Interfaces:**
- Consumes: raw PNGs in `Cars/output/generated/` (must exist locally).
- Produces: 11 WebP files at the exact paths referenced by Task 2's `loadedAssets.ts`:
  `env/asphalt.webp`, `env/dirt.webp`, `env/tire-wall.webp`, `env/street-light.webp`,
  `pickups/ammo.webp`, `pickups/turbo.webp`, `pickups/repair.webp`, `pickups/cash.webp`, `pickups/trap.webp`,
  `fx/spark.webp`, `fx/smoke.webp`.

- [ ] **Step 1: Install sharp as a devDependency**

Run:
```bash
npm install -D sharp
```
Expected: `package.json` gains `sharp` under `devDependencies`; `package-lock.json` updates; exit 0.

- [ ] **Step 2: Write the optimize script**

Create `scripts/optimize-assets.mjs`:
```js
// One-shot: optimize raw generated PNGs into small WebP game assets.
// Run manually when source art changes:  npm run assets
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const SRC = 'Cars/output/generated'
const OUT = 'public/assets'

// fit 'fill' = exact square (seamless surfaces); 'inside' = preserve aspect + alpha (sprites)
const JOBS = [
  { src: 'dark_grungy_wet_asphalt.png',          out: 'env/asphalt.webp',      w: 512, h: 512, fit: 'fill',   q: 88 },
  { src: 'off_track_dirt_dry_sandy_ground.png',  out: 'env/dirt.webp',         w: 512, h: 512, fit: 'fill',   q: 88 },
  { src: 'red_white_tyre_wall_segment.png',      out: 'env/tire-wall.webp',    w: 192,         fit: 'inside', q: 85 },
  { src: 'amber_street_light_top_down.png',      out: 'env/street-light.webp', w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_weapon_ammo_crate.png',         out: 'pickups/ammo.webp',     w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_turbo_boost.png',               out: 'pickups/turbo.webp',    w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_repair_wrench.png',             out: 'pickups/repair.webp',   w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_cash_money.png',                out: 'pickups/cash.webp',     w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_hazard_skull_booby_trap.png',   out: 'pickups/trap.webp',     w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'fx_spark_burst.png',                   out: 'fx/spark.webp',         w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'fx_smoke_puff.png',                    out: 'fx/smoke.webp',         w: 128, h: 128, fit: 'inside', q: 85 },
]

for (const j of JOBS) {
  const dest = join(OUT, j.out)
  await mkdir(dirname(dest), { recursive: true })
  const resize = j.h
    ? { width: j.w, height: j.h, fit: j.fit }
    : { width: j.w, fit: j.fit }
  await sharp(join(SRC, j.src)).resize(resize).webp({ quality: j.q }).toFile(dest)
  console.log('wrote', dest)
}
console.log(`done: ${JOBS.length} assets`)
```

- [ ] **Step 3: Add the `assets` script to package.json**

In `package.json` `"scripts"`, add:
```json
"assets": "node scripts/optimize-assets.mjs"
```

- [ ] **Step 4: Run the script and verify outputs**

Run:
```bash
npm run assets && find public/assets -type f -name '*.webp' | sort && du -sh public/assets
```
Expected: prints `wrote public/assets/...` for all 11 files, then lists exactly 11 `.webp` files, and total `public/assets` size is small (target: well under 2 MB combined). If a source PNG is missing, sharp throws — fix the filename against `ls Cars/output/generated`.

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize-assets.mjs package.json package-lock.json public/assets
git commit -m "Add asset optimize script and generated environment WebP art"
```

---

### Task 2: Wire safe drop-in textures into BootScene

**Files:**
- Create: `src/game/textures/loadedAssets.ts`
- Modify: `src/game/scenes/BootScene.ts`

**Interfaces:**
- Consumes: WebP files from Task 1; existing texture keys `asphalt`, `dirt`, `tire-wall`, `pole`, `pk-ammo`, `pk-turbo`, `pk-repair`, `pk-cash`, `pk-trap`.
- Produces: `LOADED_TEXTURES: LoadedTexture[]` and `LOADED_FX_TEXTURES: LoadedTexture[]` (Task 3 uses the FX one), where `interface LoadedTexture { key: string; url: string }`.

- [ ] **Step 1: Create the key→URL mapping module**

Create `src/game/textures/loadedAssets.ts`:
```ts
export interface LoadedTexture {
  key: string
  url: string
}

// Safe 1:1 drop-ins: surfaces, barrier, pole, pickups.
export const LOADED_TEXTURES: LoadedTexture[] = [
  { key: 'asphalt', url: 'assets/env/asphalt.webp' },
  { key: 'dirt', url: 'assets/env/dirt.webp' },
  { key: 'tire-wall', url: 'assets/env/tire-wall.webp' },
  { key: 'pole', url: 'assets/env/street-light.webp' },
  { key: 'pk-ammo', url: 'assets/pickups/ammo.webp' },
  { key: 'pk-turbo', url: 'assets/pickups/turbo.webp' },
  { key: 'pk-repair', url: 'assets/pickups/repair.webp' },
  { key: 'pk-cash', url: 'assets/pickups/cash.webp' },
  { key: 'pk-trap', url: 'assets/pickups/trap.webp' },
]

// Blend/particle-sensitive; wired in Task 3 (verify-and-revert).
export const LOADED_FX_TEXTURES: LoadedTexture[] = [
  { key: 'spark', url: 'assets/fx/spark.webp' },
  { key: 'smoke', url: 'assets/fx/smoke.webp' },
]
```

- [ ] **Step 2: Add `preload()` and drop the swapped paint calls in BootScene**

Replace the full contents of `src/game/scenes/BootScene.ts` with the following. Every import listed below still has a matching call, and every removed call had its import removed (strict TS rejects unused imports):
```ts
import Phaser from 'phaser'
import { CAR_CATALOG } from '../../data/cars'
import { ROSTER } from '../../data/roster'
import { BOSS } from '../../data/boss'
import { paintCarTexture } from '../textures/vehicleTextures'
import {
  paintSkidStampTexture,
  paintSmokeTexture,
} from '../textures/environmentTextures'
import {
  paintBulletTexture,
  paintEdgeFlashTexture,
  paintFlameConeTexture,
  paintMineTexture,
  paintRingTexture,
  paintScorchTexture,
  paintSparkTexture,
} from '../textures/combatTextures'
import {
  paintChevronTexture,
  paintDebrisTexture,
  paintGlowTexture,
} from '../textures/lightTextures'
import { LOADED_TEXTURES } from '../textures/loadedAssets'

// Authored WebP art (BootScene.preload) replaces the matching procedural
// texture keys; every key NOT loaded stays painted below.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    for (const t of LOADED_TEXTURES) this.load.image(t.key, t.url)
  }

  create() {
    for (const car of CAR_CATALOG) {
      paintCarTexture(this, `car-${car.id}`, car.bodyColor, car.accentColor, car.variant)
    }
    // rivals climb the chassis ladder with rank, so every driver gets all
    // three silhouettes in their livery
    for (const d of ROSTER) {
      for (const variant of ['compact', 'muscle', 'sleek'] as const) {
        paintCarTexture(this, `car-${d.id}-${variant}`, d.bodyColor, d.accentColor, variant)
      }
    }
    paintCarTexture(this, `car-${BOSS.id}`, BOSS.bodyColor, BOSS.accentColor, 'sleek')
    // asphalt, dirt, tire-wall, pole, and pk-* now loaded as WebP (LOADED_TEXTURES)
    paintSmokeTexture(this)
    paintSkidStampTexture(this)
    paintBulletTexture(this)
    paintMineTexture(this)
    paintRingTexture(this)
    paintSparkTexture(this)
    paintScorchTexture(this)
    paintFlameConeTexture(this)
    paintEdgeFlashTexture(this)
    paintGlowTexture(this) // glow-soft: cat-eye reflectors + light pools, kept (separate from pole)
    paintChevronTexture(this)
    paintDebrisTexture(this)
    this.scene.start('Menu')
  }
}
```

Removed vs. the original: imports+calls for `paintAsphaltTexture`, `paintDirtTexture`, `paintTireWallTexture` (environment), `paintPickupTextures` (combat), and `paintPoleTexture` (light). Kept `paintSmokeTexture` + `paintSparkTexture` (Task 3 removes those). Everything else unchanged.

- [ ] **Step 3: Build (strict TS catches unused imports / typos)**

Run:
```bash
npm run build
```
Expected: PASS. If it complains about an unused import, remove that name from the import list. Zero TS errors required.

- [ ] **Step 4: Run the test suite**

Run:
```bash
npm test
```
Expected: all Vitest tests PASS (unchanged — this guards against unrelated regressions).

- [ ] **Step 5: Browser smoke test**

Run `npm run dev`, open the race:
```bash
npm run dev
```
In the browser, start a race and confirm:
- Asphalt track surface and off-track dirt render as **real art** (not solid color, no missing-texture green box, no seams on the tiled surface).
- `dirt` is tinted by `theme.ground` — confirm it still reads acceptably. If the tint muddies the art badly, either remove the `.setTint(theme.ground)` on the dirt tileSprite in `RaceScene.ts:1779` OR revert `dirt` to procedural (drop its line from `LOADED_TEXTURES`, restore `paintDirtTexture` import+call). Note which you chose.
- Tyre walls and street-light poles render as real art at sane scale.
- All five pickups (ammo, turbo, repair, cash, trap) render as real art with correct alpha and scale.
- No console errors about failed texture loads; no visible FPS regression.

- [ ] **Step 6: Commit**

```bash
git add src/game/textures/loadedAssets.ts src/game/scenes/BootScene.ts
git commit -m "Wire surfaces, tyre wall, pole, and pickups to authored WebP art"
```

---

### Task 3: Wire spark + smoke FX (verify-and-revert)

**Files:**
- Modify: `src/game/scenes/BootScene.ts`

**Interfaces:**
- Consumes: `LOADED_FX_TEXTURES` from `loadedAssets.ts` (Task 2); WebP `fx/spark.webp`, `fx/smoke.webp`.
- Produces: nothing new for later tasks (final task of this pass).

- [ ] **Step 1: Load the FX textures and remove their paint calls**

In `src/game/scenes/BootScene.ts`:

1. Extend the import to include the FX list:
```ts
import { LOADED_TEXTURES, LOADED_FX_TEXTURES } from '../textures/loadedAssets'
```
2. Update `preload()` to load both lists:
```ts
  preload() {
    for (const t of [...LOADED_TEXTURES, ...LOADED_FX_TEXTURES]) this.load.image(t.key, t.url)
  }
```
3. In `create()`, remove the `paintSmokeTexture(this)` and `paintSparkTexture(this)` calls.
4. Remove now-unused imports: drop `paintSparkTexture` from the combat import block, and drop `paintSmokeTexture` from the environment import block (which then leaves only `paintSkidStampTexture` — keep it).

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```
Expected: PASS, zero unused-import errors.

- [ ] **Step 3: Run tests**

Run:
```bash
npm test
```
Expected: all PASS.

- [ ] **Step 4: Browser verify — the risky pair**

Run `npm run dev`, start a race, and trigger effects:
- **smoke** — drive to induce tyre skid / drift (the `smoke` particle emitter). Confirm the puff reads as smoke and isn't harshly colored or noisy at particle scale.
- **spark** — cause an impact/collision to trigger the spark burst. Confirm it reads correctly (baked color must not fight any ADD blend).

**Verify-and-revert:** if either looks wrong, revert only that key:
- Drop its entry from `LOADED_FX_TEXTURES` in `loadedAssets.ts`.
- Restore its paint call and import in `BootScene.ts` (`paintSmokeTexture` and/or `paintSparkTexture`).
- Rebuild and re-verify. Record which (if any) were reverted in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/BootScene.ts src/game/textures/loadedAssets.ts
git commit -m "Wire spark/smoke FX to authored art (note any reverts)"
```

---

## Self-Review

**Spec coverage:**
- Hybrid preload (spec §Architecture) → Task 2 Step 2 + Task 3 Step 1. ✓
- Asset-prep pipeline: location/format/tool/sizing/committed artifacts (spec §2) → Task 1. ✓
- Exact swap mapping incl. corrected 5 pickups (spec §In-scope) → Task 1 JOBS + Task 2 `LOADED_TEXTURES`. ✓
- spark/smoke verify-and-revert (spec §risky) → Task 3. ✓
- `dirt` tint verify-and-revert (spec §Error handling) → Task 2 Step 6. ✓
- Verification: build + test + browser smoke (spec §Testing) → every task's final steps. ✓
- Deferred items untouched → none of the tasks reference them. ✓
- Raw sources not committed; only optimized art + script committed → Task 1 Step 5 git add scope. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete; commands have expected output. ✓

**Type consistency:** `LoadedTexture { key; url }`, `LOADED_TEXTURES`, `LOADED_FX_TEXTURES` named identically across Tasks 2 and 3. Texture keys match the verified `generateTexture`/`createCanvas`/`pk-${type}` keys. Pickup URLs map the five real `PickupType` values. ✓
