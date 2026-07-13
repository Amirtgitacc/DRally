# Oxide Theme + Hero Car Renders (Project A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the game to the "Oxide, grittier" theme (globally, including the race HUD) and wire the Iranian 3/4 hero car renders into every pre-game screen that shows a car.

**Architecture:** The theme lives in `src/game/ui/theme.ts` (tokens) and `src/game/ui/widgets.ts` (shared primitives). Re-theming those two files propagates to every scene, so most scene work is small: swap the car image to a new `car-hero-<id>` texture key and fix any hard-coded colour. Hero art rides the existing asset pipeline (`optimize-assets.mjs` → `public/assets` → `loadedAssets.ts` → `BootScene.preload`) on **new keys**, so the in-race procedural cars (`car-<id>`) are never touched — that is Project B.

**Tech Stack:** TypeScript (strict), Phaser 3, Vite, Vitest, `sharp` (asset optimizer), `rembg` (one-time background cutout).

## Global Constraints

- **UI copy stays English.** No Farsi menu strings, no RTL. Farsi appears only where already baked into the car art. (User decision.)
- **Do not touch the in-race procedural cars.** Keep `car-<id>` / `car-<id>-<variant>` / `car-<BOSS.id>` keys and every `paintCarTexture` call. Hero art is additive on `car-hero-<id>` keys.
- **No gameplay/simulation change.** This is presentation only. The race HUD re-skin is cosmetic (token colours) — no layout, timing, or logic edits.
- **Preserve every existing element and back route.** Never remove a menu action or a scene's route back. Remove keyboard listeners on `shutdown` as the scenes already do.
- **Respect `reducedShake` / `reducedFlash`.** The new grain/plates/hazard accents are static — add no new flashes or shakes.
- **Verify gates before "done":** `npm test`, `npm run build`, `git diff --check` all clean.
- **Testing note (project rule from AGENTS.md):** do NOT write unit tests for Phaser UI. Only Task 3 has pure logic worth a unit test (hero-key coverage). Every other task's "test" is a **browser verification** using the `?debug=1` drive recipe (see Appendix). Commit per task.

---

## File map

| File | Change |
|---|---|
| `src/game/ui/theme.ts` | Add oxide/brass/concrete/plate/line tokens (Task 1) |
| `src/game/ui/widgets.ts` | Plate look on `panel`; add `rivets`, `metalGrain`, `hazardBar`, `fitImage`; repoint default accents amber→oxide (Task 2) |
| `scripts/cutout-hero.sh` | New — one-time background removal for the 6 hero PNGs (Task 3) |
| `scripts/optimize-assets.mjs` | Add 6 hero rows (Task 3) |
| `src/game/textures/loadedAssets.ts` | Add `LOADED_HERO_TEXTURES` (Task 3) |
| `src/game/scenes/BootScene.ts` | Load `LOADED_HERO_TEXTURES` in `preload` (Task 3) |
| `src/game/scenes/GarageScene.ts` | Hero image + `fitImage`, fix colours (Task 4) |
| `src/game/scenes/CarDealerScene.ts` | Hero image (drop `setAngle`), fix colours (Task 5) |
| `src/game/scenes/PreviewScene.ts` | Hero image, fix colours (Task 5) |
| `src/game/scenes/MenuScene.ts` | Hero image where the car shows, fix colours (Task 6) |
| `src/game/scenes/ChampionScene.ts` | Hero image, fix colours (Task 6) |
| `src/game/scenes/ResultsScene.ts` | Re-skin (Task 7) |
| `src/game/scenes/RaceScene.ts` (HUD only) | Cosmetic HUD token colours (Task 7) |
| `docs/DECISIONS.md`, memory | Record the direction change (Task 8) |

---

### Task 1: Theme tokens

**Files:**
- Modify: `src/game/ui/theme.ts` (the `C` object, lines 9-46)

**Interfaces:**
- Produces: new tokens on `C` — `oxide`, `oxideDim`, `brass`, `concrete`, `surfacePlate`, `surfacePlate2`, `line` (all `number`, consumed by Tasks 2-7).

