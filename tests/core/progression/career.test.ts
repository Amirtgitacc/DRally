import { describe, expect, it } from 'vitest'
import {
  applyAbandonOutcome,
  applyRaceOutcome,
  createCareer,
  deserializeCareer,
  serializeCareer,
  updateTrackRecord,
} from '../../../src/core/progression/career'

describe('career', () => {
  it('starts with the starter car and starting cash', () => {
    const c = createCareer()
    expect(c.carId).toBe('jackal')
    expect(c.cash).toBe(500)
    expect(c.damage).toBe(0)
    expect(c.schemaVersion).toBe(2)
    expect(c.profile.weaponsEnabled).toBe(true)
    expect(c.records).toEqual({})
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

  it('accepts older saves without black-market or champion fields', () => {
    const old = JSON.parse(serializeCareer(createCareer()))
    delete old.ramPlating
    delete old.overTurbo
    delete old.sabotage
    delete old.loan
    delete old.champion
    const c = deserializeCareer(JSON.stringify(old))
    expect(c).not.toBeNull()
    expect(c!.ramPlating).toBe(false)
    expect(c!.overTurbo).toBe(false)
    expect(c!.sabotage).toBe(false)
    expect(c!.loan).toBeNull()
    expect(c!.champion).toBe(false)
  })

  it('round-trips an active loan and the champion flag', () => {
    const c = {
      ...createCareer(),
      loan: { owed: 4500, racesLeft: 2 },
      champion: true,
      ramPlating: true,
    }
    expect(deserializeCareer(serializeCareer(c))).toEqual(c)
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

  it('migrates a v1-shaped career with safe profile and record defaults', () => {
    const old = JSON.parse(serializeCareer(createCareer()))
    delete old.schemaVersion
    delete old.profile
    delete old.records
    const migrated = deserializeCareer(JSON.stringify(old))!
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.profile.difficulty).toBe('standard')
    expect(migrated.profile.driverName).toBeTruthy()
    expect(migrated.records).toEqual({})
  })

  it('commits an abandoned race as a reward-free start and consumes gear', () => {
    const abandoned = applyAbandonOutcome({ ...createCareer(), mines: 3, ramPlating: true, cash: 900 }, 47.8)
    expect(abandoned.cash).toBe(900)
    expect(abandoned.points).toBe(0)
    expect(abandoned.racesRun).toBe(1)
    expect(abandoned.damage).toBe(48)
    expect(abandoned.mines).toBe(0)
    expect(abandoned.ramPlating).toBe(false)
  })

  it('updates records only when a candidate improves and counts wins', () => {
    let career = updateTrackRecord(createCareer(), { trackId: 'test', bestLapMs: 50000, raceTimeMs: 160000, finish: 2, won: false })
    career = updateTrackRecord(career, { trackId: 'test', bestLapMs: 51000, raceTimeMs: 150000, finish: 3, won: true })
    expect(career.records.test).toEqual({ bestLapMs: 50000, bestRaceMs: 150000, bestFinish: 2, wins: 1 })
  })

  it('sanitizes malformed record values during migration', () => {
    const raw = JSON.parse(serializeCareer(createCareer()))
    raw.records = { test: { bestLapMs: -2, bestRaceMs: 'fast', bestFinish: 0, wins: -4 } }
    expect(deserializeCareer(JSON.stringify(raw))!.records.test).toEqual({ bestLapMs: null, bestRaceMs: null, bestFinish: null, wins: 0 })
  })
})
