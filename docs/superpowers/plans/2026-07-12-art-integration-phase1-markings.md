# Art Integration — Phase 1 (Markings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three vector-drawn track markings (edge lines, start/finish, plus new corner kerbs) with placed authored WebP sprites, following curve orientation.

**Architecture:** Add one pure geometry function (`spacedPosesAlong`) in `src/core` that emits evenly spaced positions *with* rotation. Add one thin Phaser helper (`placeSpritesAlong`) in `src/game/track` that consumes it to place rotated sprites. Wire edge lines, kerbs, and start/finish in `RaceScene.buildTrack`, deleting the vector versions. Assets flow through the existing optimizer → `loadedAssets.ts` → auto-loaded by `BootScene.preload()`.

**Tech Stack:** TypeScript (strict), Phaser 3, Vite, Vitest, `sharp` (asset optimizer).

## Global Constraints

- No Phaser imports in `src/core/` — core stays pure and serializable.
- Race code consumes named actions / geometry; markings are presentation only (live in `src/game`).
- Respect existing depth band: markings render at depth **1.5** (above asphalt `1`, below skid RT `2`).
- Do not commit generated `dist/`, screenshots, or raw source PNGs (`Cars/output/generated/` is untracked). Only the small `public/assets/**/*.webp` outputs are committed.
- Verify gate before "done": `npm test`, `npm run build`, `git diff --check`, plus browser check.
- Authored art is original; do not copy reference material.

---

### Task 1: Pure geometry — `spacedPosesAlong`

Emits evenly spaced points along a closed polyline, each carrying the tangent angle of the segment it sits on. This is the pure, testable core of sprite placement.

**Files:**
- Modify: `src/core/track/geometry.ts` (add `Pose` interface + `spacedPosesAlong`, near `spacedPointsAlong` at line 92)
- Test: `tests/core/track/geometry.test.ts` (add a `describe('spacedPosesAlong', ...)` block)

**Interfaces:**
- Consumes: existing `Vec2` from `geometry.ts`.
- Produces: `export interface Pose { x: number; y: number; angle: number }` and `export function spacedPosesAlong(points: Vec2[], spacing: number): Pose[]` — `angle` is radians from `Math.atan2(dy, dx)` of the segment direction.

- [ ] **Step 1: Write the failing test**

Add to `tests/core/track/geometry.test.ts` (imports at top already use `{ describe, expect, it }` and pull from `'../../../src/core/track/geometry'` — add `spacedPosesAlong` to that import list):

```ts
describe('spacedPosesAlong', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('emits the same count and positions as spacedPointsAlong', () => {
    const poses = spacedPosesAlong(square, 50)
    expect(poses.length).toBe(8)
    expect(poses[0]).toMatchObject({ x: 50, y: 0 })
    expect(poses[1]).toMatchObject({ x: 100, y: 0 })
  })

  it('carries the segment tangent angle', () => {
    const poses = spacedPosesAlong(square, 50)
    // first edge runs +x → angle 0
    expect(poses[0].angle).toBeCloseTo(0)
    // point (100,50) sits on the +y edge → angle π/2
    expect(poses[2]).toMatchObject({ x: 100, y: 50 })
    expect(poses[2].angle).toBeCloseTo(Math.PI / 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/track/geometry.test.ts -t spacedPosesAlong`
Expected: FAIL — `spacedPosesAlong is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Add to `src/core/track/geometry.ts` immediately after `spacedPointsAlong` (ends line 108):

```ts
export interface Pose {
  x: number
  y: number
  angle: number
}

