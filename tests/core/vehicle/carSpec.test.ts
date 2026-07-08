import { describe, expect, it } from 'vitest'
import { armorResistance, effectiveCarSpec, NO_UPGRADES } from '../../../src/core/vehicle/carSpec'
import { STARTER_CAR } from '../../../src/data/cars'

describe('effectiveCarSpec', () => {
  it('returns the base spec with no upgrades', () => {
    const spec = effectiveCarSpec(STARTER_CAR, NO_UPGRADES)
    expect(spec.topSpeed).toBe(STARTER_CAR.topSpeed)
    expect(spec.grip).toBe(STARTER_CAR.grip)
  })

  it('compounds engine and tire tiers', () => {
    const spec = effectiveCarSpec(STARTER_CAR, { engine: 1, tires: 2, armor: 0 })
    expect(spec.topSpeed).toBeCloseTo(STARTER_CAR.topSpeed * 1.05)
    expect(spec.accel).toBeCloseTo(STARTER_CAR.accel * 1.08)
    expect(spec.grip).toBeCloseTo(STARTER_CAR.grip * 1.12 ** 2)
    expect(spec.turnRate).toBeCloseTo(STARTER_CAR.turnRate * 1.05 ** 2)
  })
})

describe('armorResistance', () => {
  it('reduces incoming damage per tier', () => {
    expect(armorResistance(0)).toBe(1)
    expect(armorResistance(2)).toBeCloseTo(0.85 * 0.85)
  })
})
