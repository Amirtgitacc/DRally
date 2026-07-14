# Menu Visual Refresh + Touch Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the shared menu visual language and make every non-gameplay screen tap-interactive, without changing gameplay, economy, art, or the FIT scaling model.

**Architecture:** Upgrade the shared `theme.ts`/`widgets.ts` primitives once (raised panels, tap-capable tiles, a reusable pointer-wiring helper, a back-button widget), then apply a repeatable wiring + cleanup recipe to each of the 16 menu scenes. Keyboard navigation keeps full parity; pointer/touch is additive and routes through each scene's existing `selected`-index + `refresh()`/`activate()` model.

**Tech Stack:** TypeScript (strict), Phaser 3.87, Vite, Vitest.

## Global Constraints

- `src/core/` stays Phaser-free and serializable; all work here is in `src/game/` + `docs/`.
- No changes to persistence, race lifecycle, economy, tuning, or art assets.
- Keep the 1920×1080 internal layout; scaling stays `Phaser.Scale.FIT`. Layout must stay readable when scaled to 1280×720.
- Every scene must remove **keyboard and pointer** listeners on `shutdown` so repeated visits don't stack handlers.
- Keyboard navigation parity: every screen still fully operable by keyboard after changes.
- WebGL-only effects (glow) must degrade gracefully on the canvas renderer, matching the existing `heading()` guard (`scene.game.renderer.type === Phaser.WEBGL`).
- Verification per task: `npm run build` clean, `npm test` green, `git diff --check` clean, plus the browser smoke noted in the task.
- `RacePause` presentation only — do not alter pause/resume/abandon semantics.
- Commit after each task with the message shown.

---

### Task 1: Raised-plate `panel()` + corner-notch helper (shared visual upgrade)

Introduce the one pure helper this project needs (corner-notched plate polygon), TDD it, then use it to give `panel()` a raised-metal look. This upgrade flows to every screen that already calls `panel()`/`modal()`.

**Files:**
- Create: `src/game/ui/plateGeometry.ts`
- Test: `tests/game/ui/plateGeometry.test.ts`
- Modify: `src/game/ui/widgets.ts` (the `panel()` function, ~lines 141-157)

**Interfaces:**
- Produces: `plateNotchPoints(w: number, h: number, notch: number): number[]` — returns a flat `[x0,y0,x1,y1,...]` polygon for a rectangle of size `w×h` **centered on (0,0)**, with the top-right and bottom-left corners cut by `notch` px. Used by `panel()` via `scene.add.polygon`.
- Produces (unchanged signature): `panel(scene, x, y, w, h, opts)` still returns a game object usable as before; callers are not modified.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/game/ui/plateGeometry.test.ts
import { describe, expect, it } from 'vitest'
import { plateNotchPoints } from '../../../src/game/ui/plateGeometry'

