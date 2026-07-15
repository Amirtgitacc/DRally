import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { computeAiInput, effectiveSpec, progressScore } from '../../../src/core/race/aiControl'
import { buildTestEnv, buildTestSetups } from './testRace'
import { RUBBER_BAND } from '../../../src/data/drivers'

describe('aiControl', () => {
  it('computeAiInput is deterministic and in range', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 7)
    const rival = state.cars[1]
    const a = computeAiInput(state, env, rival)
    const b = computeAiInput(createRaceState(env, buildTestSetups(), 7), env, rival)
    expect(a).toEqual(b)
    expect(a.steer).toBeGreaterThanOrEqual(-1)
    expect(a.steer).toBeLessThanOrEqual(1)
  })

  it('rubber band never exceeds configured bounds', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 7)
    const rival = state.cars[1]
    // put the player massively ahead
    state.cars[0].progress = { ...state.cars[0].progress, gatesPassed: 50 }
    const banded = effectiveSpec(state, env, rival, false)
    const raw = rival.ai!.spec
    expect(banded.topSpeed / raw.topSpeed).toBeCloseTo(rival.ai!.speedScale * RUBBER_BAND.max, 5)
  })

  it('progressScore grows toward the next gate', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 7)
    const car = state.cars[0]
    const before = progressScore(env, car)
    const gate = env.gates[0]
    car.state.x = gate.center.x
    car.state.y = gate.center.y
    expect(progressScore(env, car)).toBeGreaterThan(before)
  })
})
