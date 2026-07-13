# Project B — In-Race Top-Down Car Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural in-race cars (grey silhouettes + per-driver `setTint`) with the real top-down Iranian car sprites mapped by chassis, then delete the procedural car pipeline.

**Architecture:** Same "swap seam" as Project A. New authored WebP sprites (`car-top-<id>` for the 6 chassis + boss, plus a `car-hero-sovereign` reveal render) load in `BootScene.preload`. Four consumers (`RaceScene`, `NewCareerScene`, `SignUpScene`, and the boss reveal) switch their texture keys; then the procedural `paintCarTexture` and its `BootScene.create` paint loops are deleted last. No `src/core` / simulation / economy / AI change — this is presentation + cleanup only.

**Tech Stack:** TypeScript (strict), Phaser 3, Vite, Vitest. Asset pipeline: Python `rembg` + Pillow/NumPy (cutout) → `sharp` (`scripts/optimize-assets.mjs`) → WebP.

## Global Constraints

- Never copy original art/branding — these sprites are the user's own generated Iranian-car renders; recreate only high-level mechanics. (AGENTS.md)
- `src/core/` must stay untouched (browser-independent rules). This plan touches only `src/game`, `src/game/textures`, `scripts/`, `public/assets/`, `tests/`, `docs/`.
- No `CareerState` schema/migration change. `liveryColor` stays in the save with a fixed default; it is simply no longer player-chosen or displayed (B-3).
- Do NOT commit source PNGs under `cars/`. Commit only `public/assets/cars/top/*.webp` and `public/assets/cars/hero/boss.webp`. (AGENTS.md — never commit reference material / `.playwright-cli/`.)
- Engine facing convention: heading 0 = +x (east); Phaser rotation is clockwise-positive (y-down). Sources face UP (north). Bake **90° CW** into the cutout so the nose points +x; existing `sprite.rotation = heading` code needs no change. If a car drives sideways in-browser, **flip the bake direction — never add a code offset.**
- Rivals stay trackable via the colour-coded standings list only (each `car.color`, `RaceScene.ts:2455`). No `setTint` for livery/body colour anywhere on-track. Keep wreck `setTint(0x2c2c30)` and hit-flash `setTintFill`.
- Never merge/push to `main` without explicit user permission. Commit per task.
- Verification gate before "done": `npm test`, `npm run build`, `git diff --check` all clean, plus browser-drive verification (controller, throttled-tab pump recipe in `.superpowers/sdd/progress.md`). Do NOT let a verification race complete (it mutates the dev save `deathrally-career-v2`).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/cutout-topdown.py` | Cut 7 top-down sprites (rembg + despill + 90° CW rotate + bbox crop) + boss hero (no rotate) | **Create** |
| `scripts/optimize-assets.mjs` | Encode generated PNGs → WebP | **Modify** (add 7 top + 1 boss-hero rows) |
| `src/game/textures/loadedAssets.ts` | Registry of loaded WebP keys | **Modify** (`LOADED_TOP_TEXTURES` array; add boss to `LOADED_HERO_TEXTURES`) |
| `src/game/scenes/BootScene.ts` | Preload authored art; (later) drop procedural paint | **Modify** twice (Task 1 preload; Task 5 delete paint loops + imports) |
| `tests/game/topdownAssets.test.ts` | Coverage: one `car-top-<id>` per catalog car + boss; boss hero registered | **Create** |
| `src/game/scenes/RaceScene.ts` | On-track car spawn + hit-flash tint reset + `CAR_SCALE` | **Modify** (texture keys, drop tints, re-tune scale) |
| `src/game/scenes/NewCareerScene.ts` | Driver-profile screen | **Modify** (remove livery picker; hero starter render) |
| `src/game/scenes/SignUpScene.ts` | Pre-duel boss reveal | **Modify** (boss hero render) |
| `src/game/textures/vehicleTextures.ts` | Procedural car painter | **Delete** (dead after Task 5) |
| `docs/DECISIONS.md`, `docs/ART_INTEGRATION_STATUS.md`, memory | Record the decision | **Modify** (Task 6) |

---

### Task 1: Asset pipeline — cutouts, optimizer, key registration, Boot preload

Produce the 7 top-down WebP sprites + the boss hero WebP, register their keys, and load them at boot. A coverage test locks the key set.

**Files:**
- Create: `scripts/cutout-topdown.py`
- Modify: `scripts/optimize-assets.mjs` (append rows after the Project-A hero rows, ~`:58`)
- Modify: `src/game/textures/loadedAssets.ts` (add `LOADED_TOP_TEXTURES`; add boss to `LOADED_HERO_TEXTURES:54-61`)
- Modify: `src/game/scenes/BootScene.ts:19,29` (import + preload loop)
- Test: `tests/game/topdownAssets.test.ts`

**Interfaces:**
- Produces: `LOADED_TOP_TEXTURES: LoadedTexture[]` exported from `loadedAssets.ts` with keys `car-top-jackal|vandal|marauder|harrier|basilisk|leviathan|sovereign`. `LOADED_HERO_TEXTURES` gains `car-hero-sovereign` → `assets/cars/hero/boss.webp`. Consumed by Tasks 2 & 4.
- Note: `BOSS.id === 'sovereign'`, so `car-top-${BOSS.id}` = `car-top-sovereign` and `car-hero-${BOSS.id}` = `car-hero-sovereign`.

- [ ] **Step 1: Write the failing coverage test**

Create `tests/game/topdownAssets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CAR_CATALOG } from '../../src/data/cars'
import { BOSS } from '../../src/data/boss'
import { LOADED_TOP_TEXTURES, LOADED_HERO_TEXTURES } from '../../src/game/textures/loadedAssets'

