import { describe, expect, it } from 'vitest'
import {
  starsFor,
  talentAimSpread,
  talentMineCooldown,
  talentMineCount,
  talentPace,
  talentRubberBand,
  talentTuning,
  type TalentGrade,
} from '../../../src/core/ai/talent'
import {
  DRIVER_TALENT,
  DRIVING_STYLES,
  RUBBER_BAND,
  TALENT_PROFILES,
  styleForGrade,
  talentOf,
} from '../../../src/data/drivers'
import { ROSTER } from '../../../src/data/roster'
import { GUN } from '../../../src/data/weapons'
import { rivalStrength } from '../../../src/core/progression/ladder'

const ace = TALENT_PROFILES[4]
const rookie = TALENT_PROFILES[1]
const grades: TalentGrade[] = [1, 2, 3, 4]

describe('driver talent data', () => {
  it('grades every driver on the roster', () => {
    for (const d of ROSTER) expect(DRIVER_TALENT[d.id], `${d.id} has no grade`).toBeDefined()
  })

  it('grades nobody who is not on the roster', () => {
    const ids = new Set(ROSTER.map((d) => d.id))
    for (const id of Object.keys(DRIVER_TALENT)) expect(ids.has(id), `${id} is not a roster driver`).toBe(true)
  })

  it('has the planned spread: 4 aces, 6 veterans, 5 journeymen, 4 rookies', () => {
    const count = (g: TalentGrade) => Object.values(DRIVER_TALENT).filter((v) => v === g).length
    expect(count(4)).toBe(4)
    expect(count(3)).toBe(6)
    expect(count(2)).toBe(5)
    expect(count(1)).toBe(4)
    expect(ROSTER.length).toBe(19)
  })

  it('talentOf falls back to ace for off-ladder drivers (the champion)', () => {
    expect(talentOf('sovereign').grade).toBe(4)
    expect(talentOf('sable').grade).toBe(4)
    expect(talentOf('crash').grade).toBe(1)
  })

  it('is monotonic across grades — better grade is better at everything', () => {
    for (let i = 1; i < grades.length; i++) {
      const lower = TALENT_PROFILES[grades[i - 1]]
      const higher = TALENT_PROFILES[grades[i]]
      expect(higher.paceScale).toBeGreaterThan(lower.paceScale)
      expect(higher.cautionScale).toBeLessThan(lower.cautionScale)
      expect(higher.minCornerSpeedScale).toBeGreaterThan(lower.minCornerSpeedScale)
      expect(higher.aimSpreadScale).toBeLessThan(lower.aimSpreadScale)
      expect(higher.mineAggression).toBeGreaterThan(lower.mineAggression)
      expect(higher.rubberBandScale).toBeLessThan(lower.rubberBandScale)
    }
  })
})

describe('styleForGrade', () => {
  it('puts aces on the aggressive line and rookies on the timid one', () => {
    expect(styleForGrade(4)).toBe(DRIVING_STYLES[0])
    expect(styleForGrade(1)).toBe(DRIVING_STYLES[2])
  })

  it('never gives a better driver a more cautious style than a worse one', () => {
    for (let g = 2; g <= 4; g++) {
      const better = styleForGrade(g as TalentGrade).tuning
      const worse = styleForGrade((g - 1) as TalentGrade).tuning
      expect(better.corneringCaution).toBeLessThanOrEqual(worse.corneringCaution)
      expect(better.minCornerSpeed).toBeGreaterThanOrEqual(worse.minCornerSpeed)
    }
  })
})

describe('starsFor', () => {
  it('renders one star per grade', () => {
    expect(starsFor(1)).toBe('★')
    expect(starsFor(4)).toBe('★★★★')
  })
})

describe('talent scaling', () => {
  const style = DRIVING_STYLES[1].tuning

  it('makes aces braver into corners and rookies more timid', () => {
    const a = talentTuning(style, ace)
    const r = talentTuning(style, rookie)
    expect(a.corneringCaution).toBeLessThan(style.corneringCaution)
    expect(a.minCornerSpeed).toBeGreaterThan(style.minCornerSpeed)
    expect(r.corneringCaution).toBeGreaterThan(style.corneringCaution)
    expect(r.minCornerSpeed).toBeLessThan(style.minCornerSpeed)
  })

  it('leaves the style alone on the axes talent does not touch', () => {
    const a = talentTuning(style, ace)
    expect(a.steerGain).toBe(style.steerGain)
    expect(a.dodge).toBe(style.dodge)
  })

  it('an ace in a mid car out-paces a rookie in a top car', () => {
    const aceMidRank = talentPace(rivalStrength(10), ace)
    const rookieTopRank = talentPace(rivalStrength(1), rookie)
    expect(aceMidRank).toBeGreaterThan(rivalStrength(10))
    expect(rookieTopRank).toBeLessThan(rivalStrength(1))
    // the chassis still matters — rank #1 machinery keeps the rookie in touch
    expect(rookieTopRank).toBeGreaterThan(aceMidRank * 0.95)
  })

  it('aces shoot straighter', () => {
    expect(talentAimSpread(GUN.aiSpread, ace)).toBeLessThan(GUN.aiSpread)
    expect(talentAimSpread(GUN.aiSpread, rookie)).toBeGreaterThan(GUN.aiSpread)
  })

  it('aces carry more mines and drop them sooner', () => {
    expect(talentMineCount(4, ace)).toBeGreaterThan(talentMineCount(4, rookie))
    expect(talentMineCooldown(2600, ace)).toBeLessThan(talentMineCooldown(2600, rookie))
  })

  it('never hands out fractional mines', () => {
    for (const g of grades) expect(Number.isInteger(talentMineCount(3, TALENT_PROFILES[g]))).toBe(true)
  })

  it('a tier with no mines stays at no mines for every grade', () => {
    for (const g of grades) expect(talentMineCount(0, TALENT_PROFILES[g])).toBe(0)
  })

  it('leans the rubber band toward the weaker drivers', () => {
    expect(talentRubberBand(RUBBER_BAND.gainPerGate, ace)).toBeLessThan(RUBBER_BAND.gainPerGate)
    expect(talentRubberBand(RUBBER_BAND.gainPerGate, rookie)).toBeGreaterThan(RUBBER_BAND.gainPerGate)
  })
})
