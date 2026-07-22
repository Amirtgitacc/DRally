// server/index.ts
import { WebSocketServer, type WebSocket } from 'ws'
import { type ClientMsg, type ServerErrorCode, type ServerMsg } from '../src/core/net/protocol'
import { addAi, endRace, leaveRoom, rematch, removeAi, setCar, setReady, setTrack, startRace, toSnapshot } from '../src/core/net/roomState'
import { isValidRoomCode, normalizeRoomCode } from '../src/core/net/roomCode'
import { RoomStore, isValidCarId, isValidTrackId, pickUnusedDriver } from './rooms'
import { buildRaceEnv } from '../src/core/race/raceEnvBuilder'
import { buildNetworkRace } from './raceSetup'
import { createRaceHost, RaceHost } from './raceHost'
import { sanitizeCommand } from './inputCommand'
// (PlayerCommand shape validation lives in ./inputCommand now)
import { trackById } from '../src/data/tracks'
import { STARTER_CAR, carById } from '../src/data/cars'
import { effectiveCarSpec, NO_UPGRADES } from '../src/core/vehicle/carSpec'

const PORT = Number(process.env.PORT ?? 8080)
const store = new RoomStore()
const hosts = new Map<string, RaceHost>()

// env.playerSpec fallback for any human car without a per-car spec override.
// In MP every human now carries car.spec = mpCarSpec(chassis) (see raceSetup.ts),
// so this is only a defensive default and no longer the human driving spec.
const DEFAULT_PLAYER_SPEC = effectiveCarSpec(carById(STARTER_CAR.id), NO_UPGRADES)

process.on('uncaughtException', (err) => {
  console.error('[mp] uncaught exception (continuing):', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[mp] unhandled rejection (continuing):', err)
})

interface Conn {
  ws: WebSocket
  playerId: string | null
  code: string | null
}
const conns = new Set<Conn>()

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}
function fail(ws: WebSocket, code: ServerErrorCode, message: string): void {
  send(ws, { t: 'error', code, message })
}

/** Push the current lobby snapshot to every connected member of a room. */
function broadcast(code: string): void {
  const room = store.get(code)
  if (!room) return
  const snap = toSnapshot(room)
  const memberIds = new Set(room.players.map((p) => p.id))
  for (const c of conns) {
    if (c.code === code && c.playerId && memberIds.has(c.playerId)) {
      send(c.ws, { t: 'lobby', lobby: snap })
    }
  }
}

/** Send an arbitrary ServerMsg to every connected member of a room. */
function broadcastRaw(code: string, msg: ServerMsg): void {
  const room = store.get(code)
  if (!room) return
  const memberIds = new Set(room.players.map((p) => p.id))
  for (const c of conns) {
    if (c.code === code && c.playerId && memberIds.has(c.playerId)) {
      send(c.ws, msg)
    }
  }
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().slice(0, 16)
  return name.length > 0 ? name : null
}

