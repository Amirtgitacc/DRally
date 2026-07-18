// server/raceHost.ts
// Authoritative race host: steps stepRace at a fixed 30Hz per room and emits
// snapshots + end-of-race standings. No Phaser, no career/save data.
import { createRaceState, type RaceEnv, type RaceState } from '../src/core/race/raceState'
import { stepRace, type CommandSet, type PlayerCommand } from '../src/core/race/stepRace'
import { toRaceSnapshot } from '../src/core/net/snapshot'
import type { RaceCarInfo, RaceStanding, ServerMsg } from '../src/core/net/protocol'

const TICK_MS = 1000 / 30

export function computeStandings(state: RaceState, roster: RaceCarInfo[]): RaceStanding[] {
  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name ?? id
  return state.placementOrder.map((id, i) => {
    const car = state.cars.find((c) => c.id === id)!
    return { id, name: nameOf(id), place: i + 1, finishedAt: car.finishedAt, wrecked: car.wrecked, lapTimes: [...car.lapTimes] }
  })
}

export class RaceHost {
  private commands: CommandSet = {}
  // One-shot mine presses arrive in a single 60fps client message but the sim
  // samples at 30Hz — a later message would overwrite the press before a tick
  // reads it, dropping ~half of them. OR-accumulate the press here; each tick
  // consumes and clears it, so a press is never lost and never double-fires.
  private mineLatched: Record<string, boolean> = {}
  private lastSeq: Record<string, number> = {}
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    readonly env: RaceEnv,
    private state: RaceState,
    readonly roster: RaceCarInfo[],
    readonly seed: number,
    readonly trackId: string,
    readonly laps: number,
  ) {}

  setInput(playerId: string, command: PlayerCommand, seq: number): void {
    if (command.dropMine) this.mineLatched[playerId] = true
    this.commands[playerId] = command
    this.lastSeq[playerId] = seq
  }

  /** Effective commands for one tick: continuous state as last sent, but each
   *  car's `dropMine` reflects the latch so no press is lost between ticks. */
  private tickCommands(): CommandSet {
    const out: CommandSet = {}
    for (const id in this.commands) {
      out[id] = { ...this.commands[id], dropMine: this.mineLatched[id] === true }
    }
    return out
  }

  start(onTick: (msg: Extract<ServerMsg, { t: 'snapshot' }>) => void, onEnd: (standings: RaceStanding[]) => void): void {
    this.timer = setInterval(() => {
      // Defense in depth: a throwing tick must never spin forever. The
      // Phase-2 process-level uncaughtException handler keeps the server
      // alive but does NOT clear this interval, so without this try/catch
      // a bad frame re-throws at TICK_MS cadence indefinitely.
      try {
        const events = stepRace(this.state, this.env, this.tickCommands(), TICK_MS)
        this.mineLatched = {} // presses consumed by this tick; next tick starts clean
        onTick({ t: 'snapshot', snap: toRaceSnapshot(this.state), events, acks: { ...this.lastSeq } })
        if (this.state.phase === 'finished') {
          this.stop()
          onEnd(computeStandings(this.state, this.roster))
        }
      } catch (err) {
        console.error('[mp] race host tick error, stopping host:', err)
        this.stop()
      }
    }, TICK_MS)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
}

export function createRaceHost(env: RaceEnv, roster: RaceCarInfo[], setups: import('../src/core/race/raceState').CarSetup[], seed: number, trackId: string, laps: number): RaceHost {
  return new RaceHost(env, createRaceState(env, setups, seed), roster, seed, trackId, laps)
}
