// Pure set-piece resolution — no Phaser imports. A TrackSetPiece is authored
// relative to a control point; this resolves it into world space once, so the
// scene (sprite), the physics (collision circles), the racing line, pickups,
// and rescue all read the exact same geometry in single-player and multiplayer.

import { lineTangentAt, type Vec2 } from './geometry'
import type { TrackDef, TrackDecoration, TrackSetPiece } from '../../data/tracks/types'

export interface ObstacleCircle {
  x: number
  y: number
  r: number
}

export interface ResolvedSetPiece {
  texture: string
  x: number
  y: number
  /** sprite rotation, radians — track tangent plus the authored offset */
  angle: number
  scale: number
  overhead: boolean
  circles: ObstacleCircle[]
}

/** World pose + non-colliding presentation for an authored scenery landmark. */
export interface ResolvedDecoration {
  texture: string
  x: number
  y: number
  angle: number
  scale: number
  overhead: boolean
}

interface AnchorFrame {
  x: number
  y: number
  tx: number
  ty: number
  nx: number
  ny: number
  angle: number
}

/** Anchor pose for a control-point index: position, tangent, left normal. */
function anchorFrame(
  track: TrackDef,
  centerline: Vec2[],
  control: number,
  lateral: number,
): AnchorFrame {
  const n = centerline.length
  const i = ((control * track.samplesPerSegment) % n + n) % n
  const p = centerline[i]
  const t = lineTangentAt(centerline, i)
  const nx = -t.y // left normal — same convention as offsetClosedPolyline
  const ny = t.x
  return {
    x: p.x + nx * lateral,
    y: p.y + ny * lateral,
    tx: t.x,
    ty: t.y,
    nx,
    ny,
    angle: Math.atan2(t.y, t.x),
  }
}

/** World pose + collision circles for every authored set piece of a track. */
export function resolveSetPieces(track: TrackDef, centerline: Vec2[]): ResolvedSetPiece[] {
  const pieces = track.setPieces ?? []
  return pieces.map((sp: TrackSetPiece) => {
    const f = anchorFrame(track, centerline, sp.control, sp.lateral)
    return {
      texture: sp.texture,
      x: f.x,
      y: f.y,
      angle: f.angle + (sp.rotate ?? 0),
      scale: sp.scale,
      overhead: sp.overhead === true,
      circles: sp.circles.map((c) => ({
        x: f.x + f.tx * c.fwd + f.nx * c.side,
        y: f.y + f.ty * c.fwd + f.ny * c.side,
        r: c.r,
      })),
    }
  })
}

/** World pose for every authored decoration landmark — no collision output. */
export function resolveDecorations(track: TrackDef, centerline: Vec2[]): ResolvedDecoration[] {
  const decorations = track.decorations ?? []
  return decorations.map((d: TrackDecoration) => {
    const f = anchorFrame(track, centerline, d.control, d.lateral)
    return {
      texture: d.texture,
      x: f.x,
      y: f.y,
      angle: f.angle + (d.rotate ?? 0),
      scale: d.scale,
      overhead: d.overhead === true,
    }
  })
}