describe('top-down race car assets', () => {
  it('has one top-down texture per catalog car plus the boss', () => {
    for (const car of CAR_CATALOG) {
      expect(
        LOADED_TOP_TEXTURES.filter((t) => t.key === `car-top-${car.id}`),
        `missing/duplicate top key for ${car.id}`,
      ).toHaveLength(1)
    }
    expect(
      LOADED_TOP_TEXTURES.filter((t) => t.key === `car-top-${BOSS.id}`),
      'missing/duplicate top key for boss',
    ).toHaveLength(1)
  })

  it('has no stray top-down keys (catalog + boss only)', () => {
    expect(LOADED_TOP_TEXTURES).toHaveLength(CAR_CATALOG.length + 1)
  })

  it('registers the boss pre-duel hero render', () => {
    expect(
      LOADED_HERO_TEXTURES.filter((t) => t.key === `car-hero-${BOSS.id}`),
    ).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- topdownAssets`
Expected: FAIL — `LOADED_TOP_TEXTURES` is not exported (import error / undefined).

- [ ] **Step 3: Add the key registry**

In `src/game/textures/loadedAssets.ts`, add `car-hero-sovereign` to `LOADED_HERO_TEXTURES` (after `car-hero-leviathan` at `:60`):

```ts
  { key: 'car-hero-leviathan', url: 'assets/cars/hero/leviathan.webp' },
  // Project B: boss pre-duel reveal render (3/4 hero, distinct armoured car)
  { key: 'car-hero-sovereign', url: 'assets/cars/hero/boss.webp' },
]
```

Then append a new export at the end of the file:

```ts
// Project B: real top-down roof-view race sprites, one per chassis + the boss.
// Replace the procedural car-<id> keys the race used to paint at boot.
export const LOADED_TOP_TEXTURES: LoadedTexture[] = [
  { key: 'car-top-jackal', url: 'assets/cars/top/jackal.webp' },
  { key: 'car-top-vandal', url: 'assets/cars/top/vandal.webp' },
  { key: 'car-top-marauder', url: 'assets/cars/top/marauder.webp' },
  { key: 'car-top-harrier', url: 'assets/cars/top/harrier.webp' },
  { key: 'car-top-basilisk', url: 'assets/cars/top/basilisk.webp' },
  { key: 'car-top-leviathan', url: 'assets/cars/top/leviathan.webp' },
  { key: 'car-top-sovereign', url: 'assets/cars/top/sovereign.webp' },
]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- topdownAssets`
Expected: PASS (all 3 tests). The WebP files don't exist on disk yet — the test only checks the registry, which is intended (mirrors `heroAssets.test.ts`).

- [ ] **Step 5: Wire the preload**

In `src/game/scenes/BootScene.ts`, extend the import at `:19`:

```ts
import { LOADED_TEXTURES, LOADED_FX_TEXTURES, LOADED_HERO_TEXTURES, LOADED_TOP_TEXTURES } from '../textures/loadedAssets'
```

and the preload loop at `:29`:

```ts
  preload() {
    for (const t of [...LOADED_TEXTURES, ...LOADED_FX_TEXTURES, ...LOADED_HERO_TEXTURES, ...LOADED_TOP_TEXTURES]) this.load.image(t.key, t.url)
  }
```

- [ ] **Step 6: Write the cutout script**

Create `scripts/cutout-topdown.py`:

```python
#!/usr/bin/env python3
"""One-time (Project B): cut the 7 top-down Iranian race cars out of their
green-screen backgrounds, rotate them into the engine's facing convention, and
crop to the bounding box. Also cuts the boss 3/4 hero for the pre-duel reveal
(no rotation).

Engine convention: heading 0 = +x (east). Sources face UP (north), so top-down
cars are rotated 90 CW so the nose points +x; the existing rotation code then
needs no change. If a car drives sideways in-browser, flip -90 -> 90 here.

Pipeline (top-down): rembg (u2net) -> green despill -> rotate 90 CW -> crop bbox.
Pipeline (boss hero): rembg -> green despill -> crop bbox.

Deps: pip install --user "rembg[cpu]" onnxruntime pillow numpy
Run:  python3 scripts/cutout-topdown.py
      (writes cars/output/generated/, which scripts/optimize-assets.mjs then
       encodes to public/assets/cars/top + public/assets/cars/hero)
"""
import numpy as np
from rembg import remove
from PIL import Image

SRC = "cars/green"
OUT = "cars/output/generated"

# game chassis id -> top-down source (nose points UP/north in the source)
TOP_JOBS = [
    ("Pride4.png", "jackal"),
    ("taxi peykan2.png", "vandal"),
    ("Cielo Dawoo.png", "marauder"),
    ("405.png", "harrier"),
    ("nissan vanet.png", "basilisk"),
    ("Patrol nissan.png", "leviathan"),
    ("Sovereign2.png", "sovereign"),
]

# boss 3/4 hero for the pre-duel reveal (hero-style, no rotation)
HERO_JOBS = [
    ("Sovereign.png", "sovereign"),
]


def despill(im: Image.Image) -> Image.Image:
    """Clamp green where it is the dominant channel (screen bleed)."""
    a = np.asarray(im.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    a[..., 1] = np.where(g > np.maximum(r, b), np.maximum(r, b), g)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def cut(src: str) -> Image.Image:
    return despill(remove(Image.open(f"{SRC}/{src}")))


def crop_bbox(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main() -> None:
    for src, cid in TOP_JOBS:
        # PIL.rotate is CCW for positive angles; -90 = 90 CW so the north-facing
        # nose ends up pointing +x. Flip to rotate(90) if cars drive sideways.
        im = crop_bbox(cut(src).rotate(-90, expand=True))
        im.save(f"{OUT}/car_top_{cid}.png")
        print(f"top  {cid:10s} <- {src:22s} {im.size}")
    for src, cid in HERO_JOBS:
        im = crop_bbox(cut(src))
        im.save(f"{OUT}/car_hero_{cid}.png")
        print(f"hero {cid:10s} <- {src:22s} {im.size}")
    print("done: 7 top-down + 1 boss hero")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Add optimizer rows**

In `scripts/optimize-assets.mjs`, after the last Project-A hero row (`car_hero_leviathan.png`, `:58`), append:

```js
  // --- Project B: Iranian top-down race sprites (roof view, nose +x, transparent) ---
  { src: 'car_top_jackal.png',    out: 'cars/top/jackal.webp',    w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_vandal.png',    out: 'cars/top/vandal.webp',    w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_marauder.png',  out: 'cars/top/marauder.webp',  w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_harrier.png',   out: 'cars/top/harrier.webp',   w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_basilisk.png',  out: 'cars/top/basilisk.webp',  w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_leviathan.png', out: 'cars/top/leviathan.webp', w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_sovereign.png', out: 'cars/top/sovereign.webp', w: 220, fit: 'inside', q: 88, trim: true },
  // Boss 3/4 hero for the pre-duel reveal (matches the hero pipeline)
  { src: 'car_hero_sovereign.png', out: 'cars/hero/boss.webp',    w: 460, fit: 'inside', q: 88, trim: true },
```

- [ ] **Step 8: Generate the cutouts (controller step)**

Run the cutout, eyeball each PNG on a magenta backdrop for green fringe / holes (especially the rusty edges on the boss and the generated `405.png`). Re-run if a source needs a different bake.

Run: `python3 scripts/cutout-topdown.py`
Expected: 8 PNGs in `cars/output/generated/` (`car_top_*.png` ×7 + `car_hero_sovereign.png`), each cropped tight, nose-right for the top-down set.

- [ ] **Step 9: Encode to WebP**

Run: `npm run assets`
Expected: `wrote public/assets/cars/top/{jackal,vandal,marauder,harrier,basilisk,leviathan,sovereign}.webp` and `wrote public/assets/cars/hero/boss.webp`. Confirm the 8 files exist and are small (<60 KB each).

- [ ] **Step 10: Full test + build**

Run: `npm test && npm run build`
Expected: all tests PASS (incl. `topdownAssets`), build clean.

- [ ] **Step 11: Commit**

Commit code + only the produced WebP; do NOT stage anything under `cars/`.

```bash
git add scripts/cutout-topdown.py scripts/optimize-assets.mjs \
  src/game/textures/loadedAssets.ts src/game/scenes/BootScene.ts \
  tests/game/topdownAssets.test.ts \
  public/assets/cars/top public/assets/cars/hero/boss.webp
git status   # verify nothing under cars/ is staged
git commit -m "feat(art): add top-down race car + boss sprites, register + preload"
```

---

### Task 2: RaceScene — swap on-track cars to top-down sprites, drop tints, re-tune scale

Point player/boss/rival spawns at `car-top-*`, remove every body-colour `setTint`, and re-tune `CAR_SCALE` for the new native sprite size. Browser verification (rotation + scale) is the gate — this is the make-or-break task.

**Files:**
- Modify: `src/game/scenes/RaceScene.ts:110` (`CAR_SCALE`), `:788-791` (hit-flash reset), `:1257-1258` (player), `:1275` (boss), `:1300` (rivals)

**Interfaces:**
- Consumes: `car-top-<chassisId>` keys and `car-top-${BOSS.id}` from Task 1.
- Preserves: `makeUnit(slot, id, name, color, textureKey, ai)` signature (`:1130`) — `color` still drives the standings-list colour (`:2455`), `rival.chassisId` still set (`:1314`).

- [ ] **Step 1: Swap the player texture and drop its livery tint**

In `RaceScene.ts`, replace `:1257-1258`:

```ts
    const player = makeUnit(0, 'player', this.career.profile.driverName, this.career.profile.liveryColor, `car-top-${playerCar.id}`, null)
    player.damage = this.career.damage // persistent damage carries into the race
```

(the `player.sprite.setTint(this.career.profile.liveryColor)` line is deleted; `player.damage = …` was `:1259` and stays).

- [ ] **Step 2: Fix the hit-flash reset so the player no longer re-tints**

The per-frame flash reset at `:788-791` re-applies `liveryColor` to the player after the white flash. With livery tint gone, it must just clear. Replace:

```ts
      // clearTint() leaves tintFill set, which would paint the car solid white
      car.sprite.tintFill = false
      if (car.wrecked) car.sprite.setTint(0x2c2c30)
      else car.sprite.clearTint()
```

(the `else if (car.isPlayer) car.sprite.setTint(this.career.profile.liveryColor)` branch is removed; wreck darkening kept.)

- [ ] **Step 3: Swap the boss texture**

At `:1275`, change the boss texture key (no body tint exists to remove — `makeUnit` never tints by `color`):

```ts
      const boss = makeUnit(1, BOSS.id, BOSS.name, BOSS.bodyColor, `car-top-${BOSS.id}`, {
```

- [ ] **Step 4: Swap the rival texture to the chassis top-down sprite**

At `:1300`, change the key from the per-driver variant to the chassis id:

```ts
        const rival = makeUnit(i + 1, id, driver.name, driver.bodyColor, `car-top-${chassis.id}`, {
```

Keep `rival.chassisId = chassis.id` (`:1314`) and `driver.bodyColor` as the `color` arg (drives the standings colour). Rivals had no `setTint` to remove.

- [ ] **Step 5: Re-tune `CAR_SCALE`**

The old `0.75` was tuned for the 128×64 procedural texture. The top WebP is 220 px wide (car length). Set a starting value at `:110`:

```ts
const CAR_SCALE = 0.44
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run build`
Expected: strict TS + build clean (no unused-var errors; `liveryColor` is still read for `makeUnit`'s `color` arg and elsewhere).

- [ ] **Step 7: Browser-verify rotation and scale (the gate)**

Drive a real race via the throttled-tab pump recipe in `.superpowers/sdd/progress.md` (Menu.activate → Garage RACE tile → SignUp.confirm → PrepareRace keydown-ENTER → Race), with `g.loop.step()` pumping. **Do NOT let the race finish** (mutates `deathrally-career-v2`). Confirm:
  1. **Rotation:** the player nose points along travel when driving forward — NOT sideways. If sideways, fix the bake in `scripts/cutout-topdown.py` (Step 6 of Task 1: `-90` → `90`), re-run `npm run assets`, re-verify. Do not add a code offset.
  2. **Scale:** cars read at the right on-track size vs track width and each other. Adjust `CAR_SCALE` (Step 5) up/down and re-check until it looks right.
  3. Player, a rival, and (via a duel or forced spawn) the boss are each a correct, distinct real sprite — no green `__MISSING` box.
  4. Wreck still darkens (drive into a wall / force damage); hit-flash still flashes white.

- [ ] **Step 8: Commit**

```bash
git add src/game/scenes/RaceScene.ts
# if the bake was flipped, also: git add scripts/cutout-topdown.py public/assets/cars/top
git commit -m "feat(race): swap on-track cars to top-down sprites, drop livery tint, re-tune scale"
```

---

### Task 3: NewCareerScene — remove the livery picker, show the hero starter

Real sprites can't be tinted, so the livery colour selection is meaningless. Remove it, renumber the options list, and show the starter car's hero render (fixing the Project-A note that New Career still showed the old procedural car). Keep writing `liveryColor` to the save with a fixed default (no schema change).

**Files:**
- Modify: `src/game/scenes/NewCareerScene.ts` — imports (`:8`), field (`:20`), starter image (`:49`), row labels (`:53-54`), `handleKey` index math (`:71-79`), `change` (`:82-87`), `commit` (`:97`), `refresh` (`:104-118`), `drawPortrait` (`:120-137`)

**Interfaces:**
- Consumes: `car-hero-${STARTER_CAR.id}` (= `car-hero-jackal`) from the existing hero set; `fitImage` from `../ui/widgets`.
- Preserves: `DriverProfile.liveryColor` written by `commit()` — set to `LIVERIES[0]` (`0xf2a33c`), the current default, so `CareerState` schema v2 and existing saves are unchanged.

- [ ] **Step 1: Import `fitImage`**

Extend `:8`:

```ts
import { flavor, fitImage, heading, panel, text, tile, type TileHandle } from '../ui/widgets'
```

- [ ] **Step 2: Remove the livery field**

Delete `:20` (`private livery = 0`). Keep the `LIVERIES` const (`:10`) — only `LIVERIES[0]` is still referenced, for the persisted default.

- [ ] **Step 3: Show the hero starter render**

Replace `:49`:

```ts
    this.car = this.add.image(520, 440, `car-hero-${STARTER_CAR.id}`)
    fitImage(this.car, 300, 220)
```

(hero renders are not rotated — no `setAngle`; `fitImage` sizes it to the panel.)

- [ ] **Step 4: Remove LIVERY from the options list + renumber the START row**

Replace `:53-55` (the `forEach` that builds `this.rows`). START CAREER is now index 4 of 5:

```ts
    ;['DRIVER NAME', 'PORTRAIT ID', 'WEAPONS', 'DIFFICULTY', 'START CAREER'].forEach((label, i) => {
      this.rows.push(tile(this, 1320, 265 + i * 105, 760, 76, label, { accent: i === 4 ? C.oxideDim : undefined }))
    })
```

- [ ] **Step 5: Renumber `handleKey` (6 rows → 5)**

Replace the navigation block `:71-78`:

```ts
    if (event.code === 'ArrowUp') this.selected = (this.selected + 4) % 5
    else if (event.code === 'ArrowDown') this.selected = (this.selected + 1) % 5
    else if (event.code === 'ArrowLeft') this.change(-1)
    else if (event.code === 'ArrowRight') this.change(1)
    else if (event.code === 'Backspace' && this.selected === 0) this.name = this.name.slice(0, -1)
    else if (event.code === 'Enter' && this.selected === 4) this.requestCommit()
    else if (event.code === 'Escape' && !this.firstLaunch) this.scene.start('Menu')
    else if (this.selected === 0 && event.key.length === 1 && /[a-zA-Z0-9 _-]/.test(event.key) && this.name.length < 18) this.name += event.key
```

- [ ] **Step 6: Renumber `change` (drop livery; weapons/difficulty shift down)**

Replace `:82-87`:

```ts
  private change(delta: number) {
    if (this.selected === 1) this.portrait = (this.portrait + delta + PORTRAITS.length) % PORTRAITS.length
    if (this.selected === 2) this.weapons = !this.weapons
    if (this.selected === 3) this.difficulty = (this.difficulty + delta + DIFFICULTIES.length) % DIFFICULTIES.length
  }
```

- [ ] **Step 7: Persist a fixed livery default**

Replace the `liveryColor` field in `commit()` (`:97`):

```ts
      driverName: this.name.trim(), liveryColor: LIVERIES[0], portraitId: PORTRAITS[this.portrait],
```

- [ ] **Step 8: Update `refresh` (drop car tint; oxide name; renumbered labels/values)**

Replace the body of `refresh()` (`:104-118`). Remove `this.car.setTint(...)`, colour the name with `hex(C.oxide)`, and drop the LIVERY label/value so the 5 rows line up:

```ts
  private refresh() {
    this.drawPortrait()
    this.nameText.setText(this.name || 'TYPE A NAME').setColor(hex(this.name ? C.oxide : C.textDisabled))
    const difficulty = DIFFICULTIES[this.difficulty]
    this.info.setText([
      `Portrait: ${PORTRAITS[this.portrait].toUpperCase()}`,
      `${STARTER_CAR.name} · $${STARTING_CASH} starting cash`,
      this.weapons ? 'Combat and black market enabled.' : 'Clean racing: weapons and black market disabled.',
      difficulty === 'street' ? 'Street: forgiving rival pace.' : difficulty === 'hard' ? 'Hard: faster, less forgiving rivals.' : 'Standard: intended career balance.',
      this.confirmOverwrite ? '\nOVERWRITE EXISTING CAREER? Enter/Y confirm · Esc/N cancel' : '',
    ].filter(Boolean).join('\n'))
    const labels = ['DRIVER NAME', 'PORTRAIT ID', 'WEAPONS', 'DIFFICULTY', 'START CAREER']
    const values = [this.name || 'TYPE…', PORTRAITS[this.portrait].toUpperCase(), this.weapons ? 'ENABLED' : 'DISABLED', difficulty.toUpperCase(), this.confirmOverwrite ? 'CONFIRM OVERWRITE?' : 'START CAREER']
    this.rows.forEach((row, i) => { row.label.setText(`${labels[i]}\n${values[i]}`); row.setState(i === this.selected, i !== 4 || !!this.name.trim()) })
  }
```

- [ ] **Step 9: De-livery `drawPortrait`**

The portrait accent used `LIVERIES[this.livery]`. Replace `:122` with a fixed oxide accent (numeric — `gfx.fillStyle`/`lineStyle` need a number):

```ts
    const color = C.oxide
```

(the rest of `drawPortrait` is unchanged.)

- [ ] **Step 10: Typecheck + build**

Run: `npm run build`
Expected: clean. No `this.livery` references remain; `LIVERIES` is still used (default) so no unused-var error; `hex`/`C` already imported.

- [ ] **Step 11: Browser-verify New Career**

Drive to Profile (clear the save or use New Career from Menu). Confirm: the starter shows the **hero render** (car-hero-jackal, fitted, upright — no rotation), there is **no LIVERY row** (5 rows: name/portrait/weapons/difficulty/start), ↑/↓ wraps across 5 rows, ←/→ still changes portrait/weapons/difficulty, and "START CAREER" creates a career that lands in Garage. Do NOT complete a race afterward.

- [ ] **Step 12: Commit**

```bash
git add src/game/scenes/NewCareerScene.ts
git commit -m "feat(newcareer): remove livery picker, show hero starter render"
```

---

### Task 4: SignUpScene — boss reveal uses the hero render

The pre-duel reveal should match Project A's hero-style pre-game screens.

**Files:**
- Modify: `src/game/scenes/SignUpScene.ts:156` (+ import `fitImage`)

**Interfaces:**
- Consumes: `car-hero-sovereign` (= `car-hero-${BOSS.id}`) from Task 1; `fitImage` from `../ui/widgets`.

- [ ] **Step 1: Ensure `fitImage` is imported**

Confirm the widgets import in `SignUpScene.ts` includes `fitImage`; add it if missing (check the existing `from '../ui/widgets'` line).

Run: `grep -n "from '../ui/widgets'" src/game/scenes/SignUpScene.ts`
Then edit that import to include `fitImage` if absent.

- [ ] **Step 2: Swap the boss reveal image**

Replace `:156`:

```ts
    const boss = this.add.image(cx, GAME_HEIGHT * 0.375, 'car-hero-sovereign')
    fitImage(boss, 340, 240)
```

(no `setScale(1.7)`, no `setAngle(-90)` — hero renders aren't rotated. The float tween at `:157` keeps targeting `boss` and is unchanged.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Browser-verify the reveal**

Reach SignUp (the duel path, or force the scene). Confirm the boss shows the armoured hero render, upright and fitted inside its panel, with the gentle float tween intact.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/SignUpScene.ts
git commit -m "feat(signup): boss reveal uses hero render"
```

---

### Task 5: Delete the procedural car pipeline

With all four consumers on real sprites, remove `paintCarTexture`, its `BootScene.create` paint loops, and now-dead imports. Grep proves zero procedural refs remain (avoids `__MISSING` green boxes).

**Files:**
- Delete: `src/game/textures/vehicleTextures.ts`
- Modify: `src/game/scenes/BootScene.ts` (imports `:1-5`, `create()` paint loops `:33-43`)

- [ ] **Step 1: Prove `paintCarTexture` has no remaining callers**

Run: `grep -rn "paintCarTexture\|vehicleTextures" src/`
Expected: only `src/game/textures/vehicleTextures.ts` (self) and `src/game/scenes/BootScene.ts` (the import + 3 paint calls being removed). If anything else appears, stop and swap it first.

- [ ] **Step 2: Remove the procedural paint loops from `BootScene.create`**

Delete `:33-43` (the `CAR_CATALOG` paint loop, the `ROSTER` × 3-variant loop, and the boss paint line). `create()` should keep the surface/FX paints and `this.scene.start('Menu')`. Result:

```ts
  create() {
    // asphalt, dirt, tire-wall, pole, pk-*, spark, and smoke now loaded as WebP
    // (LOADED_TEXTURES / LOADED_FX_TEXTURES); cars now load as top-down WebP.
    paintSkidStampTexture(this)
    paintMineTexture(this)
    paintRingTexture(this)
    paintScorchTexture(this)
    paintFlameConeTexture(this)
    paintEdgeFlashTexture(this)
    paintGlowTexture(this) // glow-soft: cat-eye reflectors + light pools, kept (separate from pole)
    paintChevronTexture(this)
    paintDebrisTexture(this)
    this.scene.start('Menu')
  }
```

- [ ] **Step 3: Remove now-dead imports from `BootScene`**

Delete the `paintCarTexture` import (`:5`) and the `CAR_CATALOG` (`:2`), `ROSTER` (`:3`), and `BOSS` (`:4`) imports — none are used elsewhere in `BootScene`. Keep the remaining texture-paint imports and `LOADED_*`.

- [ ] **Step 4: Delete the procedural painter file**

Run: `git rm src/game/textures/vehicleTextures.ts`

(`CarVariant` stays defined in `src/data/cars.ts` for `CarSpec.variant`; nothing else imported from this file per Step 1.)

- [ ] **Step 5: Final grep — zero procedural car refs**

Run: `grep -rn "car-\${" src/game && grep -rn "car-'" src/game`
Expected: no on-track `car-<id>` / `car-<id>-<variant>` refs remain (only `car-top-*` and `car-hero-*`). Any hit is a missed swap.

- [ ] **Step 6: Test + build + diff-check**

Run: `npm test && npm run build && git diff --check`
Expected: all tests PASS, build clean, no whitespace errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(art): delete procedural car pipeline (paintCarTexture + boot loops)"
```

---

### Task 6: Docs, memory, and final whole-branch review

Record the decision and close out. No code change beyond docs.

**Files:**
- Modify: `docs/DECISIONS.md` (add D-053)
- Modify: `docs/ART_INTEGRATION_STATUS.md` (§5 — mark Project B done)
- Modify: `/Users/at/.claude/projects/-Users-at-Projects-Deathrally/memory/visual-direction-sprite-pivot.md` + `MEMORY.md`

- [ ] **Step 1: Add decision D-053**

Append to `docs/DECISIONS.md` a `D-053` entry: in-race cars are now real top-down Iranian sprites keyed by chassis (`car-top-<id>` + `car-top-sovereign`); per-driver body tint dropped (rival identity carried by the standings colour list); boss reveal + New Career starter now use hero renders; `paintCarTexture` and the procedural pipeline deleted; `liveryColor` retained in the save with a fixed default (no schema change); 90° CW rotation baked at cutout (no code offset). Reference this plan and the spec `docs/superpowers/specs/2026-07-13-projectB-race-topdown-cars-design.md`.

- [ ] **Step 2: Update ART_INTEGRATION_STATUS §5**

In `docs/ART_INTEGRATION_STATUS.md` §5 ("The big one — CARS"), add an update note that Project B is complete: in-race cars are authored top-down WebP sprites, the tint model was resolved as "real sprite per chassis, no per-driver tint," and the procedural painter is removed. Supersede the tint-model options table for the in-race cars.

- [ ] **Step 3: Update memory**

Edit `memory/visual-direction-sprite-pivot.md`: Project B (top-down race sprites) is now DONE — both Project A (pre-game heroes) and Project B (in-race top-down) shipped; procedural cars fully removed. Update the `MEMORY.md` one-line pointer to reflect it.

- [ ] **Step 4: Verify gate**

Run: `npm test && npm run build && git diff --check`
Expected: all clean.

- [ ] **Step 5: Final whole-branch review**

Dispatch a whole-branch review (Opus) over the Project-B commits. Verify the hard constraints: `src/core` untouched (empty diff); no `setTint` for body colour anywhere on-track; wreck/hit-flash tints kept; no `CareerState` schema/migration change (`liveryColor` still written with a default; existing saves load); no source PNGs under `cars/` committed; `car-top-*` count == catalog + boss; zero stray procedural `car-<id>` refs; no car sprite rotated by a code offset (rotation baked at cutout). Address any Critical/Important findings; commit fixes.

- [ ] **Step 6: Commit docs**

```bash
git add docs/DECISIONS.md docs/ART_INTEGRATION_STATUS.md
git commit -m "docs: record Project B (in-race top-down car sprites) + close art integration"
```

- [ ] **Step 7: Report completion — do NOT merge**

Summarize commits + verify-gate results to the user. Per the standing rule, do NOT merge to `main` or push without explicit permission.

---

## Self-Review

**Spec coverage (against `…projectB-race-topdown-cars-design.md`):**

| Spec item | Task |
|---|---|
| B-1 real sprites by chassis, drop per-driver tint | Task 2 (steps 1-4) |
| B-2 delete procedural pipeline | Task 5 |
| B-3 remove livery picker, hero starter, keep `liveryColor` default | Task 3 |
| B-4 distinct boss car (top-down + hero) | Tasks 1, 2, 4 |
| B-5 keep wreck darkening + hit-flash | Task 2 (steps 2-4, kept) |
| §3 source→chassis mapping | Task 1 (cutout `TOP_JOBS` + `HERO_JOBS`) |
| §4 asset pipeline (rotate, despill, optimizer, registry, preload, no-commit) | Task 1 |
| §5a RaceScene swap + `CAR_SCALE` | Task 2 |
| §5b BootScene delete | Task 5 |
| §5c NewCareer | Task 3 |
| §5d SignUp boss reveal | Task 4 |
| §5e delete `paintCarTexture` | Task 5 |
| §7 rotation baked, verify in-browser, no code offset | Task 1 step 6 + Task 2 step 7 |
| §9 verification (tests/build/diff + browser) | every task's verify steps + Task 6 |
| §10 task slicing | Tasks 1-6 map 1:1 |

**Extra vs spec (justified):** Task 2 step 2 fixes `RaceScene.ts:790`, an additional per-frame player-livery re-tint the spec's §5a line list didn't enumerate but B-1 requires. Without it the player would re-tint after every hit.

**Placeholder scan:** none — all code steps carry full code; all commands have expected output.

**Type consistency:** `LOADED_TOP_TEXTURES` defined (Task 1) and consumed by name in Tasks 2/4 and the test. `fitImage(img, maxW, maxH)` matches `widgets.ts:298`. `C.oxide` is numeric (`0xe07a3c`) → used raw in `drawPortrait` graphics and via `hex()` for text colour. `LIVERIES[0]` = `0xf2a33c` preserves the current default. `BOSS.id === 'sovereign'` makes `car-top-${BOSS.id}`/`car-hero-${BOSS.id}` resolve to the registered keys.