- [ ] **Step 1: Add the tokens.** In `src/game/ui/theme.ts`, inside the `C` object, add these lines right after the `gold` line (line 13):

```ts
  /** oxide-orange — new lead accent (titles, actions, focus) */
  oxide: 0xe07a3c,
  oxideDim: 0xb45e2c,
  /** funds and gains; aligns with the existing gold */
  brass: 0xc9a227,
  /** secondary data text / stat values */
  concrete: 0x8a8478,
  /** riveted-plate surface gradient */
  surfacePlate: 0x191712,
  surfacePlate2: 0x141210,
  /** warm plate border (replaces the cool `border` where plates are used) */
  line: 0x332e26,
```

Keep `amber` and every other token as-is — nothing is removed.

- [ ] **Step 2: Typecheck.** Run: `npm run build`
Expected: PASS (strict tsc + build clean). If it fails, a trailing-comma or duplicate-key typo is the usual cause.

- [ ] **Step 3: Commit.**

```bash
git add src/game/ui/theme.ts
git commit -m "theme: add oxide/brass/concrete plate tokens"
```

---

### Task 2: Re-theme the shared widgets

This is the propagating change: once `panel`, `tile`, `heading`, and `plate` adopt the plate look and oxide accent, every scene inherits the new theme. Also adds the grit primitives and a car-image fitter used by later tasks.

**Files:**
- Modify: `src/game/ui/widgets.ts`

**Interfaces:**
- Consumes: `C.oxide`, `C.surfacePlate`, `C.surfacePlate2`, `C.line`, `C.concrete` (Task 1).
- Produces:
  - `metalGrain(scene, x, y, w, h, alpha?): Phaser.GameObjects.TileSprite` — a faint tiled scratched-metal overlay.
  - `hazardBar(scene, x, y, w, h?): Phaser.GameObjects.Graphics` — the single oxide/black hazard-stripe accent.
  - `fitImage(img, maxW, maxH): Phaser.GameObjects.Image` — scales an image to fit a box, preserving aspect (used by every car-showing scene).
  - Changed defaults: `panel` fills with the plate gradient and `C.line` border; `heading`, `sectionLabel`, `prompt`, `tile` default accent is now `C.oxide` not `C.amber`.

- [ ] **Step 1: Add a scratched-metal grain texture generator.** At the top of `widgets.ts` after the imports, add a module-scope helper that lazily bakes a small noise texture once:

```ts
/** Bake a small greyscale noise tile once; reused by every metalGrain() call. */
function ensureGrainTexture(scene: Phaser.Scene): string {
  const KEY = 'ui-grain'
  if (scene.textures.exists(KEY)) return KEY
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  for (let i = 0; i < 900; i++) {
    const v = 0x40 + Math.floor(Math.random() * 0x40)
    g.fillStyle((v << 16) | (v << 8) | v, 1)
    g.fillRect(Math.floor(Math.random() * 96), Math.floor(Math.random() * 96), 1, 1)
  }
  g.generateTexture(KEY, 96, 96)
  g.destroy()
  return KEY
}
```

*Note:* `Math.random()` is fine here — this is a purely cosmetic overlay, not simulation. Do NOT use it in `src/core`.

- [ ] **Step 2: Add the grit + fit primitives.** Append these exported functions to `widgets.ts`:

```ts
/** Faint scratched-metal overlay for a panel region. */
export function metalGrain(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.06) {
  const key = ensureGrainTexture(scene)
  return scene.add
    .tileSprite(x, y, w, h, key)
    .setOrigin(0.5, 0.5)
    .setAlpha(alpha)
    .setBlendMode(Phaser.BlendModes.OVERLAY)
}

/** The single restrained hazard-stripe accent. */
export function hazardBar(scene: Phaser.Scene, x: number, y: number, w: number, h = 6) {
  const gfx = scene.add.graphics()
  const stripe = 12
  for (let i = 0; i * stripe < w; i++) {
    gfx.fillStyle(i % 2 === 0 ? C.oxide : C.surfacePlate2, 0.85)
    gfx.fillRect(x + i * stripe, y, stripe, h)
  }
  return gfx
}

/** Scale an image to fit maxW×maxH, preserving aspect ratio. */
export function fitImage(img: Phaser.GameObjects.Image, maxW: number, maxH: number) {
  const s = Math.min(maxW / img.width, maxH / img.height)
  return img.setScale(s)
}
```

