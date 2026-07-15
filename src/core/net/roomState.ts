import { MAX_PLAYERS, type LobbyPlayer, type LobbySnapshot, type ServerErrorCode } from './protocol'

export interface RoomState {
  code: string
  hostId: string
  trackId: string
  players: LobbyPlayer[]
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
    players: [{ id: host.id, name: host.name, carId: host.carId, ready: false }],
  }
}

export function joinRoom(room: RoomState, player: NewPlayer): RoomResult {
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'ROOM_FULL' }
  if (room.players.some((p) => p.id === player.id)) return { ok: true, room } // idempotent rejoin
  return {
    ok: true,
    room: {
      ...room,
      players: [...room.players, { id: player.id, name: player.name, carId: player.carId, ready: false }],
    },
  }
}

/** Removes a player. Hands host to the next remaining joiner. Returns null if the room is now empty. */
export function leaveRoom(room: RoomState, playerId: string): RoomState | null {
  const players = room.players.filter((p) => p.id !== playerId)
  if (players.length === 0) return null
  const hostId = room.hostId === playerId ? players[0].id : room.hostId
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

export function toSnapshot(room: RoomState): LobbySnapshot {
  return {
    code: room.code,
    hostId: room.hostId,
    trackId: room.trackId,
    players: room.players.map((p) => ({ ...p })),
  }
}