/** Like spacedPointsAlong, but each pose also carries the segment tangent angle (radians). */
export function spacedPosesAlong(points: Vec2[], spacing: number): Pose[] {
  const out: Pose[] = []
  let carried = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    let d = spacing - carried
    while (d <= segLen) {
      const t = d / segLen
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle })
      d += spacing
    }
    carried = (carried + segLen) % spacing
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/track/geometry.test.ts -t spacedPosesAlong`
Expected: PASS (2 tests).

- [ ] **Step 5: Run full suite + build**

Run: `npm test && npm run build`
Expected: all tests green (251+), `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/track/geometry.ts tests/core/track/geometry.test.ts
git commit -m "Add spacedPosesAlong geometry helper (position + tangent angle)"
```

---

### Task 2: Optimize + register the three marking assets

Turn the raw PNGs into small WebP and register their texture keys. `BootScene.preload()` already loops over `LOADED_TEXTURES`, so adding keys is all that's needed to load them.

**Files:**
- Modify: `scripts/optimize-assets.mjs` (add 3 rows to `JOBS`)
- Modify: `src/game/textures/loadedAssets.ts` (add 3 keys to `LOADED_TEXTURES`)
- Create (generated, committed): `public/assets/env/edge-line.webp`, `public/assets/env/kerb.webp`, `public/assets/env/start-finish.webp`

**Interfaces:**
- Produces: texture keys `'edge-line'`, `'kerb'`, `'start-finish'` available to any scene after boot.

- [ ] **Step 1: Add optimizer rows**

In `scripts/optimize-assets.mjs`, append to the `JOBS` array (after the last pickup/fx row):

```js
  { src: 'worn_white_edge_and_dashed_line_pieces.png', out: 'env/edge-line.webp',    w: 128, fit: 'inside', q: 85 },
  { src: 'red_white_kerb_tile.png',                    out: 'env/kerb.webp',         w: 128, fit: 'inside', q: 85 },
  { src: 'start_finish_checkered_tile.png',            out: 'env/start-finish.webp', w: 256, fit: 'inside', q: 85 },
```

- [ ] **Step 2: Run the optimizer**

Run: `npm run assets`
Expected: console prints `wrote public/assets/env/edge-line.webp`, `... kerb.webp`, `... start-finish.webp`, then `done: 14 assets`.

If a source PNG bundles several pieces side-by-side (e.g. solid + dashed edge variants), the optimizer's `resize` will squash them. If the generated WebP looks like multiple tiles crammed together, crop to the single cleanest sub-region first by adding `.extract({ left, top, width, height })` before `.resize(...)` for that job, then re-run `npm run assets`. (Phase 1 uses one sprite per marking, not an atlas.)

- [ ] **Step 3: Verify the files exist and are small**

Run: `ls -la public/assets/env/edge-line.webp public/assets/env/kerb.webp public/assets/env/start-finish.webp`
Expected: three files present, each well under 100 KB.

- [ ] **Step 4: Register the texture keys**

In `src/game/textures/loadedAssets.ts`, add to the `LOADED_TEXTURES` array (after the pickup keys, before the closing `]`):

```ts
  { key: 'edge-line', url: 'assets/env/edge-line.webp' },
  { key: 'kerb', url: 'assets/env/kerb.webp' },
  { key: 'start-finish', url: 'assets/env/start-finish.webp' },
```

- [ ] **Step 5: Build to confirm wiring**

Run: `npm run build`
Expected: `tsc` clean, Vite build succeeds (assets copied from `public/`).

- [ ] **Step 6: Commit**

```bash
git add scripts/optimize-assets.mjs src/game/textures/loadedAssets.ts public/assets/env/edge-line.webp public/assets/env/kerb.webp public/assets/env/start-finish.webp
git commit -m "Optimize and register edge-line, kerb, start-finish marking art"
```

---

### Task 3: `placeSpritesAlong` helper + swap edge lines

Add the thin Phaser placement helper and use it for its first consumer: the two track edge lines, replacing the vector strokes.

**Files:**
- Create: `src/game/track/placement.ts`
- Modify: `src/game/scenes/RaceScene.ts` (replace edge strokes at lines 1794–1796; add import)
- Verify: browser (Phaser-bound; no unit test — pure math already covered in Task 1)

**Interfaces:**
- Consumes: `spacedPosesAlong` (Task 1), `Vec2` from `geometry.ts`.
- Produces: `export function placeSpritesAlong(scene: Phaser.Scene, path: Vec2[], key: string, spacing: number, depth: number, scale?: number): Phaser.GameObjects.Image[]`.

- [ ] **Step 1: Create the helper**

Create `src/game/track/placement.ts`:

```ts
import Phaser from 'phaser'
import { spacedPosesAlong, type Vec2 } from '../../core/track/geometry'

/**
 * Place `key` sprites evenly along a closed polyline, each rotated to the local
 * tangent so the art follows the track curve. Returns the created images so the
 * caller can further tint/scale them.
 */
