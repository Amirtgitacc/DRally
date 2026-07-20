import { describe, expect, it } from 'vitest'
import { ALL_TRACKS, DUEL_TRACK, TRACKS_BY_TIER, rollTrack, trackById } from '../../src/data/tracks'
import {
  catmullRomClosed,
  offsetClosedPolyline,
  segmentsIntersect,
  signedLoopArea,
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

/** Values the track implementation manifest is authoritative for. */
const MANIFEST: Record<
  string,
  {
    tier: 'street' | 'pro' | 'death'
    world: { w: number; h: number }
    gateCount: number
    width: number
    shoulder: number
    controlCount: number
    /** screen-space driving direction; shoelace sign in y-down coords */
    direction: 'counter-clockwise' | 'clockwise'
    environment: 'harbor' | 'refinery' | 'quarry'
  }
> = {
  'blacktide-exchange': {
    tier: 'street', world: { w: 6600, h: 4300 }, gateCount: 22, width: 280, shoulder: 100,
    controlCount: 20, direction: 'counter-clockwise', environment: 'harbor',
  },
  'glassburn-works': {
    tier: 'pro', world: { w: 6400, h: 4200 }, gateCount: 21, width: 275, shoulder: 100,
    controlCount: 26, direction: 'counter-clockwise', environment: 'refinery',
  },
  'ironveil-ascent': {
    tier: 'death', world: { w: 5500, h: 5200 }, gateCount: 22, width: 270, shoulder: 95,
    controlCount: 21, direction: 'clockwise', environment: 'quarry',
  },
}

const RETIRED_IDS = [
  'dust-bowl', 'boneyard-loop', 'test-circuit', 'cinder-yards', 'serpents-throat', 'widows-coil',
]

describe('track catalog', () => {
  it('has exactly one venue per tier', () => {
    expect(TRACKS_BY_TIER.street.map((t) => t.id)).toEqual(['blacktide-exchange'])
    expect(TRACKS_BY_TIER.pro.map((t) => t.id)).toEqual(['glassburn-works'])
    expect(TRACKS_BY_TIER.death.map((t) => t.id)).toEqual(['ironveil-ascent'])
  })

  it('ALL_TRACKS is exactly the three venues in tier order', () => {
    expect(ALL_TRACKS.map((t) => t.id)).toEqual(['blacktide-exchange', 'glassburn-works', 'ironveil-ascent'])
  })

  it('runs the rank-one duel on Ironveil Ascent', () => {
    expect(DUEL_TRACK.id).toBe('ironveil-ascent')
    expect(DUEL_TRACK.tier).toBe('death')
  })

  it('rolls deterministically with one venue per tier', () => {
    for (const tier of ['street', 'pro', 'death'] as const) {
      for (const roll of [0, 0.5, 0.999]) {
        expect(rollTrack(tier, () => roll)).toBe(TRACKS_BY_TIER[tier][0])
      }
    }
  })

  it('rejects retired venue ids instead of resolving something stale', () => {
    for (const id of RETIRED_IDS) {
      expect(() => trackById(id), id).toThrow(/Unknown track id/)
    }
  })
})

describe('track catalog geometry', () => {
  for (const track of ALL_TRACKS) {
    describe(track.name, () => {
      const manifest = MANIFEST[track.id]
      const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
      const wallOffset = track.width / 2 + track.shoulder + TIRE_RADIUS

      it('matches the implementation manifest', () => {
        expect(manifest).toBeDefined()
        expect(track.tier).toBe(manifest.tier)
        expect(track.world).toEqual(manifest.world)
        expect(track.gateCount).toBe(manifest.gateCount)
        expect(track.width).toBe(manifest.width)
        expect(track.shoulder).toBe(manifest.shoulder)
        expect(track.controls).toHaveLength(manifest.controlCount)
        expect(track.environment?.kind).toBe(manifest.environment)
      })

      it('drives in the manifest direction', () => {
        const area = signedLoopArea(centerline)
        if (manifest.direction === 'clockwise') expect(area).toBeGreaterThan(0)
        else expect(area).toBeLessThan(0)
      })

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

      it('keeps even a ±350 px offset free of distant folds', () => {
        // the manifest promises this margin; it protects future width tuning
        for (const side of [1, -1]) {
          const wide = offsetClosedPolyline(centerline, side * 350)
          expect(selfIntersects(wide, track.samplesPerSegment * 2)).toBe(false)
        }
      })

      it('produces a centerline that does not cross itself', () => {
        expect(selfIntersects(centerline)).toBe(false)
      })
    })
  }
})
