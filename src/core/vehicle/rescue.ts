// Stuck-car rescue — pure bookkeeping for the "put it back on the track" net.
//
// A car counts as stuck only when it is BOTH crawling and off the tarmac. A car
// parked on the racing line is not stuck, it is just parked, and teleporting the
// player out from under their own handbrake would be worse than the bug.

import type { Vec2 } from '../track/geometry'

export interface RescueTuning {
  /** below this speed (px/s) a car is not making progress */
  minSpeed: number
  /** how long it has to stay that way before we intervene, ms */
  stuckMs: number
}

export interface StuckSample {
  speed: number
  /** distance from the centerline, px */
  offCenter: number
  /** half the track width, px — beyond this the car is on scenery */
  halfWidth: number
}

/** Accumulates or resets the stuck timer. Returns the new elapsed time, ms. */
export function updateStuckMs(prevMs: number, s: StuckSample, dtMs: number, tuning: RescueTuning): number {
  const crawling = s.speed < tuning.minSpeed
  const offTrack = s.offCenter > s.halfWidth
  return crawling && offTrack ? prevMs + dtMs : 0
}

export function needsRescue(stuckMs: number, tuning: RescueTuning): boolean {
  return stuckMs >= tuning.stuckMs
}

export interface RescuePose {
  x: number
  y: number
  heading: number
}

/**
 * Where to drop a rescued car: the middle of the gate it was heading for,
 * pointing the way the track runs there.
 */
export function rescuePose(gateA: Vec2, gateB: Vec2, tangent: Vec2): RescuePose {
  return {
    x: (gateA.x + gateB.x) / 2,
    y: (gateA.y + gateB.y) / 2,
    heading: Math.atan2(tangent.y, tangent.x),
  }
}

/**
 * A gate center can sit inside a set-piece obstacle. Slide the drop point
 * along the gate (toward either end, nearest first) until it clears every
 * circle by `clearRadius`. Deterministic; returns the pose unchanged when it
 * is already clear, and the last candidate if nothing clears (collision
 * response will finish the separation).
 */
export function clearRescuePose(
  pose: RescuePose,
  gateA: Vec2,
  gateB: Vec2,
  circles: { x: number; y: number; r: number }[],
  clearRadius: number,
): RescuePose {
  const blocked = (x: number, y: number) =>
    circles.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + clearRadius)
  if (!blocked(pose.x, pose.y)) return pose
  const gx = gateB.x - gateA.x
  const gy = gateB.y - gateA.y
  const glen = Math.hypot(gx, gy) || 1
  const ux = gx / glen
  const uy = gy / glen
  let candidate = pose
  for (const step of [1, -1, 2, -2, 3, -3]) {
    const x = pose.x + ux * step * 60
    const y = pose.y + uy * step * 60
    candidate = { ...pose, x, y }
    if (!blocked(x, y)) return candidate
  }
  return candidate
}
