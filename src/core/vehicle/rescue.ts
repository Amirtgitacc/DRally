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
