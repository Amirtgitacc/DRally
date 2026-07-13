import { describe, expect, it } from 'vitest'
import { catmullRomClosed } from '../../../src/core/track/geometry'
import { layoutPickups, type PickupType } from '../../../src/core/track/pickups'
import { randomPickupLayout, randomPickupSpot } from '../../../src/core/track/pickups'
import { createSeededRandom } from '../../../src/core/race/random'

const line = catmullRomClosed(
  [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ],
  10,
) // 40 samples

const pattern: PickupType[] = ['ammo', 'cash', 'trap']

describe('layoutPickups', () => {
  it('places pickups at the requested spacing, cycling the pattern', () => {
    const spots = layoutPickups(line, {
      spacingSamples: 10,
      lateralOffsets: [0],
      pattern,
      clearRadiusAroundStart: 0,
    })
    expect(spots).toHaveLength(4)
    expect(spots.map((s) => s.type)).toEqual(['ammo', 'cash', 'trap', 'ammo'])
  })

  it('applies lateral offsets sideways from the line', () => {
    const centered = layoutPickups(line, {
      spacingSamples: 10,
      lateralOffsets: [0],
      pattern,
      clearRadiusAroundStart: 0,
    })
    const offset = layoutPickups(line, {
      spacingSamples: 10,
      lateralOffsets: [80],
      pattern,
      clearRadiusAroundStart: 0,
    })
    for (let i = 0; i < centered.length; i++) {
      const d = Math.hypot(offset[i].x - centered[i].x, offset[i].y - centered[i].y)
      expect(d).toBeCloseTo(80, 3)
    }
  })

  it('keeps the start area clear', () => {
    const spots = layoutPickups(line, {
      spacingSamples: 10,
      lateralOffsets: [0],
      pattern,
      clearRadiusAroundStart: 300,
    })
    for (const s of spots) {
      expect(Math.hypot(s.x - line[0].x, s.y - line[0].y)).toBeGreaterThanOrEqual(300)
    }
  })
})

describe('seeded random pickup layout', () => {
  const options = {
    lateralOffsets: [-60, 0, 60],
    clearRadiusAroundStart: 250,
    minDistance: 300,
  }

  it('is reproducible for a seed but changes with another seed', () => {
    const types: PickupType[] = ['ammo', 'turbo', 'cash', 'repair', 'trap', 'trap']
    const first = randomPickupLayout(line, types, options, createSeededRandom(42))
    const replay = randomPickupLayout(line, types, options, createSeededRandom(42))
    const different = randomPickupLayout(line, types, options, createSeededRandom(43))
    expect(replay).toEqual(first)
    expect(different).not.toEqual(first)
  })

  it('keeps randomized slots away from the start and one another', () => {
    const spots = randomPickupLayout(
      line,
      ['ammo', 'turbo', 'cash', 'repair'],
      options,
      createSeededRandom(7),
    )
    for (const spot of spots) {
      expect(Math.hypot(spot.x - line[0].x, spot.y - line[0].y)).toBeGreaterThanOrEqual(options.clearRadiusAroundStart)
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThanOrEqual(options.minDistance)
      }
    }
  })

  it('relocates a respawn away from currently active pickups', () => {
    const occupied = [{ x: 1000, y: 0 }, { x: 1000, y: 1000 }]
    const spot = randomPickupSpot(line, options, createSeededRandom(99), occupied)
    occupied.forEach((other) => {
      expect(Math.hypot(spot.x - other.x, spot.y - other.y)).toBeGreaterThanOrEqual(options.minDistance)
    })
  })
})
