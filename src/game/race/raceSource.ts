// NetworkSource — client-side race source for online multiplayer. Consumes
// server `snapshot`/`raceEnd` messages, buffers them, and interpolates each
// car ~INTERP_DELAY_MS behind the newest snapshot into a persistent RaceState
// that RaceScene can render like a local sim. Pure logic; no Phaser imports.

import type { NetClient } from '../net/netClient'
import type { RaceStartPayload, RaceStanding, ServerMsg } from '../../core/net/protocol'
import type { RaceSnapshot } from '../../core/net/snapshot'
import type { SimEvent } from '../../core/race/simEvents'
import type { PlayerCommand } from '../../core/race/stepRace'
import type { RaceEnv, RaceState, CarSetup } from '../../core/race/raceState'
import type { CarPhysicsSpec } from '../../core/vehicle/carPhysics'
import { buildRaceEnv } from '../../core/race/raceEnvBuilder'
import { createRaceState } from '../../core/race/raceState'
import { trackById } from '../../data/tracks'
import { bracket, lerpCarState, INTERP_DELAY_MS } from './interpolation'
import { GUN } from '../../data/weapons'

const SNAPSHOT_BUFFER_CAP = 30

/** Shape a race-scene render loop drives, whether local or networked. */
export interface RaceSource {
  readonly youId: string
  ingest(nowMs: number, deltaMs: number): void
  readonly state: RaceState
  drainEvents(): SimEvent[]
  sendInput?(cmd: PlayerCommand): void
}

export class NetworkSource implements RaceSource {
  readonly youId: string
  /** Static per-race geometry/rules — Task 11 reads this to render the track. */
  readonly env: RaceEnv

  private readonly net: NetClient
  private readonly buffer: RaceSnapshot[] = []
  private readonly pendingEvents: SimEvent[] = []
  private readonly skeleton: RaceState
  private readonly raceEndCbs: Array<(standings: RaceStanding[]) => void> = []
  private renderTimeMs = 0

  private readonly onMsg = (msg: ServerMsg): void => {
    if (msg.t === 'snapshot') {
      this.buffer.push(msg.snap)
      if (this.buffer.length > SNAPSHOT_BUFFER_CAP) this.buffer.shift()
      this.pendingEvents.push(...msg.events)
    } else if (msg.t === 'raceEnd') {
      this.raceEndCbs.forEach((cb) => cb(msg.standings))
    }
  }

  constructor(net: NetClient, payload: RaceStartPayload, spec: CarPhysicsSpec) {
    this.net = net
    this.youId = payload.youId

    this.env = buildRaceEnv(trackById(payload.trackId), {
      playerSpec: spec,
      weaponsEnabled: true,
      hasPlating: false,
      hasOverTurbo: false,
      raceEndMode: 'all-humans',
    })

    const setups: CarSetup[] = payload.roster.map((r) => ({
      id: r.id,
      isPlayer: true,
      mass: 1000,
      damage: 0,
      ammo: this.env.weaponsEnabled ? GUN.ammoMax : 0,
      mines: 0,
      armorTier: 0,
      ai: null,
    }))
    this.skeleton = createRaceState(this.env, setups, payload.seed)

    this.net.onMessage(this.onMsg)
  }

  /** Recomputes renderTimeMs from the newest buffered snapshot (not a local
   *  accumulated clock) so a zero-delta ingest still reflects new snapshots. */
  ingest(_nowMs: number, _deltaMs: number): void {
    if (this.buffer.length === 0) return
    const latest = this.buffer[this.buffer.length - 1]
    this.renderTimeMs = latest.simTimeMs - INTERP_DELAY_MS

    const br = bracket(this.buffer, this.renderTimeMs)
    if (!br) return
    const { a, b, t } = br // b is the newer (or equal) snapshot of the pair

    this.skeleton.phase = b.phase
    this.skeleton.simTimeMs = b.simTimeMs
    this.skeleton.countdownAnnounced = b.countdownAnnounced
    this.skeleton.raceStartAt = b.raceStartAt
    this.skeleton.placementOrder = [...b.placementOrder]
    this.skeleton.bullets = b.bullets.map((x) => ({ ...x }))
    this.skeleton.mines = b.mines.map((x) => ({ ...x }))
    this.skeleton.pickups = b.pickups.map((x) => ({ ...x }))

    for (const car of this.skeleton.cars) {
      const carA = a.cars.find((c) => c.id === car.id)
      const carB = b.cars.find((c) => c.id === car.id)
      if (!carA || !carB) continue
      car.state = lerpCarState(carA.state, carB.state, t)
      car.damage = carB.damage
      car.wrecked = carB.wrecked
      car.finishedAt = carB.finishedAt
      car.turbo = carB.turbo
      car.ammo = carB.ammo
      car.mines = carB.mines
      car.progress = { ...carB.progress }
      car.lapTimes = [...carB.lapTimes]
      car.lastInput = { ...carB.lastInput }
      car.lastTurboActive = carB.lastTurboActive
      car.isPlayer = carB.isPlayer
    }
  }

  get state(): RaceState {
    return this.skeleton
  }

  drainEvents(): SimEvent[] {
    return this.pendingEvents.splice(0)
  }

  sendInput(cmd: PlayerCommand): void {
    this.net.send({ t: 'input', command: cmd })
  }

  onRaceEnd(cb: (standings: RaceStanding[]) => void): void {
    this.raceEndCbs.push(cb)
  }
}
