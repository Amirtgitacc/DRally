import { describe, expect, it } from 'vitest'
import { applyDamage, impactDamage, repairDamage } from '../../../src/core/combat/damage'

describe('applyDamage', () => {
  it('accumulates and reports wreck at 100', () => {
    const r1 = applyDamage(90, 5)
    expect(r1).toEqual({ damage: 95, wrecked: false })
    const r2 = applyDamage(r1.damage, 20)
    expect(r2).toEqual({ damage: 100, wrecked: true })
  })

  it('armor resistance scales incoming damage', () => {
    expect(applyDamage(0, 10, 0.5).damage).toBe(5)
  })

  it('ignores negative amounts', () => {
    expect(applyDamage(50, -10).damage).toBe(50)
  })
})

describe('repairDamage', () => {
  it('reduces damage without going below zero', () => {
    expect(repairDamage(40, 25)).toBe(15)
    expect(repairDamage(10, 25)).toBe(0)
  })
})

describe('impactDamage', () => {
  const spec = { threshold: 150, scale: 0.04, max: 18 }

  it('is harmless below the threshold', () => {
    expect(impactDamage(100, spec)).toBe(0)
    expect(impactDamage(150, spec)).toBe(0)
  })

  it('scales over the threshold and caps at max', () => {
    expect(impactDamage(250, spec)).toBeCloseTo(4)
    expect(impactDamage(5000, spec)).toBe(18)
  })
})
