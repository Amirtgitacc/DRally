// NetworkSource — client-side race source for online multiplayer. Consumes
// server `snapshot`/`raceEnd` messages, buffers them, and interpolates each
// remote car ~INTERP_DELAY_MS behind the newest snapshot. The local car is
// driven by a LocalPredictor instead: predicted forward every frame from the
// input just sent, reconciled once per new snapshot against the server's
// authoritative movement, and smoothed into the render car. All of it feeds a
// persistent RaceState that RaceScene can render like a local sim. Pure
// logic; no Phaser imports.

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
import { LocalPredictor } from './localPredictor'
import { GUN } from '../../data/weapons'

const SNAPSHOT_BUFFER_CAP = 30
// Cosmetic sim events (sparks, audio, etc.) buffered until the render loop drains
// them. A backgrounded tab keeps receiving 30Hz snapshots but stops draining, so
// this would grow unbounded (memory + an FX/audio burst on refocus). Authoritative
// state lives in the snapshots, never here — dropping the oldest events is safe.
const PENDING_EVENTS_CAP = 256

/** Shape a race-scene render loop drives, whether local or networked. */
export interface RaceSource {
  readonly youId: string
  ingest(nowMs: number, deltaMs: number): void
  readonly state: RaceState
  drainEvents(): SimEvent[]
  sendLocalInput(cmd: PlayerCommand): void
}

export class NetworkSource implements RaceSource {
  readonly youId: string
  /** Static per-race geometry/rules — Task 11 reads this to render the track. */
  readonly env: RaceEnv

  private readonly net: NetClient
  private readonly buffer: Array<{ snap: RaceSnapshot; acks: Record<string, number> }> = []
  private readonly pendingEvents: SimEvent[] = []
  private readonly skeleton: RaceState
  private readonly raceEndCbs: Array<(standings: RaceStanding[]) => void> = []
  private renderTimeMs = 0
  private clockStarted = false
  private predictor!: LocalPredictor
  private seq = 0
  private lastReconciledSimMs = -1
  private pendingCommand: PlayerCommand | null = null

  private readonly onMsg = (msg: ServerMsg): void => {
    if (msg.t === 'snapshot') {
      this.buffer.push({ snap: msg.snap, acks: msg.acks })
      if (this.buffer.length > SNAPSHOT_BUFFER_CAP) this.buffer.shift()
      // Countdown beats and race-started are dropped here and re-synthesized in
      // ingest() from countdownAnnounced/phase deltas, which every snapshot
      // carries. As one-shot events they die with a single missed snapshot —
      // e.g. a client whose RaceScene attaches after the server started ticking
      // would stay stuck on "3" forever.
      this.pendingEvents.push(...msg.events.filter((e) => e.type !== 'countdown' && e.type !== 'race-started'))
      // keep only the newest events on overflow (drop oldest); cosmetic-only
      if (this.pendingEvents.length > PENDING_EVENTS_CAP) {
        this.pendingEvents.splice(0, this.pendingEvents.length - PENDING_EVENTS_CAP)
      }
    } else if (msg.t === 'raceEnd') {
      this.raceEndCbs.forEach((cb) => cb(msg.standings))
    }
  }

