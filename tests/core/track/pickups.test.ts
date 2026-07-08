import { describe, expect, it } from 'vitest'
import { catmullRomClosed } from '../../../src/core/track/geometry'
import { layoutPickups, type PickupType } from '../../../src/core/track/pickups'

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
