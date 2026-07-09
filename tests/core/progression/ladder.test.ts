import { describe, expect, it } from 'vitest'
import { CAR_CATALOG, carById } from '../../../src/data/cars'
import { UPGRADES } from '../../../src/data/economy'
import { effectiveCarSpec } from '../../../src/core/vehicle/carSpec'
import {
  applyRaceLadderResults,
  initialLadder,
  PLAYER_ID,
  pickRivals,
  playerRank,
  rivalChassisId,
  rivalStrength,
  rivalUpgrades,
  simulateRound,
  standings,
  tierPool,
  TIER_TALENT_BANDS,
} from '../../../src/core/progression/ladder'
import { ROSTER } from '../../../src/data/roster'
import { DRIVER_TALENT } from '../../../src/data/drivers'
import type { RaceTier } from '../../../src/data/economy'

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
    expect(rivalStrength(1)).toBeCloseTo(1.0027)
    expect(rivalStrength(20)).toBeCloseTo(0.94)
    expect(rivalStrength(1)).toBeGreaterThan(rivalStrength(10))
  })

  it('maps rank to chassis: top ranks drive the top of the catalog', () => {
    expect(rivalChassisId(1)).toBe('leviathan')
    expect(rivalChassisId(10)).toBe('harrier')
    expect(rivalChassisId(20)).toBe('jackal')
    // never gets worse as rank improves
    const order = CAR_CATALOG.map((c) => c.id)
    for (let r = 19; r >= 1; r--) {
      expect(order.indexOf(rivalChassisId(r))).toBeGreaterThanOrEqual(order.indexOf(rivalChassisId(r + 1)))
    }
  })
})

describe('rivalUpgrades', () => {
  it('builds the top of the ladder and leaves the bottom stock', () => {
    expect(rivalUpgrades(1)).toEqual({ engine: 3, tires: 3, armor: 3 })
    expect(rivalUpgrades(20)).toEqual({ engine: 0, tires: 0, armor: 0 })
  })

  it('never gets worse as rank improves', () => {
    for (let r = 19; r >= 1; r--) {
      expect(rivalUpgrades(r).engine).toBeGreaterThanOrEqual(rivalUpgrades(r + 1).engine)
    }
  })

  it('stays inside the tiers the player can buy', () => {
    for (let r = 1; r <= 20; r++) {
      const u = rivalUpgrades(r)
      for (const tier of [u.engine, u.tires, u.armor]) {
        expect(tier).toBeGreaterThanOrEqual(0)
        expect(tier).toBeLessThanOrEqual(UPGRADES.engine.costs.length)
      }
    }
  })

  it('clamps ranks off the end of the ladder', () => {
    expect(rivalUpgrades(0)).toEqual(rivalUpgrades(1))
    expect(rivalUpgrades(99)).toEqual(rivalUpgrades(20))
  })

  it("an ace's top-rank car out-grips a fully-built mid-tier one", () => {
    // the bug this fixes: the player's tier-3 tires beat any stock chassis
    const ace = effectiveCarSpec(carById(rivalChassisId(1)), rivalUpgrades(1))
    const playerHarrier = effectiveCarSpec(carById('harrier'), { engine: 3, tires: 3, armor: 2 })
    expect(ace.grip).toBeGreaterThanOrEqual(playerHarrier.grip)
    expect(ace.topSpeed).toBeGreaterThan(playerHarrier.topSpeed)
  })
})

describe('pickRivals', () => {
  const TIERS: RaceTier[] = ['street', 'pro', 'death']

  it('returns 3 unique rivals, never the player', () => {
    for (const tier of TIERS) {
      const rivals = pickRivals(tier, fixedRand)
      expect(rivals).toHaveLength(3)
      expect(new Set(rivals).size).toBe(3)
      expect(rivals).not.toContain(PLAYER_ID)
    }
  })

  it('only ever fields drivers from the tier\'s talent band', () => {
    for (const tier of TIERS) {
      for (const id of pickRivals(tier, fixedRand)) {
        expect(TIER_TALENT_BANDS[tier]).toContain(DRIVER_TALENT[id])
      }
    }
  })

  it('leaves every tier enough drivers to fill a grid', () => {
    for (const tier of TIERS) expect(tierPool(tier).length).toBeGreaterThanOrEqual(3)
  })

  it('a street race can never field an ace, a death race can never field a rookie', () => {
    expect(tierPool('street').map((id) => DRIVER_TALENT[id])).not.toContain(4)
    expect(tierPool('death').map((id) => DRIVER_TALENT[id])).not.toContain(1)
  })

  it('gets harder as the purse grows: no tier is weaker than the one below it', () => {
    const worst = (tier: RaceTier) => Math.min(...tierPool(tier).map((id) => DRIVER_TALENT[id]))
    const best = (tier: RaceTier) => Math.max(...tierPool(tier).map((id) => DRIVER_TALENT[id]))
    expect(worst('pro')).toBeGreaterThan(worst('street'))
    expect(worst('death')).toBeGreaterThan(worst('pro'))
    expect(best('death')).toBeGreaterThan(best('pro'))
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
