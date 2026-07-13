# Full Art Integration — Design & Phase 1 Spec

**Date:** 2026-07-12
**Branch:** `milestones-13-15-ai-and-fixes`
**Predecessor:** `docs/ART_INTEGRATION_STATUS.md` (11 assets already wired: surfaces, tyre walls, poles, pickups, spark/smoke)

---

## 1. Goal

Migrate the remaining authored AI art from procedural placeholders into the game, in four sequenced phases. Every phase reuses the swap seam that already shipped and is its own spec → plan → build → verify cycle.

**In scope:** Phase 1 markings, Phase 2 atlases, Phase 3 FX, Phase 4 cars.
**Out of scope (deferred until a venue/prop needs it):** 4d optional content — concrete surface, jersey barriers, wreck props, deployed-mine art.

## 2. The swap seam (unchanged from the shipped pass)

```
Cars/output/generated/*.png          raw AI art (local, untracked)
        │  scripts/optimize-assets.mjs   (sharp: resize + WebP)
        ▼
public/assets/{env,pickups,fx,cars}/*.webp   (small, committed)
        │  src/game/textures/loadedAssets.ts    (key → url map)
        ▼
BootScene.preload()  load.image(key, url)   ← real art under the key
BootScene.create()   (delete the matching paint*/vector call)
        ▼
RaceScene & co. ask for the key → game code never changes
```

Adding an asset = add an optimizer row, `npm run assets`, add `{key,url}` to `loadedAssets.ts`, load in `preload()`, delete the placeholder draw.

## 3. Roadmap

```
PHASE 1  Markings   edge lines · kerbs · start/finish   [new: path-placement helper]
PHASE 2  Atlases    slice furniture + decal sheets       [new: atlas slicing]
PHASE 3  FX         explosion·mine·muzzle·tracer·plume·headlight  [verify-and-revert]
PHASE 4  Cars       3 neutral chassis, keep runtime tint [marquee, needs art gen]
```

| Phase | Payoff | New code | New art gen | Risk |
|---|---|---|---|---|
| 1 Markings | High (biggest remaining visual win) | path-placement helper | optimize 3 existing PNGs | low |
| 2 Atlases | Medium (dressing detail) | atlas slicing + placement | slice 2 existing sheets | low |
| 3 FX | Medium (polish) | none (key swaps) | optimize existing FX PNGs | medium — additive blend |
| 4 Cars | Marquee | none (tint stays) | **generate 3 neutral chassis** | medium — tint-neutral shading |

### Phase 4 decision (locked, detail deferred to its own brainstorm)

Liveries use the **tintable base** model: generate 3 lighting-neutral greyscale chassis
(`compact` / `muscle` / `sleek`, 128×64, top-down facing +x). They register as `car-compact/muscle/sleek`
keys; `paintCarTexture` is deleted; the runtime `setTint(liveryColor)` in `RaceScene`/`ChampionScene`
is **unchanged**, so all 20 rivals + player keep free per-driver colour. Only real risk: shading must be
tint-neutral or colours flatten — a generation-prompt concern handled in Phase 4's own brainstorm before art is committed.

---

## 4. PHASE 1 SPEC — Markings

Replace three vector-drawn markings with placed authored sprites. This is the only phase specced in
full detail here; Phases 2–4 each get their own spec when reached.

### 4.1 What changes

| # | Marking | Today | Becomes |
|---|---|---|---|
| A | Edge lines | `marks.strokePoints(offsetClosedPolyline(...))` — thin grey stroke, both edges (`RaceScene.ts:1794–1796`) | worn white edge/dashed-line sprites placed along both track edges |
| B | Kerbs | none today | red/white kerb tiles on corner apexes only |
| C | Start/finish | `drawStartLine(gfx)` — procedural 2-row checker via `fillPoints` (`RaceScene.ts:1865–1889`) | one positioned, rotated checkered strip sprite across gate 0 |

### 4.2 Source art → optimizer rows

Add to `scripts/optimize-assets.mjs` `JOBS` (all `fit: 'inside'` to preserve aspect + alpha):

| src PNG | out webp | size |
|---|---|---|
| `worn_white_edge_and_dashed_line_pieces.png` | `env/edge-line.webp` | w 128 |
| `red_white_kerb_tile.png` | `env/kerb.webp` | w 128 |
| `start_finish_checkered_tile.png` | `env/start-finish.webp` | w 256 |

If a source PNG bundles multiple pieces (e.g. edge + dashed variants side by side), pick the single
cleanest sub-region during optimization (crop before resize) rather than slicing — Phase 1 uses one
sprite per marking, not an atlas.

