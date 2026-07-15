# Multiplayer Phase 2 — Server + Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an authoritative Node `ws` server with room/code/lobby lifecycle, plus client `Multiplayer` and `Lobby` Phaser scenes, so two browser tabs can create/join a room and see each other in a lobby.

**Architecture:** Pure, serializable room rules and the wire protocol live in `src/core/net/` (Phaser-free, unit-tested like the rest of core). A thin `server/` transport (Node + `ws`, run via `tsx`) wraps those pure reducers, owns id/code generation, and broadcasts lobby snapshots. New client scenes talk to it through a small `NetClient` WebSocket wrapper. No career state is read or written anywhere in this feature.

**Tech Stack:** TypeScript (strict), Phaser 3 (client), Node + `ws` (server), `tsx` (dev runner), Vitest (unit tests for pure core).

## Global Constraints

- **Career isolation:** Multiplayer must never `import` from `src/game/state/saveGame` or read/write career keys. It is a self-contained quick-race mode. (spec §Summary)
- **Core purity:** `src/core/**` stays Phaser-free and JSON-serializable. All shared client/server types and room rules go under `src/core/net/`. (AGENTS.md §Architecture)
- **Server model:** Node + `ws`, no framework. Dev server listens on **port 8080**; client connects to **`ws://localhost:8080`** (overridable via `import.meta.env.VITE_MP_SERVER`). (user decision 2026-07-15)
- **Room size:** up to **4 humans** per room (`MAX_PLAYERS = 4`). AI grid-fill is a Phase 3 race concern; the lobby only tracks humans. (spec §Decisions)
- **Presets:** players pick any car from the existing roster at **stock `CarSpec` stats, zero upgrades** — the raw `CAR_CATALOG` entry. Fair by construction. (user decision 2026-07-15)
- **Scene invariants:** every screen is keyboard-navigable with a visible route back; every keyboard listener registered in `create()` is `.off()`'d in a `this.events.once('shutdown', …)` handler. (AGENTS.md §Current scene flow)
- **Presentation:** use tokens from `src/game/ui/theme.ts` and primitives from `src/game/ui/widgets.ts`; 1920×1080 internal layout. (AGENTS.md §Presentation)
- **Phase boundary:** Phase 2 is **lobby only**. Do NOT build the networked race (Phase 3) or own-car prediction (Phase 4). The lobby's "start race" affordance is a disabled/coming-soon placeholder. Verified by: two browser tabs see each other in a lobby with live-syncing ready state. (spec §Phases)
- **Discipline:** DRY, YAGNI, TDD for all pure core; frequent commits (one per task minimum).

---

## File Structure

**Shared core (Phaser-free, unit-tested):**
- `src/core/net/protocol.ts` — wire message unions (`ClientMsg`, `ServerMsg`), `LobbySnapshot`, `LobbyPlayer`, `MAX_PLAYERS`, error codes.
- `src/core/net/roomCode.ts` — `generateRoomCode`, `isValidRoomCode`, `normalizeRoomCode`.
- `src/core/net/roomState.ts` — pure `RoomState` + reducers (`createRoom`, `joinRoom`, `leaveRoom`, `setCar`, `setTrack`, `setReady`, `toSnapshot`, `allReady`).

**Server (Node, `tsx`):**
- `tsconfig.server.json` — Node typecheck config (root).
- `server/rooms.ts` — `RoomStore`: `Map<code, RoomState>` over the pure reducers; generates unique codes + player ids.
- `server/index.ts` — `ws` server: connection→player mapping, message routing, room broadcast.

**Client:**
- `src/config/net.ts` — `MP_SERVER_URL`.
- `src/game/net/netClient.ts` — `NetClient` WebSocket wrapper (typed send, message/close handlers).
- `src/game/scenes/MultiplayerScene.ts` — name/car entry, create/join, `?room=` deep-link.
- `src/game/scenes/LobbyScene.ts` — player list, car/track/ready controls, live updates, leave.

**Wiring / config:**
- `package.json` — add `ws` dep; `tsx`, `@types/ws` dev deps; `server` + `server:check` scripts.
- `src/main.ts` — register `MultiplayerScene`, `LobbyScene`.
- `src/game/scenes/MenuScene.ts` — add Multiplayer entry (drawn tile; see Task 8).

