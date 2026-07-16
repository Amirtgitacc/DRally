import { describe, it, expect } from 'vitest'
import { NetworkSource } from '../../src/game/race/raceSource'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import { buildRaceEnv } from '../../src/core/race/raceEnvBuilder'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { TEST_CIRCUIT } from '../../src/data/tracks/testCircuit'
import { effectiveCarSpec, NO_UPGRADES } from '../../src/core/vehicle/carSpec'
import { carById } from '../../src/data/cars'

// Minimal fake NetClient capturing handlers + sent messages.
function fakeNet() {
  const msgHandlers: any[] = []
  return {
    sent: [] as any[],
    onMessage: (fn: any) => msgHandlers.push(fn),
    onClose: () => {},
    offMessage: () => {}, offClose: () => {},
    send: function (m: any) { (this as any).sent.push(m) },
    emit: (m: any) => msgHandlers.forEach((h) => h(m)),
  }
}

const spec = effectiveCarSpec(carById('jackal'), NO_UPGRADES)
const roster = [
  { id: 'a', name: 'Ana', color: 1, chassisId: 'jackal', isAi: false },
  { id: 'b', name: 'Bo', color: 2, chassisId: 'jackal', isAi: false },
]

function snapAt(simTimeMs: number, ax: number) {
  const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: false, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
  const setups: CarSetup[] = roster.map((r) => ({ id: r.id, isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }))
  const s = createRaceState(env, setups, 1)
  s.simTimeMs = simTimeMs
  s.cars[0].state.x = ax
  return toRaceSnapshot(s)
}

describe('NetworkSource', () => {
  it('interpolates car A between two snapshots ~100ms behind', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [] })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [] })
    net.emit({ t: 'snapshot', snap: snapAt(200, 200), events: [] })
    src.ingest(/* nowMs */ 0, /* delta */ 0) // renderTime = 200 - 100 = 100 → car A at x≈100
    const a = src.state.cars.find((c) => c.id === 'a')!
    expect(a.state.x).toBeGreaterThan(50)
    expect(a.state.x).toBeLessThanOrEqual(100)
  })

  it('drains each snapshot\'s events once', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [{ type: 'race-started' }] })
    src.ingest(0, 0)
    expect(src.drainEvents().some((e) => e.type === 'race-started')).toBe(true)
    expect(src.drainEvents()).toHaveLength(0)
  })

  it('sendInput forwards an input message', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    src.sendInput({ input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false })
    expect(net.sent.some((m) => m.t === 'input')).toBe(true)
  })
})
