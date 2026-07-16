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
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    readonly env: RaceEnv,
    private state: RaceState,
    readonly roster: RaceCarInfo[],
    readonly seed: number,
    readonly trackId: string,
    readonly laps: number,
  ) {}

  setInput(playerId: string, command: PlayerCommand): void {
    this.commands[playerId] = command
  }

  start(onTick: (msg: Extract<ServerMsg, { t: 'snapshot' }>) => void, onEnd: (standings: RaceStanding[]) => void): void {
    this.timer = setInterval(() => {
      const events = stepRace(this.state, this.env, this.commands, TICK_MS)
      onTick({ t: 'snapshot', snap: toRaceSnapshot(this.state), events })
      if (this.state.phase === 'finished') {
        this.stop()
        onEnd(computeStandings(this.state, this.roster))
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
