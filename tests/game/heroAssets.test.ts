import { describe, it, expect } from 'vitest'
import { CAR_CATALOG } from '../../src/data/cars'
import { LOADED_HERO_TEXTURES } from '../../src/game/textures/loadedAssets'

describe('hero car assets', () => {
  it('has one hero texture per catalog car', () => {
    for (const car of CAR_CATALOG) {
      const hits = LOADED_HERO_TEXTURES.filter((t) => t.key === `car-hero-${car.id}`)
      expect(hits, `missing/duplicate hero key for ${car.id}`).toHaveLength(1)
    }
  })
})
