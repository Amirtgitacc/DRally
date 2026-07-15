import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { buildTestEnv, buildTestSetups } from './testRace'

describe('createRaceState', () => {
  it('is deterministic for a seed', () => {
    const env = buildTestEnv()
    expect(createRaceState(env, buildTestSetups(), 42)).toEqual(createRaceState(env, buildTestSetups(), 42))
  })

  it('produces a JSON-serializable state that round-trips losslessly', () => {
    const state = createRaceState(buildTestEnv(), buildTestSetups(), 42)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('spawns the player first, on the grid, grounded and idle', () => {
    const state = createRaceState(buildTestEnv(), buildTestSetups(), 42)
    expect(state.cars[0].isPlayer).toBe(true)
    expect(state.cars[0].state.z).toBe(0)
    expect(state.phase).toBe('countdown')
    expect(state.pickups.length).toBeGreaterThan(0)
    expect(state.placementOrder).toHaveLength(2)
  })
})
