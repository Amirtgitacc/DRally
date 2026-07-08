import { describe, expect, it } from 'vitest'
import {
  applyGateCrossing,
  createProgress,
  currentLap,
  isFinished,
  lapsCompleted,
  nextGateIndex,
  type RaceProgress,
} from '../../../src/core/race/progress'

const GATES = 4
const LAPS = 2

function cross(p: RaceProgress, gates: number[]): RaceProgress {
  for (const g of gates) p = applyGateCrossing(p, g).progress
  return p
}

describe('race progress', () => {
  it('arms on the first start-line crossing', () => {
    const r = applyGateCrossing(createProgress(GATES, LAPS), 0)
    expect(r.armed).toBe(true)
    expect(r.lapCompleted).toBe(false)
    expect(nextGateIndex(r.progress)).toBe(1)
  })

  it('ignores out-of-order gates (shortcuts do not count)', () => {
    const p = cross(createProgress(GATES, LAPS), [0, 1])
    const r = applyGateCrossing(p, 3) // skipped gate 2
    expect(r.progress.gatesPassed).toBe(p.gatesPassed)
    expect(nextGateIndex(r.progress)).toBe(2)
  })

  it('ignores re-crossing the same gate (reversing does not count)', () => {
    const p = cross(createProgress(GATES, LAPS), [0, 1])
    const r = applyGateCrossing(p, 1)
    expect(r.progress.gatesPassed).toBe(p.gatesPassed)
  })

  it('completes a lap only on re-crossing the start line after all gates', () => {
    let p = cross(createProgress(GATES, LAPS), [0, 1, 2, 3])
    expect(lapsCompleted(p)).toBe(0)
    const r = applyGateCrossing(p, 0)
    expect(r.lapCompleted).toBe(true)
    expect(lapsCompleted(r.progress)).toBe(1)
    expect(currentLap(r.progress)).toBe(2)
  })

  it('finishes after the required laps and stops counting', () => {
    let p = cross(createProgress(GATES, LAPS), [0, 1, 2, 3, 0, 1, 2, 3])
    const r = applyGateCrossing(p, 0)
    expect(r.finished).toBe(true)
    expect(isFinished(r.progress)).toBe(true)
    const after = applyGateCrossing(r.progress, 1)
    expect(after.progress.gatesPassed).toBe(r.progress.gatesPassed)
  })

  it('reports lap 1 of N before and right after arming', () => {
    const fresh = createProgress(GATES, LAPS)
    expect(currentLap(fresh)).toBe(1)
    expect(currentLap(applyGateCrossing(fresh, 0).progress)).toBe(1)
  })
})
