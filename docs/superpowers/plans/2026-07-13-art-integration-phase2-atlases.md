# Art Integration — Phase 2 (Atlases) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice the two authored atlas sheets into 20 individual WebP sprites and place them as seeded, non-colliding cosmetic dressing — flat decals on the track surface, furniture off the racing line.

**Architecture:** One pure, seeded geometry function (`scatterPointsAlong`) in `src/core` emits deterministic scattered poses. One thin Phaser helper (`scatterImages`) in `src/game/track` consumes poses to place randomized sprites. `RaceScene.buildWorld` calls both with a dedicated cosmetic RNG derived from the race seed (so it never disturbs the gameplay/pickup RNG stream). Assets flow through the existing optimizer → `loadedAssets.ts` → auto-loaded by `BootScene.preload()`.

**Tech Stack:** TypeScript (strict), Phaser 3, Vite, Vitest, `sharp` (asset optimizer).

## Global Constraints

- No Phaser imports in `src/core/` — core stays pure and serializable.
- All placement randomness is seeded and reproducible. Cosmetics use a **separate** RNG derived from `this.raceSeed` (`createSeededRandom(this.raceSeed ^ 0x9e3779b9)`) so they do **not** consume from `this.random` (which drives gameplay pickups/traps). Same seed → identical dressing every run.
- Furniture is **decoration only** — non-colliding, placed off the racing line. No core/gameplay changes, no collision.
- Depth bands (unchanged + new): markings 1.5 · cat-eye 1.6 · light pools 1.7 · **decals 1.8** · skid RT 2 · tyre walls + **furniture 3.0** · chevrons 3.1.
- Do not commit generated `dist/`, screenshots, or raw source PNGs (`Cars/output/generated/` is untracked). Only the small `public/assets/**/*.webp` outputs are committed.
- Verify gate before "done": `npm test`, `npm run build`, `git diff --check`, plus browser check.
- Authored art is original; do not copy reference material.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/track/geometry.ts` | + `scatterPointsAlong` — pure, seeded scattered poses along a closed polyline |
| `tests/core/track/geometry.test.ts` | + `scatterPointsAlong` unit tests (determinism, count/gap, lateral bound, angle) |
| `scripts/optimize-assets.mjs` | +20 slice rows (12 decals exact-grid, 8 furniture per-item), each `extract` + `trim` |
| `public/assets/decals/*.webp`, `public/assets/furniture/*.webp` | 20 generated, committed sprites |
| `src/game/textures/loadedAssets.ts` | +20 texture keys |
| `src/game/track/placement.ts` | + `scatterImages` — thin Phaser helper placing randomized sprites from poses |
| `src/game/scenes/RaceScene.ts` | `buildWorld` wires decals + furniture via a cosmetic RNG |

---

### Task 1: Pure geometry — `scatterPointsAlong`

Deterministic scattered poses along a closed polyline. Same seeded RNG + args → identical output. This is the pure, testable core of all Phase 2 placement.

**Files:**
- Modify: `src/core/track/geometry.ts` (add a private `sampleAtArcLength` + exported `scatterPointsAlong`, after `spacedPosesAlong` which ends at line 134)
- Test: `tests/core/track/geometry.test.ts` (add a `describe('scatterPointsAlong', …)` block)

**Interfaces:**
- Consumes: existing `Vec2`, `Pose`, `closedPolylineLength` from `geometry.ts`.
- Produces: `export function scatterPointsAlong(points: Vec2[], count: number, rng: () => number, opts: { halfWidth: number; lateralFrac: number; minGap: number }): Pose[]`

- [ ] **Step 1: Write the failing test**

Add to `tests/core/track/geometry.test.ts`. Add `scatterPointsAlong` and `distanceToClosedPolyline` to the existing import from `'../../../src/core/track/geometry'`, and add this import at the top of the file:

```ts
import { createSeededRandom } from '../../../src/core/race/random'
```

Then add:

```ts
describe('scatterPointsAlong', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ] // total arc length = 400

  // deterministic scripted RNG for exact-position assertions
  const scripted = (seq: number[]) => {
    let i = 0
    return () => seq[i++ % seq.length]
  }

  it('places a pose at the seeded arc distance on the +x edge', () => {
    // first rng() -> arc distance (0.1 * 400 = 40 on the +x edge); second -> lateral (unused, lateralFrac 0)
    const poses = scatterPointsAlong(square, 1, scripted([0.1, 0.5]), {
      halfWidth: 20,
      lateralFrac: 0,
      minGap: 0,
    })
    expect(poses.length).toBe(1)
    expect(poses[0].x).toBeCloseTo(40)
    expect(poses[0].y).toBeCloseTo(0)
    expect(poses[0].angle).toBeCloseTo(0)
  })

  it('carries the +y edge tangent angle', () => {
    // 0.375 * 400 = 150 -> 50px up the +y edge from (100,0)
    const poses = scatterPointsAlong(square, 1, scripted([0.375, 0.5]), {
      halfWidth: 20,
      lateralFrac: 0,
      minGap: 0,
    })
    expect(poses[0].x).toBeCloseTo(100)
    expect(poses[0].y).toBeCloseTo(50)
    expect(poses[0].angle).toBeCloseTo(Math.PI / 2)
  })

  it('is deterministic for the same seed', () => {
    const opts = { halfWidth: 20, lateralFrac: 0.5, minGap: 10 }
    const a = scatterPointsAlong(square, 5, createSeededRandom(42), opts)
    const b = scatterPointsAlong(square, 5, createSeededRandom(42), opts)
    expect(a).toEqual(b)
  })

  it('honours count when no gap constraint applies', () => {
    const poses = scatterPointsAlong(square, 10, createSeededRandom(1), {
      halfWidth: 0,
      lateralFrac: 0,
      minGap: 0,
    })
    expect(poses.length).toBe(10)
  })

  it('respects minGap (cannot fit 3 points 150 apart on a 400 loop)', () => {
    const poses = scatterPointsAlong(square, 10, createSeededRandom(7), {
      halfWidth: 0,
      lateralFrac: 0,
      minGap: 150,
    })
    expect(poses.length).toBeLessThanOrEqual(2)
  })

  it('keeps every pose within lateralFrac·halfWidth of the centerline', () => {
    const poses = scatterPointsAlong(square, 8, createSeededRandom(3), {
      halfWidth: 20,
      lateralFrac: 0.5, // max lateral offset = 10
      minGap: 5,
    })
    for (const p of poses) {
      expect(distanceToClosedPolyline(p, square)).toBeLessThanOrEqual(10 + 1e-9)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/track/geometry.test.ts -t scatterPointsAlong`
Expected: FAIL — `scatterPointsAlong is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Add to `src/core/track/geometry.ts` immediately after `spacedPosesAlong` (after line 134):

```ts
/** Position + tangent angle at an arc distance along a closed polyline. */
function sampleAtArcLength(points: Vec2[], dist: number): Pose {
  const n = points.length
  let d = dist
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    if (d <= segLen || i === n - 1) {
      const t = segLen === 0 ? 0 : d / segLen
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      }
    }
    d -= segLen
  }
  const a = points[0]
  const b = points[1 % n]
  return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

