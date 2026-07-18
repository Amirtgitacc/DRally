import { describe, it, expect } from 'vitest'
import { stepRace, type CommandSet } from '../../src/core/race/stepRace'
import { createRaceState, type CarSetup, type RaceEnv } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'

const FIXED = 1000 / 30
const idle: CommandSet = {}

function race(mode: 'single-player' | 'all-humans') {
  const env: RaceEnv = { ...buildRaceEnvFixture(), raceEndMode: mode }
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null },
    { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null },
  ]
  return { env, state: createRaceState(env, setups, 1) }
}

describe('race-end policy', () => {
  it('all-humans: one human finishing does NOT end the race', () => {
    const { env, state } = race('all-humans')
    // drive past countdown, then force car a finished
    for (let i = 0; i < 100; i++) stepRace(state, env, idle, FIXED)
    state.cars[0].finishedAt = state.simTimeMs
    const events = stepRace(state, env, idle, FIXED)
    expect(events.some((e) => e.type === 'race-over')).toBe(false)
    expect(state.phase).not.toBe('finished')
  })

  it('all-humans: ends after all humans done + grace', () => {
    const { env, state } = race('all-humans')
    for (let i = 0; i < 100; i++) stepRace(state, env, idle, FIXED)
    state.cars[0].finishedAt = state.simTimeMs
    state.cars[1].wrecked = true
    let over = false
    for (let i = 0; i < 120 && !over; i++) {
      const events = stepRace(state, env, idle, FIXED)
      over = events.some((e) => e.type === 'race-over' && e.reason === 'all-humans-done')
    }
    expect(over).toBe(true)
  })
})
