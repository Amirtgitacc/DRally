import { describe, expect, it, vi } from 'vitest'
import { FixedStepClock, simulationDeltaSeconds } from '../../../src/game/race/raceSimulation'
import { createRaceRuntime, finishRace, startRace } from '../../../src/game/race/raceRuntime'

describe('race runtime foundation', () => {
  it('allows only the intended phase progression', () => {
    const countdown = createRaceRuntime(42)
    const racing = startRace(countdown, 1000)
    expect(racing).toMatchObject({ phase: 'racing', raceStartAt: 1000, seed: 42 })
    expect(finishRace(racing)).toMatchObject({ phase: 'finished', resultCommitted: true })
  })

  it('clamps unsafe render deltas', () => {
    expect(simulationDeltaSeconds(500)).toBe(0.05)
    expect(simulationDeltaSeconds(-2)).toBe(0)
  })

  it('runs extracted systems at a fixed timestep', () => {
    const step = vi.fn()
    const clock = new FixedStepClock(10)
    expect(clock.advance(35, step)).toBe(3)
    expect(step).toHaveBeenCalledTimes(3)
    expect(step).toHaveBeenCalledWith(0.01)
  })
})
