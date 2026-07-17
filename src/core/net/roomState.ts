import { MAX_PLAYERS, type LobbyPlayer, type LobbySnapshot, type ServerErrorCode } from './protocol'
import { ROSTER, type RosterDriver } from '../../data/roster'
import { rivalChassisId } from '../progression/ladder'

export interface RoomState {
  code: string
  hostId: string
  trackId: string
  players: LobbyPlayer[]
  phase: 'lobby' | 'racing' | 'results'
}

export interface NewPlayer {
  id: string
  name: string
  carId: string
}

export type RoomResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: ServerErrorCode }

export function createRoom(code: string, host: NewPlayer, trackId: string): RoomState {
  return {
    code,
    hostId: host.id,
    trackId,
    players: [{ id: host.id, name: host.name, carId: host.carId, ready: false, isAi: false }],
    phase: 'lobby',
  }
}

export function joinRoom(room: RoomState, player: NewPlayer): RoomResult {
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'ROOM_FULL' }
  return {
    ok: true,
    room: {
      ...room,
      players: [...room.players, { id: player.id, name: player.name, carId: player.carId, ready: false, isAi: false }],
    },
  }
}

/**
 * Removes a player. Hands host to the first remaining human (never a bot).
 * Returns null when no humans remain — a room must never persist as AI-only.
 */
export function leaveRoom(room: RoomState, playerId: string): RoomState | null {
  const players = room.players.filter((p) => p.id !== playerId)
  const humans = players.filter((p) => !p.isAi)
  if (humans.length === 0) return null
  const hostId = room.hostId === playerId ? humans[0].id : room.hostId
  return { ...room, players, hostId }
}

/** Changing car clears that player's ready flag (their build changed). */
export function setCar(room: RoomState, playerId: string, carId: string): RoomState {
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, carId, ready: false } : p)),
  }
}

export function setTrack(room: RoomState, playerId: string, trackId: string): RoomResult {
  if (room.hostId !== playerId) return { ok: false, error: 'NOT_HOST' }
  return { ok: true, room: { ...room, trackId } }
}

export function setReady(room: RoomState, playerId: string, ready: boolean): RoomState {
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, ready } : p)),
  }
}

export function allReady(room: RoomState): boolean {
  return room.players.length > 0 && room.players.every((p) => p.ready)
}

export function startRace(room: RoomState, playerId: string): RoomResult {
  if (room.hostId !== playerId) return { ok: false, error: 'NOT_HOST' }
  if (room.players.length < 2 || !allReady(room)) return { ok: false, error: 'MALFORMED' }
  return { ok: true, room: { ...room, phase: 'racing' } }
}

export function endRace(room: RoomState): RoomState {
  return { ...room, phase: 'results' }
}

/** Return to the lobby: humans un-ready, AI stay ready (they have no toggle). */
export function rematch(room: RoomState): RoomState {
  return { ...room, phase: 'lobby', players: room.players.map((p) => ({ ...p, ready: p.isAi })) }
}

/** Strips the `ai:` prefix; returns null for a human id. */
function aiDriverId(id: string): string | null {
  return id.startsWith('ai:') ? id.slice(3) : null
}

/**
 * Host adds one AI opponent to the next open slot. `pickDriver` receives the
 * set of driver ids already in the room and returns an unused RosterDriver (or
 * null to no-op). The AI's carId is the chassis its rank will drive, so the
 * lobby row is truthful. No-op if not host, room full, or picker returns null.
 */
export function addAi(
  room: RoomState,
  requesterId: string,
  pickDriver: (usedDriverIds: Set<string>) => RosterDriver | null,
): RoomState {
  if (room.hostId !== requesterId) return room
  if (room.players.length >= MAX_PLAYERS) return room
  const used = new Set(
    room.players.map((p) => aiDriverId(p.id)).filter((d): d is string => d !== null),
  )
  const driver = pickDriver(used)
  if (!driver) return room
  const rank = ROSTER.findIndex((d) => d.id === driver.id) + 1
  const ai: LobbyPlayer = {
    id: `ai:${driver.id}`,
    name: driver.name,
    carId: rivalChassisId(rank),
    ready: true,
    isAi: true,
  }
  return { ...room, players: [...room.players, ai] }
}

/** Host removes a specific AI. No-op if not host, unknown id, or a human id. */
export function removeAi(room: RoomState, requesterId: string, aiId: string): RoomState {
  if (room.hostId !== requesterId) return room
  const target = room.players.find((p) => p.id === aiId)
  if (!target || !target.isAi) return room
  return { ...room, players: room.players.filter((p) => p.id !== aiId) }
}

export function toSnapshot(room: RoomState): LobbySnapshot {
  return {
    code: room.code,
    hostId: room.hostId,
    trackId: room.trackId,
    players: room.players.map((p) => ({ ...p })),
  }
}
