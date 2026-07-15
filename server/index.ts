// server/index.ts
import { WebSocketServer, type WebSocket } from 'ws'
import { type ClientMsg, type ServerErrorCode, type ServerMsg } from '../src/core/net/protocol'
import { leaveRoom, setCar, setReady, setTrack, toSnapshot } from '../src/core/net/roomState'
import { RoomStore, isValidCarId, isValidTrackId } from './rooms'

const PORT = Number(process.env.PORT ?? 8080)
const store = new RoomStore()

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

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().slice(0, 16)
  return name.length > 0 ? name : null
}

function handleLeave(conn: Conn): void {
  if (!conn.code || !conn.playerId) return
  const code = conn.code
  const pid = conn.playerId
  store.apply(code, (room) => leaveRoom(room, pid))
  conn.code = null
  conn.playerId = null
  broadcast(code)
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  const conn: Conn = { ws, playerId: null, code: null }
  conns.add(conn)

  ws.on('message', (data) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(data)) as ClientMsg
    } catch {
      fail(ws, 'MALFORMED', 'Invalid message'); return
    }

    switch (msg.t) {
      case 'create': {
        const name = sanitizeName(msg.name)
        if (!name) return fail(ws, 'BAD_NAME', 'Enter a driver name')
        if (!isValidCarId(msg.carId)) return fail(ws, 'BAD_CAR', 'Unknown car')
        const id = store.newPlayerId()
        const { code, room } = store.createRoom({ id, name, carId: msg.carId }, msg.trackId)
        conn.playerId = id
        conn.code = code
        send(ws, { t: 'joined', youId: id, lobby: toSnapshot(room) })
        return
      }
      case 'join': {
        const name = sanitizeName(msg.name)
        if (!name) return fail(ws, 'BAD_NAME', 'Enter a driver name')
        if (!isValidCarId(msg.carId)) return fail(ws, 'BAD_CAR', 'Unknown car')
        const id = store.newPlayerId()
        const result = store.join(msg.code, { id, name, carId: msg.carId })
        if (!result.ok) return fail(ws, result.error, result.error === 'ROOM_FULL' ? 'Room is full' : 'Room not found')
        conn.playerId = id
        conn.code = msg.code
        send(ws, { t: 'joined', youId: id, lobby: toSnapshot(result.room) })
        broadcast(msg.code)
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
      case 'leave': {
        handleLeave(conn)
        return
      }
    }
  })

  ws.on('close', () => {
    handleLeave(conn)
    conns.delete(conn)
  })
})

console.log(`[mp] lobby server listening on ws://localhost:${PORT}`)
