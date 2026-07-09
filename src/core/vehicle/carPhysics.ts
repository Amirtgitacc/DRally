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
  /** height above the tarmac, px. > 0 means airborne: no steering, no traction */
  z: number
  /** vertical velocity, px/s */
  vz: number
}

/** A car sitting on the ground at rest — the base every spawn/test builds from. */
export const GROUNDED: Pick<CarState, 'z' | 'vz'> = { z: 0, vz: 0 }

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

/**
 * Downward pull on an airborne car, px/s^2. The real number is tuning and
 * lives in data (MINE_BLAST.gravity); this is only the fallback for callers
 * that don't care about launch height.
 */
export const DEFAULT_GRAVITY_Z = 1600

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function isAirborne(s: CarState): boolean {
  return s.z > 0
}

/** True on the single step where the car came back down. */
export function justLanded(before: CarState, after: CarState): boolean {
  return before.z > 0 && after.z <= 0
}

/** Kick a car off the ground. Positive vz = upward. */
export function launchCar(s: CarState, vz: number): CarState {
  return { ...s, vz: Math.max(s.vz, vz) }
}

/** How long a car launched at this vz stays off the ground, seconds. */
export function airtimeFor(vz: number, gravity: number): number {
  return (2 * vz) / gravity
}

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

export function stepCar(
  state: CarState,
  input: CarInput,
  spec: CarPhysicsSpec,
  dt: number,
  gravity = DEFAULT_GRAVITY_Z,
): CarState {
  // Airborne: the wheels have nothing to push against. Steering, throttle,
  // brakes, grip and drag all do nothing — the car carries its velocity and
  // arcs back down. This is what makes a mine hit feel like a mine hit.
  if (state.z > 0 || state.vz > 0) {
    const vz = state.vz - gravity * dt
    const z = state.z + vz * dt
    const landed = z <= 0
    return {
      x: state.x + state.vx * dt,
      y: state.y + state.vy * dt,
      heading: state.heading,
      vx: state.vx,
      vy: state.vy,
      z: landed ? 0 : z,
      vz: landed ? 0 : vz,
    }
  }

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
    z: 0,
    vz: 0,
  }
}
