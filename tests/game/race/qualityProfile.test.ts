import { describe, expect, it } from 'vitest'
import { QUALITY_PROFILE, resolveQuality } from '../../../src/game/race/qualityProfile'

describe('resolveQuality', () => {
  it('resolves auto to low on touch devices', () => {
    expect(resolveQuality('auto', true)).toBe('low')
  })

  it('resolves auto to high on non-touch devices', () => {
    expect(resolveQuality('auto', false)).toBe('high')
  })

  it('honors an explicit high setting regardless of device', () => {
    expect(resolveQuality('high', true)).toBe('high')
    expect(resolveQuality('high', false)).toBe('high')
  })

  it('honors an explicit low setting regardless of device', () => {
    expect(resolveQuality('low', true)).toBe('low')
    expect(resolveQuality('low', false)).toBe('low')
  })
})

describe('QUALITY_PROFILE', () => {
  it('high keeps bloom on and particles at full rate', () => {
    expect(QUALITY_PROFILE.high.bloom).toBe(true)
    expect(QUALITY_PROFILE.high.particleScale).toBe(1)
  })

  it('low drops bloom and halves particle rate (never zeroes it)', () => {
    expect(QUALITY_PROFILE.low.bloom).toBe(false)
    expect(QUALITY_PROFILE.low.particleScale).toBe(0.5)
    expect(QUALITY_PROFILE.low.particleScale).toBeGreaterThan(0)
  })
})