`loadedAssets.ts` — add to `LOADED_TEXTURES`:
```
{ key: 'edge-line',    url: 'assets/env/edge-line.webp' },
{ key: 'kerb',         url: 'assets/env/kerb.webp' },
{ key: 'start-finish', url: 'assets/env/start-finish.webp' },
```

### 4.3 New helper — `placeSpritesAlong`

The existing `spacedPointsAlong(points, spacing)` (`src/core/track/geometry.ts:92`) returns evenly
spaced `Vec2`s but **no orientation**. Placed markings must rotate to follow the track, so Phase 1 adds a
thin presentation helper (in `RaceScene` or a small `src/game/track/placement.ts`, not in core — it
touches Phaser objects):

```ts
// Place `key` sprites along a closed polyline, each rotated to the local tangent.
// Returns the created images so callers can depth/scale/tint them.
placeSpritesAlong(
  scene: Phaser.Scene,
  path: Vec2[],
  key: string,
  spacing: number,
  depth: number,
): Phaser.GameObjects.Image[]
```

Orientation comes from the existing pure `lineTangentAt(points, i)` (`geometry.ts:50`); rotation =
`Math.atan2(tangent.y, tangent.x)`. Keep the geometry math in core (already there); the helper only does
the Phaser placement.

### 4.4 Placement rules

```
Edge lines (A):  both edges = offsetClosedPolyline(centerline, ±(halfW - 10))
                 placeSpritesAlong(edge, 'edge-line', spacing≈40, depth 1.5)
                 → replaces the two marks.strokePoints edge calls (1795–1796)

Kerbs (B):       corners only. Reuse the existing corner test from dressTrackForNight:
                 turnAmount(centerline, i, 10) > 0.55, min-gap between kerbs.
                 Place kerb sprites on the OUTSIDE edge of the apex, depth 1.5.

Start/finish (C): one sprite at gate 0, centred on the gate midpoint,
                 rotated to gate.tangent, scaled to span the gate width.
                 → replaces drawStartLine() entirely.
```

Keep the faint centre shadow stroke (`marks.lineStyle(60, 0x000000, 0.1)`, line 1792) — it is a subtle
track-darkening pass, not a marking, and has no authored replacement.

### 4.5 Depth ordering (must stay correct)

```
0    dirt ground        0.5  shoulder        1    asphalt (masked)
1.5  MARKINGS (edge, kerb, start/finish)      ← unchanged band, now sprites
1.6  cat-eye reflectors  1.7 light pools  2 skid RT  3 tyre walls  3.2 poles
```
Markings stay at 1.5 (above asphalt, below skid marks and props) so skid trails still lay over them.

### 4.6 Files touched

| File | Change |
|---|---|
| `scripts/optimize-assets.mjs` | +3 JOBS rows |
| `public/assets/env/*.webp` | +3 committed assets (via `npm run assets`) |
| `src/game/textures/loadedAssets.ts` | +3 texture keys |
| `src/game/scenes/BootScene.ts` | load the 3 keys in `preload()` |
| `src/game/scenes/RaceScene.ts` | replace edge strokes; add kerb placement; replace `drawStartLine`; add/import `placeSpritesAlong` |
| `src/game/track/placement.ts` (new, optional) | `placeSpritesAlong` helper |
| `tests/` | unit-test any new pure geometry; helper is Phaser-bound so covered by browser verify |

### 4.7 Verification

1. `npm test` (249+ green) — pure geometry only; no rule changes expected.
2. `npm run build` — strict TS + prod build clean.
3. `git diff --check` — whitespace.
4. Browser: `npm run dev` → Continue Career → RACE → any tier. Confirm:
   - both track edges show worn white line sprites following the curve,
   - kerbs appear on corner apexes (not on straights),
   - start/finish is a single crisp checkered strip across the start gate, correctly rotated,
   - skid marks still render over markings; no depth flicker; framerate unaffected,
   - `?gates=1` still aligns the start/finish sprite with gate 0.

### 4.8 Risks & mitigations

| Risk | Mitigation |
|---|---|
| Edge sprites look tiled/repetitive on long straights | tune spacing; use the dashed variant so repetition reads as intended lane dashes |
| Kerb sprites face the wrong way on tight corners | rotate from `lineTangentAt`; verify on the sharpest venue |
| Start/finish sprite doesn't span variable gate widths | scale sprite to `gate` width at runtime, not a fixed scale |
| Sprite count hurts perf (many edge images) | reasonable spacing (≈40px); markings are static (no per-frame cost) |

---

## 5. Working order after Phase 1

Phase 2 (atlases) → Phase 3 (FX, verify-and-revert per asset, report shipped vs reverted) → Phase 4
(cars — own brainstorm on tint-neutral art before generation). Each is a fresh spec built from this
roadmap.
