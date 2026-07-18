import { describe, it, expect } from 'vitest'
import { lerpCarState, bracket } from '../../src/game/race/interpolation'

const cs = (x: number, heading = 0) => ({ x, y: 0, heading, vx: 0, vy: 0, z: 0, vz: 0 })

describe('interpolation', () => {
  it('lerpCarState blends position at t', () => {
    expect(lerpCarState(cs(0), cs(10), 0.5).x).toBe(5)
  })
  it('lerpCarState takes the shortest heading arc across the ±pi seam', () => {
    const r = lerpCarState(cs(0, 3.0), cs(0, -3.0), 0.5).heading
    expect(Math.abs(r)).toBeGreaterThan(3.0) // wraps through pi, not through 0
  })
  it('bracket finds straddling snapshots and t', () => {
    const buf = [{ simTimeMs: 0 } as any, { simTimeMs: 33 } as any, { simTimeMs: 66 } as any]
    const r = bracket(buf, 50)!
    expect(r.a.simTimeMs).toBe(33)
    expect(r.b.simTimeMs).toBe(66)
    expect(r.t).toBeCloseTo((50 - 33) / (66 - 33))
  })
  it('bracket clamps before the first and after the last', () => {
    const buf = [{ simTimeMs: 10 } as any, { simTimeMs: 20 } as any]
    expect(bracket(buf, 0)!.t).toBe(0)
    expect(bracket(buf, 999)!.t).toBe(1)
    expect(bracket([], 5)).toBeNull()
  })
})