- [ ] **Step 3: Give `panel` the plate look.** Replace the body of `panel` (lines ~133-136) with a plate-gradient fill and warm border, keeping the same signature so callers are unchanged:

```ts
  const { fill = C.surfacePlate, fillAlpha = 0.92, stroke = C.line, strokeAlpha = 1, strokeWidth = 2 } = opts
  const rect = scene.add.rectangle(x, y, w, h, fill, fillAlpha).setStrokeStyle(strokeWidth, stroke, strokeAlpha)
  return rect
```

- [ ] **Step 4: Repoint default accents amber → oxide.** In `widgets.ts`, change these defaults:
  - `heading`: `const { color = C.oxide, ... }` (was `C.amber`)
  - `sectionLabel`: `color = C.oxide` param default (was `C.amber`)
  - `plate` (the HUD graphics one): `gfx.lineStyle(2, C.oxide, 0.35)` (was `C.amber`)
  - `tile`: `const selectColor = opts.select ?? C.oxide` (was `C.amber`)
  - `pips`: default `color = C.oxide` (was `C.amber`)

Leave `statBar`/`damageColor` semantic colours alone.

- [ ] **Step 5: Typecheck.** Run: `npm run build` → Expected: PASS.

- [ ] **Step 6: Browser-verify the propagation.** Start `npm run dev`, open `http://localhost:5199/?debug=1`. Confirm: the Menu title is now oxide-orange, panels read as warm dark plates. No layout has shifted. (See Appendix for the drive recipe if you need to reach Garage.)

- [ ] **Step 7: Commit.**

```bash
git add src/game/ui/widgets.ts
git commit -m "theme: plate look + grit primitives, oxide accent in shared widgets"
```

---

### Task 3: Hero-render asset pipeline

Produces the `car-hero-<id>` texture keys from `cars/green/`. New keys only — the race is untouched.

**Files:**
- Modify: `scripts/optimize-assets.mjs` (append 6 rows), `src/game/textures/loadedAssets.ts`, `src/game/scenes/BootScene.ts`
- Test: `tests/game/heroAssets.test.ts` (new)
- Already done by controller: `scripts/cutout-hero.py` + the 6 transparent PNGs in `cars/output/generated/car_hero_<id>.png` (see Steps 1-2).

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `LOADED_HERO_TEXTURES: LoadedTexture[]` in `loadedAssets.ts` with one entry per car id (`car-hero-jackal` … `car-hero-leviathan`); each resolves to `assets/cars/hero/<id>.webp`.

Car→source mapping (from the spec):

| id | source in `cars/green/` |
|---|---|
| jackal | `pride3.png` |
| vandal | `taxi peykan.png` |
| marauder | `cielo.png` |
| harrier | `nissan vanet.png` |
| basilisk | `nisasan2.png` |
| leviathan | `patrolgreen.png` |

- [x] **Step 1-2: Cutouts — DONE by controller.** `scripts/cutout-hero.py` (rembg u2net matte → green-spill despill → bbox crop) produced all six transparent PNGs in `cars/output/generated/car_hero_<id>.png`, each eyeballed clean at ~460px on a magenta backdrop (no green fringe, no matte holes). Note: `harrier` had no gritty 3/4 source in `cars/green/` (only an overhead view), so its source was generated to match the set (`cars/green/peugeot405 (generated).png`). The implementer does NOT run the cutout — the PNGs already exist. (The optimizer reads the source dir as `Cars/output/generated`, case-insensitive match for `cars/output/generated`.)

- [ ] **Step 3: Add optimizer rows.** In `scripts/optimize-assets.mjs`, append to the `JOBS` array (before the closing `]`):

