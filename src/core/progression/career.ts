// Pure career state — the persistent between-race game. Plain serializable
// object so save/load is a JSON round-trip.

import { CAR_CATALOG } from '../../data/cars'
import { STARTING_CASH } from '../../data/economy'
import { NO_UPGRADES, type UpgradeLevels } from '../vehicle/carSpec'
import { initialLadder, type Ladder } from './ladder'

export const CAREER_SCHEMA_VERSION = 2

export type Difficulty = 'street' | 'standard' | 'hard'

export interface DriverProfile {
  driverName: string
  liveryColor: number
  portraitId: string
  weaponsEnabled: boolean
  difficulty: Difficulty
}

export interface TrackRecord {
  bestLapMs: number | null
  bestRaceMs: number | null
  bestFinish: number | null
  wins: number
}

export type CareerRecords = Record<string, TrackRecord>

export const DEFAULT_PROFILE: DriverProfile = {
  driverName: 'Road Ghost',
  liveryColor: 0xf2a33c,
  portraitId: 'visor',
  weaponsEnabled: true,
  difficulty: 'standard',
}

export interface CareerState {
  schemaVersion: number
  profile: DriverProfile
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
  records: CareerRecords
  /** cosmetic livery chosen per owned car — carId -> variant key. Read as
   *  `career.liveries[carId] ?? 'base'`. */
  liveries: Record<string, string>
}

export function createCareer(profile: Partial<DriverProfile> = {}): CareerState {
  return {
    schemaVersion: CAREER_SCHEMA_VERSION,
    profile: { ...DEFAULT_PROFILE, ...profile },
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
    records: {},
    liveries: {},
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

/** An abandon is a real result: no rewards, dents persist, consumables are lost. */
export function applyAbandonOutcome(c: CareerState, endDamage: number): CareerState {
  return applyRaceOutcome(c, {
    prizeCash: 0,
    pointsEarned: 0,
    pickupCash: 0,
    endDamage,
    won: false,
  })
}

export interface RecordCandidate {
  trackId: string
  bestLapMs: number | null
  raceTimeMs: number | null
  finish: number | null
  won: boolean
}

const positiveTime = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

const positiveFinish = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null

function best(previous: number | null, candidate: number | null): number | null {
  if (candidate === null) return previous
  return previous === null ? candidate : Math.min(previous, candidate)
}

export function updateTrackRecord(c: CareerState, candidate: RecordCandidate): CareerState {
  const previous = c.records[candidate.trackId] ?? {
    bestLapMs: null,
    bestRaceMs: null,
    bestFinish: null,
    wins: 0,
  }
  const next: TrackRecord = {
    bestLapMs: best(previous.bestLapMs, positiveTime(candidate.bestLapMs)),
    bestRaceMs: best(previous.bestRaceMs, positiveTime(candidate.raceTimeMs)),
    bestFinish: best(previous.bestFinish, positiveFinish(candidate.finish)),
    wins: previous.wins + (candidate.won ? 1 : 0),
  }
  return { ...c, records: { ...c.records, [candidate.trackId]: next } }
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

function validDifficulty(value: unknown): value is Difficulty {
  return value === 'street' || value === 'standard' || value === 'hard'
}

function sanitizeProfile(value: unknown): DriverProfile {
  const profile = typeof value === 'object' && value !== null ? (value as Partial<DriverProfile>) : {}
  const name = typeof profile.driverName === 'string' ? profile.driverName.trim().slice(0, 18) : ''
  return {
    driverName: name || DEFAULT_PROFILE.driverName,
    liveryColor:
      typeof profile.liveryColor === 'number' && Number.isInteger(profile.liveryColor)
        ? clampRgb(profile.liveryColor)
        : DEFAULT_PROFILE.liveryColor,
    portraitId: typeof profile.portraitId === 'string' && profile.portraitId ? profile.portraitId : DEFAULT_PROFILE.portraitId,
    weaponsEnabled: profile.weaponsEnabled !== false,
    difficulty: validDifficulty(profile.difficulty) ? profile.difficulty : DEFAULT_PROFILE.difficulty,
  }
}

// Keep the pure core free of Phaser while constraining a serialized tint to RGB.
function clampRgb(value: number): number {
  return Math.min(0xffffff, Math.max(0, value))
}

function sanitizeRecords(value: unknown): CareerRecords {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const records: CareerRecords = {}
  for (const [trackId, raw] of Object.entries(value)) {
    if (typeof raw !== 'object' || raw === null || !trackId) continue
    const record = raw as Partial<TrackRecord>
    records[trackId] = {
      bestLapMs: positiveTime(record.bestLapMs),
      bestRaceMs: positiveTime(record.bestRaceMs),
      bestFinish: positiveFinish(record.bestFinish),
      wins: typeof record.wins === 'number' && Number.isInteger(record.wins) && record.wins >= 0 ? record.wins : 0,
    }
  }
  return records
}

/** Drops entries for unknown cars or variant keys not offered by that car
 *  (this naturally excludes MP-only cars like `anahita`, which never appear
 *  in `CAR_CATALOG`). */
function sanitizeLiveries(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const liveries: Record<string, string> = {}
  for (const [carId, raw] of Object.entries(value)) {
    if (typeof raw !== 'string') continue
    const car = CAR_CATALOG.find((c) => c.id === carId)
    if (!car || !car.variants.some((v) => v.key === raw)) continue
    liveries[carId] = raw
  }
  return liveries
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
      schemaVersion: CAREER_SCHEMA_VERSION,
      profile: sanitizeProfile(data.profile),
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
      records: sanitizeRecords(data.records),
      liveries: sanitizeLiveries(data.liveries),
    }
  } catch {
    return null
  }
}
