import type { Vec2 } from '../../core/track/geometry'
import type { RaceTier } from '../economy'

// Track definitions are pure data: a closed loop of control points plus tuning.
// The centerline, walls, and checkpoint gates all derive from this in code.

export interface TrackDef {
  id: string
  name: string
  laps: number
  /** prize tier — sets payouts and points (see data/economy.ts) */
  tier: RaceTier
  /** asphalt ribbon width in px */
  width: number
  /** drivable-but-slow rough shoulder on each side, px */
  shoulder: number
  gateCount: number
  samplesPerSegment: number
  world: { w: number; h: number }
  /** closed loop, listed in driving direction; index 0 is the start line */
  controls: Vec2[]
}

/** First original circuit — a bottom straight, sweeping right bend, top chicane, left hairpin. */
export const TEST_CIRCUIT: TrackDef = {
  id: 'test-circuit',
  name: 'Rust Belt Circuit',
  laps: 3,
  tier: 'pro',
  width: 240,
  shoulder: 80,
  gateCount: 10,
  samplesPerSegment: 12,
  world: { w: 3500, h: 2700 },
  controls: [
    { x: 1000, y: 2250 },
    { x: 1700, y: 2300 },
    { x: 2400, y: 2250 },
    { x: 2850, y: 2130 },
    { x: 3120, y: 1780 },
    { x: 3080, y: 1300 },
    { x: 2820, y: 1000 },
    { x: 2400, y: 870 },
    { x: 2050, y: 900 },
    { x: 1760, y: 1040 },
    { x: 1450, y: 860 },
    { x: 1130, y: 800 },
    { x: 790, y: 880 },
    { x: 520, y: 1110 },
    { x: 420, y: 1470 },
    { x: 560, y: 1830 },
    { x: 830, y: 2090 },
  ],
}
