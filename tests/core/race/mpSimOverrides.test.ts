import { describe, it, expect } from 'vitest'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../../helpers/raceEnvFixture'
import { effectiveSpec } from '../../../src/core/race/aiControl'
import { damageCarSim } from '../../../src/core/race/combatStep'
import { mpCarSpec } from '../../../src/core/vehicle/mpBalance'

const human = (over: Partial<CarSetup>): CarSetup => ({
  id: 'p', isPlayer: true, mass: 1, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null, ...over,
})

describe('simulation consumes MP per-car overrides', () => {
  it('effectiveSpec uses car.spec for a human when present, not env.playerSpec', () => {
    const env = buildRaceEnvFixture() // env.playerSpec = STARTER_CAR (topSpeed 520)
    const spec = mpCarSpec('marauder') // topSpeed ~672
    const state = createRaceState(env, [human({ spec })], 1)
    const resolved = effectiveSpec(state, env, state.cars[0], false)
    expect(resolved.topSpeed).toBeCloseTo(spec.topSpeed, 3)
    expect(resolved.topSpeed).not.toBeCloseTo(env.playerSpec.topSpeed, 0)
  })

  it('effectiveSpec falls back to env.playerSpec when car.spec is absent (single-player)', () => {
    const env = buildRaceEnvFixture()
    const state = createRaceState(env, [human({})], 1)
    const resolved = effectiveSpec(state, env, state.cars[0], false)
    expect(resolved.topSpeed).toBeCloseTo(env.playerSpec.topSpeed, 3)
  })

  it('damageCarSim scales incoming damage by car.damageResist when present', () => {
    const env = buildRaceEnvFixture({ raceEndMode: 'all-humans' })
    const state = createRaceState(env, [human({ damageResist: 0.5 })], 1)
    state.phase = 'racing' // damageCarSim no-ops during countdown
    damageCarSim(state, env, state.cars[0], 20, [])
    expect(state.cars[0].damage).toBeCloseTo(10, 3) // 20 * 0.5
  })

  it('damageCarSim falls back to armorResistance when damageResist is absent', () => {
    const env = buildRaceEnvFixture({ raceEndMode: 'all-humans' })
    const state = createRaceState(env, [human({ armorTier: 0 })], 1)
    state.phase = 'racing'
    damageCarSim(state, env, state.cars[0], 20, [])
    expect(state.cars[0].damage).toBeCloseTo(20, 3) // resistance 1.0
  })
})