function handleLeave(conn: Conn): void {
  if (!conn.code || !conn.playerId) return
  const code = conn.code
  const pid = conn.playerId
  const next = store.apply(code, (room) => leaveRoom(room, pid))
  conn.code = null
  conn.playerId = null
  if (!next) {
    hosts.get(code)?.stop()
    hosts.delete(code)
  } else {
    // A human left while a race is running: retire their orphan car so the
    // sim stops waiting on it. Without this, in all-humans mode the parked car
    // never finishes/wrecks and checkAllHumansDone stalls the room until the
    // 10-minute backstop. retirePlayer marks the car wrecked deterministically
    // at the next tick and clears its stale command/seq/latch.
    hosts.get(code)?.retirePlayer(pid)
  }
  broadcast(code)
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  const conn: Conn = { ws, playerId: null, code: null }
  conns.add(conn)

  ws.on('message', (data) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(data))
    } catch {
      return fail(ws, 'MALFORMED', 'Invalid message')
    }
    if (parsed === null || typeof parsed !== 'object' || typeof (parsed as { t?: unknown }).t !== 'string') {
      return fail(ws, 'MALFORMED', 'Invalid message')
    }
    const msg = parsed as ClientMsg

    switch (msg.t) {
      case 'create': {
        if (conn.code && conn.playerId) handleLeave(conn)
        const name = sanitizeName(msg.name)
        if (!name) return fail(ws, 'BAD_NAME', 'Enter a driver name')
        if (!isValidCarId(msg.carId)) return fail(ws, 'BAD_CAR', 'Unknown car')
        const id = store.newPlayerId()
        const variantId = typeof msg.variantId === 'string' ? msg.variantId : undefined
        const { code, room } = store.createRoom({ id, name, carId: msg.carId, variantId }, msg.trackId)
        conn.playerId = id
        conn.code = code
        send(ws, { t: 'joined', youId: id, lobby: toSnapshot(room) })
        return
      }
      case 'join': {
        if (conn.code && conn.playerId) handleLeave(conn)
        const name = sanitizeName(msg.name)
        if (!name) return fail(ws, 'BAD_NAME', 'Enter a driver name')
        if (!isValidCarId(msg.carId)) return fail(ws, 'BAD_CAR', 'Unknown car')
        if (typeof msg.code !== 'string') return fail(ws, 'BAD_CODE', 'Invalid room code')
        const normalizedCode = normalizeRoomCode(msg.code)
        if (!isValidRoomCode(normalizedCode)) return fail(ws, 'BAD_CODE', 'Invalid room code')
        const id = store.newPlayerId()
        const variantId = typeof msg.variantId === 'string' ? msg.variantId : undefined
        const result = store.join(normalizedCode, { id, name, carId: msg.carId, variantId })
        if (!result.ok) return fail(ws, result.error, result.error === 'ROOM_FULL' ? 'Room is full' : 'Room not found')
        conn.playerId = id
        conn.code = normalizedCode
        send(ws, { t: 'joined', youId: id, lobby: toSnapshot(result.room) })
        broadcast(normalizedCode)
        return
      }
      case 'setCar': {
        if (!conn.code || !conn.playerId) return
        if (!isValidCarId(msg.carId)) return fail(ws, 'BAD_CAR', 'Unknown car')
        store.apply(conn.code, (room) => setCar(room, conn.playerId!, msg.carId))
        broadcast(conn.code)
        return
      }
      case 'setTrack': {
        if (!conn.code || !conn.playerId) return
        if (!isValidTrackId(msg.trackId)) return fail(ws, 'BAD_TRACK', 'Unknown track')
        const room = store.get(conn.code)
        if (!room) return
        const result = setTrack(room, conn.playerId, msg.trackId)
        if (!result.ok) return fail(ws, result.error, 'Only the host can pick the track')
        store.apply(conn.code, () => result.room)
        broadcast(conn.code)
        return
      }
      case 'ready': {
        if (!conn.code || !conn.playerId) return
        store.apply(conn.code, (room) => setReady(room, conn.playerId!, !!msg.ready))
        broadcast(conn.code)
        return
      }
      case 'addAi': {
        if (!conn.code || !conn.playerId) return
        store.apply(conn.code, (room) => addAi(room, conn.playerId!, pickUnusedDriver))
        broadcast(conn.code)
        return
      }
      case 'removeAi': {
        if (!conn.code || !conn.playerId) return
        if (typeof msg.id !== 'string') return
        store.apply(conn.code, (room) => removeAi(room, conn.playerId!, msg.id))
        broadcast(conn.code)
        return
      }
      case 'leave': {
        handleLeave(conn)
        return
      }
      case 'start': {
        if (!conn.code || !conn.playerId) return
        if (hosts.has(conn.code)) return fail(ws, 'MALFORMED', 'Race already running')
        const room = store.get(conn.code)
        if (!room) return
        const res = startRace(room, conn.playerId)
        if (!res.ok) return fail(ws, res.error, res.error === 'NOT_HOST' ? 'Only the host can start' : 'Not everyone is ready')
        store.apply(conn.code, () => res.room)
        const track = trackById(room.trackId)
        const seed = Math.floor(Math.random() * 2 ** 31)
        const { setups, roster } = buildNetworkRace(room.players, /* weaponsEnabled */ true, track, seed)
        const env = buildRaceEnv(track, { playerSpec: DEFAULT_PLAYER_SPEC, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
        const host = createRaceHost(env, roster, setups, seed, room.trackId, track.laps)
        hosts.set(conn.code, host)
        // tell every member the race is starting, each with their own youId
        for (const c of conns) {
          if (c.code === conn.code && c.playerId && room.players.some((p) => p.id === c.playerId)) {
            send(c.ws, { t: 'raceStart', seed, trackId: room.trackId, laps: track.laps, roster, youId: c.playerId })
          }
        }
        host.start(
          (snapMsg) => broadcastRaw(conn.code!, snapMsg),
          (standings) => {
            broadcastRaw(conn.code!, { t: 'raceEnd', standings })
            store.apply(conn.code!, (r) => endRace(r))
            hosts.delete(conn.code!)
          },
        )
        return
      }
      case 'input': {
        if (!conn.code || !conn.playerId) return
        const host = hosts.get(conn.code)
        const command = sanitizeCommand(msg.command)
        if (host && command && typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
          host.setInput(conn.playerId, command, msg.seq)
        }
        return
      }
      case 'rematch': {
        if (!conn.code || !conn.playerId) return
        // Only a room already in 'results' may rematch. A rematch mid-race would
        // stop the running host and broadcast a 'lobby' snapshot that in-race
        // clients ignore, stranding everyone in a frozen RaceScene. Ignore it
        // outside results (rematch() is also guarded defensively, but the host
        // must not be stopped either, so gate here first).
        const room = store.get(conn.code)
        if (!room || room.phase !== 'results') return
        hosts.get(conn.code)?.stop()
        hosts.delete(conn.code)
        const next = store.apply(conn.code, (r) => rematch(r))
        if (next) broadcast(conn.code) // sends the lobby snapshot; clients return to LobbyScene
        return
      }
      default:
        return fail(ws, 'MALFORMED', 'Unknown message type')
    }
  })

  ws.on('close', () => {
    handleLeave(conn)
    conns.delete(conn)
  })
})

console.log(`[mp] lobby server listening on ws://localhost:${PORT}`)
