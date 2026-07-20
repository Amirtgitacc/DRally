import type { Vec2 } from '../../core/track/geometry'
import type { RaceTier } from '../economy'

// Track definitions are pure data: a closed loop of control points plus tuning.
// The centerline, walls, and checkpoint gates all derive from this in code.

/** Which industrial setting the venue dresses itself as, race-side. */
export type TrackEnvironmentKind = 'harbor' | 'refinery' | 'quarry'

/**
 * Serializable presentation identity. The Phaser layer reads this to pick
 * decoration mixes and light colors; nothing in core rules depends on it.
 */
export interface TrackEnvironment {
  kind: TrackEnvironmentKind
  /** warm work-light color — edge reflectors and boundary light pools */
  glowWarm: number
  /** restrained secondary accent — water/valve/dust reflections */
  glowCool: number
}

/** One collision circle of a set piece, in the piece's local frame:
 *  `fwd` runs along the track tangent, `side` along the left normal. */
export interface SetPieceCircle {
  fwd: number
  side: number
  r: number
}

/**
 * An authored landmark anchored to a centerline control point. Pieces with
 * circles are real obstacles: the same circles drive collision, racing-line
 * avoidance, pickup placement, and rescue in single-player and multiplayer.
 * Pieces with no circles are visual only (overhead spans, edge dressing).
 */
export interface TrackSetPiece {
  /** texture key the scene draws */
  texture: string
  /** control-point index this piece is anchored to */
  control: number
  /** signed lateral offset from the centerline, px; positive = left of travel */
  lateral: number
  /** sprite scale applied to the loaded texture */
  scale: number
  /** collision circles; empty for purely visual pieces */
  circles: SetPieceCircle[]
  /** drawn above the cars (pipe racks, conveyors) */
  overhead?: boolean
  /** sprite rotation offset from the track tangent, radians (art orientation) */
  rotate?: number
}

/**
 * An authored non-colliding scenery landmark anchored to a control point.
 * Decorations never carry collision circles and are placed beyond the
 * shoulder/barrier clearance; only small seeded filler varies per race.
 */
export interface TrackDecoration {
  /** texture key the scene draws */
  texture: string
  /** control-point index this landmark is anchored to */
  control: number
  /** signed lateral offset from the centerline, px; positive = left of travel */
  lateral: number
  /** sprite scale applied to the loaded texture */
  scale: number
  /** sprite rotation offset from the track tangent, radians (art orientation) */
  rotate?: number
  /** drawn above the cars — reserved for genuinely elevated scenery */
  overhead?: boolean
}

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
  /** optional color identity — tints applied over the shared textures */
  theme?: {
    /** tint over the off-track ground tile */
    ground: number
    /** rough shoulder fill color */
    shoulder: number
  }
  /** environment dressing identity for the race scene */
  environment?: TrackEnvironment
  /** authored landmarks: splitters, edge buffers, overhead spans */
  setPieces?: TrackSetPiece[]
  /** authored non-colliding scenery landmarks beyond the barriers */
  decorations?: TrackDecoration[]
}
