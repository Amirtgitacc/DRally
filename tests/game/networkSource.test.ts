import { describe, it, expect } from 'vitest'
import { NetworkSource } from '../../src/game/race/raceSource'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import { buildRaceEnv } from '../../src/core/race/raceEnvBuilder'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { TEST_CIRCUIT } from '../../src/data/tracks/testCircuit'
import { effectiveCarSpec, NO_UPGRADES } from '../../src/core/vehicle/carSpec'
import { carById } from '../../src/data/cars'

// Minimal fake NetClient capturing handlers + sent messages. offMessage/offClose
// actually remove handlers (mirrors real NetClient) so dispose() is testable.
function fakeNet() {
  const msgHandlers: any[] = []
  const closeHandlers: any[] = []
  return {
    sent: [] as any[],
    msgHandlers,
    closeHandlers,
    onMessage: (fn: any) => msgHandlers.push(fn),
    onClose: (fn: any) => closeHandlers.push(fn),
    offMessage: (fn: any) => { const i = msgHandlers.indexOf(fn); if (i >= 0) msgHandlers.splice(i, 1) },
    offClose: (fn: any) => { const i = closeHandlers.indexOf(fn); if (i >= 0) closeHandlers.splice(i, 1) },
    send: function (m: any) { (this as any).sent.push(m) },
    emit: (m: any) => msgHandlers.forEach((h) => h(m)),
  }
}

const spec = effectiveCarSpec(carById('jackal'), NO_UPGRADES)
const roster = [
  { id: 'a', name: 'Ana', color: 1, chassisId: 'jackal', isAi: false },
  { id: 'b', name: 'Bo', color: 2, chassisId: 'jackal', isAi: false },
]

function snapAt(simTimeMs: number, bx: number) {
  const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: false, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
  const setups: CarSetup[] = roster.map((r) => ({ id: r.id, isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }))
  const s = createRaceState(env, setups, 1)
  s.simTimeMs = simTimeMs
  // car B is the "moving" car used by the interpolation tests below — the
  // local car ('a', per youId in these tests) is driven by prediction now,
  // not by these snapshot positions.
  s.cars[1].state.x = bx
  return toRaceSnapshot(s)
}

describe('NetworkSource', () => {
  it('renders car B interpolated behind the newest snapshot', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [], acks: { a: 0 } })
    net.emit({ t: 'snapshot', snap: snapAt(200, 200), events: [], acks: { a: 0 } })
    src.ingest(/* nowMs */ 0, /* delta */ 0) // anchors INTERP_DELAY_MS behind newest (200)
    const b = src.state.cars.find((c) => c.id === 'b')!
    // snapAt maps x==simTime, so x reflects the render clock: behind live (200), not ahead.
    expect(b.state.x).toBeGreaterThan(0)
    expect(b.state.x).toBeLessThan(200)
  })

  it('advances the render clock by frame delta between snapshots (smooth motion)', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [], acks: { a: 0 } })
    src.ingest(0, 0) // anchor the render clock
    const x0 = src.state.cars.find((c) => c.id === 'b')!.state.x
    src.ingest(0, 50) // no new snapshot; clock advances 50ms of frame time
    const x1 = src.state.cars.find((c) => c.id === 'b')!.state.x
    // x==simTime, so a 50ms clock advance moves the car ~50px WITHOUT a new
    // snapshot — that per-frame motion is exactly what makes it smooth.
    expect(x1 - x0).toBeCloseTo(50)
  })

  it('holds at the newest snapshot when the buffer starves (no extrapolation)', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [], acks: { a: 0 } })
    src.ingest(0, 0)
    src.ingest(0, 5000) // huge delta, no new snapshots → clamp at newest (x = 100), never past it
    expect(src.state.cars.find((c) => c.id === 'b')!.state.x).toBeCloseTo(100)
  })

  it('skips ahead when the clock falls more than one interp window behind', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [], acks: { a: 0 } })
    src.ingest(0, 0) // renderTime = 0
    net.emit({ t: 'snapshot', snap: snapAt(1000, 1000), events: [], acks: { a: 0 } }) // big jump forward
    src.ingest(0, 16) // 0 + 16 is ~884ms behind target(900) → snap to 900 → x ≈ 900
    expect(src.state.cars.find((c) => c.id === 'b')!.state.x).toBeGreaterThan(800)
  })

  it('drains each snapshot\'s events once', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [{ type: 'race-started' }], acks: { a: 0 } })
    src.ingest(0, 0)
    expect(src.drainEvents().some((e) => e.type === 'race-started')).toBe(true)
    expect(src.drainEvents()).toHaveLength(0)
  })

  it('sendLocalInput forwards an input message with a seq', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    src.sendLocalInput({ input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false })
    const sent = net.sent.find((m) => m.t === 'input')
    expect(sent).toBeTruthy()
    expect(sent.t).toBe('input')
    expect(typeof sent.seq).toBe('number')
  })

  it('drives the local car from prediction, not interpolation', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })

    // send several throttle inputs (predicted locally) with no newer snapshot
    const throttle = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }
    for (let i = 0; i < 6; i++) { src.sendLocalInput(throttle); src.ingest(0, 1000 / 60) }

    // local car 'a' has moved from prediction even though the only snapshot had it at rest
    const a = src.state.cars.find((c) => c.id === 'a')!
    expect(Math.hypot(a.state.x - 0, a.state.y)).toBeGreaterThan(0)
    // an 'input' message was sent with a seq
    const inputs = net.sent.filter((m: any) => m.t === 'input')
    expect(inputs.length).toBeGreaterThan(0)
    expect(typeof inputs[0].seq).toBe('number')
  })

  it('dispose() detaches the message handler so later snapshots have no effect', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [], acks: { a: 0 } })
    src.ingest(0, 0)
    const before = src.state.simTimeMs

    src.dispose()
    expect(net.msgHandlers).toHaveLength(0)

    net.emit({ t: 'snapshot', snap: snapAt(200, 200), events: [], acks: { a: 0 } })
    src.ingest(0, 0)
    expect(src.state.simTimeMs).toBe(before)
    expect(src.drainEvents()).toHaveLength(0)
  })
})
