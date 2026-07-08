import { describe, expect, it } from 'vitest'
import {
  buildGates,
  catmullRomClosed,
  distanceToClosedPolyline,
  offsetClosedPolyline,
  segmentsIntersect,
  spacedPointsAlong,
} from '../../../src/core/track/geometry'

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

describe('catmullRomClosed', () => {
  it('returns samplesPerSegment points per control point and passes through controls', () => {
    const pts = catmullRomClosed(square, 8)
    expect(pts).toHaveLength(32)
    // t=0 of each segment is the control point itself
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[8]).toEqual({ x: 100, y: 0 })
  })
})

describe('distanceToClosedPolyline', () => {
  it('measures distance to the nearest edge, including the closing segment', () => {
    expect(distanceToClosedPolyline({ x: 50, y: -20 }, square)).toBeCloseTo(20)
    expect(distanceToClosedPolyline({ x: -30, y: 50 }, square)).toBeCloseTo(30) // closing edge x=0
    expect(distanceToClosedPolyline({ x: 50, y: 0 }, square)).toBeCloseTo(0)
  })
})

describe('offsetClosedPolyline', () => {
  it('offsets sideways by the given distance', () => {
    const pts = catmullRomClosed(square, 4)
    const off = offsetClosedPolyline(pts, 10)
    expect(off).toHaveLength(pts.length)
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(off[i].x - pts[i].x, off[i].y - pts[i].y)
      expect(d).toBeCloseTo(10, 5)
    }
  })
})

describe('spacedPointsAlong', () => {
  it('emits points at roughly even arc spacing', () => {
    const pts = spacedPointsAlong(square, 50) // perimeter 400
    expect(pts.length).toBe(8)
  })
})

describe('segmentsIntersect', () => {
  it('detects crossing and non-crossing segments', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(true)
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBe(false)
  })
})

describe('buildGates', () => {
  it('builds evenly spread gates spanning the track width', () => {
    const pts = catmullRomClosed(square, 10)
    const gates = buildGates(pts, 4, 15)
    expect(gates).toHaveLength(4)
    for (const g of gates) {
      expect(Math.hypot(g.a.x - g.b.x, g.a.y - g.b.y)).toBeCloseTo(30, 5)
      expect(Math.hypot(g.tangent.x, g.tangent.y)).toBeCloseTo(1, 5)
    }
  })
})
