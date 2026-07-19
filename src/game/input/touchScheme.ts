/**
 * Pure touch control layout and helper functions for the touch-based input scheme.
 * No Phaser, DOM, or side effects — only data structures and calculations.
 */

// Mirrors GAME_WIDTH from src/config/game.ts, which cannot be imported here:
// that module reads window.location at load time and this one must stay browser-free.
const LAYOUT_WIDTH = 1920

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

// Layout constants for the unmirrored (left-handed) scheme
const STEER_PAD_X = 260
const STEER_PAD_Y = 920
const STEER_PAD_HALF_WIDTH = 170
const STEER_PAD_HALF_HEIGHT = 110

const HANDBRAKE_X = 160
const HANDBRAKE_Y = 600
const HANDBRAKE_R = 60

const BRAKE_X = 480
const BRAKE_Y = 700
const BRAKE_R = 80

const FIRE_X = 1660
const FIRE_Y = 920
const FIRE_R = 110

const TURBO_X = 1540
const TURBO_Y = 750
const TURBO_R = 70

const MINE_X = 1830
const MINE_Y = 980
const MINE_R = 45

// System controls stay in top-right in both mirror modes (non-mirroring)
const PAUSE_X = 1850
const PAUSE_Y = 70
const PAUSE_R = 48

const MUTE_X = 1716
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
