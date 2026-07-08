import type { AiTuning } from '../core/ai/driver'

// AI rival roster — all original characters. Skill is expressed through
// concrete tuning: speed scale, how far ahead they read the track, and how
// hard they brake for corners. lookAheadSamples is in centerline samples
// (one sample ≈ 30-40 px on the test circuit).

export interface DriverDef {
  id: string
  name: string
  bodyColor: number
  accentColor: number
  /** multiplier on chassis topSpeed/accel — the driver's raw pace */
  speedScale: number
  lookAheadSamples: number
  tuning: AiTuning
}

export const RIVAL_DRIVERS: DriverDef[] = [
  {
    id: 'vex',
    name: 'Vex',
    bodyColor: 0xd04a35,
    accentColor: 0x16161c,
    speedScale: 1.02,
    lookAheadSamples: 12,
    tuning: { steerGain: 2.8, corneringCaution: 0.55, minCornerSpeed: 260, dodge: 65 },
  },
  {
    id: 'mara',
    name: 'Mara Kane',
    bodyColor: 0x4f8fd0,
    accentColor: 0xf0f0e8,
    speedScale: 0.98,
    lookAheadSamples: 10,
    tuning: { steerGain: 2.6, corneringCaution: 0.7, minCornerSpeed: 235, dodge: 75 },
  },
  {
    id: 'diesel',
    name: 'Diesel Ott',
    bodyColor: 0xd0b435,
    accentColor: 0x16161c,
    speedScale: 0.94,
    lookAheadSamples: 8,
    tuning: { steerGain: 2.4, corneringCaution: 0.85, minCornerSpeed: 210, dodge: 85 },
  },
]

/**
 * Light rubber-banding: AI pace multiplier from how far ahead/behind the
 * player they are, measured in gates (~one corner). Kept subtle on purpose.
 */
export const RUBBER_BAND = {
  /** extra pace per gate of deficit (negative when leading the player) */
  gainPerGate: 0.03,
  min: 0.92,
  max: 1.12,
}

/** AI gets faster as the player's career grows, so upgrades stay earned. */
export const DIFFICULTY_RAMP = {
  perPoint: 0.0015,
  max: 0.08,
}
