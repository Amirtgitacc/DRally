import { describe, it, expect, vi, afterEach } from 'vitest'
import { RaceHost } from '../../server/raceHost'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'
import type { PlayerCommand } from '../../src/core/race/stepRace'
import type { RaceSnapshot } from '../../src/core/net/snapshot'

const cmd = (dropMine: boolean): PlayerCommand => ({
  input: { throttle: 0, brake: 0, steer: 0, handbrake: false },
  fire: false, turbo: false, dropMine,
})

function racingHost() {
  const env = buildRaceEnvFixture({ weaponsEnabled: true })
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
  ]
  const state = createRaceState(env, setups, 1234)
  state.phase = 'racing' // skip countdown so mines can drop immediately
  const roster = [{ id: 'a', name: 'Ana', color: 1, chassisId: 'jackal', variantId: 'base', isAi: false }]
  return new RaceHost(env, state, roster, 1234, 'fixture-square', 2)
}

describe('RaceHost mine latch', () => {
  afterEach(() => vi.useRealTimers())

  it('drops a mine even when a later input overwrites the press before the tick', () => {
    vi.useFakeTimers()
    const host = racingHost()
    const snaps: RaceSnapshot[] = []
    host.start((m) => snaps.push(m.snap), () => {})

    // The 60fps client sends the press, then a non-press frame, both before the
    // next 30Hz tick. Last-write-wins would lose the press; the latch keeps it.
    host.setInput('a', cmd(true), 1)
    host.setInput('a', cmd(false), 2)
    vi.advanceTimersByTime(34) // one tick

    expect(snaps.at(-1)!.cars[0].mines).toBe(1) // one mine dropped, not lost
    host.stop()
  })

  it('consumes the press once — a following tick with no press does not drop again', () => {
    vi.useFakeTimers()
    const host = racingHost()
    const snaps: RaceSnapshot[] = []
    host.start((m) => snaps.push(m.snap), () => {})

    host.setInput('a', cmd(true), 1)
    host.setInput('a', cmd(false), 2)
    vi.advanceTimersByTime(34) // tick 1: drops one
    expect(snaps.at(-1)!.cars[0].mines).toBe(1)

    host.setInput('a', cmd(false), 3) // no new press
    vi.advanceTimersByTime(340) // enough ticks to clear the 300ms cooldown
    expect(snaps.at(-1)!.cars[0].mines).toBe(1) // still 1 — latch was cleared
    host.stop()
  })
})

describe('RaceHost retirePlayer (mid-race leave)', () => {
  afterEach(() => vi.useRealTimers())

  it('retires a leaver so the race ends when the remaining human finishes', () => {
    vi.useFakeTimers()
    const env = buildRaceEnvFixture({ weaponsEnabled: true, raceEndMode: 'all-humans' })
    const setups: CarSetup[] = [
      { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 0, armorTier: 0, ai: null },
      { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 0, armorTier: 0, ai: null },
    ]
    const state = createRaceState(env, setups, 4321)
    state.phase = 'racing'
    state.raceStartAt = state.simTimeMs
    const roster = [
      { id: 'a', name: 'A', color: 1, chassisId: 'jackal', variantId: 'base', isAi: false },
      { id: 'b', name: 'B', color: 2, chassisId: 'jackal', variantId: 'base', isAi: false },
    ]
    const host = new RaceHost(env, state, roster, 4321, 'fixture-square', 2)

    let ended = false
    host.start(() => {}, () => { ended = true })

    // 'a' disconnects mid-race; without retirement its parked car never
    // finishes/wrecks and the room would stall until MAX_RACE_MS.
    host.retirePlayer('a')
    // 'b' crosses the line
    state.cars.find((c) => c.id === 'b')!.finishedAt = state.simTimeMs

    // one tick applies the retirement + marks all humans done, then the
    // 3s all-humans grace elapses and the race ends.
    vi.advanceTimersByTime(34 * 3 + 3100)
    expect(state.cars.find((c) => c.id === 'a')!.wrecked).toBe(true)
    expect(ended).toBe(true)
    host.stop()
  })
})

describe('RaceHost input acks', () => {
  afterEach(() => vi.useRealTimers())

  it('emits acks equal to the newest seq applied before the tick', () => {
    vi.useFakeTimers()
    const host = racingHost()
    const msgs: Array<{ acks: Record<string, number> }> = []
    host.start((m) => msgs.push(m as any), () => {})

    host.setInput('a', cmd(false), 4)
    host.setInput('a', cmd(false), 9) // newest before the tick
    vi.advanceTimersByTime(34)

    expect(msgs.at(-1)!.acks.a).toBe(9)
    host.stop()
  })
})
