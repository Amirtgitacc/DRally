import { describe, expect, it } from 'vitest'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { updatePickups } from '../../../src/core/race/pickupsStep'
import type { SimEvent } from '../../../src/core/race/simEvents'
import { PICKUPS } from '../../../src/data/weapons'
import { buildTestEnv, buildTestSetups } from './testRace'

const racing = () => {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), 9)
  state.phase = 'racing'
  return { env, state }
}

describe('pickupsStep', () => {
  it('driving over a pickup collects it and schedules a respawn', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    const car = state.cars[0]
    car.state.x = p.x
    car.state.y = p.y
    const events: SimEvent[] = []
    updatePickups(state, env, events)
    expect(p.respawnAt).toBe(state.simTimeMs + PICKUPS.respawnMs)
    expect(events.some((e) => e.type === 'pickup-collected' && e.carId === 'player')).toBe(true)
  })

  it('cash pickup pays the collector', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    p.type = 'cash'
    const car = state.cars[0]
    car.state.x = p.x
    car.state.y = p.y
    updatePickups(state, env, [])
    expect(car.cash).toBe(PICKUPS.cashAmount)
  })

  it('a due respawn relocates the pickup and emits pickup-respawned', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    const oldPos = { x: p.x, y: p.y }
    p.respawnAt = 100
    state.simTimeMs = 200
    const events: SimEvent[] = []
    updatePickups(state, env, events)
    expect(p.respawnAt).toBeNull()
    expect(p.x === oldPos.x && p.y === oldPos.y).toBe(false)
    expect(events.some((e) => e.type === 'pickup-respawned' && e.index === 0)).toBe(true)
  })

  it('trap does not trap an AI collector', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    p.type = 'trap'
    const rival = state.cars[1]
    rival.state.x = p.x
    rival.state.y = p.y
    updatePickups(state, env, [])
    expect(rival.trapUntil).toBe(0)
  })

  it('trap only traps the collecting player, not other human cars', () => {
    const env = buildTestEnv()
    const humans: CarSetup[] = ['p1', 'p2'].map((id) => ({
      id, isPlayer: true, ai: null, damage: 0, ammo: 20, mines: 0, armorTier: 0, mass: 1000,
    }))
    const state = createRaceState(env, humans, 9)
    state.phase = 'racing'
    const p = state.pickups[0]
    p.type = 'trap'
    const collector = state.cars[1]
    collector.state.x = p.x
    collector.state.y = p.y
    updatePickups(state, env, [])
    expect(collector.trapUntil).toBe(state.simTimeMs + PICKUPS.trapDurationMs)
    expect(state.cars[0].trapUntil).toBe(0)
  })
})
