/**
 * Pure touch control layout and helper functions for the touch-based input scheme.
 * No Phaser, DOM, or side effects — only data structures and calculations.
 */

import { TOUCH_HUD_SCALE, anchorRight } from '../race/hudScale'

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
 * Screen regions the race HUD owns on touch devices, which push the controls
 * into the empty corners. On touch (see RaceScene.buildHud's touch branch) the
 * HUD is: cash/driver/gear top-left, the race position top-centre, lap/timer/
 * standings top-right, and a compact hull-bar + speed readout bottom-centre —
 * every ammo/turbo/mine count moved onto the buttons themselves. The joystick
 * (bottom-left corner) and action cluster (bottom-right corner) must clear all
 * four boxes. Boxes use TOUCH_HUD_SCALE because the HUD is drawn at 1.4x there.
 */
export const HUD_RESERVED: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  // top-left: cash + driver identity + gear tag
  { x: 0, y: 0, w: 520, h: 240 },
  // top-centre: race position readout ("4th")
  { x: LAYOUT_WIDTH / 2 - 170, y: 0, w: 340, h: 130 },
  // top-right: lap/time/best + standings, anchored to the screen edge
  { x: anchorRight(LAYOUT_WIDTH, 320, TOUCH_HUD_SCALE), y: 0, w: 320 * TOUCH_HUD_SCALE, h: 306 * TOUCH_HUD_SCALE },
  // bottom-centre: hull bar + speed, between the two control clusters
  { x: LAYOUT_WIDTH / 2 - 200, y: LAYOUT_HEIGHT - 160, w: 400, h: 160 },
]

/** Extra hit-area padding around the steer pad, in the same 1920x1080 space. */
export const STEER_ZONE_SLOP = 40

// Layout constants for the unmirrored (right-handed) scheme. The controls are
// tucked into the two bottom corners so the thumbs never cover the play area;
// the HUD lives along the top and bottom-centre (see HUD_RESERVED).
//
// Left corner: a round joystick dial (drawn as a circle; the hit test stays a
// square that bounds it, only making the corners forgiving). Square, so
// halfWidth === halfHeight. Its hit zone bottom (835 + 150 + 40 = 1025) stays
// on-screen (< 1080).
const STEER_PAD_X = 215
const STEER_PAD_Y = 835
const STEER_PAD_HALF_WIDTH = 150
const STEER_PAD_HALF_HEIGHT = 150

// brake sits just right of the joystick's grab zone (right edge 405):
// 500 - 56 = 444, clear of it, still reachable by the left thumb.
const BRAKE_X = 500
const BRAKE_Y = 900
const BRAKE_R = 56

// right corner action cluster: TURBO/MINE on top, HB/FIRE below, FIRE largest.
const HANDBRAKE_X = 1560
const HANDBRAKE_Y = 890
const HANDBRAKE_R = 48

const FIRE_X = 1725
const FIRE_Y = 840
const FIRE_R = 92

const TURBO_X = 1580
const TURBO_Y = 690
const TURBO_R = 62

const MINE_X = 1790
const MINE_Y = 655
const MINE_R = 46

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
