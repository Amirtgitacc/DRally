import { describe, expect, it } from 'vitest'
import {
  applyRaceLadderResults,
  initialLadder,
  PLAYER_ID,
  pickRivals,
  playerRank,
  rivalStrength,
  simulateRound,
  standings,
} from '../../../src/core/progression/ladder'
import { ROSTER } from '../../../src/data/roster'

// deterministic "random" for tests
const fixedRand = () => 0.5

describe('ladder basics', () => {
  it('seeds 19 rivals and puts a fresh player at rank 20', () => {
    const ladder = initialLadder()
    expect(Object.keys(ladder)).toHaveLength(19)
    expect(playerRank(ladder, 0)).toBe(20)
  })

  it('ranks the player up as points grow', () => {
    const ladder = initialLadder()
    const topPoints = Math.max(...Object.values(ladder))
    expect(playerRank(ladder, topPoints + 1)).toBe(1)
  })

  it('standings list all 20, sorted by points', () => {
    const rows = standings(initialLadder(), 50)
    expect(rows).toHaveLength(20)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points)
    }
    expect(rows.filter((r) => r.isPlayer)).toHaveLength(1)
  })

  it('maps rank to pace: #1 fastest, #20 slowest', () => {
    expect(rivalStrength(1)).toBeCloseTo(1.052)
    expect(rivalStrength(20)).toBeCloseTo(0.9)
    expect(rivalStrength(1)).toBeGreaterThan(rivalStrength(10))
  })
})

describe('pickRivals', () => {
  it('returns 3 unique rivals, never the player', () => {
    const rivals = pickRivals(initialLadder(), 0, fixedRand)
    expect(rivals).toHaveLength(3)
    expect(new Set(rivals).size).toBe(3)
    expect(rivals).not.toContain(PLAYER_ID)
  })

  it('picks from the player\'s neighborhood: a rank-20 player races tail-enders', () => {
    const ladder = initialLadder()
    const rivals = pickRivals(ladder, 0, fixedRand)
    for (const id of rivals) {
      const rank = standings(ladder, 0).findIndex((r) => r.id === id) + 1
      expect(rank).toBeGreaterThanOrEqual(13)
    }
  })
})

describe('race + round results', () => {
  it('awards podium points to rivals from the player race, none to wrecked or 4th', () => {
    const ladder = initialLadder()
    const next = applyRaceLadderResults(ladder, 'pro', [
      { id: 'vex', placement: 1, wrecked: false },
      { id: 'mara', placement: 2, wrecked: true },
      { id: 'diesel', placement: 4, wrecked: false },
    ])
    expect(next.vex).toBe(ladder.vex + 5)
    expect(next.mara).toBe(ladder.mara)
    expect(next.diesel).toBe(ladder.diesel)
  })

  it('simulates the two skipped tiers without touching excluded drivers', () => {
    const ladder = initialLadder()
    const exclude = ['vex', 'mara', 'diesel']
    const next = simulateRound(ladder, 'pro', exclude, fixedRand)
    for (const id of exclude) expect(next[id]).toBe(ladder[id])
    // 6 drivers earned street + death podium points
    const gainers = ROSTER.filter((d) => next[d.id] > ladder[d.id])
    expect(gainers).toHaveLength(6)
    const totalGain =
      Object.values(next).reduce((a, b) => a + b, 0) - Object.values(ladder).reduce((a, b) => a + b, 0)
    expect(totalGain).toBe(3 + 2 + 1 + 8 + 7 + 4) // street podium + death podium
  })
})
