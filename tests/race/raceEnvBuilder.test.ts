import { describe, it, expect } from 'vitest'
import { buildRaceEnv, computeBarriers } from '../../src/core/race/raceEnvBuilder'
import { GLASSBURN_WORKS } from '../../src/data/tracks/glassburnWorks'
import { effectiveCarSpec } from '../../src/core/vehicle/carSpec'
import { carById } from '../../src/data/cars'

const spec = effectiveCarSpec(carById('jackal'), { engine: 0, tires: 0, armor: 0 })

describe('buildRaceEnv', () => {
  it('produces gates, centerline, barriers and copies track tuning', () => {
    const env = buildRaceEnv(GLASSBURN_WORKS, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    expect(env.gates).toHaveLength(GLASSBURN_WORKS.gateCount)
    expect(env.laps).toBe(GLASSBURN_WORKS.laps)
    expect(env.trackWidth).toBe(GLASSBURN_WORKS.width)
    expect(env.raceEndMode).toBe('all-humans')
    expect(env.barriers.length).toBeGreaterThan(0)
  })

  it('is deterministic — same track ⇒ identical barriers', () => {
    const a = buildRaceEnv(GLASSBURN_WORKS, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    const b = buildRaceEnv(GLASSBURN_WORKS, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    expect(a.barriers).toEqual(b.barriers)
  })

  it('barriers match computeBarriers called directly on the same centerline', () => {
    const env = buildRaceEnv(GLASSBURN_WORKS, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    const direct = computeBarriers(env.centerline, GLASSBURN_WORKS.width / 2, GLASSBURN_WORKS.shoulder)
    expect(env.barriers).toEqual(direct)
  })
})
