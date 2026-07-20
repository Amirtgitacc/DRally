/**
 * Pure touch control layout and helper functions for the touch-based input scheme.
 * No Phaser, DOM, or side effects — only data structures and calculations.
 */

import { STATUS_PLATE_X, TOUCH_HUD_SCALE, anchorBottom, anchorRight, statusPlateWidth } from '../race/hudScale'

// Mirrors GAME_WIDTH from src/config/game.ts, which cannot be imported here:
// that module reads window.location at load time and this one must stay browser-free.
const LAYOUT_WIDTH = 1920
const LAYOUT_HEIGHT = 1080

export interface CircleControl {
  x: number
  y: number
  r: number
}

export interface PadControl {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
}

export interface TouchLayout {
  steerPad: PadControl
  handbrake: CircleControl
  brake: CircleControl
  fire: CircleControl
  turbo: CircleControl
  mine: CircleControl
  pause: CircleControl
  mute: CircleControl
}

/**
 * Screen regions the race HUD already owns, measured from the running scene:
 * driver/cash readouts (top left), lap + timer + standings (top right), the
 * hull/ammo/turbo/mines panel and speed (bottom left), and the position
 * readout (bottom right). Touch controls must not cover any of them.
 *
 * Touch controls only ever render on touch devices (`isTouchDevice()`), and
 * on those devices RaceScene draws its HUD at `TOUCH_HUD_SCALE`, not 1x — so
 * these boxes describe the *scaled* HUD footprint, not the desktop one.
 *
 * The top-left (driver/cash) cluster keeps its original box: every text
 * element there uses a top-left anchor and grows down/right into padding
 * that was already generous at 1x, so scaling its font doesn't grow its
 * footprint enough to matter. The standings (top-right) and position
 * (bottom-right) clusters do outgrow their boxes — their line heights and
 * text widths were already tight at 1x — so those two boxes scale with the
 * HUD using the same corner-anchor math RaceScene uses to lay them out. The
 * bottom-left status plate's row grid scales horizontally (label · bar ·
 * value no longer fit a 1x-wide row at touch font sizes), so its box widens
 * to the scaled plate right edge — statusPlateWidth caps that edge at
 * x=524, 16px clear of the brake button's hit box (starts x=540). Its top
 * stays at y=820: rows keep their 36px pitch and the gear tag above the
 * plate lifts to exactly y=820 (gearTagY), because the steer pad's hit zone
 * ends at y=815 and the band between cannot grow.
 */
export const HUD_RESERVED: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  { x: 0, y: 0, w: 620, h: 160 },
  // standings plate's right edge sits 320px in from the screen edge at 1x
  // (plate starts at x=1600, not 1650); scaled, that gap grows to 320*1.4=448
  { x: anchorRight(LAYOUT_WIDTH, 320, TOUCH_HUD_SCALE), y: 0, w: 320 * TOUCH_HUD_SCALE, h: 300 * TOUCH_HUD_SCALE },
  // status plate sits at y=854; the gear tag row above it starts at y=820.
  // Width = scaled plate right edge (14 + 510 = 524; see hudScale.ts)
  { x: 0, y: 820, w: STATUS_PLATE_X + statusPlateWidth(TOUCH_HUD_SCALE), h: 260 },
  {
    x: anchorRight(LAYOUT_WIDTH, 180, TOUCH_HUD_SCALE),
    y: anchorBottom(LAYOUT_HEIGHT, 130, TOUCH_HUD_SCALE),
    w: 180 * TOUCH_HUD_SCALE,
    h: 130 * TOUCH_HUD_SCALE,
  },
]

/** Extra hit-area padding around the steer pad, in the same 1920x1080 space. */
export const STEER_ZONE_SLOP = 40

// Layout constants for the unmirrored (right-handed) scheme. Positions sit in
// the thumb arcs near the bottom corners while clearing every HUD_RESERVED box.
// pad y accounts for STEER_ZONE_SLOP: the hit zone, not just the drawn rect,
// has to clear the status plate below it
const STEER_PAD_X = 290
const STEER_PAD_Y = 680
const STEER_PAD_HALF_WIDTH = 190
const STEER_PAD_HALF_HEIGHT = 95

const HANDBRAKE_X = 620
const HANDBRAKE_Y = 620
const HANDBRAKE_R = 60

const BRAKE_X = 620
const BRAKE_Y = 800
const BRAKE_R = 80

const FIRE_X = 1640
const FIRE_Y = 700
const FIRE_R = 110

const TURBO_X = 1440
const TURBO_Y = 620
const TURBO_R = 70

const MINE_X = 1800
const MINE_Y = 570
const MINE_R = 45

// Infrequent system actions belong in the upper row (per the touch-layout
// guide). They sit at the right end of the free gap between the HUD readouts
// to shorten the thumb stretch, and do not mirror — a pause button that moves
// between races would be worse than one that is always in the same place.
// Pushed 150px left of their original x (1530/1400) because the scaled
// standings HUD box now reaches to x=1472 — see HUD_RESERVED.
const PAUSE_X = 1380
const PAUSE_Y = 70
const PAUSE_R = 48