/**
 * Deterministically pick `count` scattered poses along a closed polyline.
 * Each pose sits at a seeded arc position with a lateral offset up to
 * ±lateralFrac·halfWidth from the centerline, carrying the local tangent angle.
 * Consecutive picks are at least `minGap` apart in arc length (wrap-aware).
 * Determinism comes entirely from `rng`. May return fewer than `count` if the
 * gap constraint can't be satisfied (attempts are capped so it never hangs).
 */
export function scatterPointsAlong(
  points: Vec2[],
  count: number,
  rng: () => number,
  opts: { halfWidth: number; lateralFrac: number; minGap: number },
): Pose[] {
  const total = closedPolylineLength(points)
  if (total === 0 || count <= 0) return []
  const chosen: number[] = []
  const maxAttempts = count * 20
  for (let attempt = 0; attempt < maxAttempts && chosen.length < count; attempt++) {
    const d = rng() * total
    const tooClose = chosen.some((c) => {
      const raw = Math.abs(c - d)
      return Math.min(raw, total - raw) < opts.minGap
    })
    if (!tooClose) chosen.push(d)
  }
  return chosen.map((d) => {
    const pose = sampleAtArcLength(points, d)
    const nx = -Math.sin(pose.angle)
    const ny = Math.cos(pose.angle)
    const lateral = (rng() * 2 - 1) * opts.lateralFrac * opts.halfWidth
    return { x: pose.x + nx * lateral, y: pose.y + ny * lateral, angle: pose.angle }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/track/geometry.test.ts -t scatterPointsAlong`
Expected: PASS (6 tests).

- [ ] **Step 5: Run full suite + build**

Run: `npm test && npm run build`
Expected: all tests green (257+), `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/track/geometry.ts tests/core/track/geometry.test.ts
git commit -m "Add scatterPointsAlong seeded geometry helper"
```

---

### Task 2: Slice + register the 12 decals (exact grid)

The decal sheet is a clean 3×4 grid (cell 512×256). Each cell → `extract` → `trim` (alpha crop) → resize → one small WebP. The optimizer already supports `extract` and `trim`, so this is data-only.

**Files:**
- Modify: `scripts/optimize-assets.mjs` (append 12 rows to `JOBS`)
- Modify: `src/game/textures/loadedAssets.ts` (append 12 keys to `LOADED_TEXTURES`)
- Create (generated, committed): `public/assets/decals/{oil,skid,crack,patch}-{0,1,2}.webp`

**Interfaces:**
- Produces: texture keys `oil-0..2`, `skid-0..2`, `crack-0..2`, `patch-0..2` available after boot.

- [ ] **Step 1: Add the 12 decal JOBS rows**

In `scripts/optimize-assets.mjs`, append to the `JOBS` array (before the closing `]`). Cells: `left = col*512`, `top = row*256`, size `512×256`; rows are oil(0) / skid(1) / crack(2) / patch(3):

```js
  // --- Phase 2 decals (track_surface_decal_set.png, 1536x1024, 3 cols x 4 rows, cell 512x256) ---
  { src: 'track_surface_decal_set.png', out: 'decals/oil-0.webp',   w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 0,   width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/oil-1.webp',   w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 0,   width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/oil-2.webp',   w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 0,   width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/skid-0.webp',  w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 256, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/skid-1.webp',  w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 256, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/skid-2.webp',  w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 256, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/crack-0.webp', w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 512, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/crack-1.webp', w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 512, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/crack-2.webp', w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 512, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/patch-0.webp', w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 768, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/patch-1.webp', w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 768, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/patch-2.webp', w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 768, width: 512, height: 256 }, trim: true },
```

- [ ] **Step 2: Run the optimizer**

Run: `npm run assets`
Expected: prints `wrote public/assets/decals/oil-0.webp` … `patch-2.webp`, then `done: N assets`.

- [ ] **Step 3: Verify the 12 files exist and are small**

Run: `ls -la public/assets/decals/`
Expected: 12 files, each well under 100 KB.

- [ ] **Step 4: Eyeball the slices**

Open a few (`public/assets/decals/oil-0.webp`, `skid-1.webp`, `crack-2.webp`, `patch-0.webp`). Each should be a single, tightly-cropped decal with a transparent background — no neighbour bleeding in, not over-trimmed. (These use the exact grid so they should be clean; if any is clipped, the sheet isn't a perfect grid — widen that cell and re-run.)

- [ ] **Step 5: Register the 12 decal keys**

In `src/game/textures/loadedAssets.ts`, append to `LOADED_TEXTURES` (after the Phase 1 marking keys, before the closing `]`):

```ts
  { key: 'oil-0', url: 'assets/decals/oil-0.webp' },
  { key: 'oil-1', url: 'assets/decals/oil-1.webp' },
  { key: 'oil-2', url: 'assets/decals/oil-2.webp' },
  { key: 'skid-0', url: 'assets/decals/skid-0.webp' },
  { key: 'skid-1', url: 'assets/decals/skid-1.webp' },
  { key: 'skid-2', url: 'assets/decals/skid-2.webp' },
  { key: 'crack-0', url: 'assets/decals/crack-0.webp' },
  { key: 'crack-1', url: 'assets/decals/crack-1.webp' },
  { key: 'crack-2', url: 'assets/decals/crack-2.webp' },
  { key: 'patch-0', url: 'assets/decals/patch-0.webp' },
  { key: 'patch-1', url: 'assets/decals/patch-1.webp' },
  { key: 'patch-2', url: 'assets/decals/patch-2.webp' },
```

- [ ] **Step 6: Build to confirm wiring**

Run: `npm run build`
Expected: `tsc` clean; Vite copies `public/` assets.

- [ ] **Step 7: Commit**

```bash
git add scripts/optimize-assets.mjs src/game/textures/loadedAssets.ts public/assets/decals/
git commit -m "Slice and register the 12 surface decal sprites"
```

---

### Task 3: Slice + register the 8 furniture props (per-item)

The furniture sheet is row-banded (not a uniform grid), so each item gets an approximate `extract` rect that isolates it; `trim` then crops to its alpha bounds. The rects below are **starting estimates** — verify visually in Step 4 and adjust.

**Files:**
- Modify: `scripts/optimize-assets.mjs` (append 8 rows to `JOBS`)
- Modify: `src/game/textures/loadedAssets.ts` (append 8 keys)
- Create (generated, committed): `public/assets/furniture/{cone-0,cone-1,barricade-0,barricade-1,tyre-0,tyre-1,sandbag-0,sandbag-1}.webp`

**Interfaces:**
- Produces: texture keys `cone-0/1`, `barricade-0/1`, `tyre-0/1`, `sandbag-0/1`.

- [ ] **Step 1: Add the 8 furniture JOBS rows**

In `scripts/optimize-assets.mjs`, append to `JOBS` (sheet is 1536×1024; bands: cones top, barricades middle, tyres/sandbags bottom):

```js
  // --- Phase 2 furniture (track_furniture_set.png, 1536x1024; per-item rects + trim) ---
  { src: 'track_furniture_set.png', out: 'furniture/cone-0.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 300,  top: 70,  width: 260, height: 220 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/cone-1.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 1020, top: 70,  width: 260, height: 220 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/barricade-0.webp', w: 200, fit: 'inside', q: 85, extract: { left: 330,  top: 340, width: 440, height: 250 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/barricade-1.webp', w: 200, fit: 'inside', q: 85, extract: { left: 810,  top: 340, width: 440, height: 250 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/tyre-0.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 270,  top: 620, width: 250, height: 290 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/tyre-1.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 520,  top: 620, width: 250, height: 290 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/sandbag-0.webp',   w: 160, fit: 'inside', q: 85, extract: { left: 780,  top: 630, width: 240, height: 270 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/sandbag-1.webp',   w: 160, fit: 'inside', q: 85, extract: { left: 1020, top: 630, width: 250, height: 270 }, trim: true },
```

- [ ] **Step 2: Run the optimizer**

Run: `npm run assets`
Expected: prints `wrote public/assets/furniture/cone-0.webp` … `sandbag-1.webp`.

- [ ] **Step 3: Verify the 8 files exist**

Run: `ls -la public/assets/furniture/`
Expected: 8 files, each well under 100 KB.

- [ ] **Step 4: Eyeball each slice and re-tune rects**

Open all 8 (`public/assets/furniture/*.webp`). Each must contain exactly one prop, tightly cropped, transparent background:
- `cone-0/1` → one traffic cone each (pick two visibly-distinct cones from the 4 if possible).
- `barricade-0` → the orange-striped A-frame; `barricade-1` → the yellow-striped one.
- `tyre-0/1` → one tyre stack each; `sandbag-0/1` → one sandbag pile each.

If an item is clipped or a neighbour intrudes, adjust that row's `extract` `{left, top, width, height}` in `optimize-assets.mjs` and re-run `npm run assets`. Repeat until all 8 are clean. (Reference: the full sheet is `Cars/output/generated/track_furniture_set.png` — open it to read approximate pixel coordinates.)

- [ ] **Step 5: Register the 8 furniture keys**

In `src/game/textures/loadedAssets.ts`, append to `LOADED_TEXTURES`:

```ts
  { key: 'cone-0', url: 'assets/furniture/cone-0.webp' },
  { key: 'cone-1', url: 'assets/furniture/cone-1.webp' },
  { key: 'barricade-0', url: 'assets/furniture/barricade-0.webp' },
  { key: 'barricade-1', url: 'assets/furniture/barricade-1.webp' },
  { key: 'tyre-0', url: 'assets/furniture/tyre-0.webp' },
  { key: 'tyre-1', url: 'assets/furniture/tyre-1.webp' },
  { key: 'sandbag-0', url: 'assets/furniture/sandbag-0.webp' },
  { key: 'sandbag-1', url: 'assets/furniture/sandbag-1.webp' },
```

- [ ] **Step 6: Build to confirm wiring**

Run: `npm run build`
Expected: `tsc` clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add scripts/optimize-assets.mjs src/game/textures/loadedAssets.ts public/assets/furniture/
git commit -m "Slice and register the 8 track furniture sprites"
```

---

### Task 4: `scatterImages` helper + wire decals into the track

Add the thin Phaser helper that turns poses into randomized sprites, then use it for its first consumer — surface decals. Introduces the cosmetic RNG.

**Files:**
- Modify: `src/game/track/placement.ts` (add `scatterImages`; add `Pose` to the geometry import)
- Modify: `src/game/scenes/RaceScene.ts` (import `scatterPointsAlong` + `scatterImages`; add `scatterDecals`; call it from `buildWorld`)
- Verify: browser (Phaser-bound; pure math already covered in Task 1)

**Interfaces:**
- Consumes: `Pose` from `geometry.ts`; `scatterPointsAlong` (Task 1); decal keys (Task 2).
- Produces: `export function scatterImages(scene: Phaser.Scene, poses: Pose[], keys: string[], rng: () => number, opts: { depth: number; minScale: number; maxScale: number; jitter?: number; alpha?: number }): Phaser.GameObjects.Image[]`

- [ ] **Step 1: Add the `scatterImages` helper**

In `src/game/track/placement.ts`, change the import line to include `Pose`:

```ts
import { spacedPosesAlong, type Pose, type Vec2 } from '../../core/track/geometry'
```

Then append:

```ts
/**
 * Place a randomized sprite at each pose. For every pose the same seeded `rng`
 * picks a key from `keys`, a scale in [minScale, maxScale], and (if `jitter`)
 * a small rotation offset around the pose's tangent angle. Returns the images.
 */
export function scatterImages(
  scene: Phaser.Scene,
  poses: Pose[],
  keys: string[],
  rng: () => number,
  opts: { depth: number; minScale: number; maxScale: number; jitter?: number; alpha?: number },
): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = []
  for (const pose of poses) {
    const key = keys[Math.floor(rng() * keys.length)]
    const scale = opts.minScale + rng() * (opts.maxScale - opts.minScale)
    const rot = pose.angle + (opts.jitter ? (rng() * 2 - 1) * opts.jitter : 0)
    images.push(
      scene.add
        .image(pose.x, pose.y, key)
        .setRotation(rot)
        .setScale(scale)
        .setDepth(opts.depth)
        .setAlpha(opts.alpha ?? 1),
    )
  }
  return images
}
```

- [ ] **Step 2: Import the new geometry + helper in RaceScene**

In `src/game/scenes/RaceScene.ts`, add `scatterPointsAlong` to the existing `'../../core/track/geometry'` import list, and add the placement import next to the existing `placeSpritesAlong` import (line 30):

```ts
import { placeSpritesAlong, scatterImages } from '../track/placement'
```

- [ ] **Step 3: Add the cosmetic RNG + `scatterDecals`, and call it**

In `RaceScene.ts`, at the end of `buildWorld` change the last line from:

```ts
    this.dressTrackForNight(halfW, shoulderHalf)
  }
```

to:

```ts
    this.dressTrackForNight(halfW, shoulderHalf)

    // cosmetic dressing uses its own seeded RNG so it never disturbs the
    // gameplay (pickup/trap) RNG stream, while staying reproducible per seed
    const decorRng = createSeededRandom(this.raceSeed ^ 0x9e3779b9)
    this.scatterDecals(halfW, decorRng)
  }

  /** Seeded flat decals (oil, skid, crack, patch) scattered on the track surface. */
  private scatterDecals(halfW: number, rng: () => number) {
    const keys = [
      'oil-0', 'oil-1', 'oil-2',
      'skid-0', 'skid-1', 'skid-2',
      'crack-0', 'crack-1', 'crack-2',
      'patch-0', 'patch-1', 'patch-2',
    ]
    const poses = scatterPointsAlong(this.centerline, 10, rng, {
      halfWidth: halfW,
      lateralFrac: 0.7,
      minGap: 220,
    })
    scatterImages(this, poses, keys, rng, {
      depth: 1.8,
      minScale: 0.35,
      maxScale: 0.55,
      jitter: Math.PI,
      alpha: 0.85,
    })
  }
```

(`createSeededRandom` is already imported at `RaceScene.ts:102`; `this.raceSeed` is set at line 322.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `tsc` clean.

- [ ] **Step 5: Browser verify (decals)**

Run: `npm run dev`, then Continue Career → RACE → any tier. Confirm:
- Oil stains / skid marks / cracks / patches are scattered on the tarmac, following the surface (not floating off-track).
- Live skid marks (drive hard into a corner) render **over** the decals (skid RT depth 2 > decal 1.8).
- Dressing is sparse and readable — cars and pickups still stand out. If too busy, lower the `10` count or `alpha`; if too sparse, raise the count. Keep values that look right.
- Re-race the **same** offer (same seed) → identical decal layout.
- Pickups still spawn in the same spots as before this task (decal RNG is separate — confirm nothing about pickups changed).

- [ ] **Step 6: Commit**

```bash
git add src/game/track/placement.ts src/game/scenes/RaceScene.ts
git commit -m "Add scatterImages helper; scatter seeded surface decals"
```

---

### Task 5: Wire furniture (off-shoulder dressing + start/finish cluster)

Place tyre stacks + sandbags on the dirt beyond the shoulder, and a cone/barricade cluster near the start gate. Reuses `scatterImages` and the cosmetic RNG from Task 4.

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` (add `placeFurniture`; call it from `buildWorld`; add `offsetClosedPolyline` usage — already imported)
- Verify: browser + full verify gate

**Interfaces:**
- Consumes: `scatterPointsAlong`, `scatterImages`, `offsetClosedPolyline` (all imported), furniture keys (Task 3), `this.gates[0]`, cosmetic RNG (Task 4).

- [ ] **Step 1: Call `placeFurniture` from `buildWorld`**

In `RaceScene.ts` `buildWorld`, extend the cosmetic block added in Task 4 so it reads:

```ts
    const decorRng = createSeededRandom(this.raceSeed ^ 0x9e3779b9)
    this.scatterDecals(halfW, decorRng)
    this.placeFurniture(shoulderHalf, decorRng)
  }
```

- [ ] **Step 2: Add the `placeFurniture` method**

In `RaceScene.ts`, add immediately after `scatterDecals` (from Task 4):

```ts
  /** Seeded non-colliding furniture: boundary props + a start-line cluster. */
  private placeFurniture(shoulderHalf: number, rng: () => number) {
    // tyre stacks + sandbags on the dirt just beyond the shoulder, both sides
    const boundaryKeys = ['tyre-0', 'tyre-1', 'sandbag-0', 'sandbag-1']
    for (const side of [1, -1]) {
      const line = offsetClosedPolyline(this.centerline, side * (shoulderHalf + 70))
      const poses = scatterPointsAlong(line, 4, rng, {
        halfWidth: 0,
        lateralFrac: 0,
        minGap: 400,
      })
      scatterImages(this, poses, boundaryKeys, rng, {
        depth: 3,
        minScale: 0.45,
        maxScale: 0.6,
        jitter: 0.4,
      })
    }

    // start/finish cluster on the shoulder: a short row of cones + one barricade
    const gate = this.gates[0]
    const t = gate.tangent
    const angle = Math.atan2(t.y, t.x)
    const nx = -t.y // left normal
    const ny = t.x
    const sideOff = shoulderHalf - 10
    const cones: Pose[] = []
    for (let i = 0; i < 4; i++) {
      const back = 40 + i * 55 // stepped back from the gate along -travel
      cones.push({
        x: gate.center.x - t.x * back + nx * sideOff,
        y: gate.center.y - t.y * back + ny * sideOff,
        angle,
      })
    }
    scatterImages(this, cones, ['cone-0', 'cone-1'], rng, {
      depth: 3,
      minScale: 0.45,
      maxScale: 0.5,
    })
    const barricade: Pose = {
      x: gate.center.x - t.x * 20 + nx * (sideOff + 20),
      y: gate.center.y - t.y * 20 + ny * (sideOff + 20),
      angle,
    }
    scatterImages(this, [barricade], ['barricade-0', 'barricade-1'], rng, {
      depth: 3,
      minScale: 0.5,
      maxScale: 0.5,
    })
  }
```

- [ ] **Step 3: Import `Pose` in RaceScene**

`placeFurniture` types `cones`/`barricade` as `Pose`, so add `Pose` to the existing `'../../core/track/geometry'` import in `RaceScene.ts` (a type-only member is fine).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `tsc` clean (no unused imports; `Pose`, `scatterImages`, `scatterPointsAlong` all used).

- [ ] **Step 5: Browser verify (furniture)**

Run: `npm run dev` → Continue Career → RACE. Confirm:
- Tyre stacks / sandbags sit on the dirt just **beyond** the shoulder (off the racing surface), not on the tarmac.
- A short row of cones plus one barricade reads as pit-lane dressing near the start/finish line, on the shoulder — upright and facing like the existing chevron signs (not lying flat).
- Nothing blocks the racing line; cars never collide with furniture (it's decoration).
- Sparse and tasteful; framerate unaffected. Tune counts (`4` per side, `4` cones), `minGap`, offsets, and scales if needed; keep what looks right.
- `?gates=1` still aligns the start/finish sprite with gate 0.
- Re-race the same offer → identical furniture layout.

- [ ] **Step 6: Full verify gate**

Run: `npm test && npm run build && git diff --check`
Expected: tests green (257+), build clean, no whitespace errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "Place seeded off-shoulder furniture and start-line cluster"
```

---

## Self-Review

**Spec coverage (§ of the design):**
- §3.1 decal grid slicing → Task 2 ✓ · §3.2 furniture per-item slicing → Task 3 ✓
- §4 `scatterPointsAlong` (pure, seeded) + §4.1 tests → Task 1 ✓
- §5.1 decals on surface (depth 1.8) → Task 4 ✓
- §5.2 off-shoulder furniture (depth 3) → Task 5 ✓ · §5.3 start/finish cluster → Task 5 ✓
- §5.4 depth ordering → decals 1.8 (Task 4), furniture 3.0 (Task 5) ✓
- §6 files touched — all appear in a task ✓
- §7 verification (test/build/diff + browser incl. skid-over-decals, seed determinism, `?gates=1`) → Tasks 4–5 ✓
- §8 risks (slice tuning, barricade perspective, visual clutter, determinism, perf) → Task 3 Step 4, Task 4/5 browser steps ✓

**Determinism guard:** cosmetic placement uses `createSeededRandom(this.raceSeed ^ 0x9e3779b9)` — a separate stream from `this.random`, so gameplay pickup/trap positions are unchanged (verified in Task 4 Step 5). All cosmetic randomness is reproducible per seed.

**Placeholder scan:** No TBDs. Furniture `extract` rects are explicit starting values with a visual re-tune loop (Task 3 Step 4) — appropriate for irregular art, not a placeholder.

**Type consistency:** `Pose { x, y, angle }` (existing) and `scatterPointsAlong(points, count, rng, {halfWidth, lateralFrac, minGap})` defined in Task 1, consumed unchanged in Tasks 4–5. `scatterImages(scene, poses, keys, rng, {depth, minScale, maxScale, jitter?, alpha?})` defined in Task 4, matches its Task 4–5 call sites. Texture keys registered in Tasks 2–3 match the key arrays used in Tasks 4–5 (`oil/skid/crack/patch-0..2`, `cone/barricade/tyre/sandbag`). `this.raceSeed`, `this.centerline`, `this.gates`, `createSeededRandom`, `offsetClosedPolyline` all exist in `RaceScene.ts` today.

**Note for the implementer:** Task 1 is unit-tested (pure core). Tasks 4–5 are Phaser presentation, browser-verified per repo convention (`src/game` is not unit-tested); the numeric tuning values (counts, scales, offsets, minGap) are starting points — adjust during browser verify and keep the values that look right.
