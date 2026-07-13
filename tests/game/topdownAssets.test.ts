import { describe, it, expect } from 'vitest'
import { CAR_CATALOG } from '../../src/data/cars'
import { BOSS } from '../../src/data/boss'
import { LOADED_TOP_TEXTURES, LOADED_HERO_TEXTURES } from '../../src/game/textures/loadedAssets'

describe('top-down race car assets', () => {
  it('has one top-down texture per catalog car plus the boss', () => {
    for (const car of CAR_CATALOG) {
      expect(
        LOADED_TOP_TEXTURES.filter((t) => t.key === `car-top-${car.id}`),
        `missing/duplicate top key for ${car.id}`,
      ).toHaveLength(1)
    }
    expect(
      LOADED_TOP_TEXTURES.filter((t) => t.key === `car-top-${BOSS.id}`),
      'missing/duplicate top key for boss',
    ).toHaveLength(1)
  })

  it('has no stray top-down keys (catalog + boss only)', () => {
    expect(LOADED_TOP_TEXTURES).toHaveLength(CAR_CATALOG.length + 1)
  })

  it('registers the boss pre-duel hero render', () => {
    expect(
      LOADED_HERO_TEXTURES.filter((t) => t.key === `car-hero-${BOSS.id}`),
    ).toHaveLength(1)
  })
})
