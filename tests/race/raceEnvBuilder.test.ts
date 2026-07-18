import { describe, it, expect } from 'vitest'
import { buildRaceEnv, computeBarriers } from '../../src/core/race/raceEnvBuilder'
import { TEST_CIRCUIT } from '../../src/data/tracks/testCircuit'
import { effectiveCarSpec } from '../../src/core/vehicle/carSpec'
import { carById } from '../../src/data/cars'

const spec = effectiveCarSpec(carById('jackal'), { engine: 0, tires: 0, armor: 0 })

describe('buildRaceEnv', () => {
  it('produces gates, centerline, barriers and copies track tuning', () => {
    const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    expect(env.gates).toHaveLength(TEST_CIRCUIT.gateCount)
    expect(env.laps).toBe(TEST_CIRCUIT.laps)
    expect(env.trackWidth).toBe(TEST_CIRCUIT.width)
    expect(env.raceEndMode).toBe('all-humans')
    expect(env.barriers.length).toBeGreaterThan(0)
  })

  it('is deterministic — same track ⇒ identical barriers', () => {
    const a = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    const b = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    expect(a.barriers).toEqual(b.barriers)
  })

  it('barriers match computeBarriers called directly on the same centerline', () => {
    const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    const direct = computeBarriers(env.centerline, TEST_CIRCUIT.width / 2, TEST_CIRCUIT.shoulder)
    expect(env.barriers).toEqual(direct)
  })
})
