import type { TrackDef } from './testCircuit'

/** Second pro-tier venue: cold industrial switchyard, one deep S-notch mid-lap. */
export const CINDER_YARDS: TrackDef = {
  id: 'cinder-yards',
  name: 'Cinder Yards',
  laps: 3,
  tier: 'pro',
  width: 240,
  shoulder: 80,
  gateCount: 10,
  samplesPerSegment: 12,
  world: { w: 3600, h: 2800 },
  theme: { ground: 0x9aa3ad, shoulder: 0x3f4348 },
  controls: [
    { x: 950, y: 2350 },
    { x: 1650, y: 2430 },
    { x: 2350, y: 2380 },
    { x: 2900, y: 2180 },
    { x: 3150, y: 1800 },
    { x: 3050, y: 1400 },
    { x: 2700, y: 1150 },
    { x: 2300, y: 1100 },
    { x: 2000, y: 1250 },
    { x: 1700, y: 1150 },
    { x: 1400, y: 900 },
    { x: 1050, y: 780 },
    { x: 700, y: 900 },
    { x: 480, y: 1250 },
    { x: 430, y: 1650 },
    { x: 600, y: 2050 },
  ],
}
