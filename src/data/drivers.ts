import type { AiTuning } from '../core/ai/driver'

// AI driving personalities. Identity (name/color) comes from the roster and
// raw pace from ladder rank (core/progression/ladder.ts rivalStrength);
// these presets shape HOW they drive and are cycled across the grid.

export interface DrivingStyle {
  lookAheadSamples: number
  tuning: AiTuning
}

export const DRIVING_STYLES: DrivingStyle[] = [
  // charger — brakes late, hunts gaps
  { lookAheadSamples: 12, tuning: { steerGain: 2.8, corneringCaution: 0.55, minCornerSpeed: 260, dodge: 65 } },
  // technician — smooth and consistent
  { lookAheadSamples: 10, tuning: { steerGain: 2.6, corneringCaution: 0.7, minCornerSpeed: 235, dodge: 75 } },
  // bruiser — slower line, harder to pass
  { lookAheadSamples: 8, tuning: { steerGain: 2.4, corneringCaution: 0.85, minCornerSpeed: 210, dodge: 85 } },
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
