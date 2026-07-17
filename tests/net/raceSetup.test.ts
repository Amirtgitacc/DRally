import { describe, it, expect } from 'vitest'
import { buildNetworkRace } from '../../server/raceSetup'
import type { LobbyPlayer } from '../../src/core/net/protocol'
import { ALL_TRACKS } from '../../src/data/tracks'

const track = ALL_TRACKS[0]

const humans: LobbyPlayer[] = [
  { id: 'a', name: 'Ana', carId: 'jackal', ready: true, isAi: false },
  { id: 'b', name: 'Bo', carId: 'jackal', ready: true, isAi: false },
]

describe('buildNetworkRace', () => {
  it('one stock setup + roster entry per human, in join order', () => {
    const { setups, roster } = buildNetworkRace(humans, true, track)
    expect(setups.map((s) => s.id)).toEqual(['a', 'b'])
    expect(setups.every((s) => s.isPlayer && s.ai === null && s.damage === 0 && s.armorTier === 0)).toBe(true)
    expect(roster[0].color).not.toBe(roster[1].color)
    expect(roster.every((r) => !r.isAi)).toBe(true)
  })

  it('weapons off ⇒ zero ammo and mines for humans', () => {
    const { setups } = buildNetworkRace(humans, false, track)
    expect(setups.every((s) => s.ammo === 0 && s.mines === 0)).toBe(true)
  })

  it('AI players get an ai-driven setup and an isAi roster entry', () => {
    const players: LobbyPlayer[] = [
      { id: 'a', name: 'Ana', carId: 'jackal', ready: true, isAi: false },
      { id: 'ai:vex', name: 'Vex', carId: 'jackal', ready: true, isAi: true },
    ]
    const { setups, roster } = buildNetworkRace(players, true, track)
    const aiSetup = setups.find((s) => s.id === 'ai:vex')!
    expect(aiSetup.isPlayer).toBe(false)
    expect(aiSetup.ai).not.toBeNull()
    expect(aiSetup.ai!.spec).toBeDefined()
    expect(aiSetup.ai!.speedScale).toBeGreaterThan(0)
    const aiRoster = roster.find((r) => r.id === 'ai:vex')!
    expect(aiRoster.isAi).toBe(true)
    expect(aiRoster.name).toBe('Vex')
  })
})
