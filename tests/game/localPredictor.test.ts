import { describe, it, expect } from 'vitest'
import { LocalPredictor } from '../../src/game/race/localPredictor'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import type { PlayerCommand } from '../../src/core/race/stepRace'

const throttle: PlayerCommand = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }

function setup() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [{ id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }]
  const state = createRaceState(env, setups, 1)
  state.phase = 'racing'
  return { env, state, car: state.cars[0] }
}

describe('LocalPredictor', () => {
  it('predicts forward so the local car moves without a server snapshot', () => {
    const { env, state, car } = setup()
    const pred = new LocalPredictor(state, env, car)
    const x0 = car.state.x
    const y0 = car.state.y
    for (let i = 1; i <= 5; i++) pred.predict(i, throttle, 1000 / 60)
    const render = { ...car, state: { ...car.state } }
    pred.writeInto(render as any)
    expect(Math.hypot(render.state.x - x0, render.state.y - y0)).toBeGreaterThan(0)
  })

  it('drops acked inputs and replays only the unacked ones on reconcile', () => {
    // Fresh predictor A: full 5-frame local prediction, no reconcile.
    const a = setup()
    const predA = new LocalPredictor(a.state, a.env, a.car)
    const startX = a.car.state.x
    const startY = a.car.state.y
    for (let i = 1; i <= 5; i++) predA.predict(i, throttle, 1000 / 60)
    const renderA = { ...a.car, state: { ...a.car.state } }
    predA.writeInto(renderA as any)
    const dFull = Math.hypot(renderA.state.x - startX, renderA.state.y - startY)

    // Fresh predictor B: same 5 frames, then reconcile against the server's
    // start-line snapshot with ack=3 — only seq 4,5 replay.
    const b = setup()
    const predB = new LocalPredictor(b.state, b.env, b.car)
    for (let i = 1; i <= 5; i++) predB.predict(i, throttle, 1000 / 60)
    const serverCar = toRaceSnapshot(b.state).cars[0]
    predB.reconcile(serverCar, 3)
    const renderB = { ...b.car, state: { ...b.car.state } }
    predB.writeInto(renderB as any)
    const dPartial = Math.hypot(renderB.state.x - serverCar.state.x, renderB.state.y - serverCar.state.y)

    expect(dPartial).toBeGreaterThan(0)
    expect(dPartial).toBeLessThan(dFull)
  })

  it('eases a small correction instead of snapping, and decays it to zero', () => {
    const { env, state, car } = setup()
    const pred = new LocalPredictor(state, env, car)
    pred.predict(1, throttle, 1000 / 60)

    const serverCar = toRaceSnapshot(state).cars[0]
    serverCar.state = { ...serverCar.state, x: serverCar.state.x + 20 } // 20px server correction
    pred.reconcile(serverCar, 1) // all acked; truth becomes server pos

    const r1 = { ...car, state: { ...car.state } }; pred.writeInto(r1 as any)
    const r2 = { ...car, state: { ...car.state } }; pred.writeInto(r2 as any)
    // offset present on frame 1, smaller on frame 2 (decaying toward truth)
    const off1 = Math.abs(r1.state.x - serverCar.state.x)
    const off2 = Math.abs(r2.state.x - serverCar.state.x)
    expect(off1).toBeGreaterThan(0)
    expect(off2).toBeLessThan(off1)
  })
})
