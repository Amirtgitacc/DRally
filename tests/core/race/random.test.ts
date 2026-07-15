import { describe, expect, it } from 'vitest'
import { createSeededRandom, initialRngState, nextRandom } from '../../../src/core/race/random'

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

describe('stateful PRNG', () => {
  it('matches createSeededRandom exactly for the same seed', () => {
    const closure = createSeededRandom(12345)
    const ref = { rngState: initialRngState(12345) }
    for (let i = 0; i < 100; i++) expect(nextRandom(ref)).toBe(closure())
  })

  it('survives JSON round-trip mid-stream', () => {
    const a = { rngState: initialRngState(999) }
    for (let i = 0; i < 10; i++) nextRandom(a)
    const b = JSON.parse(JSON.stringify(a)) as { rngState: number }
    expect(nextRandom(b)).toBe(nextRandom(a))
  })

  it('falls back to the same default state as createSeededRandom for seed 0', () => {
    const closure = createSeededRandom(0)
    const ref = { rngState: initialRngState(0) }
    expect(nextRandom(ref)).toBe(closure())
  })
})
