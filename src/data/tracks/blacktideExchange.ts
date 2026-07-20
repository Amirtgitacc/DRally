import type { TrackDef } from './types'

/**
 * Street-tier opener: a rain-soaked freight-harbour perimeter loop around a
 * black-water basin. Broad loading-apron start straight, a dockside pier
 * pinch, a fast northern container sweep, and a guarded basin crescent home.
 * Geometry comes from the track implementation manifest (blacktide_exchange).
 */
export const BLACKTIDE_EXCHANGE: TrackDef = {
  id: 'blacktide-exchange',
  name: 'Blacktide Exchange',
  laps: 3,
  tier: 'street',
  width: 280,
  shoulder: 100,
  gateCount: 22,
  samplesPerSegment: 12,
  world: { w: 6600, h: 4300 },
  // counter-clockwise; index 0 is the start line on the south loading apron
  controls: [
    { x: 950, y: 3600 },
    { x: 2120, y: 3710 },
    { x: 3390, y: 3600 },
    { x: 4660, y: 3710 },
    { x: 5720, y: 3440 },
    { x: 6100, y: 2970 },
    { x: 6040, y: 2330 },
    { x: 6100, y: 1700 },
    { x: 5940, y: 1010 },
    { x: 5510, y: 580 },
    { x: 4660, y: 480 },
    { x: 3820, y: 690 },
    { x: 2970, y: 530 },
    { x: 2120, y: 480 },
    { x: 1270, y: 580 },
    { x: 740, y: 950 },
    { x: 530, y: 1540 },
    { x: 480, y: 2230 },
    { x: 530, y: 2920 },
    { x: 640, y: 3340 },
  ],
  theme: {
    ground: 0x55606c, // wet dock concrete, cold and dark
    shoulder: 0x363c44,
  },
  environment: {
    kind: 'harbor',
    glowWarm: 0xffbb55, // dirty sodium floodlight
    glowCool: 0x4fd0c8, // restrained teal water reflections
  },
  // Obstacle anchors. Interior of this counter-clockwise loop is the
  // negative-lateral side (the water basin); positive lateral = outer quay.
  // Street tier teaches authored splitters: every piece leaves two readable
  // routes and the only hard element sits on a broad sweep.
  setPieces: [
    // south apron opener: sealed cargo pallet, centered — an easy, equal
    // left/right choice (86px lane each side of the 108px block). One circle:
    // a compound square gives the push-only line avoidance opposing targets.
    { texture: 'obstacle-sealed-cargo-pallet', control: 2, lateral: 0, scale: 0.24,
      circles: [{ fwd: 0, side: 0, r: 54 }] },
    // pier-entry braking zone: forgiving tyre bale on the outer edge
    { texture: 'obstacle-strapped-tyre-bale', control: 4, lateral: 95, scale: 0.335,
      circles: [{ fwd: -45, side: 0, r: 29 }, { fwd: 45, side: 0, r: 29 }] },
    // north container sweep: armoured divider nudged toward the basin —
    // wide fast outer lane (128px) against a shorter, tighter inner lane (80px)
    { texture: 'obstacle-armoured-concrete-divider', control: 12, lateral: -24, scale: 0.45,
      circles: [{ fwd: -77, side: 0, r: 36 }, { fwd: 0, side: 0, r: 36 }, { fwd: 77, side: 0, r: 36 }] },
    // west-return braking into the basin crescent: second dockside tyre bale
    { texture: 'obstacle-strapped-tyre-bale', control: 18, lateral: 92, scale: 0.335,
      circles: [{ fwd: -45, side: 0, r: 29 }, { fwd: 45, side: 0, r: 29 }] },
  ],
  // Non-colliding harbour landmarks beyond the barriers. Container stacks
  // follow the outer quay grid; moorings mark the water side; crane platforms
  // anchor the pier entry and the north quay as braking landmarks.
  decorations: [
    { texture: 'decor-blacktide-container-stack', control: 1, lateral: 430, scale: 0.59 },
    { texture: 'decor-blacktide-container-stack', control: 11, lateral: 430, scale: 0.55 },
    { texture: 'decor-blacktide-container-stack', control: 13, lateral: 430, scale: 0.59, rotate: Math.PI },
    { texture: 'decor-blacktide-crane-drive-platform', control: 4, lateral: 460, scale: 0.59 },
    { texture: 'decor-blacktide-crane-drive-platform', control: 14, lateral: 450, scale: 0.55 },
    { texture: 'decor-blacktide-mooring-cluster', control: 6, lateral: -410, scale: 0.47 },
    { texture: 'decor-blacktide-mooring-cluster', control: 17, lateral: -410, scale: 0.47, rotate: Math.PI },
  ],
}
