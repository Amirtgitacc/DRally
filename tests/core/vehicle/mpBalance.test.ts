import { describe, it, expect } from 'vitest'
import { mpCarSpec, mpDamageResist } from '../../../src/core/vehicle/mpBalance'
import { MP_CAR_OPTIONS } from '../../../src/data/mpCars'

describe('mpCarSpec', () => {
  it('locks the smallest car (marauder, sizeScale 0.90) at the fast/twitchy end', () => {
    const s = mpCarSpec('marauder')
    expect(s.topSpeed).toBeCloseTo(672, 0)
    expect(s.accel).toBeCloseTo(892.5, 1)
    expect(s.grip).toBeCloseTo(7.708, 2)
    expect(s.turnRate).toBeCloseTo(3.76, 2)
  })

  it('locks the largest car (basilisk, sizeScale 1.20) at the slow/grippy end', () => {
    const s = mpCarSpec('basilisk')
    expect(s.topSpeed).toBeCloseTo(608, 0)
    expect(s.accel).toBeCloseTo(807.5, 1)
    expect(s.grip).toBeCloseTo(8.692, 2)
    expect(s.turnRate).toBeCloseTo(4.24, 2)
  })

  it('puts a mid car (jackal, sizeScale 1.00) near the center', () => {
    const s = mpCarSpec('jackal')
    expect(s.topSpeed).toBeCloseTo(650.7, 1)
    expect(s.grip).toBeCloseTo(8.036, 2)
  })

  it('is monotonic: smaller cars are faster and less grippy than bigger cars', () => {
    const bySize = [...MP_CAR_OPTIONS].sort((a, b) => a.sizeScale - b.sizeScale)
    for (let i = 1; i < bySize.length; i++) {
      const small = mpCarSpec(bySize[i - 1].id)
      const big = mpCarSpec(bySize[i].id)
      // strictly monotonic only when sizeScale differs
      if (bySize[i - 1].sizeScale < bySize[i].sizeScale) {
        expect(small.topSpeed).toBeGreaterThan(big.topSpeed)
        expect(small.accel).toBeGreaterThan(big.accel)
        expect(small.grip).toBeLessThan(big.grip)
        expect(small.turnRate).toBeLessThan(big.turnRate)
      }
    }
  })

  it('reuses each car base value for non-tuned fields (drag, brakeForce)', () => {
    const s = mpCarSpec('basilisk')
    expect(s.drag).toBe(0.25)
    expect(s.brakeForce).toBe(1080)
  })

  it('falls back to the starter chassis for an unknown id (no throw)', () => {
    expect(() => mpCarSpec('does-not-exist')).not.toThrow()
    expect(mpCarSpec('does-not-exist')).toEqual(mpCarSpec('jackal'))
  })
})

describe('mpDamageResist', () => {
  it('makes big cars tougher (<1) and small cars softer (>1)', () => {
    expect(mpDamageResist('basilisk')).toBeCloseTo(0.9, 3) // sizeScale 1.20
    expect(mpDamageResist('marauder')).toBeCloseTo(1.1, 3) // sizeScale 0.90
    expect(mpDamageResist('jackal')).toBeCloseTo(1.0333, 3) // sizeScale 1.00
  })
})
