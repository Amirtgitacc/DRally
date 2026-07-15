import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { damageCarSim, tryFire, updateBullets } from '../../../src/core/race/combatStep'
import type { SimEvent } from '../../../src/core/race/simEvents'
import { GUN } from '../../../src/data/weapons'
import { buildTestEnv, buildTestSetups } from './testRace'

const racing = (seed = 1) => {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), seed)
  state.phase = 'racing'
  return { env, state }
}

describe('combatStep', () => {
  it('damage accumulates and 100 wrecks the car with an event', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    damageCarSim(state, state.cars[1], 150, events)
    expect(state.cars[1].wrecked).toBe(true)
    expect(events.some((e) => e.type === 'car-wrecked' && e.carId === 'rival-1')).toBe(true)
  })

  it('player wreck ends the race', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    damageCarSim(state, state.cars[0], 150, events)
    expect(state.phase).toBe('finished')
    expect(events.some((e) => e.type === 'race-over' && e.reason === 'player-wrecked')).toBe(true)
  })

  it('damage is ignored during countdown', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 1)
    damageCarSim(state, state.cars[0], 50, [])
    expect(state.cars[0].damage).toBe(0)
  })

  it('firing spends ammo, sets cooldown, spawns a bullet, emits gun-fired', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    const ammoBefore = state.cars[0].ammo
    tryFire(state, state.cars[0], events)
    expect(state.cars[0].ammo).toBe(ammoBefore - 1)
    expect(state.cars[0].gunCooldown).toBeCloseTo(1 / GUN.fireRate)
    expect(state.bullets).toHaveLength(1)
    expect(events.some((e) => e.type === 'gun-fired')).toBe(true)
    tryFire(state, state.cars[0], events) // cooldown blocks
    expect(state.bullets).toHaveLength(1)
  })

  it('a bullet crossing a car damages and shoves it', () => {
    const { env, state } = racing()
    const victim = state.cars[1]
    // place a bullet dead on the victim
    state.bullets.push({ id: 99, x: victim.state.x, y: victim.state.y, vx: 100, vy: 0, ttl: 1, ownerId: 'player' })
    const events: SimEvent[] = []
    updateBullets(state, env, 1 / 60, events)
    expect(victim.damage).toBeGreaterThan(0)
    expect(victim.state.vx).toBeGreaterThan(0)
    expect(state.bullets).toHaveLength(0)
    expect(events.some((e) => e.type === 'bullet-hit' && e.carId === 'rival-1')).toBe(true)
  })
})
