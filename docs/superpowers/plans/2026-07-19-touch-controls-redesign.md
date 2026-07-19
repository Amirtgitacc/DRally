# Touch Controls Redesign — Spec & Task Plan (2026-07-19)

Reference: Microsoft GDK "Touch Adaptation Kit designer's guide". Decisions confirmed by user:
redesign per the guide, auto-accelerate + brake button, Chrome-emulation verification,
extras = touch settings + handbrake + fullscreen + multiplayer pass.

## Spec

### Race layout (1920×1080 HUD space, landscape)

```
┌──────────────────────────────────────────────────┐
│ [⏸ PAUSE]   race HUD (existing)          [🔇]   │  system row (upper corners)
│                                                  │
│                   game view                      │
│               (center stays clear)               │
│                                                  │
│  (HANDBRK)                            (TURBO)    │  secondary arcs
│ ╭─────────╮  (BRAKE)          (MINE) ╭───────╮   │
│ │  STEER  │                          │ FIRE  │   │  primary controls
│ │  ◀   ▶  │                          ╰───────╯   │
│ ╰─────────╯                                      │
└──────────────────────────────────────────────────┘
```

- **Two-thumb budget** (guide rule): full core loop = left thumb steers, right thumb fires.
- **Steer pad (left primary):** wide pad, thumb position/slide left or right of center →
  `steerLeft`/`steerRight`. Slide between sides without lifting. Single large control, no cluster.
- **Auto-accelerate:** while touch controls are active in a race, `accelerate` is held
  automatically; **BRAKE** button (left secondary) overrides to `brake`. Touch-only —
  keyboard/gamepad behavior unchanged. No sim changes: implemented entirely through the
  existing `InputManager` touch source.
- **FIRE (right primary):** largest button on screen. **TURBO** upper-right arc, **MINE**
  lower slot — split, not stacked, so fire+turbo chords work.
- **HANDBRAKE:** left secondary (new — no touch button exists today).
- **Context layouts** (guide rule): weapons-off careers hide FIRE and MINE; network races'
  pause button routes to leave-race (existing behavior preserved).
- **Visual states:** idle semi-transparent, pressed = full opacity + amber tint from
  `theme.ts`; turbo shows active state while engaged. All art from theme tokens, no
  generic gamepad icons.

### Touch settings (persisted in `deathrally-settings-v1`)

| Field | Type | Default | Effect |
|---|---|---|---|
| `touchOpacity` | number 0.2–1 | 0.5 | idle opacity of all touch controls |
| `touchMirrored` | boolean | false | swap left/right control groups (left-handed) |

Sanitized in `normalizeSettings`, migration tests, two new rows in `SettingsScene`
(only functional change for touch users; visible everywhere like other settings).

### Fullscreen + orientation

On touch devices, first tap after load requests fullscreen, then attempts
`screen.orientation.lock('landscape')` (lock requires fullscreen). Existing rotate
overlay stays as fallback. No-ops silently on unsupported browsers/desktop.

### Out of scope

Menu touch support (already done via `wireTiles`), native keyboard name entry (done),
any sim/economy/AI change, any keyboard/gamepad behavior change.

## Non-negotiables (from AGENTS.md)

Core stays Phaser-free; touch feeds `InputManager.setTouchAxis/setTouchButton` only.
Pause freezes everything; abandon semantics unchanged. Listeners removed on shutdown.
Respect `reducedFlash`/`reducedShake`. 1920×1080 layout readable at 1280×720.
`npm test` + `npm run build` + `git diff --check` before done.

## Task plan

Branch: `feat/touch-controls-v2`. One commit per task. Ledger: this file (checkboxes
updated as tasks land). No two agents edit the same file concurrently — tasks are
sequenced by file ownership. Tests written first per task. Each task gets a fresh
implementer (cheapest capable model) + an independent reviewer (spec-compliance +
quality); fix loops until clean.

- [ ] **T1 — Pure touch-scheme logic** (haiku): `src/game/input/touchScheme.ts` — pure
  functions for steer-pad pointer→actions mapping and auto-accel/brake resolution.
  Tests first in `tests/game/input/touchScheme.test.ts`. No Phaser.
- [ ] **T2 — Settings fields + UI** (haiku): `touchOpacity`/`touchMirrored` in
  `settings.ts` + migration tests + `SettingsScene` rows.
- [ ] **T3 — TouchControls rebuild** (sonnet): rewrite `touchControls.ts` to the spec
  layout using T1 logic + T2 settings; visual states; weapons-off context; mirroring;
  wire auto-accel; RaceScene hookup (weapons flag pass-through).
- [ ] **T4 — Fullscreen + orientation engage** (haiku): extend
  `systems/orientation.ts`; first-gesture fullscreen request on touch devices.
- [ ] **T5 — Integration + emulated smoke** (strong model): full race via touch in
  Chrome device emulation (single-player + multiplayer flows, pause/resume/abandon,
  weapons-off market career), fix integration bugs.
- [ ] **T6 — Adversarial whole-diff review**: parallel finder agents per risk area
  (race invariants, input correctness, persistence/migration, UI/accessibility,
  MP behavior) → independent verifiers refute each finding → fix confirmed findings
  with regression tests → re-run `npm test` + `npm run build` + emulated smoke.

## Progress ledger

| Task | Status | Commit | Notes |
|---|---|---|---|
| T1 | done | c1f4d29 | review: margin test unenforced + <5px button gaps; fixed (≥24px gaps, boundary/NaN tests). GAME_WIDTH import reverted — config/game.ts touches window, module must stay pure |
| T2 | done | 5bc7af8 | review found bottom-row overflow; fixed (68px rhythm, 65px clearance) |
| T3 | done | 98f03fa | TouchControls rebuilt on touchScheme; RaceScene hookup + toggleMute refactor |
| T4 | done | be93126 | review blocker: rejected fullscreen permanently disarmed the feature; fixed with re-arm state machine |
| T5 | done | 584846f | real-app emulation caught HUD collisions in 3 corners + the forced-throttle blocker |
| T6 | done | e9b5dfa | 3 parallel finders + refuting verifier; fixed held-button-through-pause, mute desync, contrast, briefing text |
