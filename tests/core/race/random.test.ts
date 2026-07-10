import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../../../src/core/race/random'

describe('seeded race random', () => {
  it('replays the same sequence from the same seed', () => {
    const a = createSeededRandom(12345)
    const b = createSeededRandom(12345)
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b))
  })

  it('diverges for different seeds', () => {
    expect(createSeededRandom(1)()).not.toBe(createSeededRandom(2)())
  })
})
