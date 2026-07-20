import type { TrackDef } from './types'

/**
 * Death-tier finale and the rank-one duel stage: a mountain quarry wrapped
 * around one central excavation void. Broad crusher apron, a guarded rock-cut
 * ascent, a fast high bench, a tight switchback descent, and a dusty gravel
 * shelf return. Geometry comes from the track implementation manifest
 * (ironveil_ascent).
 */
export const IRONVEIL_ASCENT: TrackDef = {
  id: 'ironveil-ascent',
  name: 'Ironveil Ascent',
  laps: 4,
  tier: 'death',
  width: 270,
  shoulder: 95,
  gateCount: 22,
  samplesPerSegment: 12,
  world: { w: 5500, h: 5200 },
  // clockwise; index 0 is the start line on the crusher apron
  controls: [
    { x: 4200, y: 4500 },
    { x: 3200, y: 4700 },
    { x: 2100, y: 4650 },
    { x: 1100, y: 4400 },
    { x: 600, y: 3900 },
    { x: 550, y: 3300 },
    { x: 900, y: 2800 },
    { x: 650, y: 2300 },
    { x: 500, y: 1700 },
    { x: 700, y: 1100 },
    { x: 1200, y: 600 },
    { x: 2000, y: 450 },
    { x: 2800, y: 600 },
    { x: 3600, y: 450 },
    { x: 4400, y: 700 },
    { x: 4850, y: 1200 },
    { x: 4700, y: 1800 },
    { x: 4200, y: 2200 },
    { x: 4600, y: 2600 },
    { x: 4900, y: 3200 },
    { x: 4800, y: 3800 },
  ],
  theme: {
    ground: 0x7d8794, // moonlit blue-grey quarry rock
    shoulder: 0x4c5560,
  },
  environment: {
    kind: 'quarry',
    glowWarm: 0xffcf8a, // dirty-amber work lights
    glowCool: 0x9ab0c8, // pale rock-dust moonlight
  },
  // Obstacle anchors. Interior of this clockwise loop (the quarry void) is
  // the positive-lateral side; negative lateral = the outer benches.
  // Death tier: contained rockfall islands are the signature threat — heavy
  // silhouettes with a clean steel-curb collision boundary, always leaving
  // one honest lane.
  setPieces: [
    // crusher apron: signature rockfall island, nudged toward the void —
    // safe 130px outer lane against a risky 40px inside squeeze
    { texture: 'obstacle-contained-rockfall', control: 1, lateral: 45, scale: 0.41,
      circles: [{ fwd: -55, side: 0, r: 50 }, { fwd: 0, side: 0, r: 50 }, { fwd: 55, side: 0, r: 50 }] },
    // broad south sweep: armoured divider as quarry safety infrastructure —
    // a different silhouette, tight void-side lane vs a wide outer lane.
    // (Kept off the switchbacks: bumped AI cars wedge on obstacles at apexes.)
    { texture: 'obstacle-armoured-concrete-divider', control: 3, lateral: 25, scale: 0.45,
      circles: [{ fwd: -77, side: 0, r: 36 }, { fwd: 0, side: 0, r: 36 }, { fwd: 77, side: 0, r: 36 }] },
    // rock-cut ascent: small contained spill nibbling the outer edge of the
    // gentle climb — not the switchback apex, for the same wedging reason
    { texture: 'obstacle-contained-rockfall', control: 9, lateral: -105, scale: 0.25,
      circles: [{ fwd: -30, side: 0, r: 30 }, { fwd: 30, side: 0, r: 30 }] },
    // high bench: second rockfall offset outward — fast line hugs the void
    { texture: 'obstacle-contained-rockfall', control: 12, lateral: -40, scale: 0.41,
      circles: [{ fwd: -55, side: 0, r: 50 }, { fwd: 0, side: 0, r: 50 }, { fwd: 55, side: 0, r: 50 }] },
  ],
  // Non-colliding quarry landmarks on the outer benches. One hero excavator,
  // and an ore hopper + conveyor-drive pair telling one story at the crusher.
  decorations: [
    // parked excavator on the north-east bench, boom folded away from the road
    { texture: 'decor-ironveil-excavator', control: 15, lateral: -430, scale: 0.56, rotate: Math.PI / 2 },
    // crusher service pad: ore hopper visible on the start/finish approach…
    { texture: 'decor-ironveil-ore-hopper', control: 0, lateral: -440, scale: 0.59 },
    // …fed by its conveyor-drive module just upstream, parallel to the road
    { texture: 'decor-ironveil-conveyor-drive', control: 20, lateral: -400, scale: 0.58 },
    // second conveyor module on the high-bench terrace
    { texture: 'decor-ironveil-conveyor-drive', control: 11, lateral: -380, scale: 0.52 },
  ],
}
