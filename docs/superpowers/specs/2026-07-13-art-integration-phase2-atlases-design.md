# Art Integration — Phase 2 (Atlases) Design & Spec

**Date:** 2026-07-13
**Branch:** `milestones-13-15-ai-and-fixes`
**Predecessor:** `docs/superpowers/specs/2026-07-12-art-integration-design.md` (§3 roadmap, Phase 2 row) and the shipped Phase 1 markings pass.

---

## 1. Goal

Slice the two authored atlas sheets — `track_surface_decal_set.png` (12 flat decals) and
`track_furniture_set.png` (8 props) — into individual WebP sprites and place them as **cosmetic,
non-colliding** track dressing, seeded from the race offer so every track looks identical each run.

**In scope:** slice 20 items, wire them through the existing pipeline, place decals on the track
surface and furniture off the racing line (shoulders + a start/finish cluster).

**Out of scope:** any collision or gameplay effect (furniture is decoration only); the FX and car
phases (Phase 3 / Phase 4); the deferred 4d content (concrete surface, jersey barriers, wreck props).

## 2. The swap seam (unchanged)

Same three-move pipeline as every prior asset. Phase 2 adds no new runtime loader path and — because
the optimizer already supports `extract` (crop) and `trim` (alpha-crop) — **no new optimizer code**.
Slicing is expressed purely as data (one JOBS row per item):

```
Cars/output/generated/track_{surface_decal,furniture}_set.png   (raw sheet, local, untracked)
        │  scripts/optimize-assets.mjs   (sharp: extract cell → trim alpha → resize → WebP)
        ▼
public/assets/{decals,furniture}/*.webp   (20 small committed sprites)
        │  src/game/textures/loadedAssets.ts   (key → url map)
        ▼
BootScene.preload()  loops LOADED_TEXTURES → load.image(key, url)   ← auto-loaded, no code change
        ▼
RaceScene.buildTrack()  places sprites by key, seeded from this.random
```

## 3. Source sheets

Both sheets are **1536×1024**, RGBA, items on transparent background.

### 3.1 Decal set — clean 3×4 grid (cell 512×256)

| Row (top→bottom) | Col 0 | Col 1 | Col 2 |
|---|---|---|---|
| 0 | `oil-0` | `oil-1` | `oil-2` |
| 1 | `skid-0` | `skid-1` | `skid-2` |
| 2 | `crack-0` | `crack-1` | `crack-2` |
| 3 | `patch-0` | `patch-1` | `patch-2` |

Cell for (row `r`, col `c`) = `extract { left: c*512, top: r*256, width: 512, height: 256 }`, then `trim`.
These rects are exact (uniform grid); no eyeball tuning needed.

### 3.2 Furniture set — row-banded (irregular)

| Band | Items | Keys |
|---|---|---|
| Top (~y 40–280) | 4 near-identical traffic cones | `cone-0`, `cone-1` (slice 2 of the 4 for variety) |
| Middle (~y 340–580) | 2 striped A-frame barricades (orange, yellow) | `barricade-0`, `barricade-1` |
| Bottom (~y 620–920) | 2 tyre stacks + 2 sandbag piles | `tyre-0`, `tyre-1`, `sandbag-0`, `sandbag-1` |

Furniture cells are **per-item bands**, not a uniform grid. Each JOBS row gives an approximate
`extract` rectangle that fully contains one item without overlapping its neighbours; `trim` then
crops to the item's alpha bounds. The exact `left/top/width/height` per item are tuned by eye during
implementation (the `trim` makes them forgiving — the rect only has to isolate the right item). All 8
are sliced; placement uses a sparse subset.

## 4. New pure geometry — `scatterPointsAlong`

Placement randomness must be **seeded and deterministic** (race-offer seed → identical dressing every
run), so the position logic lives in pure core and is unit-tested. Mirrors Phase 1's `spacedPosesAlong`.

Add to `src/core/track/geometry.ts` (near `spacedPosesAlong`):

```ts
/**
 * Deterministically pick `count` scattered poses along a closed polyline.
 * Each pose sits at a seeded arc position with a lateral offset up to
 * ±lateralFrac·halfWidth from the centerline, carrying the local tangent angle.
 * Consecutive picks are at least `minGap` apart in arc length. Determinism comes
 * entirely from `rng` — same rng sequence + same args → same output.
 */
export function scatterPointsAlong(
  points: Vec2[],
  count: number,
  rng: () => number,
  opts: { halfWidth: number; lateralFrac: number; minGap: number },
): Pose[]
```

- Reuses the existing arc-length machinery (`spacedPointsAlong` / segment walk) to convert a seeded
  arc distance into an `(x, y)` on the centerline, then offsets laterally along the segment normal by
  `(rng()*2 - 1) * lateralFrac * halfWidth`.
- `angle` = local tangent (`Math.atan2(dy, dx)`), same convention as `Pose` from Phase 1.
- Enforces `minGap` by rejecting a pick too close (in arc length) to an already-accepted one; caps
  attempts so a too-dense request can't loop forever (returns fewer than `count` rather than hanging).

The Phaser layer consumes the returned poses and pulls **sprite key, extra rotation jitter, and scale**
from the *same* `this.random` afterwards, so the whole placement is one deterministic seeded sequence.

### 4.1 Test (pure, deterministic)

`tests/core/track/geometry.test.ts` — add a `describe('scatterPointsAlong', …)`:

- **Determinism:** two calls with fresh RNGs seeded identically (via `createSeededRandom(seed)` from
  `src/core/race/random.ts`, as used in `tests/core/race/random.test.ts`) return identical pose arrays.
- **Count & gap:** with a generous `minGap` the result honours `count` (or fewer) and no two consecutive
  poses are closer than `minGap`.
