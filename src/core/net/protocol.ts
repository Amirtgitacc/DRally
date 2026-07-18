import type { PlayerCommand } from '../race/stepRace'
import type { SimEvent } from '../race/simEvents'
import type { RaceSnapshot } from './snapshot'

/** Maximum grid slots per room (humans + AI combined). */
export const MAX_PLAYERS = 4

export interface LobbyPlayer {
  id: string
  name: string
  carId: string
  /** cosmetic livery variant key ('base' | 'a' | 'b'); always sanitized to a
   *  key valid for `carId` (or 'base') before it lands here. */
  variantId: string
  ready: boolean
  /** true for AI grid-fill opponents; false for humans */
  isAi: boolean
}

export interface LobbySnapshot {
  code: string
  hostId: string
  trackId: string
  /** Join order preserved; index 0 is the earliest remaining joiner. */
  players: LobbyPlayer[]
}

export interface RaceCarInfo {
  id: string
  name: string
  /** livery tint applied over the shared car texture */
  color: number
  /** CAR_CATALOG id → texture key `car-top-${chassisId}` */
  chassisId: string
  /** cosmetic livery variant key; texture is `car-top-${chassisId}` when
   *  'base', else `car-top-${chassisId}-${variantId}` */
  variantId: string
  /** true for AI grid-fill opponents */
  isAi: boolean
}

export interface RaceStanding {
  id: string
  name: string
  place: number
  finishedAt: number | null
  wrecked: boolean
  lapTimes: number[]
}

/** Messages the client sends to the server. */
export type ClientMsg =
  | { t: 'create'; name: string; carId: string; trackId: string; variantId: string }
  | { t: 'join'; code: string; name: string; carId: string; variantId: string }
  | { t: 'setCar'; carId: string }
  | { t: 'setTrack'; trackId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'leave' }
  | { t: 'start' }
  | { t: 'addAi' }
  | { t: 'removeAi'; id: string }
  | { t: 'input'; command: PlayerCommand; seq: number }
  | { t: 'rematch' }

export type ServerErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'BAD_CODE'
  | 'BAD_NAME'
  | 'BAD_CAR'
  | 'BAD_TRACK'
  | 'NOT_HOST'
  | 'MALFORMED'

/** Messages the server sends to the client. */
export type ServerMsg =
  | { t: 'joined'; youId: string; lobby: LobbySnapshot }
  | { t: 'lobby'; lobby: LobbySnapshot }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'raceStart'; seed: number; trackId: string; laps: number; roster: RaceCarInfo[]; youId: string }
  | { t: 'snapshot'; snap: RaceSnapshot; events: SimEvent[]; acks: Record<string, number> }
  | { t: 'raceEnd'; standings: RaceStanding[] }

/** Scene-handoff shape consumed by Tasks 9 & 11. */
export type RaceStartPayload = Omit<Extract<ServerMsg, { t: 'raceStart' }>, 't'>
