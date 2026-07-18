import { describe, it, expect } from 'vitest'
import { stepCarMovement } from '../../../src/core/race/carMovement'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../../helpers/raceEnvFixture'
import type { SimEvent } from '../../../src/core/race/simEvents'

function oneCar() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [{ id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }]
  const state = createRaceState(env, setups, 1)
  state.phase = 'racing'
  return { state, env, car: state.cars[0] }
}

describe('stepCarMovement', () => {
  it('accelerates a car under throttle', () => {
    const { state, env, car } = oneCar()
    const x0 = car.state.x
    const y0 = car.state.y
    const events: SimEvent[] = []
    for (let i = 0; i < 30; i++) {
      stepCarMovement(state, env, car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, false, 1 / 60, events)
      state.simTimeMs += 1000 / 60
    }
    expect(Math.hypot(car.state.x - x0, car.state.y - y0)).toBeGreaterThan(0)
    expect(car.state.vx * car.state.vx + car.state.vy * car.state.vy).toBeGreaterThan(0)
  })

  it('records lastInput/lastTurboActive for the renderer', () => {
    const { state, env, car } = oneCar()
    const input = { throttle: 0.5, brake: 0, steer: 0.2, handbrake: false }
    stepCarMovement(state, env, car, input, false, 1 / 60, [])
    expect(car.lastInput).toEqual(input)
    expect(typeof car.lastTurboActive).toBe('boolean')
  })
})
