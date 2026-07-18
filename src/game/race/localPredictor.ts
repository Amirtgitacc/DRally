// Client-side prediction for the local car. Advances a private "truth" copy of
// the car each frame via the same stepCarMovement the server runs, and on each
// server snapshot snaps to the authoritative state + replays unacked inputs.
// Corrections are eased with a decaying render offset kept OUT of the truth, so
// smoothing never feeds back into the simulation.
import { stepCarMovement } from '../../core/race/carMovement'
import type { PlayerCommand } from '../../core/race/stepRace'
import type { CarSim, RaceEnv, RaceState } from '../../core/race/raceState'
import type { CarSnapshot } from '../../core/net/snapshot'
import { IDLE_INPUT } from '../../core/vehicle/carPhysics'

const SMOOTH_DECAY = 0.80   // per-frame render-offset decay toward zero
const SNAP_DISTANCE = 200   // px; corrections beyond this snap instead of sliding

interface PendingInput { seq: number; command: PlayerCommand; dtMs: number }

function cloneCar(c: CarSim): CarSim {
  return {
    ...c,
    state: { ...c.state },
    prevPos: { ...c.prevPos },
    progress: { ...c.progress },
    lapTimes: [...c.lapTimes],
    lastInput: { ...c.lastInput },
  }
}

export class LocalPredictor {
  private readonly truth: CarSim
  private pending: PendingInput[] = []
  private offsetX = 0
  private offsetY = 0
  // Wreck + damage are SERVER-owned. The predictor runs the same
  // stepCarMovement the server does, which can locally accrue wall damage and
  // even trip a transient (1-2 frame) self-healing wreck before the next
  // snapshot corrects it — freezing local input for those frames. Cache the
  // last server-acked values and restore them after every predictive step so a
  // predicted impact never flips the local car to wrecked on its own.
  private serverWrecked: boolean
  private serverDamage: number

  constructor(
    private readonly state: RaceState,
    private readonly env: RaceEnv,
    seedCar: CarSim,
  ) {
    this.truth = cloneCar(seedCar)
    this.serverWrecked = seedCar.wrecked
    this.serverDamage = seedCar.damage
  }

  /** Advance the predicted truth one frame with the command just sent. */
  predict(seq: number, command: PlayerCommand, dtMs: number): void {
    this.pending.push({ seq, command, dtMs })
    this.step(command, dtMs)
  }

  /** Adopt the server's authoritative movement state, drop acked inputs, replay
   *  the rest, and fold the resulting jump into the render offset. */
  reconcile(server: CarSnapshot, ackSeq: number): void {
    const renderX = this.truth.state.x + this.offsetX
    const renderY = this.truth.state.y + this.offsetY

    // adopt authoritative movement fields (weapons/laps stay server-owned elsewhere)
    this.truth.state = { ...server.state }
    this.truth.prevPos = { x: server.state.x, y: server.state.y }
    this.truth.turbo = server.turbo
    this.truth.turboDepleted = false // not in the snapshot; re-derives within a few steps
    this.truth.wrecked = server.wrecked
    this.truth.finishedAt = server.finishedAt
    this.truth.progress = { ...server.progress }
    // Re-sync damage too: the predictor runs stepCarMovement on the shared
    // skeleton, so client-side wall damage must not diverge from the server and
    // drive an independent (phantom) wreck. Server damage is authoritative.
    this.truth.damage = server.damage
    this.truth.stuckMs = 0
    // remember the authoritative wreck/damage so step() can restore them after
    // each predictive movement integration
    this.serverWrecked = server.wrecked
    this.serverDamage = server.damage

    this.pending = this.pending.filter((p) => p.seq > ackSeq)
    for (const p of this.pending) this.step(p.command, p.dtMs)

    // keep the rendered position continuous across the correction, then ease it
    const nextOffX = renderX - this.truth.state.x
    const nextOffY = renderY - this.truth.state.y
    if (Math.hypot(nextOffX, nextOffY) > SNAP_DISTANCE) {
      this.offsetX = 0
      this.offsetY = 0
    } else {
      this.offsetX = nextOffX
      this.offsetY = nextOffY
    }
  }

  /** Decay the offset and write truth+offset movement fields into the render car. */
  writeInto(renderCar: CarSim): void {
    this.offsetX *= SMOOTH_DECAY
    this.offsetY *= SMOOTH_DECAY
    renderCar.state = {
      ...this.truth.state,
      x: this.truth.state.x + this.offsetX,
      y: this.truth.state.y + this.offsetY,
    }
    renderCar.turbo = this.truth.turbo
    renderCar.turboDepleted = this.truth.turboDepleted
    renderCar.lastInput = { ...this.truth.lastInput }
    renderCar.lastTurboActive = this.truth.lastTurboActive
    renderCar.wrecked = this.truth.wrecked
  }

  private step(command: PlayerCommand, dtMs: number): void {
    // Mirrors stepRace's player-input gate (see stepRace.ts's per-car loop):
    // a player car only drives with its own command when the race isn't
    // locked in countdown and the car is neither wrecked nor finished.
    // Without this, the local car would mispredict movement the server will
    // never produce — e.g. rolling forward during the 3s countdown while
    // players hold throttle waiting for the start.
    const drivable = this.state.phase !== 'countdown' && !this.truth.wrecked && this.truth.finishedAt === null
    const input = drivable ? command.input : IDLE_INPUT
    const wantsTurbo = drivable ? command.turbo : false
    // No slow-mo dilation client-side (slowMoUntil isn't in the snapshot); the
    // 30Hz reconcile corrects the small difference. dt in seconds.
    const phaseBefore = this.state.phase
    stepCarMovement(this.state, this.env, this.truth, input, wantsTurbo, dtMs / 1000, [])
    // Wreck/damage are server-owned: discard whatever this local step derived so
    // a predicted wall impact can neither wreck the car nor advance its damage
    // ahead of the server. The next reconcile refreshes the cached truth.
    this.truth.wrecked = this.serverWrecked
    this.truth.damage = this.serverDamage
    // Defense in depth: stepCarMovement's damage path could flip the shared
    // skeleton phase (single-player wreck rule). The predictor must never mutate
    // it — restore if it changed.
    if (this.state.phase !== phaseBefore) this.state.phase = phaseBefore
  }
}
