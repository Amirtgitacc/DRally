import { describe, expect, it } from 'vitest'
import { armorResistance, effectiveCarSpec, NO_UPGRADES } from '../../../src/core/vehicle/carSpec'
import { CAR_CATALOG, STARTER_CAR, carById } from '../../../src/data/cars'
import { BOSS } from '../../../src/data/boss'
import { MP_ONLY_CARS, mpCarById } from '../../../src/data/mpCars'

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

const REAL_NAME_BY_ID: Record<string, string> = {
  jackal: 'Daewoo Cielo',
  vandal: 'Peykan',
  marauder: 'Pride',
  harrier: 'Peugeot 405',
  basilisk: 'Nissan Vanet',
  leviathan: 'Patrol',
}

describe('car display names', () => {
  it('match the real-model name mapping exactly', () => {
    for (const [id, name] of Object.entries(REAL_NAME_BY_ID)) {
      expect(carById(id).name).toBe(name)
    }
  })

  it('leaves the boss name unchanged', () => {
    expect(BOSS.name).toBe('The Sovereign')
  })
})

describe('car variants', () => {
  it('gives every catalog car a base variant plus unique keys', () => {
    for (const car of CAR_CATALOG) {
      const keys = car.variants.map((v) => v.key)
      expect(keys).toContain('base')
      expect(new Set(keys).size).toBe(keys.length)
      for (const v of car.variants) expect(v.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('gives the boss base/a/b variants', () => {
    const keys = BOSS.variants.map((v) => v.key)
    expect(keys).toEqual(['base', 'a', 'b'])
    expect(new Set(BOSS.variants.map((v) => v.label)).size).toBe(3)
  })
})

describe('MP-only car anahita', () => {
  it('never appears in the single-player catalog', () => {
    expect(CAR_CATALOG.some((c) => c.id === 'anahita')).toBe(false)
  })

  it('is present in MP_ONLY_CARS with the mapped name', () => {
    const anahita = MP_ONLY_CARS.find((c) => c.id === 'anahita')
    expect(anahita).toBeDefined()
    expect(anahita?.name).toBe('206 Anahita')
  })

  it('has stats between vandal and marauder', () => {
    const vandal = carById('vandal')
    const marauder = carById('marauder')
    const anahita = MP_ONLY_CARS.find((c) => c.id === 'anahita')!
    expect(anahita.topSpeed).toBeGreaterThan(vandal.topSpeed)
    expect(anahita.topSpeed).toBeLessThan(marauder.topSpeed)
    expect(anahita.accel).toBeGreaterThan(vandal.accel)
    expect(anahita.accel).toBeLessThan(marauder.accel)
    expect(anahita.grip).toBeGreaterThan(vandal.grip)
    expect(anahita.grip).toBeLessThan(marauder.grip)
  })

  it('resolves through mpCarById', () => {
    expect(mpCarById('anahita')?.name).toBe('206 Anahita')
  })

  it('falls back through the catalog for normal ids', () => {
    expect(mpCarById('jackal')?.id).toBe('jackal')
  })

  it('returns undefined for unknown ids', () => {
    expect(mpCarById('does-not-exist')).toBeUndefined()
  })
})