```js
  // --- Project A: Iranian hero car renders (3/4 angle, transparent) ---
  { src: 'car_hero_jackal.png',    out: 'cars/hero/jackal.webp',    w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_vandal.png',    out: 'cars/hero/vandal.webp',    w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_marauder.png',  out: 'cars/hero/marauder.webp',  w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_harrier.png',   out: 'cars/hero/harrier.webp',   w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_basilisk.png',  out: 'cars/hero/basilisk.webp',  w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_leviathan.png', out: 'cars/hero/leviathan.webp', w: 460, fit: 'inside', q: 88, trim: true },
```

- [ ] **Step 4: Build the webp assets.** Run: `npm run assets`
Expected: prints `wrote public/assets/cars/hero/jackal.webp` … through `leviathan.webp`. Confirm the six files exist and are small (tens of KB each).

- [ ] **Step 5: Register the keys.** In `src/game/textures/loadedAssets.ts`, append after `LOADED_FX_TEXTURES`:

```ts
// Project A: 3/4 hero renders for pre-game screens. Separate from the
// procedural car-<id> keys the race still uses — nothing here touches the race.
export const LOADED_HERO_TEXTURES: LoadedTexture[] = [
  { key: 'car-hero-jackal', url: 'assets/cars/hero/jackal.webp' },
  { key: 'car-hero-vandal', url: 'assets/cars/hero/vandal.webp' },
  { key: 'car-hero-marauder', url: 'assets/cars/hero/marauder.webp' },
  { key: 'car-hero-harrier', url: 'assets/cars/hero/harrier.webp' },
  { key: 'car-hero-basilisk', url: 'assets/cars/hero/basilisk.webp' },
  { key: 'car-hero-leviathan', url: 'assets/cars/hero/leviathan.webp' },
]
```

- [ ] **Step 6: Load them at boot.** In `src/game/scenes/BootScene.ts`:
  - Update the import (line 19) to include the new array: `import { LOADED_TEXTURES, LOADED_FX_TEXTURES, LOADED_HERO_TEXTURES } from '../textures/loadedAssets'`
  - Update `preload` (line 29): `for (const t of [...LOADED_TEXTURES, ...LOADED_FX_TEXTURES, ...LOADED_HERO_TEXTURES]) this.load.image(t.key, t.url)`

- [ ] **Step 7: Write the coverage test.** Create `tests/game/heroAssets.test.ts` — assert every car id has exactly one hero key so no scene can ask for a missing texture:

```ts
import { describe, it, expect } from 'vitest'
import { CAR_CATALOG } from '../../src/data/cars'
import { LOADED_HERO_TEXTURES } from '../../src/game/textures/loadedAssets'

describe('hero car assets', () => {
  it('has one hero texture per catalog car', () => {
    for (const car of CAR_CATALOG) {
      const hits = LOADED_HERO_TEXTURES.filter((t) => t.key === `car-hero-${car.id}`)
      expect(hits, `missing/duplicate hero key for ${car.id}`).toHaveLength(1)
    }
  })
})
```

- [ ] **Step 8: Run the test.** Run: `npm test -- heroAssets` → Expected: PASS. (If it fails "missing key", a typo in Step 5 id is the cause.)

- [ ] **Step 9: Commit.**