export function placeSpritesAlong(
  scene: Phaser.Scene,
  path: Vec2[],
  key: string,
  spacing: number,
  depth: number,
  scale = 1,
): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = []
  for (const pose of spacedPosesAlong(path, spacing)) {
    const img = scene.add
      .image(pose.x, pose.y, key)
      .setRotation(pose.angle)
      .setScale(scale)
      .setDepth(depth)
    images.push(img)
  }
  return images
}
```

- [ ] **Step 2: Import the helper in RaceScene**

In `src/game/scenes/RaceScene.ts`, add near the other local imports (the block importing from `'../../core/track/geometry'` ends around line 29):

```ts
import { placeSpritesAlong } from '../track/placement'
```

- [ ] **Step 3: Replace the edge-line vector strokes**

In `RaceScene.ts`, find the marking block in `buildTrack` (lines 1791–1796):

```ts
    const marks = this.add.graphics().setDepth(1.5)
    marks.lineStyle(60, 0x000000, 0.1)
    marks.strokePoints(this.centerline, true, true)
    marks.lineStyle(6, 0xe8e8f0, 0.35)
    marks.strokePoints(offsetClosedPolyline(this.centerline, halfW - 10), true, true)
    marks.strokePoints(offsetClosedPolyline(this.centerline, -(halfW - 10)), true, true)
    this.drawStartLine(marks)
```

Replace with (keep the faint centre shadow; swap only the two white edge strokes for placed sprites):

```ts
    const marks = this.add.graphics().setDepth(1.5)
    marks.lineStyle(60, 0x000000, 0.1)
    marks.strokePoints(this.centerline, true, true)
    for (const side of [1, -1]) {
      const edge = offsetClosedPolyline(this.centerline, side * (halfW - 10))
      placeSpritesAlong(this, edge, 'edge-line', 40, 1.5, 0.4)
    }
    this.drawStartLine(marks)
```

(`scale 0.4` and `spacing 40` are starting values tuned in Step 5.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `tsc` clean, build succeeds.

- [ ] **Step 5: Browser verify (edge lines)**

Run: `npm run dev`, then in the browser: Continue Career → RACE → any tier.
Confirm:
- Both track edges now show worn white line sprites that follow the curve (rotation correct, not axis-aligned).
- No obvious gaps or heavy overlap; dashes read as lane edges. If overlapping, raise `spacing`; if too sparse, lower it; adjust `scale` so a tile's width ≈ intended line thickness.
- Skid marks (drive hard into a corner) still render *over* the edge lines (depth 2 > 1.5).
- Framerate unaffected (edge sprites are static, created once).

- [ ] **Step 6: Commit**

```bash
git add src/game/track/placement.ts src/game/scenes/RaceScene.ts
git commit -m "Add placeSpritesAlong helper; swap edge lines to authored sprites"
```

---

### Task 4: Kerbs on corner apexes

Place kerb tiles along both edges through sharp corners only, reusing the corner-detection pattern already used for chevron signs.

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` (add kerb placement inside `buildTrack`, after the edge-line loop; uses `turnAmount` + `lineTangentAt`, both already imported)
- Verify: browser

**Interfaces:**
- Consumes: `turnAmount`, `lineTangentAt`, `offsetClosedPolyline` (all already imported in RaceScene), texture key `'kerb'` (Task 2).

- [ ] **Step 1: Add kerb placement**

In `RaceScene.ts` `buildTrack`, immediately after the edge-line `for (const side ...)` loop added in Task 3 (and before `this.drawStartLine(marks)`), add:

```ts
    // red/white kerbs through sharp corners only (mirrors the chevron-sign gate)
    const clN = this.centerline.length
    let lastKerbAt = -100
    for (let i = 0; i < clN; i += 4) {
      if (turnAmount(this.centerline, i, 10) < 0.55 || i - lastKerbAt < 24) continue
      lastKerbAt = i
      for (const side of [1, -1]) {
        const edge = offsetClosedPolyline(this.centerline, side * (halfW - 4))
        for (let j = -8; j <= 8; j += 4) {
          const k = (i + j + clN) % clN
          const t = lineTangentAt(this.centerline, k)
          this.add
            .image(edge[k].x, edge[k].y, 'kerb')
            .setRotation(Math.atan2(t.y, t.x))
            .setScale(0.4)
            .setDepth(1.5)
        }
      }
    }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `tsc` clean.

- [ ] **Step 3: Browser verify (kerbs)**

Run: `npm run dev` → Continue Career → RACE → pick a tier with tight corners.
Confirm:
- Kerb tiles appear only through corner apexes, forming a short striped run on each edge; straights have none.
- Kerbs follow the curve (rotation correct) and sit at the track edge, not floating on the grass or across the racing surface.
- If kerbs look too dense/sparse, tune the `j` step or `-8..8` span; if too far off the tarmac, adjust the `halfW - 4` offset.

- [ ] **Step 4: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "Place authored kerb tiles through corner apexes"
```

