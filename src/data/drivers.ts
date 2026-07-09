import type { AiTuning } from '../core/ai/driver'
import type { TalentGrade, TalentProfile } from '../core/ai/talent'

// AI driving personalities and permanent talent grades.
//
// Three axes decide how hard a rival is to beat:
//   chassis  → ladder rank        (core/progression/ladder.ts rivalChassisId)
//   raw pace → ladder rank        (rivalStrength) × talent paceScale
//   skill    → talent grade       (this file, permanent per driver)
//   style    → cycled preset      (this file, how they drive, not how well)

export interface DrivingStyle {
  lookAheadSamples: number
  tuning: AiTuning
}

export const DRIVING_STYLES: DrivingStyle[] = [
  // charger — brakes late, hunts gaps
  { lookAheadSamples: 12, tuning: { steerGain: 2.8, corneringCaution: 0.48, minCornerSpeed: 300, dodge: 65 } },
  // technician — smooth and consistent
  { lookAheadSamples: 10, tuning: { steerGain: 2.6, corneringCaution: 0.6, minCornerSpeed: 275, dodge: 75 } },
  // bruiser — slower line, harder to pass
  { lookAheadSamples: 8, tuning: { steerGain: 2.4, corneringCaution: 0.72, minCornerSpeed: 250, dodge: 85 } },
]

/**
 * Style follows talent, not grid slot. An ace who happened to be seeded third
 * used to inherit the bruiser's timid line, which made the best drivers on the
 * ladder drive like the worst — the fastest cars, driven slowly.
 */
export function styleForGrade(grade: TalentGrade): DrivingStyle {
  if (grade === 4) return DRIVING_STYLES[0] // aces charge
  if (grade === 3) return DRIVING_STYLES[1] // veterans are technicians
  if (grade === 2) return DRIVING_STYLES[1]
  return DRIVING_STYLES[2] // rookies muscle around the outside
}

/** Talent tuning by grade. Grade is permanent; the ladder only lends machinery. */
export const TALENT_PROFILES: Record<TalentGrade, TalentProfile> = {
  4: {
    grade: 4,
    label: 'ACE',
    paceScale: 1.045,
    cautionScale: 0.8,
    minCornerSpeedScale: 1.1,
    // an ace with near-perfect aim simply executes you from behind: at 10
    // shots/s a tight cone is ~24 dmg/s. Keep them the best shot on the grid,
    // but leave the player time to react.
    aimSpreadScale: 0.85,
    mineAggression: 1.5,
    rubberBandScale: 0.6,
  },
  3: {
    grade: 3,
    label: 'VETERAN',
    paceScale: 1.015,
    cautionScale: 0.92,
    minCornerSpeedScale: 1.04,
    aimSpreadScale: 0.95,
    mineAggression: 1.15,
    rubberBandScale: 0.85,
  },
  2: {
    grade: 2,
    label: 'JOURNEYMAN',
    paceScale: 0.995,
    cautionScale: 1.05,
    minCornerSpeedScale: 0.96,
    aimSpreadScale: 1.05,
    mineAggression: 0.9,
    rubberBandScale: 1.05,
  },
  1: {
    grade: 1,
    label: 'ROOKIE',
    paceScale: 0.96,
    cautionScale: 1.2,
    minCornerSpeedScale: 0.88,
    aimSpreadScale: 1.4,
    mineAggression: 0.6,
    rubberBandScale: 1.25,
  },
}

/**
 * Permanent grade per roster driver, looked up by id — never stored in the
 * save, so old careers pick these up for free.
 *
 * 4 aces · 6 veterans · 5 journeymen · 4 rookies = the 19 ladder rivals.
 * (The champion, The Sovereign, sits above the ladder and drives as an ace.)
 */
export const DRIVER_TALENT: Record<string, TalentGrade> = {
  // aces — dangerous in anything
  sable: 4,
  gunnar: 4,
  vex: 4,
  nadia: 4,
  // veterans
  lux: 3,
  brick: 3,
  mara: 3,
  piper: 3,
  otto: 3,
  slick: 3,
  // journeymen
  tessa: 2,
  rico: 2,
  diesel: 2,
  juno: 2,
  hana: 2,
  // rookies — fast car, shaky hands
  yara: 1,
  moss: 1,
  kid: 1,
  crash: 1,
}

/** The champion races as an ace. */
export const DEFAULT_GRADE: TalentGrade = 4

export function talentOf(driverId: string): TalentProfile {
  return TALENT_PROFILES[DRIVER_TALENT[driverId] ?? DEFAULT_GRADE]
}

/**
 * Light rubber-banding: AI pace multiplier from how far ahead/behind the
 * player they are, measured in gates (~one corner). Kept subtle on purpose,
 * and scaled down further for talented drivers.
 */
export const RUBBER_BAND = {
  /** extra pace per gate of deficit (negative when leading the player) */
  gainPerGate: 0.035,
  min: 0.92,
  /**
   * Ceiling on catch-up pace. At 1.15 a trailing rival claws back almost any
   * machinery advantage, so buying a better car never made you the favourite.
   */
  max: 1.1,
}
