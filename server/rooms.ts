// server/rooms.ts
import { randomUUID } from 'node:crypto'
import {
  createRoom, joinRoom, type NewPlayer, type RoomResult, type RoomState,
} from '../src/core/net/roomState'
import { generateRoomCode } from '../src/core/net/roomCode'
import { ALL_TRACKS } from '../src/data/tracks/index'
import { CAR_CATALOG } from '../src/data/cars'
import { ROSTER, type RosterDriver } from '../src/data/roster'

const VALID_CAR_IDS = new Set(CAR_CATALOG.map((c) => c.id))
const VALID_TRACK_IDS = new Set(ALL_TRACKS.map((t) => t.id))
const DEFAULT_TRACK_ID = ALL_TRACKS[0].id

export function isValidCarId(id: string): boolean {
  return VALID_CAR_IDS.has(id)
}
export function isValidTrackId(id: string): boolean {
  return VALID_TRACK_IDS.has(id)
}

/** Random roster driver not already used in a room; null when all are taken. */
export function pickUnusedDriver(used: Set<string>): RosterDriver | null {
  const free = ROSTER.filter((d) => !used.has(d.id))
  if (free.length === 0) return null
  return free[Math.floor(Math.random() * free.length)]
}

export class RoomStore {
  private rooms = new Map<string, RoomState>()

  newPlayerId(): string {
    return randomUUID()
  }

  createRoom(host: NewPlayer, trackId: string): { code: string; room: RoomState } {
    let code = generateRoomCode(Math.random)
    while (this.rooms.has(code)) code = generateRoomCode(Math.random)
    const track = isValidTrackId(trackId) ? trackId : DEFAULT_TRACK_ID
    const room = createRoom(code, host, track)
    this.rooms.set(code, room)
    return { code, room }
  }

  join(code: string, player: NewPlayer): RoomResult {
    const room = this.rooms.get(code)
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' }
    const result = joinRoom(room, player)
    if (result.ok) this.rooms.set(code, result.room)
    return result
  }

  /** Apply a pure reducer to the stored room; store & return the result (null deletes/empties). */
  apply(code: string, fn: (room: RoomState) => RoomState | null): RoomState | null {
    const room = this.rooms.get(code)
    if (!room) return null
    const next = fn(room)
    if (next === null) this.rooms.delete(code)
    else this.rooms.set(code, next)
    return next
  }

  get(code: string): RoomState | undefined {
    return this.rooms.get(code)
  }
}
