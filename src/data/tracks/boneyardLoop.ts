import type { TrackDef } from './testCircuit'

/** Second street-tier venue: a sun-bleached scrapyard oval with one nasty kink at the top. */
export const BONEYARD_LOOP: TrackDef = {
  id: 'boneyard-loop',
  name: 'Boneyard Loop',
  laps: 3,
  tier: 'street',
  width: 310,
  shoulder: 115,
  gateCount: 8,
  samplesPerSegment: 12,
  world: { w: 3400, h: 2450 },
  theme: { ground: 0xd4b98c, shoulder: 0x5a4f3c },
  controls: [
    { x: 800, y: 1850 },
    { x: 1500, y: 1950 },
    { x: 2200, y: 1880 },
    { x: 2700, y: 1700 },
    { x: 2950, y: 1350 },
    { x: 2800, y: 950 },
    { x: 2350, y: 700 },
    { x: 1900, y: 780 },
    { x: 1500, y: 640 },
    { x: 1000, y: 620 },
    { x: 600, y: 850 },
    { x: 430, y: 1250 },
    { x: 520, y: 1600 },
  ],
}
