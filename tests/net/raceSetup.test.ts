import { describe, it, expect } from 'vitest'
import { buildNetworkRace } from '../../server/raceSetup'
import type { LobbyPlayer } from '../../src/core/net/protocol'

const players: LobbyPlayer[] = [
  { id: 'a', name: 'Ana', carId: 'jackal', ready: true },
  { id: 'b', name: 'Bo', carId: 'jackal', ready: true },
]

describe('buildNetworkRace', () => {
  it('one stock setup + roster entry per player, in join order', () => {
    const { setups, roster } = buildNetworkRace(players, true)
    expect(setups.map((s) => s.id)).toEqual(['a', 'b'])
    expect(setups.every((s) => s.isPlayer && s.ai === null && s.damage === 0 && s.armorTier === 0)).toBe(true)
    expect(roster[0].color).not.toBe(roster[1].color) // distinct liveries
    expect(roster.every((r) => !r.isAi)).toBe(true)
  })
  it('weapons off ⇒ zero ammo and mines', () => {
    const { setups } = buildNetworkRace(players, false)
    expect(setups.every((s) => s.ammo === 0 && s.mines === 0)).toBe(true)
  })
})