---

## Task 1: Wire protocol types

**Files:**
- Create: `src/core/net/protocol.ts`
- Test: `tests/core/net/protocol.test.ts`

**Interfaces:**
- Produces: `MAX_PLAYERS: number`; `LobbyPlayer`, `LobbySnapshot`, `ClientMsg`, `ServerMsg`, `ServerErrorCode` types consumed by every later task.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/net/protocol.test.ts
import { describe, it, expect } from 'vitest'
import { MAX_PLAYERS, type ClientMsg, type ServerMsg } from '../../../src/core/net/protocol'

describe('protocol', () => {
  it('caps a room at 4 humans', () => {
    expect(MAX_PLAYERS).toBe(4)
  })

  it('round-trips a client message through JSON unchanged', () => {
    const msg: ClientMsg = { t: 'join', code: 'TIGER-42', name: 'Nyx', carId: 'jackal' }
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg)
  })

  it('round-trips a server lobby snapshot through JSON unchanged', () => {
    const msg: ServerMsg = {
      t: 'lobby',
      lobby: {
        code: 'TIGER-42', hostId: 'p1', trackId: 'test-circuit',
        players: [{ id: 'p1', name: 'Nyx', carId: 'jackal', ready: false }],
      },
    }
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/net/protocol.test.ts`
Expected: FAIL — cannot resolve `src/core/net/protocol`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/net/protocol.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/net/protocol.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/net/protocol.ts tests/core/net/protocol.test.ts
git commit -m "feat(net): wire protocol types for multiplayer lobby"
```

---

## Task 2: Room code generation & validation

**Files:**
- Create: `src/core/net/roomCode.ts`
- Test: `tests/core/net/roomCode.test.ts`

**Interfaces:**
- Produces: `generateRoomCode(rand: () => number): string`, `isValidRoomCode(code: string): boolean`, `normalizeRoomCode(raw: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/net/roomCode.test.ts
import { describe, it, expect } from 'vitest'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../../../src/core/net/roomCode'

describe('roomCode', () => {
  it('generates a WORD-NN code that validates', () => {
    // rand=0 picks the first word and digits 00
    const code = generateRoomCode(() => 0)
    expect(code).toMatch(/^[A-Z]+-\d{2}$/)
    expect(isValidRoomCode(code)).toBe(true)
  })

  it('produces different words as rand advances', () => {
    const a = generateRoomCode(() => 0)
    const b = generateRoomCode(() => 0.999)
    expect(a).not.toBe(b)
  })

  it('normalizes user input to canonical form', () => {
    expect(normalizeRoomCode('  tiger-42 ')).toBe('TIGER-42')
    expect(normalizeRoomCode('tiger 42')).toBe('TIGER-42') // space tolerated as separator
  })

  it('rejects malformed codes', () => {
    expect(isValidRoomCode('')).toBe(false)
    expect(isValidRoomCode('TIGER')).toBe(false)
    expect(isValidRoomCode('TIGER-4')).toBe(false)
    expect(isValidRoomCode('12-34')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/net/roomCode.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/net/roomCode.ts

/** Short, phonetic, unambiguous words (no I/O/1/0 confusion) for shareable codes. */
const WORDS = [
  'TIGER', 'VIPER', 'RAVEN', 'COBRA', 'HAWK', 'WOLF', 'LYNX', 'PUMA',
  'DELTA', 'ECHO', 'NOVA', 'ONYX', 'RUST', 'ASH', 'EMBER', 'FLINT',
]

/** `WORD-NN`, e.g. `TIGER-42`. `rand` is a 0..1 source; caller supplies uniqueness retries. */
export function generateRoomCode(rand: () => number): string {
  const word = WORDS[Math.min(WORDS.length - 1, Math.floor(rand() * WORDS.length))]
  const n = Math.min(99, Math.floor(rand() * 100))
  return `${word}-${String(n).padStart(2, '0')}`
}

const CODE_RE = /^[A-Z]+-\d{2}$/

export function isValidRoomCode(code: string): boolean {
  return CODE_RE.test(code)
}

/** Uppercase, trim, and collapse a space separator into the canonical hyphen form. */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/net/roomCode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/net/roomCode.ts tests/core/net/roomCode.test.ts
git commit -m "feat(net): room code generation and validation"
```

---

## Task 3: Pure room-state reducers

**Files:**
- Create: `src/core/net/roomState.ts`
- Test: `tests/core/net/roomState.test.ts`

**Interfaces:**
- Consumes: `LobbyPlayer`, `LobbySnapshot`, `MAX_PLAYERS`, `ServerErrorCode` from `protocol.ts`.
- Produces:
  - `RoomState` = `{ code: string; hostId: string; trackId: string; players: LobbyPlayer[] }`
  - `createRoom(code: string, host: NewPlayer, trackId: string): RoomState`
  - `joinRoom(room: RoomState, player: NewPlayer): RoomResult`
  - `leaveRoom(room: RoomState, playerId: string): RoomState | null` (null = room now empty)
  - `setCar(room: RoomState, playerId: string, carId: string): RoomState`
  - `setTrack(room: RoomState, playerId: string, trackId: string): RoomResult` (NOT_HOST guard)
  - `setReady(room: RoomState, playerId: string, ready: boolean): RoomState`
  - `toSnapshot(room: RoomState): LobbySnapshot`
  - `allReady(room: RoomState): boolean`
  - `NewPlayer` = `{ id: string; name: string; carId: string }`
  - `RoomResult` = `{ ok: true; room: RoomState } | { ok: false; error: ServerErrorCode }`

All reducers are **pure**: they return new objects and never mutate the input (spread copies). Ids and codes are supplied by the caller (the server transport), keeping these functions deterministic.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/net/roomState.test.ts
import { describe, it, expect } from 'vitest'
import {
  createRoom, joinRoom, leaveRoom, setCar, setTrack, setReady, toSnapshot, allReady,
} from '../../../src/core/net/roomState'

const host = { id: 'p1', name: 'Nyx', carId: 'jackal' }

describe('roomState', () => {
  it('creates a room whose creator is host and only player', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(room.hostId).toBe('p1')
    expect(room.trackId).toBe('test-circuit')
    expect(room.players.map((p) => p.id)).toEqual(['p1'])
    expect(room.players[0].ready).toBe(false)
  })

  it('joins additional players in order', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal' })
    expect(r.ok).toBe(true)
    if (r.ok) room = r.room
    expect(room.players.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('rejects a 5th human with ROOM_FULL', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    for (const id of ['p2', 'p3', 'p4']) {
      const r = joinRoom(room, { id, name: id, carId: 'jackal' })
      if (r.ok) room = r.room
    }
    const overflow = joinRoom(room, { id: 'p5', name: 'p5', carId: 'jackal' })
    expect(overflow).toEqual({ ok: false, error: 'ROOM_FULL' })
  })

  it('hands host to the next joiner when the host leaves', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal' })
    if (r.ok) room = r.room
    const after = leaveRoom(room, 'p1')
    expect(after).not.toBeNull()
    expect(after!.hostId).toBe('p2')
    expect(after!.players.map((p) => p.id)).toEqual(['p2'])
  })

  it('returns null when the last player leaves', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(leaveRoom(room, 'p1')).toBeNull()
  })

  it('updates a player car and ready flag without mutating input', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    const carred = setCar(room, 'p1', 'leviathan')
    expect(carred.players[0].carId).toBe('leviathan')
    expect(room.players[0].carId).toBe('jackal') // original unchanged
    const readied = setReady(carred, 'p1', true)
    expect(readied.players[0].ready).toBe(true)
    expect(allReady(readied)).toBe(true)
  })

  it('only the host may change the track', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal' })
    if (r.ok) room = r.room
    expect(setTrack(room, 'p2', 'dust-bowl')).toEqual({ ok: false, error: 'NOT_HOST' })
    const ok = setTrack(room, 'p1', 'dust-bowl')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.room.trackId).toBe('dust-bowl')
  })

  it('changing a player car clears their ready flag', () => {
    const room = setReady(createRoom('TIGER-42', host, 'test-circuit'), 'p1', true)
    expect(setCar(room, 'p1', 'vandal').players[0].ready).toBe(false)
  })

  it('projects a JSON snapshot', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(toSnapshot(room)).toEqual({
      code: 'TIGER-42', hostId: 'p1', trackId: 'test-circuit',
      players: [{ id: 'p1', name: 'Nyx', carId: 'jackal', ready: false }],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/net/roomState.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/net/roomState.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/net/roomState.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Full suite + commit**

Run: `npm test` (expected: all prior tests + the new net tests pass).

```bash
git add src/core/net/roomState.ts tests/core/net/roomState.test.ts
git commit -m "feat(net): pure room-state reducers with ownership handoff"
```

---

## Task 4: Server transport (`ws` + RoomStore)

**Files:**
- Create: `tsconfig.server.json`
- Create: `server/rooms.ts`
- Create: `server/index.ts`
- Modify: `package.json` (deps + scripts)

**Interfaces:**
- Consumes: all of `src/core/net/*`.
- Produces: `RoomStore` class with `createRoom(host): { code; room }`, `join(code, player): RoomResult`, `apply(code, fn): RoomState | null`, `leave(code, playerId): RoomState | null`, `get(code): RoomState | undefined`. `newPlayerId(): string`.

**Note on config:** the server runs through `tsx` (esbuild), so `tsconfig.server.json` keeps `moduleResolution: "bundler"` (inherited) — this lets it import `src/core`'s extensionless modules and `src/data` id lists without rewriting them. It only overrides `lib`/`types` to drop the DOM. `npm run server:check` typechecks; `tsx` runs.

- [ ] **Step 1: Add dependencies**

Run:
```bash
npm install ws
npm install -D tsx @types/ws @types/node
```
Expected: `ws` under dependencies; `tsx`, `@types/ws`, `@types/node` under devDependencies in `package.json`.

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` block:
```json
    "server": "tsx watch server/index.ts",
    "server:check": "tsc -p tsconfig.server.json --noEmit"
```

- [ ] **Step 3: Create `tsconfig.server.json`**

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["server", "src/core", "src/data"]
}
```

- [ ] **Step 4: Write `server/rooms.ts`**

```ts
// server/rooms.ts
import { randomUUID } from 'node:crypto'
import {
  createRoom, joinRoom, type NewPlayer, type RoomResult, type RoomState,
} from '../src/core/net/roomState'
import { generateRoomCode } from '../src/core/net/roomCode'
import { ALL_TRACKS } from '../src/data/tracks/index'
import { CAR_CATALOG } from '../src/data/cars'

const VALID_CAR_IDS = new Set(CAR_CATALOG.map((c) => c.id))
const VALID_TRACK_IDS = new Set(ALL_TRACKS.map((t) => t.id))
const DEFAULT_TRACK_ID = ALL_TRACKS[0].id

export function isValidCarId(id: string): boolean {
  return VALID_CAR_IDS.has(id)
}
export function isValidTrackId(id: string): boolean {
  return VALID_TRACK_IDS.has(id)
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
```

- [ ] **Step 5: Write `server/index.ts`**

```ts
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
```

- [ ] **Step 6: Typecheck the server**

Run: `npm run server:check`
Expected: exits 0, no type errors. (If `src/data/*` pulls a Phaser import into the Node build, fall back to shape-only validation: replace the `isValidCarId`/`isValidTrackId` id-set checks with `typeof id === 'string' && id.length > 0 && id.length <= 40`, and drop `src/data` from the tsconfig include. Note this in the commit if used.)

- [ ] **Step 7: Boot smoke test**

Run: `npm run server` — leave it running in one terminal.
Expected: prints `[mp] lobby server listening on ws://localhost:8080`. Stop it with Ctrl-C. (Two-client verification happens in Task 7 with real browser tabs.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.server.json server/
git commit -m "feat(server): ws lobby transport over pure room reducers"
```

---

## Task 5: Client net config + `NetClient`

**Files:**
- Create: `src/config/net.ts`
- Create: `src/game/net/netClient.ts`

**Interfaces:**
- Consumes: `ClientMsg`, `ServerMsg` from `src/core/net/protocol`.
- Produces:
  - `MP_SERVER_URL: string`
  - `NetClient` with `connect(): Promise<void>`, `send(msg: ClientMsg): void`, `onMessage(fn: (msg: ServerMsg) => void): void`, `onClose(fn: () => void): void`, `close(): void`, `readonly connected: boolean`.

- [ ] **Step 1: Write `src/config/net.ts`**

```ts
// src/config/net.ts

/** WebSocket URL of the multiplayer lobby server. Override in prod via VITE_MP_SERVER. */
export const MP_SERVER_URL: string =
  (import.meta.env.VITE_MP_SERVER as string | undefined) ?? 'ws://localhost:8080'
```

- [ ] **Step 2: Write `src/game/net/netClient.ts`**

```ts
// src/game/net/netClient.ts
import { type ClientMsg, type ServerMsg } from '../../core/net/protocol'
import { MP_SERVER_URL } from '../../config/net'

/** Thin typed WebSocket wrapper for the multiplayer lobby. Career-independent. */
export class NetClient {
  private ws: WebSocket | null = null
  private messageHandlers: Array<(msg: ServerMsg) => void> = []
  private closeHandlers: Array<() => void> = []

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  connect(url: string = MP_SERVER_URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('Could not reach the multiplayer server'))
      ws.onclose = () => this.closeHandlers.forEach((h) => h())
      ws.onmessage = (ev) => {
        let msg: ServerMsg
        try {
          msg = JSON.parse(String(ev.data)) as ServerMsg
        } catch {
          return
        }
        this.messageHandlers.forEach((h) => h(msg))
      }
    })
  }

  send(msg: ClientMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg))
  }

  onMessage(fn: (msg: ServerMsg) => void): void {
    this.messageHandlers.push(fn)
  }

  onClose(fn: () => void): void {
    this.closeHandlers.push(fn)
  }

  close(): void {
    this.messageHandlers = []
    this.closeHandlers = []
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: `tsc --noEmit` passes (no unused/type errors); Vite build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/config/net.ts src/game/net/netClient.ts
git commit -m "feat(net): client config and NetClient WebSocket wrapper"
```

---

## Task 6: `MultiplayerScene` (create / join)

**Files:**
- Create: `src/game/scenes/MultiplayerScene.ts`
- Modify: `src/main.ts` (register scene)

**Interfaces:**
- Consumes: `NetClient`, `CAR_CATALOG` (`src/data/cars`), theme/widgets, `ServerMsg`.
- Produces: scene key `'Multiplayer'`. On successful `joined`, does `this.scene.start('Lobby', { net, youId, lobby })` where `net: NetClient`, `youId: string`, `lobby: LobbySnapshot`.

**Behavior:**
- Title `MULTIPLAYER · QUICK RACE`, with a line noting career progress is untouched.
- Driver-name field: reuse the desktop `keydown` append pattern from `NewCareerScene` (sanitize `/[a-zA-Z0-9 _-]/`, max 16) and, on touch (`isTouchDevice()`), `openNativeText` from `src/game/ui/nativeInput`. Prefill from `localStorage['deathrally-mp-name']` if present (NOT a career key).
- Car selector: left/right cycles `CAR_CATALOG`; show `car.name`.
- Room-code field (for Join): same entry pattern, uppercased, validated with `isValidRoomCode`.
- Actions row: `CREATE ROOM`, `JOIN ROOM`, plus a back route to `Menu`.
- Deep link: on `create()`, read `new URLSearchParams(window.location.search).get('room')`; if present and valid, prefill the code field and focus the Join action.
- On `CREATE`: `net.connect()` → `net.send({ t: 'create', name, carId, trackId: ALL_TRACKS[0].id })`. On `JOIN`: require a valid code → connect → `net.send({ t: 'join', code, name, carId })`.
- Register a single `net.onMessage` handler: on `joined` → persist name/car to localStorage → `this.scene.start('Lobby', { net, youId: msg.youId, lobby: msg.lobby })`; on `error` → show the message in a status line and stay.
- Cleanup: `this.events.once('shutdown', …)` removes all keyboard listeners and disposes any native-input handle. Do NOT `net.close()` here on a successful transition — ownership of the live `NetClient` passes to `LobbyScene`. Only close it if the user backs out to `Menu` without joining.

- [ ] **Step 1: Implement `MultiplayerScene`** following the `NewCareerScene`/`MenuScene` patterns (keyboard nav over the action tiles via `wireTiles`/index, `heading`/`text`/`panel`/`backButton` widgets, `sceneBackground(this, 'bg-menu', { veil: 0.6 })` or a plain dark fill). Write the full scene — no placeholders. Structure the interactive fields as an index-selectable list `[nameField, carField, codeField, createBtn, joinBtn]` with ↑/↓ to move focus, ←/→ to change car/edit, Enter to activate a button.

- [ ] **Step 2: Register the scene in `src/main.ts`**

Add the import and insert `MultiplayerScene` into the `scene` array (e.g. after `SettingsScene`):
```ts
import { MultiplayerScene } from './game/scenes/MultiplayerScene'
// …
      SettingsScene,
      MultiplayerScene,
      LobbyScene, // added in Task 7
      CreditsScene,
```
(Add `LobbyScene` in Task 7; leave a comment placeholder or add both imports now and create `LobbyScene` next.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Browser check (manual)**

Start `npm run server` (terminal 1) and `npm run dev` (terminal 2). Open `http://localhost:5199/?debug=1`, run `__game.scene.start('Multiplayer')` in the console (Menu entry lands in Task 8). Type a name, pick a car, click `CREATE ROOM`. Expected: no console errors; the scene attempts to transition to `Lobby` (which errors until Task 7 — acceptable here) OR temporarily log `msg` on `joined` to confirm the round-trip.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/MultiplayerScene.ts src/main.ts
git commit -m "feat(scene): Multiplayer create/join entry scene"
```

---

## Task 7: `LobbyScene` (the phase deliverable)

**Files:**
- Create: `src/game/scenes/LobbyScene.ts`
- Modify: `src/main.ts` (ensure `LobbyScene` registered — done in Task 6 Step 2)

**Interfaces:**
- Consumes: `init(data: { net: NetClient; youId: string; lobby: LobbySnapshot })`; `CAR_CATALOG`, `ALL_TRACKS`, `trackById`, theme/widgets, `LobbySnapshot`.
- Produces: scene key `'Lobby'`.

**Behavior:**
- `init(data)` stores `this.net`, `this.youId`, `this.lobby`.
- Header: big room code (`this.lobby.code`) + a share hint (`localhost:5199/?room=CODE` in dev — build from `window.location.origin + window.location.pathname`). Include a "career untouched" reassurance line.
- Player panel: up to 4 rows, each showing name, chosen car name, a ready ✓/✗, and a ★ for the host. The local player's row is highlighted.
- Controls (in a `hintBar`): `←/→` change my car → `net.send({ t: 'setCar', carId })`; `Enter`/`R` toggle my ready → `net.send({ t: 'ready', ready: !mine.ready })`; host only: `[`/`]` or `T` cycles track → `net.send({ t: 'setTrack', trackId })`; `Esc` leaves → `net.send({ t: 'leave' })`, `net.close()`, `this.scene.start('Menu')`.
- `net.onMessage`: on `lobby` → `this.lobby = msg.lobby` → `this.render()`; on `error` → show in a status line.
- `net.onClose`: show "Disconnected from server" and route back to `Menu` after a short beat (or on next key). Do not leave the player stuck.
- **Start race:** render a `START RACE` affordance that is **disabled** with the label `START — networked race lands in Phase 3`. It never starts a race in Phase 2. (Keeps the deliverable honest and the invariant that shipped actions are visible.)
- Cleanup on `shutdown`: remove all keyboard listeners. Do NOT `net.close()` on shutdown caused by starting a race later (Phase 3) — but in Phase 2 the only exits are Esc/leave (which closes) and disconnect (already closed), so closing in the Esc handler is sufficient.

- [ ] **Step 1: Implement `LobbyScene`** — full scene, a `render()` that rebuilds the player rows from `this.lobby`, host-gated track control, and the disabled Start affordance. Reuse `panel`, `text`, `heading`, `sectionLabel`, `hintBar`, `backButton` widgets.

- [ ] **Step 2: Ensure registration** — confirm `LobbyScene` is imported and in the `scene` array in `src/main.ts`.

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Two-tab verification (the phase acceptance test)**

With `npm run server` + `npm run dev` running:
1. Tab A: `http://localhost:5199/?debug=1` → `__game.scene.start('Multiplayer')` → name "Nyx", create room → lands in Lobby showing code, e.g. `TIGER-42`, one player (Nyx ★).
2. Tab B: open `http://localhost:5199/?room=TIGER-42` (or start Multiplayer and type the code) → join → **both tabs now list Nyx and the second player**.
3. In Tab B, toggle ready → **Tab A sees Tab B's ✓ update live**. Change a car in Tab A → Tab B reflects it.
4. Close Tab A (host) → Tab B shows the ★ move to the remaining player (ownership handoff).

Expected: all of the above with no console errors. This satisfies the spec's Phase 2 verification ("two browser tabs see each other in a lobby").

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/LobbyScene.ts src/main.ts
git commit -m "feat(scene): Lobby scene with live player list and ownership handoff"
```

---

## Task 8: Menu entry point

**Files:**
- Modify: `src/game/scenes/MenuScene.ts`

**Decision (user, 2026-07-15):** replace the dev-only `PREVIEW / DEMO` menu entry (index 7) with `MULTIPLAYER`. This keeps all 8 baked plates on the grid with no art change. The `PreviewScene` stays registered in `main.ts` and remains reachable via `?debug` console; only its menu plate is repurposed.

**Interfaces:**
- Consumes: existing `ITEMS`/`makePlate`/`move`/`refresh` machinery — unchanged.
- Produces: a navigable `MULTIPLAYER` entry (plate index 7) that does `this.scene.start('Multiplayer')`.

- [ ] **Step 1: Repoint the 8th item**

In `ITEMS`, change the last entry:
```ts
// before
  { label: 'PREVIEW / DEMO', scene: 'Preview' },
// after
  { label: 'MULTIPLAYER', scene: 'Multiplayer' },
```
No other menu machinery changes — it stays on baked plate `PLATE_Y[7]` and in the ↑/↓ cycle.

- [ ] **Step 2: (optional) Add an `M` shortcut and update the hint**

Add to the keyboard block:
```ts
const multi = () => this.scene.start('Multiplayer')
kb.on('keydown-M', multi)
// in shutdown: kb.off('keydown-M', multi)
```
Optionally append `· M multiplayer` to the `flavor` hint string.

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Browser check**

`npm run dev`, open the menu with an existing career. Expected: the 8th entry now reads `MULTIPLAYER`, is keyboard-navigable (↑/↓ and `M`), and launches the Multiplayer scene; the other 7 entries are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/MenuScene.ts
git commit -m "feat(menu): multiplayer entry point"
```

---

## Final verification (run before declaring Phase 2 complete)

- [ ] `npm test` — all unit tests pass (Task 1–3 net tests included).
- [ ] `npm run server:check` — server typechecks clean.
- [ ] `npm run build` — strict `tsc --noEmit` + Vite build succeed.
- [ ] `git diff --check` — no whitespace errors.
- [ ] Two-tab lobby smoke (Task 7 Step 4) passes end to end, including ready-sync and host handoff.
- [ ] Confirm no `saveGame`/career import leaked into `server/`, `src/core/net/`, `MultiplayerScene`, or `LobbyScene` (`grep -rn "saveGame\|deathrally-career" server src/core/net src/game/scenes/MultiplayerScene.ts src/game/scenes/LobbyScene.ts` returns nothing).

## Self-review notes

- **Spec coverage:** rooms/codes/lobby lifecycle → Tasks 2–4; client Multiplayer/Lobby scenes → Tasks 6–7; ownership handoff → Task 3 + verified Task 7; room-rule unit tests → Tasks 1–3; two-tab acceptance → Task 7. Preset cars (stock stats) → Task 6 uses raw `CAR_CATALOG`. Career isolation → Global Constraints + final grep check.
- **Out of scope (correctly deferred):** networked race, interpolation, prediction, disconnect-to-AI grace, deployment — all Phase 3+ per spec. The Lobby's Start affordance is intentionally disabled.
- **Type consistency:** `RoomState`, `NewPlayer`, `RoomResult`, `LobbySnapshot`, `LobbyPlayer`, `ClientMsg`, `ServerMsg` names are used identically across Tasks 1, 3, 4, 5. `net`/`youId`/`lobby` scene-data shape matches between Task 6 (producer) and Task 7 (consumer).
