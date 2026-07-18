import { describe, it, expect } from 'vitest'
import { CAR_CATALOG } from '../../src/data/cars'
import { BOSS } from '../../src/data/boss'
import { LOADED_POSTER_TEXTURES } from '../../src/game/textures/loadedAssets'

describe('car dealer/garage poster assets', () => {
  it('has one poster per catalog car', () => {
    for (const car of CAR_CATALOG) {
      expect(
        LOADED_POSTER_TEXTURES.filter((t) => t.key === `car-poster-${car.id}`),
        `missing/duplicate poster key for ${car.id}`,
      ).toHaveLength(1)
    }
  })

  it('registers the boss under both its boss and sovereign identities', () => {
    expect(LOADED_POSTER_TEXTURES.filter((t) => t.key === 'car-poster-boss')).toHaveLength(1)
    expect(
      LOADED_POSTER_TEXTURES.filter((t) => t.key === `car-poster-${BOSS.id}`),
    ).toHaveLength(1)
  })

  it('has no stray poster keys (catalog + boss + sovereign)', () => {
    expect(LOADED_POSTER_TEXTURES).toHaveLength(CAR_CATALOG.length + 2)
  })
})
