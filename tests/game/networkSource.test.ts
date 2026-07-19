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
  { id: 'a', name: 'Ana', color: 1, chassisId: 'jackal', variantId: 'base', isAi: false },
  { id: 'b', name: 'Bo', color: 2, chassisId: 'jackal', variantId: 'base', isAi: false },
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

// Same as snapAt but in the 'racing' phase — prediction only drives the local
// car outside of countdown (see LocalPredictor's player-input gate), so tests
// that actually exercise prediction need a racing-phase snapshot.
function racingSnapAt(simTimeMs: number, bx: number) {
  const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: false, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
  const setups: CarSetup[] = roster.map((r) => ({ id: r.id, isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }))
  const s = createRaceState(env, setups, 1)
  s.simTimeMs = simTimeMs
  s.phase = 'racing'
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
    // countdown/race-started are filtered (synthesized from state instead), so
    // use a cosmetic event to check pass-through drains exactly once
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [{ type: 'bullet-wall', x: 1, y: 2 }], acks: { a: 0 } })
    src.ingest(0, 0)
    expect(src.drainEvents().some((e) => e.type === 'bullet-wall')).toBe(true)
    expect(src.drainEvents()).toHaveLength(0)
  })

  it('caps pendingEvents on overflow, keeping the newest (backgrounded tab)', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    // Simulate a backgrounded tab: many snapshots arrive but the render loop
    // never drains. 2000 wall-hit events with a rising `impact` marker.
    for (let i = 0; i < 2000; i++) {
      net.emit({ t: 'snapshot', snap: snapAt(i, i), events: [{ type: 'wall-hit', carId: 'a', impact: i }], acks: { a: 0 } })
    }
    const drained = src.drainEvents()
    expect(drained.length).toBeLessThanOrEqual(256)
    // newest event preserved, oldest dropped
    const last = drained[drained.length - 1] as any
    expect(last.impact).toBe(1999)
    expect((drained[0] as any).impact).toBeGreaterThan(0) // early events were dropped
  })

  it('synthesizes countdown beats from snapshot state when event snapshots were missed', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    // Client attached late: the snapshots carrying the count=3 and count=2
    // events never arrived. First seen snapshot already has announced=2.
    const snap = snapAt(1100, 0)
    snap.countdownAnnounced = 2
    net.emit({ t: 'snapshot', snap, events: [], acks: { a: 0 } })
    src.ingest(0, 0)
    const beats = src.drainEvents().filter((e) => e.type === 'countdown')
    expect(beats).toEqual([{ type: 'countdown', count: 2 }])
  })

  it('synthesizes race-started from the phase flip when the event snapshot was missed', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: racingSnapAt(3100, 0), events: [], acks: { a: 0 } })
    src.ingest(0, 0)
    expect(src.drainEvents().some((e) => e.type === 'race-started')).toBe(true)
  })

  it('does not double-fire beats when the server events did arrive', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    const snap = snapAt(1100, 0)
    snap.countdownAnnounced = 2
    net.emit({ t: 'snapshot', snap, events: [{ type: 'countdown', count: 2 }], acks: { a: 0 } })
    src.ingest(0, 0)
    expect(src.drainEvents().filter((e) => e.type === 'countdown')).toHaveLength(1)
    // a later snapshot with the same announced count fires nothing new
    const snap2 = snapAt(1150, 0)
    snap2.countdownAnnounced = 2
    net.emit({ t: 'snapshot', snap: snap2, events: [], acks: { a: 0 } })
    src.ingest(0, 33)
    expect(src.drainEvents().filter((e) => e.type === 'countdown')).toHaveLength(0)
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
    // racing phase: with the countdown gate (Fix 1), only a racing-phase
    // snapshot lets prediction actually drive the local car.
    net.emit({ t: 'snapshot', snap: racingSnapAt(0, 0), events: [], acks: { a: 0 } })
    src.ingest(0, 0) // anchor render clock + skeleton phase before capturing the start position

    const start = { ...src.state.cars.find((c) => c.id === 'a')!.state }

    // send several throttle inputs (predicted locally) with no newer snapshot
    const throttle = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }
    for (let i = 0; i < 6; i++) { src.sendLocalInput(throttle); src.ingest(0, 1000 / 60) }

    // local car 'a' has genuinely moved from its start position under throttle
    const a = src.state.cars.find((c) => c.id === 'a')!
    expect(Math.hypot(a.state.x - start.x, a.state.y - start.y)).toBeGreaterThan(0)
    // an 'input' message was sent with a seq
    const inputs = net.sent.filter((m: any) => m.t === 'input')
    expect(inputs.length).toBeGreaterThan(0)
    expect(typeof inputs[0].seq).toBe('number')
  })

  it('does not predict movement during countdown (matches server input gate)', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    // default snapAt snapshot is in 'countdown' phase
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })
    src.ingest(0, 0)

    const start = { ...src.state.cars.find((c) => c.id === 'a')!.state }

    const throttle = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }
    for (let i = 0; i < 6; i++) { src.sendLocalInput(throttle); src.ingest(0, 1000 / 60) }

    const a = src.state.cars.find((c) => c.id === 'a')!
    expect(Math.hypot(a.state.x - start.x, a.state.y - start.y)).toBeCloseTo(0)
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
