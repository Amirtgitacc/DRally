import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { tryDropMine, updateMines } from '../../../src/core/race/minesStep'
import type { SimEvent } from '../../../src/core/race/simEvents'
import { MINES } from '../../../src/data/weapons'
import { buildTestEnv, buildTestSetups } from './testRace'

const racing = () => {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), 5)
  state.phase = 'racing'
  return { env, state }
}

describe('minesStep', () => {
  it('drops behind the car, spends a mine, respects cooldown', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    const car = state.cars[0]
    const before = car.mines
    tryDropMine(state, car, events)
    expect(car.mines).toBe(before - 1)
    expect(state.mines).toHaveLength(1)
    expect(events.filter((e) => e.type === 'mine-dropped')).toHaveLength(1)
    tryDropMine(state, car, events) // cooldown blocks
    expect(state.mines).toHaveLength(1)
  })

  it('an armed mine detonates under a rival: damage, launch, event, mine removed', () => {
    const { env, state } = racing()
    const victim = state.cars[1]
    state.mines.push({ id: 1, x: victim.state.x, y: victim.state.y, droppedAt: -100000, ownerId: 'player' })
    const events: SimEvent[] = []
    state.simTimeMs = 10000
    updateMines(state, env, events)
    expect(state.mines).toHaveLength(0)
    expect(victim.damage).toBeGreaterThanOrEqual(MINES.damage * 0.5)
    expect(victim.state.vz).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'mine-detonated')).toBe(true)
  })

  it('the dropper gets an owner grace period', () => {
    const { env, state } = racing()
    const owner = state.cars[0]
    const events: SimEvent[] = []
    tryDropMine(state, owner, events) // dropped right under the owner at simTime 0
    state.simTimeMs = 100 // inside the owner grace
    owner.state.x = state.mines[0].x
    owner.state.y = state.mines[0].y
    updateMines(state, env, events)
    expect(state.mines).toHaveLength(1) // did not blow
  })

  it('an airborne car flies over a live mine', () => {
    const { env, state } = racing()
    const victim = state.cars[1]
    state.mines.push({ id: 1, x: victim.state.x, y: victim.state.y, droppedAt: -100000, ownerId: 'player' })
    victim.state = { ...victim.state, z: 20, vz: 100 }
    state.simTimeMs = 10000
    updateMines(state, env, [])
    expect(state.mines).toHaveLength(1)
  })
})
