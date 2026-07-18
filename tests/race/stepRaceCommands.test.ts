// tests/race/stepRaceCommands.test.ts
import { describe, it, expect } from 'vitest'
import { stepRace, type CommandSet } from '../../src/core/race/stepRace'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'

const FIXED = 1000 / 30

function twoHumans() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
    { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
  ]
  return { env, setups }
}

const throttle = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }
const idle = { input: { throttle: 0, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }

describe('stepRace CommandSet', () => {
  it('drives each human car from its own command', () => {
    const { env, setups } = twoHumans()
    const state = createRaceState(env, setups, 7)
    const cmds: CommandSet = { a: throttle, b: idle }
    for (let i = 0; i < 200; i++) stepRace(state, env, cmds, FIXED) // past countdown
    const a = state.cars.find((c) => c.id === 'a')!
    const b = state.cars.find((c) => c.id === 'b')!
    expect(Math.hypot(a.state.vx, a.state.vy)).toBeGreaterThan(Math.hypot(b.state.vx, b.state.vy))
  })

  it('is deterministic for the same CommandSet sequence + seed', () => {
    const run = () => {
      const { env, setups } = twoHumans()
      const state = createRaceState(env, setups, 7)
      const cmds: CommandSet = { a: throttle, b: throttle }
      for (let i = 0; i < 200; i++) stepRace(state, env, cmds, FIXED)
      return JSON.stringify(state)
    }
    expect(run()).toEqual(run())
  })

  it('single-player: { player } path matches a lone car', () => {
    const env = buildRaceEnvFixture()
    const setups: CarSetup[] = [{ id: 'player', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null }]
    const state = createRaceState(env, setups, 42)
    for (let i = 0; i < 200; i++) stepRace(state, env, { player: throttle }, FIXED)
    expect(state.cars[0].state.x).not.toBe(0)
  })
})
