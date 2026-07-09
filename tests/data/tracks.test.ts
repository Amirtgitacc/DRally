import { describe, expect, it } from 'vitest'
import { TRACKS_BY_TIER } from '../../src/data/tracks'
import {
  catmullRomClosed,
  offsetClosedPolyline,
  segmentsIntersect,
  type Vec2,
} from '../../src/core/track/geometry'

// Hand-authored control loops can silently produce self-crossing wall lines
// (too-tight folds). This guards every venue in the catalog.

const TIRE_RADIUS = 24

/**
 * Self-intersection between DISTANT parts of the loop. Tight inside corners
 * produce small local cusp loops in a naive offset — harmless, the discrete
 * tire walls just cluster there. What must never happen is two different
 * sections of track (a fold) overlapping, so only segment pairs at least
 * `minGap` samples apart along the line count.
 */
function selfIntersects(line: Vec2[], minGap = 0): boolean {
  const n = line.length
  for (let i = 0; i < n; i++) {
    const a1 = line[i]
    const a2 = line[(i + 1) % n]
    for (let j = i + 2 + minGap; j < n; j++) {
      if (i + n - j <= minGap + 1) continue // too close around the wrap (adjacent shares a point)
      const b1 = line[j]
      const b2 = line[(j + 1) % n]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

const allTracks = Object.values(TRACKS_BY_TIER).flat()

describe('track catalog geometry', () => {
  it('has two venues per tier', () => {
    expect(TRACKS_BY_TIER.street).toHaveLength(2)
    expect(TRACKS_BY_TIER.pro).toHaveLength(2)
    expect(TRACKS_BY_TIER.death).toHaveLength(2)
  })

  for (const track of allTracks) {
    describe(track.name, () => {
      const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
      const wallOffset = track.width / 2 + track.shoulder + TIRE_RADIUS

      it('keeps the centerline inside the world bounds with wall clearance', () => {
        for (const p of centerline) {
          expect(p.x).toBeGreaterThan(wallOffset / 2)
          expect(p.y).toBeGreaterThan(wallOffset / 2)
          expect(p.x).toBeLessThan(track.world.w - wallOffset / 2)
          expect(p.y).toBeLessThan(track.world.h - wallOffset / 2)
        }
      })

      it('produces wall lines with no distant-fold overlap', () => {
        for (const side of [1, -1]) {
          const wall = offsetClosedPolyline(centerline, side * wallOffset)
          expect(selfIntersects(wall, track.samplesPerSegment * 2)).toBe(false)
        }
      })

      it('produces a centerline that does not cross itself', () => {
        expect(selfIntersects(centerline)).toBe(false)
      })
    })
  }
})
