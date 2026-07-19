import { describe, it, expect } from 'vitest'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture' // see note below

function twoCarState() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
    { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
  ]
  return { state: createRaceState(env, setups, 1234), env }
}

describe('toRaceSnapshot', () => {
  it('captures per-car render + standings fields', () => {
    const { state } = twoCarState()
    const snap = toRaceSnapshot(state)
    expect(snap.cars).toHaveLength(2)
    expect(snap.cars[0].id).toBe('a')
    expect(snap.cars[0].state.x).toBe(state.cars[0].state.x)
    expect(snap.phase).toBe(state.phase)
    expect(snap.placementOrder).toEqual(state.placementOrder)
  })

  it('carries trapUntil per car so only the collector fires the trap effect online', () => {
    const { state } = twoCarState()
    state.cars[1].trapUntil = state.simTimeMs + 1500
    const snap = toRaceSnapshot(state)
    expect(snap.cars[1].trapUntil).toBe(state.cars[1].trapUntil)
    expect(snap.cars[0].trapUntil).toBe(0)
    const round = JSON.parse(JSON.stringify(snap))
    expect(round.cars[1].trapUntil).toBe(state.cars[1].trapUntil)
  })

  it('survives a JSON round-trip unchanged', () => {
    const { state } = twoCarState()
    const snap = toRaceSnapshot(state)
    const round = JSON.parse(JSON.stringify(snap))
    expect(round).toEqual(snap)
  })

  it('excludes rngState and AI internals (cosmetic-only contract)', () => {
    const { state } = twoCarState()
    const json = JSON.stringify(toRaceSnapshot(state))
    expect(json).not.toContain('rngState')
    expect(json).not.toContain('tuning')
    expect(json).not.toContain('speedScale')
  })
})
