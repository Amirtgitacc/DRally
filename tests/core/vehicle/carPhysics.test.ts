import { describe, expect, it } from 'vitest'
import {
  IDLE_INPUT,
  forwardSpeed,
  lateralSpeed,
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

const rest: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 0 }
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
    const sliding: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 200 }
    const s = simulate(sliding, {}, 1)
    expect(Math.abs(lateralSpeed(s))).toBeLessThan(5)
  })

  it('handbrake keeps the car sliding much longer', () => {
    const sliding: CarState = { x: 0, y: 0, heading: 0, vx: 0, vy: 200 }
    const s = simulate(sliding, { handbrake: true }, 1)
    expect(Math.abs(lateralSpeed(s))).toBeGreaterThan(30)
  })

  it('brake decelerates forward motion', () => {
    const moving: CarState = { x: 0, y: 0, heading: 0, vx: 300, vy: 0 }
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
