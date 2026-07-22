import { describe, it, expect } from 'vitest'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../../helpers/raceEnvFixture'
import { mpCarSpec } from '../../../src/core/vehicle/mpBalance'

const baseSetup = (over: Partial<CarSetup>): CarSetup => ({
  id: 'p', isPlayer: true, mass: 1, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null, ...over,
})

describe('createRaceState per-car overrides', () => {
  it('copies spec and damageResist onto the car when the setup provides them', () => {
    const env = buildRaceEnvFixture()
    const spec = mpCarSpec('basilisk')
    const state = createRaceState(env, [baseSetup({ spec, damageResist: 0.9 })], 1)
    expect(state.cars[0].spec).toEqual(spec)
    expect(state.cars[0].damageResist).toBe(0.9)
  })

  it('leaves them undefined when the setup omits them (single-player default)', () => {
    const env = buildRaceEnvFixture()
    const state = createRaceState(env, [baseSetup({})], 1)
    expect(state.cars[0].spec).toBeUndefined()
    expect(state.cars[0].damageResist).toBeUndefined()
  })
})
