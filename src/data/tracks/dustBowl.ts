import type { TrackDef } from './testCircuit'

/** Street-tier opener: wide, fast, forgiving — a dusty fairground oval with a kink. */
export const DUST_BOWL: TrackDef = {
  id: 'dust-bowl',
  name: 'Dust Bowl Run',
  laps: 3,
  tier: 'street',
  width: 300,
  shoulder: 110,
  gateCount: 8,
  samplesPerSegment: 12,
  world: { w: 3300, h: 2500 },
  controls: [
    { x: 900, y: 1900 },
    { x: 1600, y: 1980 },
    { x: 2300, y: 1900 },
    { x: 2750, y: 1650 },
    { x: 2870, y: 1250 },
    { x: 2650, y: 850 },
    { x: 2100, y: 620 },
    { x: 1400, y: 600 },
    { x: 850, y: 720 },
    { x: 520, y: 1050 },
    { x: 480, y: 1450 },
    { x: 650, y: 1750 },
  ],
}
