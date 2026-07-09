import { describe, expect, it } from 'vitest'
import { mineBlast, type BlastTuning } from '../../../src/core/combat/blast'
import { IDLE_INPUT, isAirborne, launchCar, stepCar, type CarPhysicsSpec } from '../../../src/core/vehicle/carPhysics'
import { MINES, MINE_BLAST } from '../../../src/data/weapons'

const tuning: BlastTuning = {
  damage: MINES.damage,
  splashDamage: MINES.splashDamage,
  blastRadius: MINES.blastRadius,
  ...MINE_BLAST,
}

const center = { x: 0, y: 0 }
/** deterministic "random": mid-range means no spin either way */
const noSpin = () => 0.5
const fullSpin = () => 1

describe('mineBlast', () => {
  it('gives the car that triggered it full damage and a full launch', () => {
    const b = mineBlast({ x: 0, y: 0, mass: 1, direct: true }, center, tuning, noSpin)!
    expect(b.damage).toBe(MINES.damage)
    expect(b.dvz).toBe(MINE_BLAST.launchVz)
    expect(b.falloff).toBe(1)
  })

  it('shoves the car directly away from the blast', () => {
    const b = mineBlast({ x: 50, y: 0, mass: 1, direct: false }, center, tuning, noSpin)!
    expect(b.dvx).toBeGreaterThan(0)
    expect(b.dvy).toBeCloseTo(0, 6)

    const above = mineBlast({ x: 0, y: -50, mass: 1, direct: false }, center, tuning, noSpin)!
    expect(above.dvy).toBeLessThan(0)
  })

  it('ignores cars outside the blast radius', () => {
    expect(mineBlast({ x: MINES.blastRadius, y: 0, mass: 1, direct: false }, center, tuning, noSpin)).toBeNull()
  })

  it('still catches the trigger car even if it has driven clear of the radius', () => {
    const far = { x: MINES.blastRadius * 3, y: 0, mass: 1, direct: true }
    expect(mineBlast(far, center, tuning, noSpin)).not.toBeNull()
  })

  it('splashed cars take less damage and barely leave the ground', () => {
    const direct = mineBlast({ x: 0, y: 0, mass: 1, direct: true }, center, tuning, noSpin)!
    const splash = mineBlast({ x: 40, y: 0, mass: 1, direct: false }, center, tuning, noSpin)!
    expect(splash.damage).toBe(MINES.splashDamage)
    expect(splash.damage).toBeLessThan(direct.damage)
    expect(splash.dvz).toBeGreaterThan(0)
    expect(splash.dvz).toBeLessThan(direct.dvz * 0.6)
  })

  it('falls off with distance but never below 0.3', () => {
    const near = mineBlast({ x: 10, y: 0, mass: 1, direct: false }, center, tuning, noSpin)!
    const far = mineBlast({ x: MINES.blastRadius - 1, y: 0, mass: 1, direct: false }, center, tuning, noSpin)!
    expect(near.falloff).toBeGreaterThan(far.falloff)
    expect(far.falloff).toBeGreaterThanOrEqual(0.3)
  })

  it('heavy cars get shoved and launched less', () => {
    const light = mineBlast({ x: 0, y: 0, mass: 1, direct: true }, center, tuning, noSpin)!
    const heavy = mineBlast({ x: 0, y: 0, mass: 1.3, direct: true }, center, tuning, noSpin)!
    expect(heavy.dvz).toBeLessThan(light.dvz)
    expect(Math.hypot(heavy.dvx, heavy.dvy)).toBeLessThan(Math.hypot(light.dvx, light.dvy))
  })

  it('spins the car, bounded by the tuning', () => {
    const b = mineBlast({ x: 0, y: 0, mass: 1, direct: true }, center, tuning, fullSpin)!
    expect(b.spin).toBeCloseTo(MINE_BLAST.spin, 6)
    expect(Math.abs(b.spin)).toBeLessThanOrEqual(MINE_BLAST.spin)
  })

  it('a car sitting exactly on the mine still gets shoved somewhere', () => {
    const b = mineBlast({ x: 0, y: 0, mass: 1, direct: true }, center, tuning, noSpin)!
    expect(Math.hypot(b.dvx, b.dvy)).toBeGreaterThan(0)
  })
})

describe('mine hit → airborne → steering ignored → lands', () => {
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
  const DT = 1 / 60

  it('costs the driver the corner, then hands control back', () => {
    let car = { x: 0, y: 0, heading: 0, vx: 300, vy: 0, z: 0, vz: 0 }

    const blast = mineBlast({ x: car.x, y: car.y, mass: 1, direct: true }, center, tuning, noSpin)!
    car = launchCar({ ...car, vx: car.vx + blast.dvx, vy: car.vy + blast.dvy }, blast.dvz)

    const headingAtLaunch = car.heading
    let steps = 0
    // hold full lock the whole time it is in the air — it must do nothing
    while (isAirborne(car) || car.vz > 0) {
      car = stepCar(car, { ...IDLE_INPUT, steer: 1, throttle: 1 }, spec, DT, MINE_BLAST.gravity)
      steps++
      expect(steps).toBeLessThan(600)
    }
    expect(car.heading).toBe(headingAtLaunch)
    expect(steps * DT).toBeCloseTo(0.8, 1) // ~0.8s of airtime, per the plan

    const landed = stepCar(car, { ...IDLE_INPUT, steer: 1 }, spec, DT, MINE_BLAST.gravity)
    expect(landed.heading).not.toBe(headingAtLaunch)
  })
})