  constructor(net: NetClient, payload: RaceStartPayload, spec: CarPhysicsSpec) {
    this.net = net
    this.youId = payload.youId

    this.env = buildRaceEnv(trackById(payload.trackId), {
      playerSpec: spec,
      // Multiplayer races always run weapons-on; weapons-off is a career-only
      // constraint (see AGENTS.md) and does not apply here. Intentional, not a placeholder.
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

    const localCar = this.skeleton.cars.find((c) => c.id === this.youId)!
    this.predictor = new LocalPredictor(this.skeleton, this.env, localCar)

    this.net.onMessage(this.onMsg)
  }

  /** Advances a local render clock by the real frame delta and interpolates every
   *  OTHER car ~INTERP_DELAY_MS behind the newest snapshot. Driving the clock by
   *  frame time (rather than snapping it onto each arriving snapshot) is what
   *  makes motion smooth at the render frame rate instead of stepping at the 30Hz
   *  snapshot rate — the whole point of interpolation. The local car skips
   *  interpolation entirely: it is predicted forward every frame and reconciled
   *  against the newest snapshot once per new snapshot (see steps 1-4 below). */
  ingest(_nowMs: number, deltaMs: number): void {
    if (this.buffer.length === 0) return
    const latest = this.buffer[this.buffer.length - 1].snap
    const target = latest.simTimeMs - INTERP_DELAY_MS

    if (!this.clockStarted) {
      this.renderTimeMs = target
      this.clockStarted = true
    } else {
      this.renderTimeMs += deltaMs
      // Fell more than one interp window behind (tab resume, stall-then-catch-up,
      // or a large snapshot jump): skip ahead rather than crawl through stale time.
      if (target - this.renderTimeMs > INTERP_DELAY_MS) this.renderTimeMs = target
      // Ran past the newest snapshot (buffer starved): hold at the edge; never
      // extrapolate into time we have no snapshot data for.
      if (this.renderTimeMs > latest.simTimeMs) this.renderTimeMs = latest.simTimeMs
    }

    // 1. predict the local car forward with this frame's command
    if (this.pendingCommand) {
      this.predictor.predict(this.seq, this.pendingCommand, deltaMs)
      this.pendingCommand = null
    }

    // 2. reconcile against the newest snapshot, once per new snapshot
    const newest = this.buffer[this.buffer.length - 1]
    if (newest.snap.simTimeMs > this.lastReconciledSimMs) {
      const serverLocal = newest.snap.cars.find((c) => c.id === this.youId)
      if (serverLocal) this.predictor.reconcile(serverLocal, newest.acks[this.youId] ?? 0)
      this.lastReconciledSimMs = newest.snap.simTimeMs
    }

    // 3. interpolate every OTHER car; copy server non-movement fields for the local one
    const br = bracket(this.buffer.map((e) => e.snap), this.renderTimeMs)
    if (br) {
      const { a, b, t } = br // b is the newer (or equal) snapshot of the pair

      // Re-synthesize countdown/GO from state deltas (see onMsg). Only the
      // newest missed beat is emitted so a late join shows the current count
      // rather than replaying the whole sequence in one frame.
      if (b.countdownAnnounced > this.skeleton.countdownAnnounced && b.phase === 'countdown') {
        this.pendingEvents.push({ type: 'countdown', count: (4 - b.countdownAnnounced) as 3 | 2 | 1 })
      }
      if (this.skeleton.phase === 'countdown' && b.phase !== 'countdown') {
        this.pendingEvents.push({ type: 'race-started' })
      }

      this.skeleton.phase = b.phase
      this.skeleton.simTimeMs = b.simTimeMs
      this.skeleton.countdownAnnounced = b.countdownAnnounced
      this.skeleton.raceStartAt = b.raceStartAt
      this.skeleton.placementOrder = [...b.placementOrder]
      // Interpolate bullets between the bracketing snapshots like cars — copying
      // only `b` makes them step at the 30Hz snapshot rate, which reads as
      // stutter on fast rounds. A bullet only in `b` (just fired) keeps b's pos.
      this.skeleton.bullets = b.bullets.map((x) => {
        const xa = a.bullets.find((p) => p.id === x.id)
        if (!xa) return { ...x }
        return { ...x, x: xa.x + (x.x - xa.x) * t, y: xa.y + (x.y - xa.y) * t }
      })
      this.skeleton.mines = b.mines.map((x) => ({ ...x }))
      this.skeleton.pickups = b.pickups.map((x) => ({ ...x }))

      for (const car of this.skeleton.cars) {
        const carB = b.cars.find((c) => c.id === car.id)
        if (!carB) continue
        // server-authoritative non-movement fields (both local and remote)
        car.damage = carB.damage
        car.wrecked = carB.wrecked
        car.finishedAt = carB.finishedAt
        car.ammo = carB.ammo
        car.mines = carB.mines
        car.progress = { ...carB.progress }
        car.lapTimes = [...carB.lapTimes]
        car.isPlayer = carB.isPlayer
        car.trapUntil = carB.trapUntil
        if (car.id === this.youId) continue // movement comes from the predictor
        const carA = a.cars.find((c) => c.id === car.id)
        if (!carA) continue
        car.state = lerpCarState(carA.state, carB.state, t)
        car.turbo = carB.turbo
        car.lastInput = { ...carB.lastInput }
        car.lastTurboActive = carB.lastTurboActive
      }
    }

    // 4. write the predicted + smoothed local car
    const localCar = this.skeleton.cars.find((c) => c.id === this.youId)
    if (localCar) this.predictor.writeInto(localCar)
  }

  get state(): RaceState {
    return this.skeleton
  }

  drainEvents(): SimEvent[] {
    return this.pendingEvents.splice(0)
  }

  /** Assign a seq, send the input, and stash it so the next ingest() predicts
   *  the local car forward by the frame's delta. Call once per frame before
   *  ingest(). */
  sendLocalInput(command: PlayerCommand): void {
    this.seq += 1
    this.net.send({ t: 'input', command, seq: this.seq })
    this.pendingCommand = command
  }

  onRaceEnd(cb: (standings: RaceStanding[]) => void): void {
    this.raceEndCbs.push(cb)
  }

  /** Detaches this source's listeners from the shared NetClient. Does not
   *  close the socket — the scene owns the connection lifecycle. Call this
   *  when a race ends/rematches so a freshly constructed NetworkSource
   *  doesn't stack handlers on the same NetClient. */
  dispose(): void {
    this.net.offMessage(this.onMsg)
  }
}
