import { describe, expect, it } from 'vitest'
import { buildRacingLine, racingLineOffsets, totalCurvature } from '../../../src/core/track/racingLine'
import { catmullRomClosed, closedPolylineLength, distanceToClosedPolyline } from '../../../src/core/track/geometry'
import { ALL_TRACKS } from '../../../src/data/tracks'

const MAX_OFFSET = 80

// an oval: two straights joined by two 180° ends — the shape apex-clipping helps most
const oval = catmullRomClosed(
  [
    { x: 400, y: 200 },
    { x: 1200, y: 200 },
    { x: 1400, y: 600 },
    { x: 1200, y: 1000 },
    { x: 400, y: 1000 },
    { x: 200, y: 600 },
  ],
  24,
)

describe('racingLineOffsets', () => {
  it('never leaves the corridor', () => {
    const offsets = racingLineOffsets(oval, { maxOffset: MAX_OFFSET })
    for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(MAX_OFFSET + 1e-6)
  })

  it('actually uses the corridor — a straight centerline would leave it unused', () => {
    const offsets = racingLineOffsets(oval, { maxOffset: MAX_OFFSET })
    const widest = Math.max(...offsets.map(Math.abs))
    expect(widest).toBeGreaterThan(MAX_OFFSET * 0.5)
  })

  it('gives one offset per centerline sample', () => {
    expect(racingLineOffsets(oval, { maxOffset: MAX_OFFSET })).toHaveLength(oval.length)
  })

  it('collapses onto the centerline when there is nowhere to go', () => {
    const offsets = racingLineOffsets(oval, { maxOffset: 0 })
    for (const o of offsets) expect(o).toBe(0)
  })
})

describe('buildRacingLine', () => {
  it('is shorter than the centerline', () => {
    const line = buildRacingLine(oval, { maxOffset: MAX_OFFSET })
    expect(closedPolylineLength(line)).toBeLessThan(closedPolylineLength(oval))
  })

  it('is straighter than the centerline — that is the whole point', () => {
    const line = buildRacingLine(oval, { maxOffset: MAX_OFFSET })
    expect(totalCurvature(line)).toBeLessThan(totalCurvature(oval))
  })

  it('stays on the tarmac', () => {
    const line = buildRacingLine(oval, { maxOffset: MAX_OFFSET })
    for (const p of line) expect(distanceToClosedPolyline(p, oval)).toBeLessThanOrEqual(MAX_OFFSET + 1e-6)
  })

  it('a closed loop still closes: every step is a small one', () => {
    const line = buildRacingLine(oval, { maxOffset: MAX_OFFSET })
    for (let i = 0; i < line.length; i++) {
      const a = line[i]
      const b = line[(i + 1) % line.length]
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(80)
    }
  })
})

describe('every shipped venue', () => {
  // a line that clips a barrier is worse than no line at all
  for (const track of ALL_TRACKS) {
    it(`${track.id}: the line is inside the track, shorter and straighter`, () => {
      const centerline = catmullRomClosed(track.controls, 12)
      const maxOffset = track.width / 2 - 40
      const line = buildRacingLine(centerline, { maxOffset })
      for (const p of line) expect(distanceToClosedPolyline(p, centerline)).toBeLessThanOrEqual(maxOffset + 1e-6)
      expect(closedPolylineLength(line)).toBeLessThan(closedPolylineLength(centerline))
      expect(totalCurvature(line)).toBeLessThan(totalCurvature(centerline))
    })
  }
})

describe('totalCurvature', () => {
  it('a closed loop turns through a full circle', () => {
    const circle = Array.from({ length: 64 }, (_, i) => ({
      x: Math.cos((i / 64) * Math.PI * 2) * 500,
      y: Math.sin((i / 64) * Math.PI * 2) * 500,
    }))
    expect(totalCurvature(circle)).toBeCloseTo(Math.PI * 2, 3)
  })
})
