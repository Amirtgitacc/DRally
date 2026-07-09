// Pure AI driving decision — no Phaser imports. The scene supplies a context
// (target point on the racing line, upcoming corner sharpness, a car to dodge)
// and this returns the same CarInput a human would produce.

import { forwardSpeed, type CarInput, type CarPhysicsSpec, type CarState } from '../vehicle/carPhysics'
import type { Vec2 } from '../track/geometry'

export interface AiTuning {
  /** steering response: input per radian of heading error */
  steerGain: number
  /** how strongly upcoming corners reduce target speed (0 = fearless) */
  corneringCaution: number
  /** never slow below this even in hairpins, px/s */
  minCornerSpeed: number
  /** lateral offset applied to the target when dodging another car, px */
  dodge: number
}

export interface AiContext {
  /** point on the racing line to chase */
  target: Vec2
  /** upcoming corner sharpness, 0 (straight) .. 1 (hairpin) */
  curvatureAhead: number
  /** position of a car ahead to steer around, or null */
  avoid: Vec2 | null
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * How far down the racing line to scan for the next corner, in samples.
 *
 * Braking distance grows with speed, so a fixed horizon makes a fast car spot
 * every corner too late — it arrives over-speed, understeers into the barrier,
 * and grinds itself to a wreck. Scale the horizon with how fast the car is
 * actually travelling, as a fraction of what it can do.
 *
 * This is the BRAKING horizon only. The steering target stays at a fixed
 * distance: chasing a point further ahead makes the car cut the corner.
 */
export function lookAheadFor(base: number, forwardSpeed: number, topSpeed: number, gain = 1.2): number {
  const ratio = clamp(forwardSpeed / Math.max(1, topSpeed), 0, 1)
  return Math.max(2, Math.round(base * (0.65 + gain * ratio)))
}

export function aiDrive(state: CarState, ctx: AiContext, spec: CarPhysicsSpec, tune: AiTuning): CarInput {
  let tx = ctx.target.x
  let ty = ctx.target.y

  if (ctx.avoid) {
    // shift the chase target sideways, away from whichever side the obstacle is on
    const fx = Math.cos(state.heading)
    const fy = Math.sin(state.heading)
    const ox = ctx.avoid.x - state.x
    const oy = ctx.avoid.y - state.y
    const side = Math.sign(fx * oy - fy * ox) || 1
    tx += -fy * -side * tune.dodge
    ty += fx * -side * tune.dodge
  }

  const desired = Math.atan2(ty - state.y, tx - state.x)
  const headingError = wrapAngle(desired - state.heading)
  const steer = clamp(headingError * tune.steerGain, -1, 1)

  const targetSpeed = Math.max(
    tune.minCornerSpeed,
    spec.topSpeed * (1 - clamp(ctx.curvatureAhead, 0, 1) * tune.corneringCaution),
  )
  const fwd = forwardSpeed(state)

  return {
    throttle: fwd < targetSpeed ? 1 : 0,
    brake: fwd > targetSpeed * 1.12 ? 1 : 0,
    steer,
    handbrake: false,
  }
}
