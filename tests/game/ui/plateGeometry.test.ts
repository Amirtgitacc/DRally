import { describe, expect, it } from 'vitest'
import { plateNotchPoints } from '../../../src/game/ui/plateGeometry'

describe('plateNotchPoints', () => {
  it('cuts the top-right and bottom-left corners by the notch amount', () => {
    // 100x60 plate, 10px notch, centered on origin => corners at ±50, ±30
    const pts = plateNotchPoints(100, 60, 10)
    // 6 vertices => 12 numbers
    expect(pts).toHaveLength(12)
    // top-left corner is untouched
    expect(pts.slice(0, 2)).toEqual([-50, -30])
    // top edge stops 10px short of the top-right corner
    expect(pts.slice(2, 4)).toEqual([40, -30])
    // then drops 10px down the right edge (the cut)
    expect(pts.slice(4, 6)).toEqual([50, -20])
  })

  it('degrades to a plain rectangle when notch is 0', () => {
    const pts = plateNotchPoints(100, 60, 0)
    expect(pts).toEqual([-50, -30, 50, -30, 50, 30, -50, 30])
  })
})