```bash
git add scripts/cutout-hero.py scripts/optimize-assets.mjs src/game/textures/loadedAssets.ts src/game/scenes/BootScene.ts public/assets/cars/hero tests/game/heroAssets.test.ts
git commit -m "cars: hero-render asset pipeline (car-hero-<id> keys)"
```
Do NOT `git add` the source PNGs in `cars/` — those are untracked source art (AGENTS.md: don't commit reference/generated source material). Only the small `public/assets/cars/hero/*.webp` outputs are committed.

---

### Task 4: Garage — hero render + fit

**Files:**
- Modify: `src/game/scenes/GarageScene.ts`

**Interfaces:**
- Consumes: `fitImage` (Task 2), `car-hero-<id>` keys (Task 3).

- [ ] **Step 1: Swap the car image to the hero key and fit it.** In `GarageScene.ts` line 143, replace:

```ts
    this.carImage = this.add.image(LX, 330, `car-${this.career.carId}`).setScale(3.2)
```
with:
```ts
    this.carImage = this.add.image(LX, 320, `car-hero-${this.career.carId}`)
    fitImage(this.carImage, 520, 300)
```

Add `fitImage` to the widgets import block (lines 11-23).

- [ ] **Step 2: Update the texture on refresh.** In `refresh()` (line 373) replace `this.carImage.setTexture(\`car-${showing.id}\`)` with:

```ts
    this.carImage.setTexture(`car-hero-${showing.id}`)
    fitImage(this.carImage, 520, 300)
```
(Re-fit because different chassis have different aspect ratios.)

- [ ] **Step 3: Fix hard-coded amber.** In `GarageScene.ts`, replace the two `C.amber` usages that are now theme accents: the stat-bar fill in `drawBars()` (line 439) `statBar(..., C.amber)` → `C.oxide`. Leave `C.money`, `C.ammo`, tier and semantic colours as-is.

- [ ] **Step 3b: Apply the grit (this is the approved-mockup look).** At the very start of `create()`, right after `this.career = loadCareer()`, lay down a faint full-screen grain behind everything and a single hazard sliver under the title. Import `metalGrain`, `hazardBar` from widgets, and `GAME_WIDTH`/`GAME_HEIGHT` are already imported:

```ts
    metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)
```
Then after the `heading(this, cx, 70, 'THE GARAGE')` call, add the accent:
```ts
    hazardBar(this, cx - 240, 108, 480)
```
This is the one screen the direction was approved against — it must carry grain + a hazard accent, not just the plate fill.

- [ ] **Step 4: Typecheck.** Run: `npm run build` → Expected: PASS.

- [ ] **Step 5: Browser-verify.** `npm run dev` → `?debug=1` → drive to Garage (Appendix). Confirm: the owned car shows as its Iranian hero render, correctly sized on the stage, name reads under it, bars are oxide, all seven tiles and Esc-back still work. Buy an upgrade and confirm bars animate.

- [ ] **Step 6: Commit.**

```bash
git add src/game/scenes/GarageScene.ts
git commit -m "garage: hero car render + oxide bars"
```

---

### Task 5: CarDealer + Preview — hero renders

Both show a single car and today rotate/scale the procedural sprite. Hero renders are 3/4 and must NOT be rotated.

**Files:**
- Modify: `src/game/scenes/CarDealerScene.ts`, `src/game/scenes/PreviewScene.ts`

**Interfaces:**
- Consumes: `fitImage` (Task 2), `car-hero-<id>` keys (Task 3).

- [ ] **Step 1: CarDealer image.** In `CarDealerScene.ts` line 60, replace:

```ts
    this.carImage = this.add.image(cx, 300, `car-${CAR_CATALOG[this.idx].id}`).setScale(2.0).setAngle(-90)
```
with:
```ts
    this.carImage = this.add.image(cx, 300, `car-hero-${CAR_CATALOG[this.idx].id}`)
    fitImage(this.carImage, 620, 320)
```
And in the refresh (line 177) replace `this.carImage.setTexture(\`car-${showing.id}\`)` with:
```ts
    this.carImage.setTexture(`car-hero-${showing.id}`)
    fitImage(this.carImage, 620, 320)
```
Add `fitImage` to the widgets import. **Do not keep `setAngle`** — hero art is pre-oriented.

- [ ] **Step 2: Preview image.** In `PreviewScene.ts`, find the car sprite: run `grep -nE "car-|setScale|setAngle|setTexture" src/game/scenes/PreviewScene.ts`. Apply the same transform: create with `car-hero-${id}`, drop any `setScale`/`setAngle`, add `fitImage(img, 620, 320)`; if it re-textures on change, re-fit there too. Import `fitImage`.

- [ ] **Step 3: Fix hard-coded amber.** In both scenes, `grep -n "C.amber" src/game/scenes/CarDealerScene.ts src/game/scenes/PreviewScene.ts`; change accent/selection/title ambers to `C.oxide`. Leave semantic colours (money/danger/tier/warn) alone.

- [ ] **Step 3b: Background grain (consistency).** In each scene's `create()`, after the background is laid but before content, add `metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)` (import `metalGrain`; `GAME_WIDTH`/`GAME_HEIGHT` from `../../config/game`). Matches the Garage's texture so the pre-game screens read as one theme.

- [ ] **Step 4: Typecheck.** Run: `npm run build` → Expected: PASS.

- [ ] **Step 5: Browser-verify.** Drive Garage → BUY CAR to reach CarDealer: browse all six, each shows its hero render upright and fitted, the owned marker and delta labels still work, Esc returns. Then verify Preview shows the offered car as a hero render.

- [ ] **Step 6: Commit.**

```bash
git add src/game/scenes/CarDealerScene.ts src/game/scenes/PreviewScene.ts
git commit -m "dealer+preview: hero car renders (no rotation)"
```

---

### Task 6: Menu + Champion — hero renders

**Files:**
- Modify: `src/game/scenes/MenuScene.ts`, `src/game/scenes/ChampionScene.ts`

**Interfaces:**
- Consumes: `fitImage` (Task 2), `car-hero-<id>` keys (Task 3).

- [ ] **Step 1: Menu car.** Run `grep -nE "car-|setScale|setAngle|setTexture" src/game/scenes/MenuScene.ts`. Where the player's current car renders (`car-${career.carId}`), swap to `car-hero-${career.carId}`, drop `setScale`/`setAngle`, add `fitImage(img, <maxW>, <maxH>)` sized to the space it currently occupies (match the current on-screen size). Import `fitImage`.

- [ ] **Step 2: Champion car.** Same transform in `ChampionScene.ts` (`car-${career.carId}` → `car-hero-…` + `fitImage`).

- [ ] **Step 3: Fix hard-coded amber.** `grep -n "C.amber" src/game/scenes/MenuScene.ts src/game/scenes/ChampionScene.ts`; change accents to `C.oxide`. Champion may intentionally use `C.gold` — leave gold as-is (champion identity).

- [ ] **Step 3b: Background grain (consistency).** In each scene's `create()`, add `metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)` behind content (import `metalGrain`; `GAME_WIDTH`/`GAME_HEIGHT` from `../../config/game`).

- [ ] **Step 4: Typecheck.** Run: `npm run build` → Expected: PASS.

- [ ] **Step 5: Browser-verify.** Menu shows the player's car as a hero render at the right size, identity still visible, all menu actions + keyboard nav intact. If reachable, verify Champion (rank-one duel win) shows the hero render; otherwise confirm via a code read that the key/import are correct.

- [ ] **Step 6: Commit.**

```bash
git add src/game/scenes/MenuScene.ts src/game/scenes/ChampionScene.ts
git commit -m "menu+champion: hero car renders"
```

---

### Task 7: Results re-skin + Race HUD cosmetic re-skin

**Files:**
- Modify: `src/game/scenes/ResultsScene.ts`, `src/game/scenes/RaceScene.ts` (HUD colours only)

**Interfaces:**
- Consumes: Task 1 tokens; Task 2 widgets already carry the plate look.

- [ ] **Step 1: Results.** `ResultsScene` builds on `modal`/`panel`, so it already inherits the plate look. Fix hard-coded accents: `grep -n "C.amber" src/game/scenes/ResultsScene.ts` → change title/accent ambers to `C.oxide`; leave prize/points semantic colours alone. Add the background grain in `create()`: `metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)` (import `metalGrain`; `GAME_WIDTH`/`GAME_HEIGHT` from `../../config/game`). Do NOT add grain to the Race HUD — the race world has its own textures.

- [ ] **Step 2: Race HUD — cosmetic only.** `grep -n "C.amber" src/game/scenes/RaceScene.ts`. For **HUD/readout** usages (speed readout, HUD plate accents, lap/position labels), change `C.amber` → `C.oxide`. **Do not** change: weapon/mine/pickup FX colours, damage ramp, tier colours, or anything inside the simulation/update loop. If a given `C.amber` is on an FX or world object, leave it. When unsure whether a usage is HUD or FX, leave it and note it for review.

- [ ] **Step 3: Typecheck + full tests.** Run: `npm run build && npm test` → Expected: PASS (all existing tests green; no simulation change).

- [ ] **Step 4: Browser-verify.** Drive a short race (Appendix) — DO NOT let it complete (it mutates the dev save). Confirm the HUD reads in oxide, layout/readouts unchanged, follow-camera fine, no new flashes. Abandon via pause. Then finish a race enough to see Results if you have a throwaway save, or read Results code to confirm accent swap.

- [ ] **Step 5: Commit.**

```bash
git add src/game/scenes/ResultsScene.ts src/game/scenes/RaceScene.ts
git commit -m "results+race HUD: oxide accent re-skin (cosmetic)"
```

---

### Task 8: Docs + memory + final verification

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/ART_INTEGRATION_STATUS.md`
- Update memory: `visual-direction-sprite-pivot`

- [ ] **Step 1: Record the direction change.** Add a `docs/DECISIONS.md` entry: the car art is now specific pre-coloured Iranian 3/4 hero renders on `car-hero-<id>` keys for pre-game screens; the "clean & premium / pristine" and "orthographic tintable greyscale" notes are superseded — orthographic top-down applies only to the deferred Project B (in-race sprites). Add one line to `docs/ART_INTEGRATION_STATUS.md` §5 pointing at this plan + spec.

- [ ] **Step 2: Update the memory.** Update `visual-direction-sprite-pivot` in the memory dir: style is now "Oxide, grittier" (rusted Mad-Max Iranian cars), UI stays English, pre-game uses 3/4 hero renders, in-race top-down sprites are the deferred Project B.

- [ ] **Step 3: Final verification gate.** Run all three and confirm clean:

```bash
npm test
npm run build
git diff --check
```
Expected: tests pass, build clean, no whitespace errors.

- [ ] **Step 4: Full browser smoke.** With `?debug=1`, walk Menu → Garage → CarDealer → back → SignUp → PrepareRace → (start race, verify HUD) → abandon. Confirm every screen is on-theme, every car is a hero render, every back route and keyboard nav works, nothing removed.

- [ ] **Step 5: Commit.**

```bash
git add docs/DECISIONS.md docs/ART_INTEGRATION_STATUS.md
git commit -m "docs: record Oxide theme + hero-render direction (Project A)"
```

---

## Appendix — Browser drive recipe (`?debug=1`)

Subagents cannot drive Chrome; the controller verifies. Background tabs are rAF-throttled, so pump the loop manually. With `window.__game` exposed:

```js
const g = window.__game
const pump = (n = 30) => { for (let i = 0; i < n; i++) g.loop.step(performance.now() + i * 16) }
// Menu → Garage:
const Menu = g.scene.getScene('Menu'); Menu.selected = 0; Menu.activate?.(); pump()
const Garage = g.scene.getScene('Garage'); // inspect Garage.children.list, texture keys, etc.
```

- Verify sprites by filtering `scene.children.list` on `texture.key` (e.g. count `car-hero-*`), checking scale/position, rather than by eyeballing a throttled frame.
- **Driving a real race mutates the dev save (`deathrally-career-v2`).** Never let a verification race complete unless intended.

## Self-review notes

- **Spec coverage:** theme tokens (T1) ✓, plate/grit widgets incl. global reach (T2) ✓, hero pipeline + mapping (T3) ✓, Garage/Dealer/Preview/Menu/Champion/Results/Race-HUD screens (T4-T7) ✓, English-only + no-race-touch constraints (Global Constraints) ✓, docs/memory (T8) ✓. Roster strip: intentionally dropped per user decision — spec §6 updated.
- **Race HUD global reach:** delivered via T2 token propagation + T7 explicit HUD accent swap, scoped cosmetic.
- **No orphan types:** `fitImage`, `metalGrain`, `hazardBar`, `LOADED_HERO_TEXTURES` are all defined in Tasks 2-3 and consumed in Tasks 4-7 (grain in every pre-game scene, hazard in Garage, fitImage in every car scene). `rivets` was cut as unused.
