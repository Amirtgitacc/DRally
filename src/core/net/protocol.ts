/** Maximum human players per room. AI fills remaining grid slots at race time (Phase 3). */
export const MAX_PLAYERS = 4

export interface LobbyPlayer {
  id: string
  name: string
  carId: string
  ready: boolean
}

export interface LobbySnapshot {
  code: string
  hostId: string
  trackId: string
  /** Join order preserved; index 0 is the earliest remaining joiner. */
  players: LobbyPlayer[]
}

/** Messages the client sends to the server. */
export type ClientMsg =
  | { t: 'create'; name: string; carId: string; trackId: string }
  | { t: 'join'; code: string; name: string; carId: string }
  | { t: 'setCar'; carId: string }
  | { t: 'setTrack'; trackId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'leave' }

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