- **Lateral bound:** every pose is within `lateralFrac·halfWidth` of the nearest centerline point.
- **Angle:** on an axis-aligned square fixture, a pose on the +x edge has `angle ≈ 0`, on the +y edge
  `≈ π/2` (same fixture style as the `spacedPosesAlong` test).

## 5. Placement rules (sparse / tasteful)

All placement lives in `src/game/track/placement.ts` (extended) + `RaceScene.buildTrack`, consuming
`this.random` (seeded). Counts below are starting values, tuned during browser verify.

### 5.1 Decals — on the track surface

```
poses = scatterPointsAlong(centerline, ~10, this.random,
                           { halfWidth: halfW, lateralFrac: 0.7, minGap: 220 })
for each pose:
  key   = seeded pick from the 12 decal keys
  img   = add.image(pose.x, pose.y, key)
          .setRotation(pose.angle + jitter)          // small seeded rotation jitter
          .setScale(seeded 0.35–0.55)
          .setDepth(1.8)
          .setAlpha(0.85)
```

Depth **1.8**: above markings (1.5) and light pools (1.7), below the dynamic skid RenderTexture (2) so
live skid trails render *over* decals. No blend mode (decals are opaque-ish surface art).

### 5.2 Furniture — off the shoulder (boundary dressing)

Tyre stacks + sandbags on the dirt just beyond the shoulder, both sides, sparse:

```
for side in [1, -1]:
  line  = offsetClosedPolyline(centerline, side * (shoulderHalf + margin))   // margin ≈ 60–90
  poses = scatterPointsAlong(line, ~4 per side, this.random,
                             { halfWidth: 0, lateralFrac: 0, minGap: 400 })  // on the line itself
  for each pose:
    key = seeded pick from [tyre-0, tyre-1, sandbag-0, sandbag-1]
    add.image(pose.x, pose.y, key)
        .setRotation(pose.angle + seeded jitter)
        .setScale(seeded ~0.5)
        .setDepth(3.0)
```

`lateralFrac: 0` keeps them on the offset boundary line (they're already off-track via the offset);
`minGap` spreads them out. Depth **3.0** = prop band (with tyre walls).

### 5.3 Furniture — start/finish cluster (pit-lane feel)

A small fixed cluster near gate 0, on the shoulder, seeded for minor variation:

```
gate = gates[0]
place ~4 cones stepped back from the gate along -tangent, offset onto the shoulder on one side,
  each add.image(...).setRotation(gate tangent).setScale(~0.5).setDepth(3.0)
place 1 barricade near the gate edge, same depth
```

Cones/barricades are treated exactly like the existing chevron signs: upright, front-facing props at
prop depth — the established convention for face-on billboard art on this top-down camera.

### 5.4 Depth ordering (extends the Phase 1 band)

```
0    dirt        0.5  shoulder     1  asphalt      1.5 markings
1.6  cat-eye     1.7  light pools  1.8 DECALS ← new (below skid RT)
2    skid RT     3    tyre walls + FURNITURE ← new    3.1 chevrons
```

## 6. Files touched

| File | Change |
|---|---|
| `scripts/optimize-assets.mjs` | +20 slice rows (extract cell + `trim`), grouped by sheet |
| `public/assets/decals/*.webp` | +12 committed decal sprites (via `npm run assets`) |
| `public/assets/furniture/*.webp` | +8 committed furniture sprites |
| `src/game/textures/loadedAssets.ts` | +20 texture keys |
| `src/core/track/geometry.ts` | add `scatterPointsAlong` (pure, seeded) |
| `tests/core/track/geometry.test.ts` | add `scatterPointsAlong` describe block |
| `src/game/track/placement.ts` | add decal-scatter + furniture-placement helpers |
| `src/game/scenes/RaceScene.ts` | call placement in `buildTrack` (seeded, correct depths) |

## 7. Verification

1. `npm test` — new `scatterPointsAlong` tests green; full suite (251+) still passes (no rule changes).
2. `npm run build` — strict TS + prod build clean.
3. `git diff --check` — whitespace.
4. **Slice check:** open the generated `public/assets/{decals,furniture}/*.webp` — each is a single,
   tightly-cropped item (no neighbours bleeding in, no over-trim). Re-tune furniture `extract` rects if
   an item is clipped or a neighbour intrudes.
5. **Browser:** `npm run dev` → Continue Career → RACE →
   - decals scattered on the surface, following the track, *under* live skid marks (drive hard into a
     corner and confirm skids lay over them);
   - tyre stacks / sandbags sit on the dirt just beyond the shoulder, not on the racing surface;
   - a small cone/barricade cluster reads as pit-lane dressing near the start line;
   - dressing is sparse and readable (cars/pickups still clearly stand out); framerate unaffected
     (all static, created once);
   - `?gates=1` still aligns the start/finish sprite with gate 0.
   - Re-race the same offer → identical dressing layout (seed determinism).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Furniture `extract` rect grabs two items or clips one | approximate rect + `trim`; visual slice check in §7.4; re-tune rects |
| Front-view barricades look wrong top-down | treat as upright face-on props like the shipped chevron signs; place on shoulder, not flat on tarmac |
| Decals compete visually with cars/pickups | sparse count (~10), alpha 0.85, depth below skids; tune down if busy |
| Non-determinism between runs | all randomness from `this.random` (race seed) via `scatterPointsAlong`; determinism unit-tested |
| Sprite count hurts perf | sparse, static sprites created once in `buildTrack` — no per-frame cost |

## 9. Working order after Phase 2

Phase 3 (FX — verify-and-revert per additive asset) → Phase 4 (cars — own brainstorm on tint-neutral
art before generation). Each remains its own spec → plan → build → verify cycle.
