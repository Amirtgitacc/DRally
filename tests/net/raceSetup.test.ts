import { describe, it, expect } from 'vitest'
import { buildNetworkRace } from '../../server/raceSetup'
import { isValidCarId } from '../../server/rooms'
import type { LobbyPlayer } from '../../src/core/net/protocol'
import { ALL_TRACKS } from '../../src/data/tracks'
import { MP_ONLY_CARS } from '../../src/data/mpCars'
import { CAR_CATALOG } from '../../src/data/cars'
import { mpCarSpec, mpDamageResist } from '../../src/core/vehicle/mpBalance'
import { mpCarById } from '../../src/data/mpCars'

const track = ALL_TRACKS[0]
const SEED = 12345

const humans: LobbyPlayer[] = [
  { id: 'a', name: 'Ana', carId: 'jackal', variantId: 'base', ready: true, isAi: false },
  { id: 'b', name: 'Bo', carId: 'jackal', variantId: 'base', ready: true, isAi: false },
]

describe('buildNetworkRace', () => {
  it('one stock setup + roster entry per human, in join order', () => {
    const { setups, roster } = buildNetworkRace(humans, true, track, SEED)
    expect(setups.map((s) => s.id)).toEqual(['a', 'b'])
    expect(setups.every((s) => s.isPlayer && s.ai === null && s.damage === 0 && s.armorTier === 0)).toBe(true)
    expect(roster[0].color).not.toBe(roster[1].color)
    expect(roster.every((r) => !r.isAi)).toBe(true)
  })

  it('gives each human its chassis MP spec, resistance, and sizeScale', () => {
    const players: LobbyPlayer[] = [
      { id: 'a', name: 'Ana', carId: 'basilisk', variantId: 'base', ready: true, isAi: false },
      { id: 'b', name: 'Bo', carId: 'marauder', variantId: 'base', ready: true, isAi: false },
    ]
    const { setups } = buildNetworkRace(players, true, track, SEED)
    const a = setups.find((s) => s.id === 'a')!
    const b = setups.find((s) => s.id === 'b')!
    expect(a.spec).toEqual(mpCarSpec('basilisk'))
    expect(a.damageResist).toBeCloseTo(mpDamageResist('basilisk'), 6)
    expect(a.sizeScale).toBe(mpCarById('basilisk')!.sizeScale)
    // bigger basilisk is slower + tougher than the smaller marauder
    expect(a.spec!.topSpeed).toBeLessThan(b.spec!.topSpeed)
    expect(a.damageResist!).toBeLessThan(b.damageResist!)
  })

  it('weapons off ⇒ zero ammo and mines for humans', () => {
    const { setups } = buildNetworkRace(humans, false, track, SEED)
    expect(setups.every((s) => s.ammo === 0 && s.mines === 0)).toBe(true)
  })

  it('AI players get an ai-driven setup and an isAi roster entry', () => {
    const players: LobbyPlayer[] = [
      { id: 'a', name: 'Ana', carId: 'jackal', variantId: 'base', ready: true, isAi: false },
      { id: 'ai:vex', name: 'Vex', carId: 'jackal', variantId: 'base', ready: true, isAi: true },
    ]
    const { setups, roster } = buildNetworkRace(players, true, track, SEED)
    const aiSetup = setups.find((s) => s.id === 'ai:vex')!
    expect(aiSetup.isPlayer).toBe(false)
    expect(aiSetup.ai).not.toBeNull()
    expect(aiSetup.ai!.spec).toBeDefined()
    expect(aiSetup.ai!.speedScale).toBeGreaterThan(0)
    const aiRoster = roster.find((r) => r.id === 'ai:vex')!
    expect(aiRoster.isAi).toBe(true)
    expect(aiRoster.name).toBe('Vex')
  })

  describe('livery variantId', () => {
    it('threads a human player chosen variantId into the roster', () => {
      const players: LobbyPlayer[] = [
        { id: 'a', name: 'Ana', carId: 'jackal', variantId: 'a', ready: true, isAi: false },
        { id: 'b', name: 'Bo', carId: 'jackal', variantId: 'b', ready: true, isAi: false },
      ]
      const { roster } = buildNetworkRace(players, true, track, SEED)
      expect(roster.find((r) => r.id === 'a')!.variantId).toBe('a')
      expect(roster.find((r) => r.id === 'b')!.variantId).toBe('b')
    })

    it('sanitizes a missing/invalid human variantId to base (backward-compat)', () => {
      const players = [
        { id: 'a', name: 'Ana', carId: 'jackal', ready: true, isAi: false } as LobbyPlayer, // variantId omitted
        { id: 'b', name: 'Bo', carId: 'jackal', variantId: 'not-a-real-key', ready: true, isAi: false },
      ]
      const { roster } = buildNetworkRace(players, true, track, SEED)
      expect(roster.find((r) => r.id === 'a')!.variantId).toBe('base')
      expect(roster.find((r) => r.id === 'b')!.variantId).toBe('base')
    })

    it('accepts anahita (MP-only car) for a human without throwing', () => {
      const players: LobbyPlayer[] = [
        { id: 'a', name: 'Ana', carId: 'anahita', variantId: 'base', ready: true, isAi: false },
      ]
      expect(() => buildNetworkRace(players, true, track, SEED)).not.toThrow()
      const { setups, roster } = buildNetworkRace(players, true, track, SEED)
      expect(setups[0].mass).toBeCloseTo(MP_ONLY_CARS[0].mass)
      expect(roster[0].chassisId).toBe('anahita')
      expect(roster[0].variantId).toBe('base')
    })

    it('assigns AI grid-fill opponents a seed-derived variantId that is valid for their chassis', () => {
      const players: LobbyPlayer[] = [
        { id: 'ai:vex', name: 'Vex', carId: 'jackal', variantId: 'base', ready: true, isAi: true },
      ]
      const { roster } = buildNetworkRace(players, true, track, SEED)
      const ai = roster.find((r) => r.id === 'ai:vex')!
      const chassis = CAR_CATALOG.find((c) => c.id === ai.chassisId)!
      expect(chassis.variants.some((v) => v.key === ai.variantId)).toBe(true)
    })

    it('is deterministic: the same seed produces the same AI variantId every time', () => {
      const players: LobbyPlayer[] = [
        { id: 'ai:vex', name: 'Vex', carId: 'jackal', variantId: 'base', ready: true, isAi: true },
        { id: 'ai:rook', name: 'Rook', carId: 'jackal', variantId: 'base', ready: true, isAi: true },
      ]
      const run1 = buildNetworkRace(players, true, track, SEED).roster.map((r) => r.variantId)
      const run2 = buildNetworkRace(players, true, track, SEED).roster.map((r) => r.variantId)
      expect(run1).toEqual(run2)
    })
  })
})

describe('server car validation (isValidCarId)', () => {
  it('accepts single-player catalog cars', () => {
    expect(isValidCarId('jackal')).toBe(true)
  })

  it('accepts MP-only cars (anahita) — see task-7de-report.md known gap, fixed here', () => {
    expect(isValidCarId('anahita')).toBe(true)
  })

  it('rejects the boss/sovereign — never selectable in MP', () => {
    expect(isValidCarId('sovereign')).toBe(false)
  })

  it('rejects unknown ids', () => {
    expect(isValidCarId('not-a-real-car')).toBe(false)
  })
})
