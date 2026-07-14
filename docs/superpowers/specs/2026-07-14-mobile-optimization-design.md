# Mobile Optimization — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan
**Project:** 2 of 3 (Menu refresh → **Mobile optimization** → Online multiplayer)
**Builds on:** Project 1 (menu touch foundation, merged at `acc309e`)

## Context

Deathrally is a landscape, top-down combat racer built on Phaser 3 with a
deterministic core. It boots with `Phaser.Scale.FIT` (uniform scale, preserves
aspect ratio) at a fixed 1920×1080 internal resolution. Project 1 made every
menu screen tap-interactive. This project makes the **race itself** playable on
a touch device and handles device concerns (orientation, native keyboard).

Driving uses named actions from `InputManager`: `accelerate`, `brake`,
`steerLeft`, `steerRight`, `fire`, `mine`, `turbo`, `handbrake`, `pause`,
`mute`. `InputManager.update()` already merges keyboard **and** gamepad, and
already thresholds the gamepad's analog axes into the boolean steer/accelerate/
brake actions. Touch is added as a **third input source** merged the same way —
so the simulation, AI, and seed-based reproducibility are untouched.

## Goals

1. Make a race fully playable by touch on a phone/tablet in landscape.
2. On-screen controls: a left virtual joystick (steer + gas + brake) and a
   right button cluster (FIRE, MINE, TURBO), plus a visible pause button.
3. Auto-enable touch controls on touch devices; leave desktop/keyboard exactly
   as-is.
4. Lock to landscape with a rotate-device prompt in portrait.
5. Let touch-only players enter a driver name (the keyboard-only gap Project 1
   left).

## Non-goals (YAGNI)

- No settings toggle for touch controls — auto-detect covers it.
- No analog/smooth steering — the sim consumes boolean steer actions, so
  threshold crossing (as with keyboard/gamepad) is faithful and sufficient.
- No gameplay, economy, tuning, or art changes.
- Handbrake stays keyboard-only (niche; keeps the right cluster to 3 buttons).
- No reflow layout engine — FIT scaling stays (from Project 1).
- No multiplayer (Project 3).

## Control scheme (decided)

- **Left thumb — virtual joystick:** push up = accelerate, down = brake/reverse,
  tilt left/right = steer. Analog vector is thresholded into the existing
  boolean actions.
- **Right thumb — button cluster:** FIRE, MINE, TURBO (vertical stack).
- **Pause button:** top-left, triggers the same pause path as `Esc`.
- Controls are semi-transparent, drawn as Phaser objects at fixed 1920×1080
  internal coordinates, so they scale with the existing FIT logic. They overlay
  the lower corners of the play area (a phone at ≈20:9 is only slightly wider
  than 16:9, so the letterbox bars are too thin to host controls).

## Layout

```
┌──────────────────────────────────────────────────────┐
│ ⏸(pause)                    [ RACE HUD ]              │
│                                                        │
│                   [ top-down race view ]        [FIRE] │
│                                                 [MINE] │
│      ╱▔▔▔╲                                      [TURBO]│
│     │  ⦿  │  joystick                                  │
│      ╲___╱   up=gas · tilt=steer · down=brake          │
└──────────────────────────────────────────────────────┘
```

## Architecture

```
TouchControls (new — src/game/input/touchControls.ts)
  • renders joystick + FIRE/MINE/TURBO + pause (Phaser objects, high depth)
  • tracks joystick vector (x,y) in [-1,1] and a set of held buttons
        │  feeds a virtual source, exactly like the gamepad path
        ▼
InputManager.update()  ── ORs ──▶  keyboard | gamepad | TOUCH  ──▶  named actions
        │  thresholds the touch joystick vector the same way it already
        │  thresholds gamepad axes (steer at |x|>0.3, accel y<-0.35, brake y>0.35)
        ▼
   RaceScene simulation  ← unchanged
```

