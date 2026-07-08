import { describe, expect, it } from 'vitest'
import {
  applyRaceOutcome,
  createCareer,
  deserializeCareer,
  serializeCareer,
} from '../../../src/core/progression/career'

describe('career', () => {
  it('starts with the starter car and starting cash', () => {
    const c = createCareer()
    expect(c.carId).toBe('jackal')
    expect(c.cash).toBe(500)
    expect(c.damage).toBe(0)
  })

  it('applies race outcomes: cash, points, persistent damage, stats', () => {
    const c = applyRaceOutcome(createCareer(), {
      prizeCash: 3000,
      pointsEarned: 5,
      pickupCash: 400,
      endDamage: 42.6,
      won: true,
    })
    expect(c.cash).toBe(3900)
    expect(c.points).toBe(5)
    expect(c.damage).toBe(43)
    expect(c.racesRun).toBe(1)
    expect(c.wins).toBe(1)
  })

  it('spends mines after a race whether used or not', () => {
    const withMines = { ...createCareer(), mines: 6 }
    const c = applyRaceOutcome(withMines, {
      prizeCash: 0,
      pointsEarned: 0,
      pickupCash: 0,
      endDamage: 0,
      won: false,
    })
    expect(c.mines).toBe(0)
  })

  it('accepts older saves without the mines field', () => {
    const old = JSON.parse(serializeCareer(createCareer()))
    delete old.mines
    const c = deserializeCareer(JSON.stringify(old))
    expect(c).not.toBeNull()
    expect(c!.mines).toBe(0)
  })

  it('caps persistent damage below 100 even after a wreck', () => {
    const c = applyRaceOutcome(createCareer(), {
      prizeCash: 0,
      pointsEarned: 0,
      pickupCash: 0,
      endDamage: 100,
      won: false,
    })
    expect(c.damage).toBe(99)
  })

  it('round-trips through serialize/deserialize', () => {
    const c = applyRaceOutcome(createCareer(), {
      prizeCash: 750,
      pointsEarned: 3,
      pickupCash: 200,
      endDamage: 17,
      won: true,
    })
    expect(deserializeCareer(serializeCareer(c))).toEqual(c)
  })

  it('rejects malformed saves', () => {
    expect(deserializeCareer('not json')).toBeNull()
    expect(deserializeCareer('{"cash": "lots"}')).toBeNull()
    expect(deserializeCareer('{}')).toBeNull()
  })
})
