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

  describe('trap loss of control', () => {
    const drive = (s: ReturnType<typeof oneCar>, steer: number, steps: number) => {
      for (let i = 0; i < steps; i++) {
        stepCarMovement(s.state, s.env, s.car, { throttle: 1, brake: 0, steer, handbrake: false }, false, 1 / 60, [])
        s.state.simTimeMs += 1000 / 60
      }
    }

    it('keeps minor steering authority while trapped — reduced, not zero', () => {
      const headingSpread = (trapped: boolean) => {
        const a = oneCar()
        const b = oneCar()
        drive(a, 0, 30)
        drive(b, 0, 30)
        if (trapped) {
          a.car.trapUntil = a.state.simTimeMs + 2000
          b.car.trapUntil = b.state.simTimeMs + 2000
        }
        drive(a, 1, 30)
        drive(b, -1, 30)
        return Math.abs(a.car.state.heading - b.car.state.heading)
      }
      const trappedSpread = headingSpread(true)
      const freeSpread = headingSpread(false)
      expect(trappedSpread).toBeGreaterThan(0) // some control survives
      expect(trappedSpread).toBeLessThan(freeSpread * 0.6) // but well below normal
    })

    it('yaws on its own while trapped even with steer 0', () => {
      const s = oneCar()
      drive(s, 0, 30)
      const headingBefore = s.car.state.heading
      s.car.trapUntil = s.state.simTimeMs + 2000
      drive(s, 0, 30)
      expect(s.car.state.heading).not.toBe(headingBefore)
    })

    it('returns control once the trap expires', () => {
      const a = oneCar()
      const b = oneCar()
      drive(a, 0, 30)
      drive(b, 0, 30)
      a.car.trapUntil = a.state.simTimeMs - 1 // already expired
      b.car.trapUntil = b.state.simTimeMs - 1
      drive(a, 1, 30)
      drive(b, -1, 30)
      expect(a.car.state.heading).not.toBe(b.car.state.heading)
    })
  })
})
