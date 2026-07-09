// Pure career state — the persistent between-race game. Plain serializable
// object so save/load is a JSON round-trip.

import { STARTING_CASH } from '../../data/economy'
import { NO_UPGRADES, type UpgradeLevels } from '../vehicle/carSpec'
import { initialLadder, type Ladder } from './ladder'

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
  /** black-market one-race gear — cleared after every race like mines */
  ramPlating: boolean
  overTurbo: boolean
  sabotage: boolean
  /** outstanding loanshark debt, or null when clean */
  loan: { owed: number; racesLeft: number } | null
  /** true once the rank-1 duel has been won — the career's crown */
  champion: boolean
  /** championship points per AI rival (the player's points are `points`) */
  ladder: Ladder
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
    ramPlating: false,
    overTurbo: false,
    sabotage: false,
    loan: null,
    champion: false,
    ladder: initialLadder(),
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
    // one-race gear is gone after the race, used or not
    mines: 0,
    ramPlating: false,
    overTurbo: false,
    sabotage: false,
  }
}

export function serializeCareer(c: CareerState): string {
  return JSON.stringify(c)
}

function isValidLoan(value: unknown): value is { owed: number; racesLeft: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { owed?: unknown }).owed === 'number' &&
    typeof (value as { racesLeft?: unknown }).racesLeft === 'number'
  )
}

function isValidLadder(value: unknown): value is Ladder {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'number')
  )
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
      ramPlating: data.ramPlating === true, // ditto for everything below
      overTurbo: data.overTurbo === true,
      sabotage: data.sabotage === true,
      loan: isValidLoan(data.loan) ? { owed: data.loan.owed, racesLeft: data.loan.racesLeft } : null,
      champion: data.champion === true,
      ladder: isValidLadder(data.ladder) ? data.ladder : initialLadder(),
    }
  } catch {
    return null
  }
}
