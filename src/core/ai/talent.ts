// Pure driver-talent math — no Phaser imports, no numbers. A driver's talent
// grade is permanent and separate from their machinery: chassis and raw pace
// come from ladder rank, talent decides how well they use them.
//
// An ace in a mid car is scary. A rookie in a good car is beatable.
// The grade tables themselves live in src/data/drivers.ts.

import type { AiTuning } from './driver'

/** 1 = rookie, 2 = journeyman, 3 = veteran, 4 = ace. */
export type TalentGrade = 1 | 2 | 3 | 4

export interface TalentProfile {
  grade: TalentGrade
  /** shown in the ladder screen, e.g. 'ACE' */
  label: string
  /** multiplier on the pace their ladder rank earns them */
  paceScale: number
  /** scale on corneringCaution — below 1 means braver into corners */
  cautionScale: number
  /** scale on minCornerSpeed — above 1 means more speed carried through */
  minCornerSpeedScale: number
  /** scale on gun spread — below 1 means tighter aim */
  aimSpreadScale: number
  /** scale on how many mines they carry and how eagerly they drop them */
  mineAggression: number
  /** scale on rubber-band assistance — aces need less help catching up */
  rubberBandScale: number
}

export function starsFor(grade: TalentGrade): string {
  return '★'.repeat(grade)
}

/** Bend a driving style's tuning by talent. Style says HOW, talent says HOW WELL. */
export function talentTuning(base: AiTuning, t: TalentProfile): AiTuning {
  return {
    ...base,
    corneringCaution: base.corneringCaution * t.cautionScale,
    minCornerSpeed: base.minCornerSpeed * t.minCornerSpeedScale,
  }
}

/** Final pace multiplier: what their rank earned, scaled by what they can do with it. */
export function talentPace(rankStrength: number, t: TalentProfile): number {
  return rankStrength * t.paceScale
}

export function talentAimSpread(baseSpread: number, t: TalentProfile): number {
  return baseSpread * t.aimSpreadScale
}

/** Mines carried for a tier. Aces bring extra; rookies may bring none at all. */
export function talentMineCount(baseCount: number, t: TalentProfile): number {
  return Math.round(baseCount * t.mineAggression)
}

/** Aces drop them sooner (shorter cooldown); rookies dither. */
export function talentMineCooldown(baseCooldownMs: number, t: TalentProfile): number {
  return Math.round(baseCooldownMs / t.mineAggression)
}

export function talentRubberBand(gainPerGate: number, t: TalentProfile): number {
  return gainPerGate * t.rubberBandScale
}
