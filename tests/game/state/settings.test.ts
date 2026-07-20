import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../src/game/state/settings'

describe('settings migration', () => {
  it('clamps volumes and supplies new accessibility defaults', () => {
    const settings = normalizeSettings({ masterVolume: 4, musicVolume: -1, muted: true })
    expect(settings.masterVolume).toBe(1)
    expect(settings.musicVolume).toBe(0)
    expect(settings.effectsVolume).toBe(DEFAULT_SETTINGS.effectsVolume)
    expect(settings.muted).toBe(true)
    expect(settings.reducedFlash).toBe(false)
  })

  it('supplies touch setting defaults for old saves', () => {
    const settings = normalizeSettings({ masterVolume: 0.7, muted: false })
    expect(settings.touchOpacity).toBe(0.5)
    expect(settings.touchMirrored).toBe(false)
  })

  it('clamps touchOpacity to [0.2, 1]', () => {
    expect(normalizeSettings({ touchOpacity: 4 }).touchOpacity).toBe(1)
    expect(normalizeSettings({ touchOpacity: -1 }).touchOpacity).toBe(0.2)
    expect(normalizeSettings({ touchOpacity: 0.7 }).touchOpacity).toBe(0.7)
  })

  it('coerces invalid touchOpacity to default', () => {
    expect(normalizeSettings({ touchOpacity: 'high' as any }).touchOpacity).toBe(0.5)
    expect(normalizeSettings({ touchOpacity: null as any }).touchOpacity).toBe(0.5)
    expect(normalizeSettings({ touchOpacity: NaN as any }).touchOpacity).toBe(0.5)
  })

  it('coerces touchMirrored to boolean with === true', () => {
    expect(normalizeSettings({ touchMirrored: true }).touchMirrored).toBe(true)
    expect(normalizeSettings({ touchMirrored: false }).touchMirrored).toBe(false)
    expect(normalizeSettings({ touchMirrored: 'yes' as any }).touchMirrored).toBe(false)
    expect(normalizeSettings({ touchMirrored: 1 as any }).touchMirrored).toBe(false)
  })

  it('round-trip save/load preserves touch settings', () => {
    const original = {
      ...DEFAULT_SETTINGS,
      touchOpacity: 0.75,
      touchMirrored: true,
    }
    const normalized = normalizeSettings(original)
    expect(normalized.touchOpacity).toBe(0.75)
    expect(normalized.touchMirrored).toBe(true)

    const roundTrip = normalizeSettings(JSON.parse(JSON.stringify(normalized)))
    expect(roundTrip.touchOpacity).toBe(0.75)
    expect(roundTrip.touchMirrored).toBe(true)
  })

  it('defaults quality to auto for old saves missing the field', () => {
    const settings = normalizeSettings({ masterVolume: 0.7, muted: false })
    expect(settings.quality).toBe('auto')
    expect(DEFAULT_SETTINGS.quality).toBe('auto')
  })

  it('accepts valid quality values', () => {
    expect(normalizeSettings({ quality: 'auto' }).quality).toBe('auto')
    expect(normalizeSettings({ quality: 'high' }).quality).toBe('high')
    expect(normalizeSettings({ quality: 'low' }).quality).toBe('low')
  })

  it('sanitizes malformed quality values to auto', () => {
    expect(normalizeSettings({ quality: 'ultra' as any }).quality).toBe('auto')
    expect(normalizeSettings({ quality: 1 as any }).quality).toBe('auto')
    expect(normalizeSettings({ quality: null as any }).quality).toBe('auto')
    expect(normalizeSettings({ quality: undefined }).quality).toBe('auto')
  })

  it('round-trip save/load preserves quality', () => {
    const normalized = normalizeSettings({ ...DEFAULT_SETTINGS, quality: 'low' })
    expect(normalized.quality).toBe('low')
    const roundTrip = normalizeSettings(JSON.parse(JSON.stringify(normalized)))
    expect(roundTrip.quality).toBe('low')
  })

  it('resetSettings restores quality to auto', () => {
    const settings = normalizeSettings({ quality: 'high' })
    expect(settings.quality).toBe('high')
    const reset = normalizeSettings(DEFAULT_SETTINGS)
    expect(reset.quality).toBe('auto')
  })
})