describe('plateNotchPoints', () => {
  it('cuts the top-right and bottom-left corners by the notch amount', () => {
    // 100x60 plate, 10px notch, centered on origin => corners at ±50, ±30
    const pts = plateNotchPoints(100, 60, 10)
    // 6 vertices => 12 numbers
    expect(pts).toHaveLength(12)
    // top-left corner is untouched
    expect(pts.slice(0, 2)).toEqual([-50, -30])
    // top edge stops 10px short of the top-right corner
    expect(pts.slice(2, 4)).toEqual([40, -30])
    // then drops 10px down the right edge (the cut)
    expect(pts.slice(4, 6)).toEqual([50, -20])
  })

  it('degrades to a plain rectangle when notch is 0', () => {
    const pts = plateNotchPoints(100, 60, 0)
    expect(pts).toEqual([-50, -30, 50, -30, 50, 30, -50, 30])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/ui/plateGeometry.test.ts`
Expected: FAIL — cannot find module `plateGeometry`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/game/ui/plateGeometry.ts
/**
 * Polygon for a rectangle centered on (0,0) with the top-right and bottom-left
 * corners cut by `notch` px — the industrial "clipped plate" silhouette.
 * Returns a flat [x0,y0,x1,y1,...] list for Phaser's polygon game object.
 */
export function plateNotchPoints(w: number, h: number, notch: number): number[] {
  const hx = w / 2
  const hy = h / 2
  if (notch <= 0) return [-hx, -hy, hx, -hy, hx, hy, -hx, hy]
  return [
    -hx, -hy, // top-left
    hx - notch, -hy, // top edge, stop short
    hx, -hy + notch, // cut down the right edge
    hx, hy, // bottom-right
    -hx + notch, hy, // bottom edge, stop short
    -hx, hy - notch, // cut up the left edge
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/ui/plateGeometry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Upgrade `panel()` to use the raised-plate look**

Replace the body of `panel()` in `src/game/ui/widgets.ts` (keep the exported signature identical). Add the import at the top of the file.

```typescript
// add to the imports at the top of src/game/ui/widgets.ts
import { plateNotchPoints } from './plateGeometry'
```

```typescript
// src/game/ui/widgets.ts — replace the existing panel() body
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; fillAlpha?: number; stroke?: number; strokeAlpha?: number; strokeWidth?: number; notch?: number } = {},
) {
  const { fill = C.surfacePlate, fillAlpha = 0.92, stroke = C.line, strokeAlpha = 1, strokeWidth = 2, notch = 12 } = opts
  const container = scene.add.container(x, y)

  const body = scene.add.polygon(0, 0, plateNotchPoints(w, h, notch), fill, fillAlpha)
    .setStrokeStyle(strokeWidth, stroke, strokeAlpha)
  // raised edge: a bright hairline along the top, a shadow hairline along the bottom
  const edge = scene.add.graphics()
  edge.lineStyle(1, C.textMuted, 0.25)
  edge.lineBetween(-w / 2 + 4, -h / 2 + 1, w / 2 - notch, -h / 2 + 1)
  edge.lineStyle(1, C.shadow, 0.5)
  edge.lineBetween(-w / 2 + notch, h / 2 - 1, w / 2 - 4, h / 2 - 1)

  container.add([body, edge])
  return container
}
```

Note: callers use `panel()` only for its side effect (drawing); none read its return value's rectangle API, so returning a container is safe. Verify with the grep in Step 7.

- [ ] **Step 6: Update `modal()` to keep working**

`modal()` calls `panel()` with `strokeWidth: 3`. It needs no change — confirm it still compiles. If TypeScript complains about the return type anywhere, that is a real caller to inspect (Step 7).

- [ ] **Step 7: Verify no caller depends on the old return type**

Run: `grep -rn "panel(" src/game/scenes | grep -vE "//|sectionLabel"`
Expected: every hit is a bare `panel(...)` / `modal(...)` call whose return value is discarded. If any assigns the result and calls `.setStrokeStyle`/`.setPosition` on it, note it and adapt that caller in this task.

Run: `npm run build`
Expected: PASS (no type errors).

- [ ] **Step 8: Browser smoke**

Run `npm run dev`, open the Garage (`?debug=1` then `__game.scene.start('Garage')`). Confirm the CHASSIS / LOADOUT / stat panels now render as clipped raised plates with a top highlight, and nothing overlaps that didn't before.

- [ ] **Step 9: Commit**

```bash
git add src/game/ui/plateGeometry.ts tests/game/ui/plateGeometry.test.ts src/game/ui/widgets.ts
git commit -m "feat(ui): raised-plate panel() + corner-notch geometry helper"
```

---

### Task 2: `wireTiles()` pointer helper + `backButton()` widget

The reusable touch seam. `wireTiles()` makes an existing `TileHandle[]` respond to hover/tap by calling back with the tile index — mapping directly onto each scene's `selected` index. `backButton()` is a tappable back affordance for screens that have a back target.

**Files:**
- Modify: `src/game/ui/widgets.ts` (add two exports near `tile()`)

**Interfaces:**
- Consumes: `TileHandle` (existing, with `.rect`).
- Produces: `wireTiles(handles: TileHandle[], onFocus: (i: number) => void, onActivate: (i: number) => void): void` — sets each handle's rect interactive; `pointerover` → `onFocus(i)`, `pointerup` → `onActivate(i)`. Listeners live on the rect and die when the scene destroys it on shutdown/restart.
- Produces: `backButton(scene, onBack: () => void, opts?: { label?: string }): TileHandle` — a small tappable tile at top-right (default label `'‹ BACK'`) wired to `onBack` on tap; returns the handle so the scene can also drive it from keyboard focus if desired.

- [ ] **Step 1: Add `wireTiles()` to `src/game/ui/widgets.ts`**

Place directly after the `tile()` function.

```typescript
/**
 * Make an existing row of tiles respond to pointer/touch. Hover focuses,
 * tap activates — both report the tile's index so the scene can reuse its
 * existing `selected`-index + refresh()/activate() logic. Pointer listeners
 * live on each rect and are torn down when the scene destroys it.
 */
export function wireTiles(
  handles: TileHandle[],
  onFocus: (i: number) => void,
  onActivate: (i: number) => void,
): void {
  handles.forEach((h, i) => {
    h.rect.setInteractive({ useHandCursor: true })
    h.rect.on('pointerover', () => onFocus(i))
    h.rect.on('pointerup', () => onActivate(i))
  })
}
```

- [ ] **Step 2: Add `backButton()` to `src/game/ui/widgets.ts`**

Place after `wireTiles()`. Reuses `tile()` so it inherits the shared look. Import `GAME_WIDTH` is NOT available in widgets.ts (widgets are geometry-agnostic), so the caller passes nothing extra — position is fixed in the 1920-wide space via a literal, matching how `hintBar()` hard-codes `16,16`.

```typescript
/** Tappable back affordance, top-right. Screens keep their Esc handler too. */
export function backButton(
  scene: Phaser.Scene,
  onBack: () => void,
  opts: { label?: string } = {},
): TileHandle {
  const handle = tile(scene, 1810, 52, 180, 56, opts.label ?? '‹ BACK', { size: 'bodySm' })
  handle.rect.setInteractive({ useHandCursor: true })
  handle.rect.on('pointerup', onBack)
  handle.rect.on('pointerover', () => handle.setState(true, true))
  handle.rect.on('pointerout', () => handle.setState(false, true))
  return handle
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/game/ui/widgets.ts
git commit -m "feat(ui): wireTiles() pointer helper + backButton() widget"
```

---

### Task 3: Wire Menu + Garage (reference implementation + Garage bug fix)

Apply the touch recipe to the two most representative screens and fix the Garage `ENGINE`↔`WINS` overlap. This task establishes the exact pattern Tasks 4-5 repeat.

**Files:**
- Modify: `src/game/scenes/MenuScene.ts`
- Modify: `src/game/scenes/GarageScene.ts`

**Interfaces:**
- Consumes: `wireTiles`, `backButton` (Task 2).

- [ ] **Step 1: Menu — make the list tiles tappable**

In `MenuScene.ts`, import `wireTiles` from `../ui/widgets`. After the `ITEMS.forEach(... this.handles.push(...))` loop (around line 73), add:

```typescript
wireTiles(
  this.handles,
  (i) => { this.selected = i; this.refresh() },
  (i) => { this.selected = i; this.activate() },
)
```

Menu is the root screen — **no back button**. Keyboard flow is unchanged.

- [ ] **Step 2: Menu — browser smoke**

`npm run dev` → main menu. Confirm: hovering a menu item highlights it; clicking/tapping it navigates; arrow keys + Enter still work; disabled (no-career) items don't activate on tap (because `activate()` already guards `needsCareer`).

- [ ] **Step 3: Garage — fix the right-panel overlap**

In `GarageScene.ts`, the stats block (`this.statsText` at y=200, 9 lines) collides with the pip rows (`PIP_TOP = 500`). Give the stats block room and push the pips/divider down. Change the constants near the top of the file:

```typescript
const PIP_TOP = 560 // was 500 — clear the 9-line stats block above it
const PIP_STEP = 40
```

The divider `rule(..., PIP_TOP - 26)` and pip labels/rows all derive from `PIP_TOP`, so they move together. Confirm `PANEL_H = 480` still contains them: last pip row is `PIP_TOP + 2*40 = 640`; panel bottom is `PANEL_Y + PANEL_H/2 = 400 + 240 = 640`. Bump the panel so the last row isn't flush against the border:

```typescript
const PANEL_Y = 420 // was 400 — recenters the taller content
const PANEL_H = 520 // was 480 — fits stats + divider + 3 pip rows with margin
```

- [ ] **Step 4: Garage — make the action tiles tappable + add back button**

In `GarageScene.ts`, import `wireTiles` and `backButton`. After the `TILES.forEach(...)` tile-creation loop (around line 228), add:

```typescript
wireTiles(
  this.tiles,
  (i) => { this.selected = i; this.refresh() },
  (i) => { this.selected = i; this.activate() },
)
backButton(this, () => this.scene.start('Menu'))
```

`activate()` already routes each tile id correctly and guards disabled actions, so tap reuses it verbatim.

- [ ] **Step 5: Garage — browser smoke**

`npm run dev` → Garage. Confirm: the right panel no longer overlaps (`ENGINE`/`TIRES`/`ARMOR` sit clearly below `WINS`); hovering a bottom tile focuses it and updates the info line; tapping REPAIR/ENGINE/etc. performs the action; tapping RACE goes to SignUp; the top-right BACK button returns to the menu; keyboard still works.

- [ ] **Step 6: Verify + commit**

Run: `npm run build && npm test`
Expected: build PASS, tests PASS.

```bash
git add src/game/scenes/MenuScene.ts src/game/scenes/GarageScene.ts
git commit -m "feat(ui): touch-wire Menu + Garage; fix Garage panel overlap"
```

---

### Task 4: Wire the single-list screens

Apply the identical recipe to the screens that have one tile/row array driven by a `selected` index. For each screen: import `wireTiles`/`backButton`, add the `wireTiles(...)` call after its tile array is built, and add `backButton(this, () => <back target>)` (except where noted).

**Files (modify each):**
- `src/game/scenes/VenuesScene.ts`
- `src/game/scenes/RankingScene.ts`
- `src/game/scenes/HallOfFameScene.ts`
- `src/game/scenes/CreditsScene.ts`
- `src/game/scenes/PreviewScene.ts`
- `src/game/scenes/ChampionScene.ts`
- `src/game/scenes/ResultsScene.ts`

**Interfaces:**
- Consumes: `wireTiles`, `backButton` (Task 2).

The wiring call is always this shape — substitute the per-screen tile-array field, selection field, and refresh/activate method names from the table:

```typescript
wireTiles(
  this.<tilesField>,
  (i) => { this.<selectedField> = i; this.<refreshMethod>() },
  (i) => { this.<selectedField> = i; this.<activateMethod>(/* i if the method takes an index */) },
)
```

- [ ] **Step 1: Inspect each screen and fill in the recipe**

For each file, open it and identify: the tile/row array field, the selection index field, the refresh method, the activate/select method, and the back target. Confirm against the observed back targets:

| Screen | Back target | Notes |
|---|---|---|
| Venues | `Menu` | selectable venue rows |
| Ranking | `Garage` | ladder rows; if rows aren't tiles, wire only the back button + any action tile |
| HallOfFame | `Menu` | mostly static; add back button; wire any tiles present |
| Credits | `Menu` | mostly static; add back button |
| Preview | `Menu` | add back button; wire any demo controls present |
| Champion | `Menu` | progression screen — use a tappable primary "continue" affordance instead of a back button if there is no true back |
| Results | `Ranking` | progression screen — the primary action is "continue to standings"; make that tappable (tap anywhere / a continue tile) rather than a BACK label |

If a screen has **no tile array** (purely static text with a single "press Enter to continue"), skip `wireTiles` and instead make its continue/back interactive: add `backButton` (for menu screens) or wire a full-screen tappable zone that calls the same handler Enter calls (for progression screens):

```typescript
// full-screen tap-to-continue for a static progression screen
this.add.zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
  .setInteractive()
  .on('pointerup', () => this.scene.start('<next scene>'))
```

- [ ] **Step 2: Apply the recipe to each of the 7 screens**

Edit each file per the table. Keep every existing keyboard handler intact.

- [ ] **Step 3: Verify**

Run: `npm run build && npm test`
Expected: build PASS, tests PASS.

- [ ] **Step 4: Browser smoke each screen**

For each of the 7: reach it (via normal flow or `__game.scene.start('<Key>')` with `?debug=1`), confirm tap focuses/activates rows, the back or continue affordance works by tap, and keyboard still works.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/VenuesScene.ts src/game/scenes/RankingScene.ts src/game/scenes/HallOfFameScene.ts src/game/scenes/CreditsScene.ts src/game/scenes/PreviewScene.ts src/game/scenes/ChampionScene.ts src/game/scenes/ResultsScene.ts
git commit -m "feat(ui): touch-wire single-list + progression screens"
```

---

### Task 5: Wire the multi-group / special screens

These screens have more than one interactive group or a non-standard selection model. Wire each group separately, mapping pointer index to that group's selection logic.

**Files (modify each):**
- `src/game/scenes/SettingsScene.ts` — two groups: `settingTiles` and `bindTiles`, one shared `selected` index spanning both (0..SETTINGS.length-1 = settings, then bindings).
- `src/game/scenes/SignUpScene.ts` — race-offer tiles; back to `Garage`.
- `src/game/scenes/CarDealerScene.ts` — car list; back to `Garage`.
- `src/game/scenes/BlackMarketScene.ts` — market item tiles; back to `Garage`.
- `src/game/scenes/PrepareRaceScene.ts` — start/back; back to `SignUp`.
- `src/game/scenes/NewCareerScene.ts` (Profile) — form/steps; cancel to `Menu`.
- `src/game/scenes/RacePauseScene.ts` — overlay: Resume / Abandon; tap must reuse the exact existing handlers (no semantic change).

**Interfaces:**
- Consumes: `wireTiles`, `backButton` (Task 2).

- [ ] **Step 1: Settings — wire both tile groups against the shared index**

In `SettingsScene.ts`, `selected` spans settings (0..N-1) then bindings (N..N+M-1). After both arrays are built, add:

```typescript
const N = SETTINGS.length
wireTiles(
  this.settingTiles,
  (i) => { this.selected = i; this.refresh() },
  (i) => { this.selected = i; this.activateSelected() }, // whatever the Enter path calls
)
wireTiles(
  this.bindTiles,
  (i) => { this.selected = N + i; this.refresh() },
  (i) => { this.selected = N + i; this.activateSelected() },
)
```

Inspect the Enter handler to find the exact method that acts on `this.selected` (e.g. the code under `Enter`/`Escape` in `handleKey`). If activation is inline in `handleKey`, extract it into a small `private activateSelected()` method first, then call that from both keyboard and pointer so there is one activation path. Settings' back is `Menu` via its existing Esc-persist path — add `backButton(this, () => { this.persist(); this.scene.start('Menu') })` mirroring that exact behavior (persist THEN leave).

- [ ] **Step 2: SignUp / CarDealer / BlackMarket — wire the item list + back**

Each has a single selectable array and an index. Apply the standard `wireTiles(...)` recipe from Task 4 against that array's field + selection field + refresh/activate methods, and add `backButton(this, () => this.scene.start('Garage'))`. For BlackMarket, preserve the existing weapons-off guard — tap must go through the same `activate()` that already denies purchases in a weapons-off career.

- [ ] **Step 3: PrepareRace — wire its controls + back**

Add `backButton(this, () => this.scene.start('SignUp'))` and wire any start/confirm tile with `wireTiles` (or a tappable zone if it is a single "press Enter to start"). Confirm the start path still routes to `Race`.

- [ ] **Step 4: Profile (NewCareer) — make the flow tappable, cancel to Menu**

Wire the profile's interactive elements (name entry confirm, any option tiles) so they are reachable by tap. Add a cancel/back affordance that reuses the existing Escape path (to `Menu` on first-launch/replace, matching current logic). Do not change the persistence behavior.

- [ ] **Step 5: RacePause — tap Resume/Abandon via existing handlers (no semantic change)**

In `RacePauseScene.ts`, wire the Resume and Abandon controls to call the **exact same functions** the keyboard currently calls. Do not touch pause/resume/abandon logic — only add pointer entry points. Confirm resuming restores the pre-pause race state and confirmed-abandon still commits a DNF.

- [ ] **Step 6: Verify**

Run: `npm run build && npm test`
Expected: build PASS, tests PASS (including the pause/abandon lifecycle tests).

- [ ] **Step 7: Browser smoke**

- Settings: tap a setting to adjust/activate; tap a binding to start a rebind; BACK persists and returns.
- SignUp/CarDealer/BlackMarket: tap selects and confirms; BACK returns to Garage; weapons-off market denial still holds.
- PrepareRace: tap starts the race / BACK to SignUp.
- Profile: create a profile by tap; cancel returns to Menu.
- RacePause (start a race, press Esc): tap Resume restores exactly; tap Abandon → confirm commits a DNF.

- [ ] **Step 8: Commit**

```bash
git add src/game/scenes/SettingsScene.ts src/game/scenes/SignUpScene.ts src/game/scenes/CarDealerScene.ts src/game/scenes/BlackMarketScene.ts src/game/scenes/PrepareRaceScene.ts src/game/scenes/NewCareerScene.ts src/game/scenes/RacePauseScene.ts
git commit -m "feat(ui): touch-wire settings, market, sign-up, prepare, profile, pause"
```

---

### Task 6: Consistency sweep + letterbox + full verification

Final pass for visual consistency across all 16 screens and confirmation the letterbox reads intentionally.

**Files:**
- Possibly minor edits to any scene from Tasks 3-5.
- Verify only: `index.html`, `src/main.ts` (letterbox background already `#0b0b10`).

- [ ] **Step 1: Consistency audit**

Walk all 16 screens in the browser. Check each has: a heading in the same position/size, hint bar and/or back button consistently placed (back button top-right, hint bar top-left), even panel margins, no text colliding with panels or other text, and the new raised-plate panels rendering everywhere. Fix any stragglers inline (spacing/position only).

- [ ] **Step 2: Confirm letterbox is intentional**

Resize the browser window to a wide (≈20:9) and a tall shape. Confirm the pill/letterbox bars are the surface color (`#0b0b10`, already set on `body` in `index.html` and `backgroundColor` in `main.ts`) with no white gaps or visible seams. No code change expected; if a white gap appears, set the `#game` element and canvas background to `#0b0b10` in `index.html`.

- [ ] **Step 3: Scaled-readability check**

Confirm every screen stays readable and every back/tile target is comfortably tappable at 1280×720 (resize the window down). Fix any element that becomes cramped.

- [ ] **Step 4: Full verification**

Run: `npm test && npm run build && git diff --check`
Expected: tests PASS, build PASS, no whitespace errors.

- [ ] **Step 5: Final smoke of the critical flows**

Walk: profile create → menu → garage (repair/upgrade by tap) → sign-up → prepare → race → Esc pause (resume + abandon) → results → ranking → back to garage. Confirm keyboard and touch both drive the whole loop and no listeners stack on repeat visits (revisit Garage 3× and confirm a single tap still triggers one action).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "polish(ui): menu consistency sweep + letterbox/readability verification"
```

---

## Self-Review

**Spec coverage:**
- Refresh shared visual language → Task 1 (panel), Task 2 (tile pointer/back look). Tile visual bevel/selected polish is carried by the existing `tile()` selected state; if a stronger selected treatment is wanted it is a one-line change folded into Task 1's widget work.
- Touch foundation (tap/hover/keyboard parity, back button, letterbox) → Tasks 2, 3, 4, 5, 6.
- Per-screen cleanup, all 16 screens → Tasks 3 (Menu, Garage + overlap fix), 4 (7 screens), 5 (7 screens), 6 (consistency).
- Accessibility/lifecycle invariants → Global Constraints + per-task smoke (keyboard parity, shutdown teardown checked in Task 6 Step 5).
- No gameplay/economy/art changes → Global Constraints.

**Placeholder scan:** The per-screen recipe in Tasks 4-5 intentionally requires the implementer to read each scene for its exact field names — the wiring code is given in full; only the identifiers vary. This is inspection, not a placeholder, and each screen's back target is specified.

**Type consistency:** `wireTiles`, `backButton`, `plateNotchPoints`, and the `panel()` signature are used with the same names/signatures everywhere they appear.
