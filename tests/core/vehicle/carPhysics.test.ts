import { describe, expect, it } from 'vitest'
import {
  IDLE_INPUT,
  airtimeFor,
  forwardSpeed,
  isAirborne,
  justLanded,
  lateralSpeed,
  launchCar,
  stepCar,
  type CarInput,
  type CarPhysicsSpec,
  type CarState,
} from '../../../src/core/vehicle/carPhysics'

const spec: CarPhysicsSpec = {
  accel: 600,
  brakeForce: 900,
  reverseAccel: 300,
  topSpeed: 500,
  reverseTopSpeed: 150,
  turnRate: 3,
  grip: 6,
  handbrakeGrip: 1.2,
  drag: 0.25,
  steerSaturationSpeed: 140,
}

const rest: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 0, z: 0, vz: 0 }
const DT = 1 / 60

function simulate(state: CarState, input: Partial<CarInput>, seconds: number): CarState {
  const full: CarInput = { ...IDLE_INPUT, ...input }
  let s = state
  for (let t = 0; t < seconds; t += DT) s = stepCar(s, full, spec, DT)
  return s
}

describe('stepCar', () => {
  it('accelerates along its heading under throttle', () => {
    const s = simulate(rest, { throttle: 1 }, 1)
    expect(s.x).toBeGreaterThan(50)
    expect(Math.abs(s.y)).toBeLessThan(1e-6)
    expect(forwardSpeed(s)).toBeGreaterThan(100)
  })

  it('clamps forward speed at topSpeed', () => {
    const s = simulate(rest, { throttle: 1 }, 10)
    expect(forwardSpeed(s)).toBeLessThanOrEqual(spec.topSpeed + 1e-6)
    expect(forwardSpeed(s)).toBeGreaterThan(spec.topSpeed * 0.95)
  })

  it('does not rotate at standstill', () => {
    const s = simulate(rest, { steer: 1 }, 1)
    expect(s.heading).toBeCloseTo(0, 10)
  })

  it('turns while moving', () => {
    const moving = simulate(rest, { throttle: 1 }, 1)
    const turned = simulate(moving, { throttle: 1, steer: 1 }, 0.5)
    expect(turned.heading).toBeGreaterThan(0.5)
  })

  it('grip decays lateral (sliding) velocity', () => {
    const sliding: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 200, z: 0, vz: 0 }
    const s = simulate(sliding, {}, 1)
    expect(Math.abs(lateralSpeed(s))).toBeLessThan(5)
  })

  it('handbrake keeps the car sliding much longer', () => {
    const sliding: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 200, z: 0, vz: 0 }
    const s = simulate(sliding, { handbrake: true }, 1)
    expect(Math.abs(lateralSpeed(s))).toBeGreaterThan(30)
  })

  it('brake decelerates forward motion', () => {
    const moving: CarState = { x: 0, y: 0, heading: 0, vx: 300, vy: 0, z: 0, vz: 0 }
    const s = simulate(moving, { brake: 1 }, 0.3)
    expect(forwardSpeed(s)).toBeLessThan(100)
    expect(forwardSpeed(s)).toBeGreaterThan(0)
  })

  it('holding brake from standstill reverses, clamped at reverseTopSpeed', () => {
    const s = simulate(rest, { brake: 1 }, 3)
    expect(forwardSpeed(s)).toBeLessThan(-10)
    expect(forwardSpeed(s)).toBeGreaterThanOrEqual(-spec.reverseTopSpeed - 1e-6)
  })
})

describe('airborne cars', () => {
  const GRAVITY = 1600
  const LAUNCH_VZ = 640

  /** A car cruising forward, launched off the ground (as a mine blast does). */
  const launched = launchCar({ x: 0, y: 0, heading: 0, vx: 300, vy: 0, z: 0, vz: 0 }, LAUNCH_VZ)

  function flyUntilLanded(start: CarState, input: Partial<CarInput>): { state: CarState; airtime: number } {
    const full: CarInput = { ...IDLE_INPUT, ...input }
    let s = start
    let airtime = 0
    for (let i = 0; i < 600; i++) {
      const next = stepCar(s, full, spec, DT, GRAVITY)
      airtime += DT
      if (justLanded(s, next)) return { state: next, airtime }
      s = next
    }
    throw new Error('car never landed')
  }

  it('leaves the ground when launched', () => {
    const s = stepCar(launched, IDLE_INPUT, spec, DT, GRAVITY)
    expect(isAirborne(s)).toBe(true)
    expect(s.z).toBeGreaterThan(0)
  })

  it('ignores steering while airborne', () => {
    const s = stepCar(launched, { ...IDLE_INPUT, steer: 1 }, spec, DT, GRAVITY)
    expect(s.heading).toBe(launched.heading)
  })

  it('ignores throttle and brake while airborne — velocity just carries', () => {
    const s = stepCar(launched, { ...IDLE_INPUT, throttle: 1, brake: 1 }, spec, DT, GRAVITY)
    expect(s.vx).toBe(launched.vx)
    expect(s.vy).toBe(launched.vy)
    expect(s.x).toBeCloseTo(launched.vx * DT, 6)
  })

  it('does not bleed sideways velocity in the air (no grip without tarmac)', () => {
    const sideways = launchCar({ x: 0, y: 0, heading: 0, vx: 0, vy: 200, z: 0, vz: 0 }, LAUNCH_VZ)
    const s = stepCar(sideways, IDLE_INPUT, spec, DT, GRAVITY)
    expect(lateralSpeed(s)).toBeCloseTo(200, 6)
  })

  it('lands after roughly 2·vz/gravity seconds, back on the tarmac', () => {
    const { state, airtime } = flyUntilLanded(launched, { steer: 1, throttle: 1 })
    expect(airtime).toBeCloseTo(airtimeFor(LAUNCH_VZ, GRAVITY), 1)
    expect(state.z).toBe(0)
    expect(state.vz).toBe(0)
    expect(isAirborne(state)).toBe(false)
    // the whole flight was a straight line — the corner was lost
    expect(state.heading).toBe(launched.heading)
    expect(state.y).toBeCloseTo(0, 6)
  })

  it('steers again once it has landed', () => {
    const { state } = flyUntilLanded(launched, {})
    const after = stepCar(state, { ...IDLE_INPUT, steer: 1 }, spec, DT, GRAVITY)
    expect(after.heading).toBeGreaterThan(state.heading)
  })

  it('a heavier launch flies longer', () => {
    const high = flyUntilLanded(launchCar(launched, LAUNCH_VZ * 1.5), {})
    const low = flyUntilLanded(launched, {})
    expect(high.airtime).toBeGreaterThan(low.airtime)
  })

  it('launchCar never cancels an existing higher launch', () => {
    const already = launchCar(launched, 100)
    expect(already.vz).toBe(LAUNCH_VZ)
  })
})