### Units and responsibilities

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| `joystickToActions` | `src/game/input/joystickMap.ts` (new, pure) | Map an (x,y) vector + deadzone to `{accelerate, brake, steerLeft, steerRight}` booleans. **Unit-tested (TDD).** | nothing (pure) |
| `InputManager` virtual source | `src/game/input/inputManager.ts` (modify) | Accept a touch axis + touch button state; OR it into the existing per-action merge alongside keyboard/gamepad. The touch axis is thresholded via `joystickToActions` (the canonical helper). The existing gamepad axis thresholds stay inline and unchanged (no refactor of the gamepad path — out of scope). | `joystickMap` |
| `TouchControls` | `src/game/input/touchControls.ts` (new) | Render joystick + buttons + pause; translate pointer events into the joystick vector and button set; push them to `InputManager` | Phaser, `InputManager` |
| `isTouchDevice` | `src/game/input/device.ts` (new, small) | Detect a touch-capable device (`matchMedia('(pointer: coarse)')` / `navigator.maxTouchPoints`) | nothing |
| Orientation overlay | `src/game/scenes/` or a DOM overlay | Landscape lock where supported; show a "rotate device ⟳" prompt when portrait; hide in landscape | `isTouchDevice` |
| Name entry | `NewCareerScene` + a hidden `<input>` helper | On touch, tapping the name field focuses a hidden HTML input to raise the native keyboard; write the value back into the profile flow | Project 1 profile flow |
| Pause button | `RaceScene` / `TouchControls` | Visible on touch; calls the same pause handler as `Esc` | existing pause path |

### Input-merge contract (must not regress determinism)

- Touch feeds the SAME boolean actions the sim already consumes; no new action
  types, no analog values reach the simulation.
- Simulation-affecting randomness still comes only from the race offer seed.
- `InputManager` merge order is keyboard OR gamepad OR touch per action — any
  source down = action down. Existing keyboard/gamepad behavior is byte-for-byte
  unchanged on desktop.
- `TouchControls` and its pointer listeners are torn down on scene shutdown so
  repeated races don't stack handlers (same invariant Project 1 followed).

## Accessibility / UX

- Touch targets sized generously (joystick and buttons large enough for a
  thumb); positioned clear of the HUD readouts.
- Respect `reducedShake` / `reducedFlash` for any control feedback animation.
- Keep the internal layout readable at the scaled sizes phones produce.
- Pause reachable on touch (no `Esc`); every race can be paused/exited by touch.
- Rotate prompt is clear and dismisses itself when the device is rotated.

## Race lifecycle invariants (unchanged)

- `Esc`/pause still opens `RacePause`; the touch pause button routes to the same
  handler — no direct jump to a menu.
- Pausing still freezes sim, AI, weapons, pickups, timers, and the race clock.
- Weapons-off careers still disable weapons; the FIRE/MINE touch buttons must
  respect the same weapons-off state (no firing when disabled).
- Difficulty still changes rival pace only.

## Testing & verification

- **Unit (TDD):** `joystickToActions` — deadzone yields no actions; up →
  accelerate only; down → brake only; left/right → steer; diagonal → steer +
  accelerate; beyond-range magnitudes clamp correctly.
- Keep `InputManager` tests green; add a test that a virtual touch source ORs
  into actions without breaking keyboard/gamepad merges.
- `npm run build` clean; full suite green; `git diff --check` clean.
- Browser smoke in device emulation (landscape phone): controls appear on
  touch only; joystick drives (gas/brake/steer); FIRE/MINE/TURBO act; weapons-off
  disables FIRE/MINE; pause button opens RacePause and resumes cleanly; portrait
  shows the rotate prompt; name entry raises the native keyboard and commits.
- Desktop regression: with no touch device, the race view and controls are
  visually and behaviorally unchanged.

## Rollout order (for the plan)

1. `joystickToActions` pure helper (TDD) + `isTouchDevice`.
2. `InputManager` virtual touch source (merge + test), no rendering yet.
3. `TouchControls` rendering + pointer→vector/button wiring, fed into
   `InputManager`; FIRE/MINE/TURBO respecting weapons-off; pause button.
4. Orientation lock + rotate prompt.
5. Native-keyboard name entry in the profile flow.
6. Full verification + device-emulation smoke + desktop regression pass.
