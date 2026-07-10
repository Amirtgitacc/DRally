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
})
