import { describe, expect, it } from 'vitest'
import { applyDuelOutcome, duelAvailable } from '../../../src/core/progression/duel'
import { BOSS } from '../../../src/data/boss'
import { createCareer } from '../../../src/core/progression/career'

describe('final duel', () => {
  it('is offered only at rank #1 and only before the crown is won', () => {
    expect(duelAvailable(1, false)).toBe(true)
    expect(duelAvailable(2, false)).toBe(false)
    expect(duelAvailable(1, true)).toBe(false)
  })

  it('winning pays the purse and crowns the career', () => {
    const c = applyDuelOutcome(createCareer(), { won: true, pickupCash: 150, endDamage: 20 })
    expect(c.champion).toBe(true)
    expect(c.cash).toBe(500 + BOSS.prizeCash + 150)
    expect(c.wins).toBe(1)
    expect(c.racesRun).toBe(1)
    expect(c.points).toBe(0) // no ladder points move in the duel
  })

  it('losing costs nothing but the damage — the crown stays winnable', () => {
    const c = applyDuelOutcome(createCareer(), { won: false, pickupCash: 0, endDamage: 65 })
    expect(c.champion).toBe(false)
    expect(c.cash).toBe(500)
    expect(c.damage).toBe(65)
    expect(c.racesRun).toBe(1)
    expect(c.wins).toBe(0)
  })

  it('keeps the crown once won, even after a lost rematch would be impossible anyway', () => {
    const crowned = applyDuelOutcome(createCareer(), { won: true, pickupCash: 0, endDamage: 0 })
    expect(duelAvailable(1, crowned.champion)).toBe(false)
  })
})
