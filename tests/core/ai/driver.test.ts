import { describe, expect, it } from 'vitest'
import { aiDrive, lookAheadFor, wrapAngle, type AiContext, type AiTuning } from '../../../src/core/ai/driver'
import type { CarPhysicsSpec, CarState } from '../../../src/core/vehicle/carPhysics'

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

const tune: AiTuning = { steerGain: 2.5, corneringCaution: 1, minCornerSpeed: 130, dodge: 70 }

// facing +x, moving at 300 px/s
const cruising: CarState = { x: 0, y: 0, heading: 0, vx: 300, vy: 0, z: 0, vz: 0 }

const straightCtx: AiContext = { target: { x: 400, y: 0 }, curvatureAhead: 0, avoid: null }

describe('lookAheadFor', () => {
  it('looks further ahead the faster the car is going', () => {
    const slow = lookAheadFor(10, 100, 600)
    const fast = lookAheadFor(10, 600, 600)
    expect(fast).toBeGreaterThan(slow)
  })

  it('a faster car looks further ahead at the same absolute speed share', () => {
    // two cars at 90% of their own top speed: the quicker one needs more road
    const slowCar = lookAheadFor(10, 0.9 * 500, 500)
    const fastCar = lookAheadFor(10, 0.9 * 700, 700)
    expect(fastCar).toBe(slowCar) // same fraction → same horizon in samples...
    // ...but in px that horizon is travelled faster, which is the point:
    expect(lookAheadFor(10, 700, 500)).toBeGreaterThanOrEqual(fastCar)
  })

  it('clamps at both ends and never returns a useless horizon', () => {
    expect(lookAheadFor(10, 0, 600)).toBeGreaterThanOrEqual(2)
    expect(lookAheadFor(1, -500, 600)).toBeGreaterThanOrEqual(2)
    expect(lookAheadFor(10, 99999, 600)).toBe(lookAheadFor(10, 600, 600))
  })

  it('survives a zero top speed without dividing by zero', () => {
    expect(Number.isFinite(lookAheadFor(10, 300, 0))).toBe(true)
  })
})

describe('wrapAngle', () => {
  it('wraps into [-π, π]', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 5)
    expect(Math.abs(wrapAngle(-3 * Math.PI))).toBeCloseTo(Math.PI, 5)
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 10)
  })
})

describe('aiDrive', () => {
  it('drives straight at full throttle toward a target ahead', () => {
    const input = aiDrive(cruising, straightCtx, spec, tune)
    expect(input.throttle).toBe(1)
    expect(input.brake).toBe(0)
    expect(Math.abs(input.steer)).toBeLessThan(0.01)
  })

  it('steers toward an offset target with the correct sign', () => {
    const below = aiDrive(cruising, { ...straightCtx, target: { x: 200, y: 200 } }, spec, tune)
    expect(below.steer).toBeGreaterThan(0.5) // +y is clockwise/right of heading 0
    const above = aiDrive(cruising, { ...straightCtx, target: { x: 200, y: -200 } }, spec, tune)
    expect(above.steer).toBeLessThan(-0.5)
  })

  it('brakes for a sharp corner when going too fast', () => {
    const fast: CarState = { ...cruising, vx: 480 }
    const input = aiDrive(fast, { ...straightCtx, curvatureAhead: 0.8 }, spec, tune)
    // target speed = max(130, 500 * 0.2) = 130 → braking
    expect(input.brake).toBe(1)
    expect(input.throttle).toBe(0)
  })

  it('never targets below minCornerSpeed', () => {
    const slow: CarState = { ...cruising, vx: 100 }
    const input = aiDrive(slow, { ...straightCtx, curvatureAhead: 1 }, spec, tune)
    expect(input.throttle).toBe(1) // 100 < 130 floor → still accelerating
  })

  it('dodges around a car ahead', () => {
    const withObstacle = aiDrive(
      cruising,
      { ...straightCtx, avoid: { x: 120, y: 10 } }, // obstacle slightly right
      spec,
      tune,
    )
    expect(withObstacle.steer).toBeLessThan(-0.1) // steer left, away from it
  })
})
