# Menu Visual Refresh + Touch Foundation — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan
**Project:** 1 of 3 (Menu refresh → Mobile optimization → Online multiplayer)

## Context

Deathrally's menu screens are hand-placed at a fixed 1920×1080 internal
resolution, sharing a `theme.ts` + `widgets.ts` visual language. The game boots
with `Phaser.Scale.FIT` + `CENTER_BOTH`, so the whole canvas already scales
uniformly to any display while preserving aspect ratio. The screens are
keyboard-only and carry a few concrete layout bugs (e.g. the Garage right panel
overlaps `ENGINE` onto `WINS`).

This project is the first of three. It deliberately builds the **touch/pointer
foundation** that Project 2 (mobile) will inherit, while keeping the FIT scaling
model — no reflow engine.

## Goals

1. **Refresh the shared visual language** (ambition level B): keep the industrial
   night-racing aesthetic; level up the shared primitives so every screen
   improves at once.
2. **Add a touch/pointer foundation**: every menu tile and interactive row works
   by tap, hover, and keyboard, with full keyboard parity preserved.
3. **Fix per-screen layout issues** across *all* non-gameplay screens in one
   consistent sweep.

## Non-goals (YAGNI)

- No reflow / RESIZE layout engine — FIT scaling stays.
- No new screens (the multiplayer menu is Project 3).
- No gameplay, economy, tuning, or art-asset changes.
- No on-screen driving controls (that is Project 2, race scene).

## Scope: screens covered

All non-gameplay scenes (everything except `Boot`, the asset loader, and `Race`,
the gameplay scene, which is Project 2):

`Menu`, `Profile` (NewCareer), `Garage`, `BlackMarket`, `CarDealer`, `Venues`,
`SignUp`, `PrepareRace`, `Results`, `Ranking`, `Champion`, `HallOfFame`,
`Settings`, `Credits`, `Preview`, `RacePause` (overlay).

## Architecture

The leverage point: every screen draws from shared `widgets.ts` primitives, so
upgrading the primitives improves all screens at once. Then a per-screen sweep
cleans up the remainder.

```
theme.ts / widgets.ts  ──drives──▶  16 menu scenes
      ▲                                   │
      │ upgrade primitives once           │ per-screen cleanup sweep on top
      └───────────────────────────────────┘
```

### A. Shared visual-language upgrades

| Primitive | Now | After |
|---|---|---|
| `panel()` | Flat rectangle + 2px border | Raised plate: top-edge highlight + drop shadow, hairline inner border, subtle corner notch. Backward-compatible signature (new look is the default; callers unchanged). |
| `tile()` | Keyboard-only, flat | Pointer + keyboard: `pointerover` = focus, `pointerdown`/tap = activate. Inner bevel; stronger selected state (glow on WebGL, flat fallback on canvas). |
| Type / spacing | Ad-hoc per-scene offsets | Consistent use of the `SPACE` scale for headers, margins, and column gaps. |
| `sectionLabel` / `rule` / `hazardBar` | Fine | Minor consistency tuning so cards read as one family. |

Constraints:
- `tile()` keeps its current `TileHandle` return shape; new pointer wiring is
  additive. Existing callers (which drive selection from the scene's keyboard
  handler) must keep working unchanged.
- All effects must respect the WebGL/canvas split already used by `heading()`
  (glow only on WebGL; graceful flat fallback).

### B. Touch / pointer foundation

- **Pointer-driven tiles/rows:** the upgraded `tile()` fires an `onActivate`
  callback and reports focus changes, so a tap selects+activates and a hover
  focuses. Scenes register their activate logic once; keyboard and pointer both
  route through it.
- **`backButton()` widget:** a visible, tappable back affordance (top-left) for
  every screen, because mobile has no `Esc`. On desktop it coexists with the
  existing `Esc` handler. It routes to the same target the scene's back/Esc
  logic already uses.
- **Shared pointer helper:** one small helper so scenes don't each re-wire
  pointer events by hand; keeps listener teardown consistent with the existing
  `shutdown` cleanup pattern.
- **Graceful letterbox:** fill the pill/letterbox bars with the surface color so
  scaling on non-16:9 screens looks intentional. No controls placed there yet.

### C. Per-screen cleanup sweep

Walk all 16 screens for concrete issues. Known starting items:
- **Garage:** fix `ENGINE`↔`WINS` overlap in the right panel; realign the pip
  rows to sit below the stats block; even the bottom tile-row gaps.
- Consistent placement of header / hazard bar / hint bar / back button on every
  screen.
- Even margins and panel sizing; no text colliding with panels or other text.

## Accessibility

- Keyboard navigation and focus order preserved on every screen (parity gate).
- Pointer targets sized for touch (tiles already large; verify smaller rows).
- Back affordance visible and reachable on every screen.
- Maintain sufficient contrast per existing theme tokens; no contrast
  regressions from the new panel/tile treatments.

## Input & lifecycle invariants (must not regress)

- Every scene removes its keyboard **and** new pointer listeners on `shutdown`
  so repeated visits don't stack handlers (existing AGENTS.md rule).
- `RacePause` remains an overlay that pauses `Race`; its refresh must not alter
  pause/resume/abandon semantics — only its presentation and touch affordances.
- No change to persistence, race lifecycle, or economy behavior.

## Testing & verification

UI-only work, so no new unit tests are required unless a pure layout helper is
introduced (in which case unit-test that helper). Verification is:

- `npm test` stays green.
- `npm run build` passes (strict TS + production build).
- `git diff --check` clean.
- Browser smoke every screen for: touch activation, hover focus, keyboard
  parity, visible back affordance, and no layout collisions — checked at both
  1920×1080 and scaled 1280×720.

## Rollout order (for the plan)

1. Shared primitive upgrades (`theme.ts`, `widgets.ts`) + pointer helper +
   `backButton()`. Verify on one representative screen (Garage).
2. Wire touch + back into each screen, screen by screen, verifying parity.
3. Per-screen layout cleanup sweep.
4. Full-suite verification pass.
