// Multiplayer-only car balance. Single-player never calls this.
// Every MP car is derived from a shared fully-upgraded power center, then
// tilted by car size: smaller = faster but less grip, bigger = slower but
// grippier and tougher. Pure function of carId (no randomness) so the server
// sim and the client predictor derive identical specs from the same chassis.
import { mpCarById } from '../../data/mpCars'
import { STARTER_CAR } from '../../data/cars'
import type { CarPhysicsSpec } from './carPhysics'

/** Shared MP power center (≈ the roster's average fully-upgraded stats). */
const CENTER = { topSpeed: 640, accel: 850, grip: 8.2, turnRate: 4.0 }

const SIZE_MID = 1.05
const SIZE_HALF_RANGE = 0.15
const SPEED_TILT = 0.05 // topSpeed & accel: small faster
const HANDLING_TILT = 0.06 // grip & turnRate: big grippier
const RESIST_TILT = 0.1 // incoming-damage multiplier: big tougher

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Size axis in [-1, +1]: -1 = smallest MP car, +1 = largest. */
function sizeTilt(sizeScale: number): number {
  return clamp((sizeScale - SIZE_MID) / SIZE_HALF_RANGE, -1, 1)
}

export function mpCarSpec(carId: string): CarPhysicsSpec {
  const base = mpCarById(carId) ?? STARTER_CAR
  const t = sizeTilt(base.sizeScale)
  const speed = 1 - SPEED_TILT * t
  const handling = 1 + HANDLING_TILT * t
  return {
    accel: CENTER.accel * speed,
    brakeForce: base.brakeForce,
    reverseAccel: base.reverseAccel,
    topSpeed: CENTER.topSpeed * speed,
    reverseTopSpeed: base.reverseTopSpeed,
    turnRate: CENTER.turnRate * handling,
    grip: CENTER.grip * handling,
    handbrakeGrip: base.handbrakeGrip,
    drag: base.drag,
    steerSaturationSpeed: base.steerSaturationSpeed,
  }
}

/** Incoming-damage multiplier for an MP car (1 = neutral, <1 tougher). */
export function mpDamageResist(carId: string): number {
  const base = mpCarById(carId) ?? STARTER_CAR
  return 1 - RESIST_TILT * sizeTilt(base.sizeScale)
}
