// Pure arcade car model — no Phaser imports. All tuning lives in CarPhysicsSpec.
// Model: velocity is split into forward and lateral components each step;
// lateral velocity decays with "grip" — low grip (or handbrake) means sliding.

export interface CarState {
  x: number
  y: number
  /** radians, 0 = facing +x */
  heading: number
  vx: number
  vy: number
}

export interface CarInput {
  /** 0..1 */
  throttle: number
  /** 0..1 — brakes when moving forward, reverses near standstill */
  brake: number
  /** -1..1, positive turns clockwise on screen */
  steer: number
  handbrake: boolean
}

export interface CarPhysicsSpec {
  /** px/s^2 */
  accel: number
  brakeForce: number
  reverseAccel: number
  /** px/s */
  topSpeed: number
  reverseTopSpeed: number
  /** rad/s at full steer and full steering authority */
  turnRate: number
  /** 1/s — how fast lateral (sliding) velocity dies. Lower = more drift */
  grip: number
  /** grip while the handbrake is held — much lower, enables drifting */
  handbrakeGrip: number
  /** 1/s decay on forward speed (rolling resistance + air) */
  drag: number
  /** forward speed (px/s) at which steering reaches full authority */
  steerSaturationSpeed: number
}

export const IDLE_INPUT: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Signed speed along the car's heading. Negative = reversing. */
export function forwardSpeed(s: CarState): number {
  return s.vx * Math.cos(s.heading) + s.vy * Math.sin(s.heading)
}

/** Signed sideways (sliding) speed. */
export function lateralSpeed(s: CarState): number {
  return -s.vx * Math.sin(s.heading) + s.vy * Math.cos(s.heading)
}

export function speed(s: CarState): number {
  return Math.hypot(s.vx, s.vy)
}

export function stepCar(state: CarState, input: CarInput, spec: CarPhysicsSpec, dt: number): CarState {
  const vF0 = forwardSpeed(state)

  // Steering authority scales with forward speed (no spinning in place),
  // and flips naturally when reversing.
  const steerAuthority = clamp(vF0 / spec.steerSaturationSpeed, -1, 1)
  const heading = state.heading + input.steer * spec.turnRate * steerAuthority * dt

  const fx = Math.cos(heading)
  const fy = Math.sin(heading)

  let accel = input.throttle * spec.accel
  if (input.brake > 0) {
    accel -= input.brake * (vF0 > 15 ? spec.brakeForce : spec.reverseAccel)
  }

  let vx = state.vx + fx * accel * dt
  let vy = state.vy + fy * accel * dt

  const vFRaw = vx * fx + vy * fy
  const grip = input.handbrake ? spec.handbrakeGrip : spec.grip
  const latDecay = Math.exp(-grip * dt)
  const vLx = (vx - vFRaw * fx) * latDecay
  const vLy = (vy - vFRaw * fy) * latDecay

  const vF = clamp(vFRaw * Math.exp(-spec.drag * dt), -spec.reverseTopSpeed, spec.topSpeed)

  vx = fx * vF + vLx
  vy = fy * vF + vLy

  return {
    x: state.x + vx * dt,
    y: state.y + vy * dt,
    heading,
    vx,
    vy,
  }
}
