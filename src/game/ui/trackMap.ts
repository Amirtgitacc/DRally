import Phaser from 'phaser'
import { catmullRomClosed } from '../../core/track/geometry'
import type { TrackDef } from '../../data/tracks/types'

export interface TrackMapOptions {
  cx: number
  cy: number
  /** the box the map is fitted into, preserving aspect ratio */
  width: number
  height: number
  color: number
  lineWidth?: number
  /** draw the start-line marker */
  showStart?: boolean
  /** draw a faint wide "asphalt" underlay beneath the outline */
  showSurface?: boolean
}

/**
 * Top-down outline of a venue drawn from its real centerline — the same curve
 * the race is built from, so a preview can never disagree with the track.
 * Shared by the sign-up cards and the venues gallery.
 */
export function drawTrackMap(gfx: Phaser.GameObjects.Graphics, track: TrackDef, opts: TrackMapOptions) {
  const line = catmullRomClosed(track.controls, track.samplesPerSegment)
  const xs = line.map((p) => p.x)
  const ys = line.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX
  const spanY = Math.max(...ys) - minY

  const scale = Math.min(opts.width / spanX, opts.height / spanY)
  const offX = opts.cx - (spanX * scale) / 2
  const offY = opts.cy - (spanY * scale) / 2
  const pts = line.map((p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }))

  const lw = opts.lineWidth ?? 3.5
  // Closing the loop with strokePoints' closeShape spikes a miter join at the
  // seam. Wrapping past the start by two points hides it instead.
  const loop = [...pts, pts[0], pts[1]]

  if (opts.showSurface) {
    gfx.lineStyle(Math.max(10, track.width * scale), 0x1c1c24, 0.9)
    gfx.strokePoints(loop, false, false)
  }

  gfx.lineStyle(lw * 2, 0x000000, 0.8)
  gfx.strokePoints(loop, false, false)
  gfx.lineStyle(lw, opts.color, 0.95)
  gfx.strokePoints(loop, false, false)

  if (opts.showStart !== false) {
    gfx.fillStyle(0xf2a33c, 1)
    gfx.fillCircle(pts[0].x, pts[0].y, Math.max(5, lw))
  }
}