const MUTE_X = 1250
const MUTE_Y = 70
const MUTE_R = 48

/**
 * Compute the touch control layout for the given mirror mode.
 * In mirrored mode, all drive controls are horizontally flipped (x → GAME_WIDTH - x),
 * but system controls (pause, mute) remain in the top-right (non-mirroring).
 */
export function computeTouchLayout(mirrored: boolean): TouchLayout {
  const mirrorX = (x: number) => (mirrored ? LAYOUT_WIDTH - x : x)

  return {
    steerPad: {
      x: mirrorX(STEER_PAD_X),
      y: STEER_PAD_Y,
      halfWidth: STEER_PAD_HALF_WIDTH,
      halfHeight: STEER_PAD_HALF_HEIGHT,
    },
    handbrake: {
      x: mirrorX(HANDBRAKE_X),
      y: HANDBRAKE_Y,
      r: HANDBRAKE_R,
    },
    brake: {
      x: mirrorX(BRAKE_X),
      y: BRAKE_Y,
      r: BRAKE_R,
    },
    fire: {
      x: mirrorX(FIRE_X),
      y: FIRE_Y,
      r: FIRE_R,
    },
    turbo: {
      x: mirrorX(TURBO_X),
      y: TURBO_Y,
      r: TURBO_R,
    },
    mine: {
      x: mirrorX(MINE_X),
      y: MINE_Y,
      r: MINE_R,
    },
    pause: {
      x: PAUSE_X,
      y: PAUSE_Y,
      r: PAUSE_R,
    },
    mute: {
      x: MUTE_X,
      y: MUTE_Y,
      r: MUTE_R,
    },
  }
}

/**
 * Determine left/right steer from a pointer's x position relative to the steer pad.
 * Normalizes the offset from pad center by halfWidth.
 * Within deadzone → both false; beyond → left or right true.
 * Clamps: pointers beyond pad edge still steer (full deflection).
 */
export function steerFromPad(
  pointerX: number,
  pad: { x: number; halfWidth: number },
  deadzoneRatio: number = 0.18
): { steerLeft: boolean; steerRight: boolean } {
  const offset = pointerX - pad.x
  const normalized = offset / pad.halfWidth
  const clamped = Math.max(-1, Math.min(1, normalized))

  if (Math.abs(clamped) < deadzoneRatio) {
    return { steerLeft: false, steerRight: false }
  }

  return {
    steerLeft: clamped < 0,
    steerRight: clamped > 0,
  }
}

/**
 * Auto-accelerate rule for the touch scheme.
 * schemeActive && !braking → accelerate true, brake false
 * schemeActive && braking → accelerate false, brake true
 * !schemeActive → both false
 */
export function resolveThrottle(state: {
  schemeActive: boolean
  braking: boolean
}): { accelerate: boolean; brake: boolean } {
  if (!state.schemeActive) {
    return { accelerate: false, brake: false }
  }

  if (state.braking) {
    return { accelerate: false, brake: true }
  }

  return { accelerate: true, brake: false }
}

/**
 * Test whether a point is inside a circle (or within slop pixels of the edge).
 */
export function pointInCircle(
  px: number,
  py: number,
  c: CircleControl,
  slop: number = 0
): boolean {
  const dist = Math.hypot(px - c.x, py - c.y)
  return dist <= c.r + slop
}

/**
 * Test whether a point is inside the steer pad rectangle (or within slop pixels of the edge).
 */
export function pointInPad(
  px: number,
  py: number,
  pad: PadControl,
  slop: number = 0
): boolean {
  const dx = Math.abs(px - pad.x)
  const dy = Math.abs(py - pad.y)
  return dx <= pad.halfWidth + slop && dy <= pad.halfHeight + slop
}

/**
 * Actions whose button is still under a finger. A held touch produces no
 * repeat event (unlike keyboard auto-repeat), so InputManager.reset() during a
 * pause would otherwise leave a still-pressed button dead for the rest of the
 * race. The caller re-asserts these every frame.
 */
export function heldButtonActions<T>(
  entries: ReadonlyArray<{ action: T | null; pointerId: number | null }>,
): T[] {
  return entries.filter((e) => e.pointerId !== null && e.action !== null).map((e) => e.action as T)
}

/**
 * The auto-accelerate scheme may only drive the car once the player has
 * actually used the on-screen controls. `isTouchDevice()` is true for any
 * touch-capable machine including hybrid laptops, so a keyboard player on such
 * a device must never receive forced throttle they cannot release.
 */
export function isSchemeActive(engaged: boolean, finished: boolean): boolean {
  return engaged && !finished
}

/**
 * Combine the steer pad's discrete state and the auto-accelerate throttle
 * state into the (x, y) axis InputManager.setTouchAxis expects. accelerate
 * and brake are mutually exclusive by construction (resolveThrottle never
 * returns both true), so y is unambiguous.
 */
export function driveAxisFromTouch(
  steer: -1 | 0 | 1,
  throttle: { accelerate: boolean; brake: boolean }
): { x: number; y: number } {
  const y = throttle.accelerate ? -1 : throttle.brake ? 1 : 0
  return { x: steer, y }
}