---

### Task 5: Start/finish sprite (replace procedural checker)

Swap the procedurally drawn checkered start line for a single positioned, rotated sprite spanning the start gate.

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` (rewrite `drawStartLine`, lines 1865–1889; it no longer needs the `gfx` param)
- Verify: browser (incl. `?gates=1`)

**Interfaces:**
- Consumes: `this.gates[0]` (`Gate` with `a`, `b`, `center`, `tangent: Vec2`), texture key `'start-finish'` (Task 2).

- [ ] **Step 1: Replace the drawStartLine body and call**

In `RaceScene.ts`, change the call site (currently `this.drawStartLine(marks)`) to:

```ts
    this.drawStartLine()
```

Then replace the whole `drawStartLine` method (lines 1865–1889) with:

```ts
  /** Single authored checkered strip spanning the start gate, rotated to travel dir. */
  private drawStartLine() {
    const gate = this.gates[0]
    const width = Math.hypot(gate.b.x - gate.a.x, gate.b.y - gate.a.y)
    const strip = this.add
      .image(gate.center.x, gate.center.y, 'start-finish')
      .setRotation(Math.atan2(gate.tangent.y, gate.tangent.x))
      .setDepth(1.5)
    // stretch the tile across the full gate width; keep its native aspect for depth
    strip.setDisplaySize(width, strip.height * (width / strip.width))
  }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `tsc` clean (no unused-param or unused-var errors; `marks` is still used by the shadow stroke and — after Task 3 — nothing else draws to it, so confirm `marks` is still referenced; if `tsc`/lint flags `marks` as unused, delete the now-empty `const marks` line and its shadow stroke only if truly unused — but the centre shadow stroke at lines 1792–1793 still uses it, so it stays).

- [ ] **Step 3: Browser verify (start/finish)**

Run: `npm run dev` → Continue Career → RACE.
Confirm:
- The start/finish line is a single crisp checkered strip across the start of the lap, rotated to match the track direction (perpendicular to travel).
- It spans the full track width (no under/overhang) on tracks with different widths — check a second tier.
- Run with `?gates=1` (append to the dev URL): the checkered strip aligns with rendered gate 0.
- Reduced-shake/flash settings unaffected (this is static art).

- [ ] **Step 4: Full verify gate**

Run: `npm test && npm run build && git diff --check`
Expected: tests green, build clean, no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "Replace procedural start line with authored checkered sprite"
```

---

## Self-Review

**Spec coverage (§4 of the design):**
- §4.1 A edge lines → Task 3 ✓ · B kerbs → Task 4 ✓ · C start/finish → Task 5 ✓
- §4.2 optimizer rows + loadedAssets keys → Task 2 ✓
- §4.3 `placeSpritesAlong` helper → Task 3 ✓ (orientation via `spacedPosesAlong`/tangent, Task 1)
- §4.4 placement rules (edges both sides, kerbs corners-only, start/finish rotated across gate) → Tasks 3–5 ✓
- §4.5 depth 1.5 band preserved, centre shadow kept → Tasks 3 & 5 ✓
- §4.6 files touched — all listed files appear in a task ✓
- §4.7 verification (test/build/diff + browser incl. `?gates=1`, skid-over-markings) → Steps in Tasks 3–5 ✓
- §4.8 risks (repetition, kerb facing, gate-width span, perf) → tuning notes in Tasks 3–5 ✓

**Placeholder scan:** No TBDs; every code step shows real code and exact commands.

**Type consistency:** `Pose {x,y,angle}` and `spacedPosesAlong(points, spacing)` defined in Task 1, consumed unchanged in Task 3's helper. `placeSpritesAlong(scene, path, key, spacing, depth, scale?)` defined in Task 3, matches its Task 3 call sites. Texture keys `'edge-line' | 'kerb' | 'start-finish'` registered in Task 2, consumed in Tasks 3–5. `Gate.tangent/center/a/b` match `geometry.ts` definitions.

**Note for the implementer:** Task 1 is unit-tested (pure core). Tasks 3–5 are Phaser presentation and are browser-verified per this repo's convention (`src/game` is not unit-tested); the numeric tuning values (spacing/scale/offset) are starting points — adjust them during browser verification and keep the values that look right.
