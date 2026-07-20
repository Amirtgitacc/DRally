import type { TrackDef } from './types'

/**
 * Pro-tier circuit: an abandoned desert refinery. Wide maintenance straight,
 * a fast furnace arc, a decreasing-radius process bend under pipe racks, a
 * broad flare-basin carousel, then a narrow pipe field and settling-pond
 * return. Geometry comes from the track implementation manifest
 * (glassburn_works).
 */
export const GLASSBURN_WORKS: TrackDef = {
  id: 'glassburn-works',
  name: 'Glassburn Works',
  laps: 3,
  tier: 'pro',
  width: 275,
  shoulder: 100,
  gateCount: 21,
  samplesPerSegment: 12,
  world: { w: 6400, h: 4200 },
  // counter-clockwise; index 0 is the start line on the maintenance straight
  controls: [
    { x: 940, y: 3478 },
    { x: 1974, y: 3572 },
    { x: 3008, y: 3478 },
    { x: 4042, y: 3572 },
    { x: 5076, y: 3431 },
    { x: 5640, y: 3008 },
    { x: 5734, y: 2444 },
    { x: 5546, y: 1974 },
    { x: 5076, y: 1739 },
    { x: 4700, y: 1410 },
    { x: 5029, y: 987 },
    { x: 5170, y: 611 },
    { x: 4700, y: 376 },
    { x: 4042, y: 423 },
    { x: 3384, y: 705 },
    { x: 2820, y: 611 },
    { x: 2256, y: 329 },
    { x: 1598, y: 376 },
    { x: 1034, y: 658 },
    { x: 658, y: 1034 },
    { x: 517, y: 1504 },
    { x: 752, y: 1927 },
    { x: 1128, y: 2162 },
    { x: 846, y: 2538 },
    { x: 517, y: 2914 },
    { x: 611, y: 3290 },
  ],
  theme: {
    ground: 0xb08d5e, // windblown ochre sand
    shoulder: 0x54493a,
  },
  environment: {
    kind: 'refinery',
    glowWarm: 0xffb055, // dirty amber process lighting
    glowCool: 0xc05a3a, // muted rust-red valve accents
  },
  // Obstacle anchors. Interior of this counter-clockwise loop is the
  // negative-lateral side; positive lateral = the outer sand aprons.
  // Pro tier: refinery machinery controls the racing line — manifold islands
  // set the rhythm, with recovery room after each one.
  setPieces: [
    // maintenance straight: signature pipe-manifold island, centered —
    // a 97px lane either side of the plinth
    { texture: 'obstacle-low-pipe-manifold', control: 2, lateral: 0, scale: 0.41,
      circles: [{ fwd: -65, side: 0, r: 40 }, { fwd: 0, side: 0, r: 40 }, { fwd: 65, side: 0, r: 40 }] },
    // straight-exit braking into the furnace arc: forgiving tyre bale outside
    { texture: 'obstacle-strapped-tyre-bale', control: 5, lateral: 92, scale: 0.335,
      circles: [{ fwd: -45, side: 0, r: 29 }, { fwd: 45, side: 0, r: 29 }] },
    // process bend: pipe-rack overpass — purely visual, supports off-road
    { texture: 'set-pipe-rack', control: 8, lateral: 0, scale: 0.5, circles: [], overhead: true },
    // flare-basin carousel: alternating manifold islands, inside then outside —
    // a rhythm of two clear line changes, each with a control point of recovery
    { texture: 'obstacle-low-pipe-manifold', control: 14, lateral: -52, scale: 0.41,
      circles: [{ fwd: -65, side: 0, r: 40 }, { fwd: 0, side: 0, r: 40 }, { fwd: 65, side: 0, r: 40 }] },
    { texture: 'obstacle-low-pipe-manifold', control: 16, lateral: 52, scale: 0.41,
      circles: [{ fwd: -65, side: 0, r: 40 }, { fwd: 0, side: 0, r: 40 }, { fwd: 65, side: 0, r: 40 }] },
    // west pipe field: second overpass
    { texture: 'set-pipe-rack', control: 21, lateral: 0, scale: 0.5, circles: [], overhead: true },
  ],
  // Non-colliding refinery landmarks beyond the barriers. Heat exchangers run
  // parallel to the straights, pump skids sit on process pads, and repeated
  // red valve trees tie the venue together near its technical bends.
  decorations: [
    { texture: 'decor-glassburn-heat-exchanger-bank', control: 1, lateral: 400, scale: 0.65 },
    { texture: 'decor-glassburn-heat-exchanger-bank', control: 24, lateral: 400, scale: 0.6, rotate: Math.PI },
    { texture: 'decor-glassburn-pump-skid', control: 3, lateral: 410, scale: 0.51 },
    { texture: 'decor-glassburn-pump-skid', control: 20, lateral: 400, scale: 0.51, rotate: Math.PI / 2 },
    { texture: 'decor-glassburn-valve-tree', control: 6, lateral: 400, scale: 0.45 },
    { texture: 'decor-glassburn-valve-tree', control: 15, lateral: 400, scale: 0.45, rotate: Math.PI / 2 },
    // chicane elbow: the outer side folds back toward the previous segment,
    // so this landmark sits on the open infield side instead
    { texture: 'decor-glassburn-valve-tree', control: 22, lateral: -400, scale: 0.45 },
  ],
}
