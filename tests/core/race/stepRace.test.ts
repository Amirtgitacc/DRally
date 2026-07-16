import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { IDLE_COMMAND, stepRace, type PlayerCommand } from '../../../src/core/race/stepRace'
import { FIXED_STEP_MS } from '../../../src/game/race/raceSimulation'
import type { SimEvent } from '../../../src/core/race/simEvents'
import type { RaceState } from '../../../src/core/race/raceState'
import { buildTestEnv, buildTestSetups } from './testRace'

const command = (i: number): PlayerCommand => ({
  input: { throttle: 1, brake: 0, steer: Math.sin(i / 90) * 0.4, handbrake: false },
  fire: i % 300 < 30,
  turbo: i % 600 < 120,
  dropMine: i === 700,
})

function run(steps: number, seed = 1234) {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), seed)
  const events: SimEvent[] = []
  for (let i = 0; i < steps; i++) events.push(...stepRace(state, env, { player: command(i) }, FIXED_STEP_MS))
  return { state, events }
}

describe('stepRace', () => {
  it('counts down and starts the race at 3 seconds', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 1)
    const events: SimEvent[] = []
    for (let i = 0; i < Math.ceil(3100 / FIXED_STEP_MS); i++)
      events.push(...stepRace(state, env, { player: IDLE_COMMAND }, FIXED_STEP_MS))
    expect(events.filter((e) => e.type === 'countdown')).toHaveLength(3)
    expect(events.some((e) => e.type === 'race-started')).toBe(true)
    expect(state.phase).toBe('racing')
    expect(state.raceStartAt).toBeGreaterThanOrEqual(3000)
  })

  it('cars are locked during countdown and move after the start', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 1)
    const x0 = state.cars[0].state.x
    for (let i = 0; i < 60; i++) stepRace(state, env, { player: command(i) }, FIXED_STEP_MS)
    expect(state.cars[0].state.x).toBe(x0) // locked
    for (let i = 0; i < 600; i++) stepRace(state, env, { player: command(i) }, FIXED_STEP_MS)
    const moved = Math.hypot(state.cars[0].state.x - x0, state.cars[0].state.y - state.cars[0].prevPos.y)
    expect(moved).toBeGreaterThan(0)
  })

  it('is bit-identical across two runs (determinism)', () => {
    const a = run(60 * 30)
    const b = run(60 * 30)
    expect(a.state).toEqual(b.state)
    expect(a.events).toEqual(b.events)
  })

  it('a JSON snapshot mid-race resumes to an identical future (serialization)', () => {
    const env = buildTestEnv()
    const live = createRaceState(env, buildTestSetups(), 77)
    for (let i = 0; i < 500; i++) stepRace(live, env, { player: command(i) }, FIXED_STEP_MS)
    const resumed = JSON.parse(JSON.stringify(live)) as RaceState
    for (let i = 500; i < 1000; i++) {
      stepRace(live, env, { player: command(i) }, FIXED_STEP_MS)
      stepRace(resumed, env, { player: command(i) }, FIXED_STEP_MS)
    }
    expect(resumed).toEqual(live)
  })

  it('weapons-off env silences player and AI guns and mines', () => {
    const env = buildTestEnv({ weaponsEnabled: false })
    const state = createRaceState(env, buildTestSetups(), 3)
    const events: SimEvent[] = []
    for (let i = 0; i < 60 * 20; i++)
      events.push(...stepRace(state, env, { player: { ...command(i), fire: true, dropMine: true } }, FIXED_STEP_MS))
    expect(events.some((e) => e.type === 'gun-fired' || e.type === 'mine-dropped')).toBe(false)
  })

  it('placements stay in sync and include every car', () => {
    const { state } = run(60 * 10)
    expect([...state.placementOrder].sort()).toEqual(['player', 'rival-1'])
  })
})
