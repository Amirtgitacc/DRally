import type { RaceState, BulletSim, MineSim, PickupSim, RacePhase } from '../race/raceState'
import type { CarState, CarInput } from '../vehicle/carPhysics'
import type { RaceProgress } from '../race/progress'

export interface CarSnapshot {
  id: string
  isPlayer: boolean
  state: CarState
  damage: number
  wrecked: boolean
  finishedAt: number | null
  turbo: number
  ammo: number
  mines: number
  progress: RaceProgress
  lapTimes: number[]
  lastInput: CarInput
  lastTurboActive: boolean
}

export interface RaceSnapshot {
  simTimeMs: number
  phase: RacePhase
  countdownAnnounced: number
  raceStartAt: number
  /** When the local player's trap-pickup camera disorientation ends. Carried so
   *  the effect fires online; without it the client's trapUntil stays 0. */
  trapUntil: number
  cars: CarSnapshot[]
  bullets: BulletSim[]
  mines: MineSim[]
  pickups: PickupSim[]
  placementOrder: string[]
}

/** Trimmed, serializable projection of RaceState. Excludes rngState + AI internals. */
export function toRaceSnapshot(state: RaceState): RaceSnapshot {
  return {
    simTimeMs: state.simTimeMs,
    phase: state.phase,
    countdownAnnounced: state.countdownAnnounced,
    raceStartAt: state.raceStartAt,
    trapUntil: state.trapUntil,
    cars: state.cars.map((c) => ({
      id: c.id,
      isPlayer: c.isPlayer,
      state: { ...c.state },
      damage: c.damage,
      wrecked: c.wrecked,
      finishedAt: c.finishedAt,
      turbo: c.turbo,
      ammo: c.ammo,
      mines: c.mines,
      progress: { ...c.progress },
      lapTimes: [...c.lapTimes],
      lastInput: { ...c.lastInput },
      lastTurboActive: c.lastTurboActive,
    })),
    bullets: state.bullets.map((b) => ({ ...b })),
    mines: state.mines.map((m) => ({ ...m })),
    pickups: state.pickups.map((p) => ({ ...p })),
    placementOrder: [...state.placementOrder],
  }
}
