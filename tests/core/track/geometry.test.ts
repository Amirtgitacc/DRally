import { describe, expect, it } from 'vitest'
import {
  buildGates,
  catmullRomClosed,
  closedPolylineLength,
  distanceToClosedPolyline,
  offsetClosedPolyline,
  scatterPointsAlong,
  segmentsIntersect,
  spacedPointsAlong,
  spacedPosesAlong,
} from '../../../src/core/track/geometry'
import { createSeededRandom } from '../../../src/core/race/random'

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

describe('closedPolylineLength', () => {
  it('measures the full loop, including the closing segment', () => {
    expect(closedPolylineLength(square)).toBe(400)
  })

  it('is zero for a degenerate loop', () => {
    expect(closedPolylineLength([{ x: 5, y: 5 }])).toBe(0)
  })

  it('grows with the number of samples around a curve, converging on the arc length', () => {
    const coarse = closedPolylineLength(catmullRomClosed(square, 2))
    const fine = closedPolylineLength(catmullRomClosed(square, 32))
    expect(fine).toBeGreaterThan(coarse * 0.95)
    expect(fine).toBeLessThan(coarse * 1.15)
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

describe('spacedPosesAlong', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('emits the same count and positions as spacedPointsAlong', () => {
    const poses = spacedPosesAlong(square, 50)
    expect(poses.length).toBe(8)
    expect(poses[0]).toMatchObject({ x: 50, y: 0 })
    expect(poses[1]).toMatchObject({ x: 100, y: 0 })
  })

  it('carries the segment tangent angle', () => {
    const poses = spacedPosesAlong(square, 50)
    // first edge runs +x → angle 0
    expect(poses[0].angle).toBeCloseTo(0)
    // point (100,50) sits on the +y edge → angle π/2
    expect(poses[2]).toMatchObject({ x: 100, y: 50 })
    expect(poses[2].angle).toBeCloseTo(Math.PI / 2)
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

describe('scatterPointsAlong', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ] // total arc length = 400

  // deterministic scripted RNG for exact-position assertions
  const scripted = (seq: number[]) => {
    let i = 0
    return () => seq[i++ % seq.length]
  }

  it('places a pose at the seeded arc distance on the +x edge', () => {
    // first rng() -> arc distance (0.1 * 400 = 40 on the +x edge); second -> lateral (unused, lateralFrac 0)
    const poses = scatterPointsAlong(square, 1, scripted([0.1, 0.5]), {
      halfWidth: 20,
      lateralFrac: 0,
      minGap: 0,
    })
    expect(poses.length).toBe(1)
    expect(poses[0].x).toBeCloseTo(40)
    expect(poses[0].y).toBeCloseTo(0)
    expect(poses[0].angle).toBeCloseTo(0)
  })

  it('carries the +y edge tangent angle', () => {
    // 0.375 * 400 = 150 -> 50px up the +y edge from (100,0)
    const poses = scatterPointsAlong(square, 1, scripted([0.375, 0.5]), {
      halfWidth: 20,
      lateralFrac: 0,
      minGap: 0,
    })
    expect(poses[0].x).toBeCloseTo(100)
    expect(poses[0].y).toBeCloseTo(50)
    expect(poses[0].angle).toBeCloseTo(Math.PI / 2)
  })

  it('is deterministic for the same seed', () => {
    const opts = { halfWidth: 20, lateralFrac: 0.5, minGap: 10 }
    const a = scatterPointsAlong(square, 5, createSeededRandom(42), opts)
    const b = scatterPointsAlong(square, 5, createSeededRandom(42), opts)
    expect(a).toEqual(b)
  })

  it('honours count when no gap constraint applies', () => {
    const poses = scatterPointsAlong(square, 10, createSeededRandom(1), {
      halfWidth: 0,
      lateralFrac: 0,
      minGap: 0,
    })
    expect(poses.length).toBe(10)
  })

  it('respects minGap (cannot fit 3 points 150 apart on a 400 loop)', () => {
    const poses = scatterPointsAlong(square, 10, createSeededRandom(7), {
      halfWidth: 0,
      lateralFrac: 0,
      minGap: 150,
    })
    expect(poses.length).toBeLessThanOrEqual(2)
  })

  it('keeps every pose within lateralFrac·halfWidth of the centerline', () => {
    const poses = scatterPointsAlong(square, 8, createSeededRandom(3), {
      halfWidth: 20,
      lateralFrac: 0.5, // max lateral offset = 10
      minGap: 5,
    })
    for (const p of poses) {
      expect(distanceToClosedPolyline(p, square)).toBeLessThanOrEqual(10 + 1e-9)
    }
  })
})
