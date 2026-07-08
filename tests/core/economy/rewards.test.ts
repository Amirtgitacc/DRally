import { describe, expect, it } from 'vitest'
import { rewardFor } from '../../../src/core/economy/rewards'

describe('rewardFor', () => {
  it('pays tiered prizes for podium placements', () => {
    expect(rewardFor('street', 1, false)).toEqual({ cash: 750, points: 3 })
    expect(rewardFor('pro', 2, false)).toEqual({ cash: 1500, points: 3 })
    expect(rewardFor('death', 3, false)).toEqual({ cash: 1500, points: 4 })
  })

  it('pays nothing for 4th place', () => {
    expect(rewardFor('death', 4, false)).toEqual({ cash: 0, points: 0 })
  })

  it('pays nothing when wrecked, even in a winning position', () => {
    expect(rewardFor('death', 1, true)).toEqual({ cash: 0, points: 0 })
  })

  it('handles out-of-range placements defensively', () => {
    expect(rewardFor('street', 0, false)).toEqual({ cash: 0, points: 0 })
    expect(rewardFor('street', 99, false)).toEqual({ cash: 0, points: 0 })
  })
})
