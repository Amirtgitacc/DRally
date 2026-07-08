// Pure career state — the persistent between-race game. Plain serializable
// object so save/load is a JSON round-trip.

import { STARTING_CASH } from '../../data/economy'
import { NO_UPGRADES, type UpgradeLevels } from '../vehicle/carSpec'

export interface CareerState {
  cash: number
  carId: string
  upgrades: UpgradeLevels
  /** persistent car damage 0..99 — carried into the next race until repaired */
  damage: number
  points: number
  racesRun: number
  wins: number
  /** one-race consumable — cleared after every race, bought in the garage */
  mines: number
}

export function createCareer(): CareerState {
  return {
    cash: STARTING_CASH,
    carId: 'jackal',
    upgrades: { ...NO_UPGRADES },
    damage: 0,
    points: 0,
    racesRun: 0,
    wins: 0,
    mines: 0,
  }
}

export interface RaceOutcome {
  prizeCash: number
  pointsEarned: number
  pickupCash: number
  /** player damage at the end of the race (100 if wrecked) */
  endDamage: number
  won: boolean
}

/** Merge a finished race into the career. Damage persists; mines are spent. */
export function applyRaceOutcome(c: CareerState, o: RaceOutcome): CareerState {
  return {
    ...c,
    cash: c.cash + o.prizeCash + o.pickupCash,
    points: c.points + o.pointsEarned,
    damage: Math.min(99, Math.max(0, Math.round(o.endDamage))),
    racesRun: c.racesRun + 1,
    wins: c.wins + (o.won ? 1 : 0),
    mines: 0, // one race only, used or not
  }
}

export function serializeCareer(c: CareerState): string {
  return JSON.stringify(c)
}

/** Returns null on malformed/incompatible data — caller starts fresh. */
export function deserializeCareer(raw: string): CareerState | null {
  try {
    const data = JSON.parse(raw) as Partial<CareerState>
    if (
      typeof data.cash !== 'number' ||
      typeof data.carId !== 'string' ||
      typeof data.damage !== 'number' ||
      typeof data.points !== 'number' ||
      !data.upgrades ||
      typeof data.upgrades.engine !== 'number' ||
      typeof data.upgrades.tires !== 'number' ||
      typeof data.upgrades.armor !== 'number'
    ) {
      return null
    }
    return {
      cash: data.cash,
      carId: data.carId,
      upgrades: { engine: data.upgrades.engine, tires: data.upgrades.tires, armor: data.upgrades.armor },
      damage: Math.min(99, Math.max(0, data.damage)),
      points: data.points,
      racesRun: typeof data.racesRun === 'number' ? data.racesRun : 0,
      wins: typeof data.wins === 'number' ? data.wins : 0,
      mines: typeof data.mines === 'number' ? data.mines : 0, // older saves lack this
    }
  } catch {
    return null
  }
}
