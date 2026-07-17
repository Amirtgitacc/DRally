# Multiplayer AI Grid Fill + Copyable Room Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lobby host add AI opponents to fill empty grid slots (so a solo host can race against bots), and make the existing room code one-click copyable.

**Architecture:** AI participants become real entries in `room.players`, flagged `isAi`. Pure reducers (`addAi`/`removeAi`) in `src/core/net/roomState.ts` add/remove them; the server injects a random roster-driver picker. At race start, `buildNetworkRace` branches per player — humans get today's stock setup, AI get a rival-style `CarSetup` built from the same career-independent tuning helpers single-player uses. The lobby scene gains a Copy button and Add/Remove-AI controls.

**Tech Stack:** TypeScript (strict), Phaser 3, `ws` WebSocket server, Vitest. Pure rules in `src/core`, data in `src/data`, server in `server/`, presentation in `src/game`.

## Global Constraints

- Core rules stay browser-independent and serializable: no Phaser imports in `src/core` or `server/`. (AGENTS.md)
- `MAX_PLAYERS = 4` — the grid cap covers humans + AI combined.
- Multiplayer has **no** career difficulty; AI pace uses no `difficultyPaceScale` (factor `1.0`).
- Server uses one stock human spec (`DEFAULT_PLAYER_SPEC`); do not add per-car career data.
- Reuse `src/game/ui/theme.ts` tokens and `src/game/ui/widgets.ts` primitives for any lobby UI; keep it keyboard navigable with a visible route back. (AGENTS.md)
- AI ids are `ai:<driverId>` (e.g. `ai:vex`); the `"ai:"` prefix is 3 chars.
- Room-code **format** (`WORD-NN`) is unchanged.
- Verify with `npm test`, `npm run build`, `npm run server:check`, `git diff --check` before declaring done.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/core/net/protocol.ts` | wire types | add `LobbyPlayer.isAi`; add `addAi`/`removeAi` ClientMsg |
| `src/core/net/roomState.ts` | pure room reducers | set `isAi` in create/join; `addAi`/`removeAi`; human-only host handoff; `rematch` keeps AI ready |
| `server/rooms.ts` | server room store + driver picker | export `pickUnusedDriver` |
| `server/index.ts` | socket message routing | handle `addAi`/`removeAi`; pass `track` to `buildNetworkRace` |
| `server/raceSetup.ts` | lobby→race setup | AI branch; add `track` param |
| `src/game/scenes/LobbyScene.ts` | lobby presentation | Copy button + `C`; Add/Remove AI (`A`/`X`, click); AI-aware render |
| `tests/core/net/roomState.test.ts` | reducer tests | `addAi`/`removeAi`/`leaveRoom`/`rematch` |
| `tests/net/roomLifecycle.test.ts` | lifecycle tests | solo-human + AI start |
| `tests/net/raceSetup.test.ts` | setup tests | AI branch + fixture `isAi` + `track` arg |

---

## Task 1: Wire types — `isAi` field + AI messages

**Files:**
- Modify: `src/core/net/protocol.ts`
- Modify: `src/core/net/roomState.ts` (createRoom/joinRoom set `isAi: false`)
- Test: `tests/core/net/roomState.test.ts` (existing suite must still pass)

**Interfaces:**
- Produces: `LobbyPlayer { id, name, carId, ready, isAi: boolean }`; `ClientMsg` gains `{ t: 'addAi' }` and `{ t: 'removeAi'; id: string }`.

- [ ] **Step 1: Add `isAi` to `LobbyPlayer` and the two ClientMsg variants**

In `src/core/net/protocol.ts`, change the `LobbyPlayer` interface:

```ts
export interface LobbyPlayer {
  id: string
  name: string
  carId: string
  ready: boolean
  /** true for AI grid-fill opponents; false for humans */
  isAi: boolean
}
```

And extend `ClientMsg` (add the two lines before `| { t: 'input'; ... }`):

```ts
  | { t: 'addAi' }
  | { t: 'removeAi'; id: string }
```

Also update the stale doc comment on `RaceCarInfo.isAi` from `/** always false in Phase 3 (AI grid fill is deferred) */` to `/** true for AI grid-fill opponents */`.

- [ ] **Step 2: Set `isAi: false` where human `LobbyPlayer`s are created**

In `src/core/net/roomState.ts`, `createRoom` — the host player literal:

```ts
    players: [{ id: host.id, name: host.name, carId: host.carId, ready: false, isAi: false }],
```

And `joinRoom` — the appended player literal:

```ts
      players: [...room.players, { id: player.id, name: player.name, carId: player.carId, ready: false, isAi: false }],
```

- [ ] **Step 3: Typecheck to confirm no other construction sites break**

Run: `npm run build`
Expected: FAIL only in `tests/net/raceSetup.test.ts` (its literal `LobbyPlayer` fixtures now miss `isAi`). This is fixed in Task 4. If any **non-test** `src/` file fails, add `isAi: false` there too. No production `src/` file other than `roomState.ts` should construct a `LobbyPlayer`.

- [ ] **Step 4: Run the roomState suite (still green — those rooms go through create/join)**

Run: `npx vitest run tests/core/net/roomState.test.ts`
Expected: PASS (createRoom/joinRoom now stamp `isAi: false`).

- [ ] **Step 5: Commit**

```bash
git add src/core/net/protocol.ts src/core/net/roomState.ts
git commit -m "feat(mp): add isAi flag and addAi/removeAi protocol messages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `addAi` / `removeAi` reducers + human-only lifecycle

**Files:**
- Modify: `src/core/net/roomState.ts`
- Test: `tests/core/net/roomState.test.ts`

**Interfaces:**
- Consumes: `LobbyPlayer.isAi` (Task 1); `ROSTER`/`RosterDriver` from `src/data/roster.ts`; `rivalChassisId` from `src/core/progression/ladder.ts`.
- Produces:
  - `addAi(room: RoomState, requesterId: string, pickDriver: (usedDriverIds: Set<string>) => RosterDriver | null): RoomState`
  - `removeAi(room: RoomState, requesterId: string, aiId: string): RoomState`
  - `leaveRoom` now hands host to the first remaining **human** and returns `null` when no humans remain.
  - `rematch` resets human `ready` to `false` but leaves AI `ready: true`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/net/roomState.test.ts` (add `addAi, removeAi, rematch` to the import from `roomState`):

```ts
import { ROSTER } from '../../../src/data/roster'
import { rivalChassisId } from '../../../src/core/progression/ladder'

// deterministic picker: always the first unused roster driver
const firstUnused = (used: Set<string>) => ROSTER.find((d) => !used.has(d.id)) ?? null

describe('roomState AI fill', () => {
  it('addAi appends a ready AI for an unused driver with a truthful carId', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    const next = addAi(room, 'p1', firstUnused)
    expect(next.players).toHaveLength(2)
    const ai = next.players[1]
    const driver = ROSTER[0]
    expect(ai.id).toBe(`ai:${driver.id}`)
    expect(ai.name).toBe(driver.name)
    expect(ai.isAi).toBe(true)
    expect(ai.ready).toBe(true)
    // carId is the chassis the AI will actually drive (rank = ROSTER index + 1)
    expect(ai.carId).toBe(rivalChassisId(1))
  })

  it('addAi never picks the same driver twice', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = addAi(room, 'p1', firstUnused)
    room = addAi(room, 'p1', firstUnused)
    const aiIds = room.players.filter((p) => p.isAi).map((p) => p.id)
    expect(new Set(aiIds).size).toBe(aiIds.length)
    expect(aiIds).toEqual([`ai:${ROSTER[0].id}`, `ai:${ROSTER[1].id}`])
  })

  it('addAi is host-only and respects MAX_PLAYERS', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    expect(addAi(room, 'intruder', firstUnused).players).toHaveLength(1) // not host → no-op
    room = addAi(room, 'p1', firstUnused)
    room = addAi(room, 'p1', firstUnused)
    room = addAi(room, 'p1', firstUnused) // now 4 (1 human + 3 AI)
    const full = addAi(room, 'p1', firstUnused)
    expect(full.players).toHaveLength(4) // no 5th
  })

  it('addAi no-ops when the picker returns null (roster exhausted)', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(addAi(room, 'p1', () => null).players).toHaveLength(1)
  })

  it('removeAi removes only AI, host-only', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = addAi(room, 'p1', firstUnused)
    const aiId = room.players[1].id
    expect(removeAi(room, 'intruder', aiId).players).toHaveLength(2) // not host → no-op
    expect(removeAi(room, 'p1', 'p1').players).toHaveLength(2) // can't remove a human
    expect(removeAi(room, 'p1', aiId).players).toHaveLength(1) // AI gone
  })

  it('leaveRoom hands host to the first remaining human, skipping AI', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit') // p1 host
    const j = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'jackal' })
    if (j.ok) room = j.room
    room = addAi(room, 'p1', firstUnused) // AI sits at index 1, before p2
    const after = leaveRoom(room, 'p1')
    expect(after).not.toBeNull()
    expect(after!.hostId).toBe('p2') // not the AI at index 1
  })

  it('leaveRoom closes the room when the last human leaves even if AI remain', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = addAi(room, 'p1', firstUnused)
    expect(leaveRoom(room, 'p1')).toBeNull()
  })

  it('rematch clears human ready but keeps AI ready', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = setReady(room, 'p1', true)
    room = addAi(room, 'p1', firstUnused)
    const next = rematch(room)
    expect(next.players.find((p) => p.id === 'p1')!.ready).toBe(false)
    expect(next.players.find((p) => p.isAi)!.ready).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/net/roomState.test.ts`
Expected: FAIL — `addAi`/`removeAi` are not exported.

- [ ] **Step 3: Implement the reducers and lifecycle changes**

In `src/core/net/roomState.ts`, add imports at the top:

```ts
import { ROSTER, type RosterDriver } from '../../data/roster'
import { rivalChassisId } from '../progression/ladder'
```

Replace `leaveRoom` with the human-aware version:

```ts
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
```

Replace `rematch`:

```ts
/** Return to the lobby: humans un-ready, AI stay ready (they have no toggle). */
export function rematch(room: RoomState): RoomState {
  return { ...room, phase: 'lobby', players: room.players.map((p) => ({ ...p, ready: p.isAi })) }
}
```

Add the two new reducers (near `setReady`):

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/net/roomState.test.ts`
Expected: PASS (all, including the new `AI fill` describe block).

- [ ] **Step 5: Commit**

```bash
git add src/core/net/roomState.ts tests/core/net/roomState.test.ts
git commit -m "feat(mp): addAi/removeAi reducers with human-only host handoff

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Server wiring — driver picker + message handlers

**Files:**
- Modify: `server/rooms.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `addAi`/`removeAi` (Task 2); `ROSTER`/`RosterDriver`.
- Produces: `pickUnusedDriver(used: Set<string>): RosterDriver | null` (exported from `server/rooms.ts`); server routes `addAi`/`removeAi` client messages.

- [ ] **Step 1: Add the random driver picker to `server/rooms.ts`**

Add the import and exported helper (place `pickUnusedDriver` after the `isValidTrackId` function):

```ts
import { ROSTER, type RosterDriver } from '../src/data/roster'
```

```ts
/** Random roster driver not already used in a room; null when all are taken. */
export function pickUnusedDriver(used: Set<string>): RosterDriver | null {
  const free = ROSTER.filter((d) => !used.has(d.id))
  if (free.length === 0) return null
  return free[Math.floor(Math.random() * free.length)]
}
```

- [ ] **Step 2: Route the two new messages in `server/index.ts`**

Add `addAi, removeAi` to the existing import from `'../src/core/net/roomState'`, and `pickUnusedDriver` to the import from `'./rooms'`.

Add these two cases to the `switch (msg.t)` block (after the `ready` case, before `leave`):

```ts
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
```

- [ ] **Step 3: Typecheck the server**

Run: `npm run server:check`
Expected: PASS (no type errors; `msg.id` is typed via the `removeAi` ClientMsg variant).

- [ ] **Step 4: Commit**

```bash
git add server/rooms.ts server/index.ts
git commit -m "feat(mp): route addAi/removeAi with random roster-driver picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `buildNetworkRace` AI branch

**Files:**
- Modify: `server/raceSetup.ts`
- Modify: `server/index.ts` (pass `track` at the `start` call site)
- Test: `tests/net/raceSetup.test.ts`

**Interfaces:**
- Consumes: `LobbyPlayer.isAi` (Task 1); AI-tuning helpers (`talentOf`, `styleForGrade`, `rivalChassisId`, `rivalUpgrades`, `rivalStrength`, `talent*`, `effectiveCarSpec`, `AI_MINES`, `RUBBER_BAND`, `ROSTER`).
- Produces: `buildNetworkRace(players: LobbyPlayer[], weaponsEnabled: boolean, track: TrackDef): { setups: CarSetup[]; roster: RaceCarInfo[] }` — AI players yield `ai != null` setups and `roster.isAi === true`.

- [ ] **Step 1: Update tests (fixtures + new AI case)**

Rewrite `tests/net/raceSetup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildNetworkRace } from '../../server/raceSetup'
import type { LobbyPlayer } from '../../src/core/net/protocol'
import { trackById, ALL_TRACKS } from '../../src/data/tracks'

const track = ALL_TRACKS[0]

const humans: LobbyPlayer[] = [
  { id: 'a', name: 'Ana', carId: 'jackal', ready: true, isAi: false },
  { id: 'b', name: 'Bo', carId: 'jackal', ready: true, isAi: false },
]

describe('buildNetworkRace', () => {
  it('one stock setup + roster entry per human, in join order', () => {
    const { setups, roster } = buildNetworkRace(humans, true, track)
    expect(setups.map((s) => s.id)).toEqual(['a', 'b'])
    expect(setups.every((s) => s.isPlayer && s.ai === null && s.damage === 0 && s.armorTier === 0)).toBe(true)
    expect(roster[0].color).not.toBe(roster[1].color)
    expect(roster.every((r) => !r.isAi)).toBe(true)
  })

  it('weapons off ⇒ zero ammo and mines for humans', () => {
    const { setups } = buildNetworkRace(humans, false, track)
    expect(setups.every((s) => s.ammo === 0 && s.mines === 0)).toBe(true)
  })

  it('AI players get an ai-driven setup and an isAi roster entry', () => {
    const players: LobbyPlayer[] = [
      { id: 'a', name: 'Ana', carId: 'jackal', ready: true, isAi: false },
      { id: 'ai:vex', name: 'Vex', carId: 'jackal', ready: true, isAi: true },
    ]
    const { setups, roster } = buildNetworkRace(players, true, track)
    const aiSetup = setups.find((s) => s.id === 'ai:vex')!
    expect(aiSetup.isPlayer).toBe(false)
    expect(aiSetup.ai).not.toBeNull()
    expect(aiSetup.ai!.spec).toBeDefined()
    expect(aiSetup.ai!.speedScale).toBeGreaterThan(0)
    const aiRoster = roster.find((r) => r.id === 'ai:vex')!
    expect(aiRoster.isAi).toBe(true)
    expect(aiRoster.name).toBe('Vex')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/net/raceSetup.test.ts`
Expected: FAIL — `buildNetworkRace` takes 2 args / AI branch missing.

- [ ] **Step 3: Implement the AI branch**

Rewrite `server/raceSetup.ts`:

```ts
// server/raceSetup.ts
// Career-independent race setup: turns lobby players into CarSetup[] + the
// RaceCarInfo[] roster the client renderer uses. Humans get a stock loadout;
// AI grid-fill opponents get a rival-style setup from the same tuning helpers
// single-player uses (no career/difficulty on the server — pace factor 1.0).
import type { LobbyPlayer, RaceCarInfo } from '../src/core/net/protocol'
import type { CarSetup } from '../src/core/race/raceState'
import type { TrackDef } from '../src/data/tracks/testCircuit'
import { carById } from '../src/data/cars'
import { ROSTER } from '../src/data/roster'
import { rivalChassisId, rivalUpgrades, rivalStrength } from '../src/core/progression/ladder'
import { styleForGrade, talentOf, RUBBER_BAND } from '../src/data/drivers'
import {
  talentTuning, talentPace, talentAimSpread, talentMineCount, talentMineCooldown, talentRubberBand,
} from '../src/core/ai/talent'
import { effectiveCarSpec } from '../src/core/vehicle/carSpec'
import { GUN, MINES, AI_MINES } from '../src/data/weapons'

export const MP_LIVERY_PALETTE = [0xff7a1a, 0x3aa0ff, 0x36d17a, 0xd94fd0]

/** Stock mine loadout: the garage pack size (MINES.count), not a career purchase. */
const STOCK_MINES = MINES.count

export function buildNetworkRace(
  players: LobbyPlayer[],
  weaponsEnabled: boolean,
  track: TrackDef,
): { setups: CarSetup[]; roster: RaceCarInfo[] } {
  const setups: CarSetup[] = []
  const roster: RaceCarInfo[] = []
  players.forEach((player, i) => {
    const color = MP_LIVERY_PALETTE[i % MP_LIVERY_PALETTE.length]
    if (player.isAi) {
      const driverId = player.id.slice(3) // strip "ai:"
      const rank = ROSTER.findIndex((d) => d.id === driverId) + 1
      const talent = talentOf(driverId)
      const style = styleForGrade(talent.grade)
      const chassis = carById(rivalChassisId(rank))
      const upgrades = rivalUpgrades(rank)
      setups.push({
        id: player.id,
        isPlayer: false,
        mass: chassis.mass,
        damage: 0,
        ammo: weaponsEnabled ? GUN.ammoMax : 0,
        mines: weaponsEnabled ? talentMineCount(AI_MINES.count[track.tier], talent) : 0,
        armorTier: upgrades.armor,
        ai: {
          lineIdx: 0,
          lookAheadSamples: style.lookAheadSamples,
          speedScale: talentPace(rivalStrength(rank), talent), // no difficulty scale in MP
          tuning: talentTuning(style.tuning, talent),
          spec: effectiveCarSpec(chassis, upgrades),
          grade: talent.grade,
          aimSpread: talentAimSpread(GUN.aiSpread, talent),
          mineCooldownMs: talentMineCooldown(AI_MINES.cooldownMs, talent),
          rubberBandGain: talentRubberBand(RUBBER_BAND.gainPerGate, talent),
        },
      })
      roster.push({ id: player.id, name: player.name, color, chassisId: chassis.id, isAi: true })
    } else {
      const car = carById(player.carId)
      setups.push({
        id: player.id,
        isPlayer: true,
        mass: car.mass,
        damage: 0,
        ammo: weaponsEnabled ? GUN.ammoMax : 0,
        mines: weaponsEnabled ? STOCK_MINES : 0,
        armorTier: 0,
        ai: null,
      })
      roster.push({ id: player.id, name: player.name, color, chassisId: player.carId, isAi: false })
    }
  })
  return { setups, roster }
}
```

- [ ] **Step 4: Pass `track` at the server start call site**

In `server/index.ts`, in the `start` case, the `track` const already exists above the `buildNetworkRace` call. Update the call:

```ts
        const { setups, roster } = buildNetworkRace(room.players, /* weaponsEnabled */ true, track)
```

- [ ] **Step 5: Run tests + server typecheck to verify pass**

Run: `npx vitest run tests/net/raceSetup.test.ts && npm run server:check`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add server/raceSetup.ts server/index.ts tests/net/raceSetup.test.ts
git commit -m "feat(mp): build rival-style AI setups for grid-fill opponents

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Lobby UI — Copy button + Add/Remove AI

**Files:**
- Modify: `src/game/scenes/LobbyScene.ts`

**Interfaces:**
- Consumes: `addAi`/`removeAi` messages (Task 1); `LobbyPlayer.isAi`; existing widgets (`tile`, `text`, `heading`, etc.).
- Produces: no exports — scene behavior only.

- [ ] **Step 1: Add a Copy button beside the room heading**

In `create()`, after the `heading(...)` line (currently line 50) and the `shareUrl` const (line 51), add a Copy tile and a transient confirmation label. Replace the block that builds the heading/share text so it reads:

```ts
    heading(this, cx, 110, `ROOM ${this.lobby.code}`)
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${this.lobby.code}`

    const copyTile = tile(this, cx + 430, 110, 150, 56, 'COPY', { size: 'bodySm' })
    copyTile.rect.setInteractive({ useHandCursor: true })
    copyTile.rect.on('pointerup', () => this.copyShareLink(shareUrl))
    this.copiedLabel = text(this, cx + 430, 150, '', {
      size: 'caption', color: C.ok, origin: [0.5, 0.5],
    })

    text(this, cx, 168, `Share this link to invite: ${shareUrl}`, {
      size: 'body', color: C.textSecondary, origin: [0.5, 0.5],
    })
```

Add the field near the other private fields (with `private statusText!` etc.):

```ts
  private copiedLabel!: Phaser.GameObjects.Text
  private shareUrl = ''
```

And set `this.shareUrl = shareUrl` right after the `shareUrl` const so the `C` key handler can reach it.

- [ ] **Step 2: Implement the copy method with a fallback**

Add this method to the class:

```ts
  /** Copy the invite link; async clipboard first, hidden-textarea fallback. */
  private copyShareLink(url: string) {
    const done = () => {
      this.copiedLabel.setText('Copied!')
      this.time.delayedCall(1200, () => this.copiedLabel.setText(''))
    }
    const nav = navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } }
    if (nav.clipboard?.writeText) {
      nav.clipboard.writeText(url).then(done).catch(() => this.copyFallback(url, done))
    } else {
      this.copyFallback(url, done)
    }
  }

  private copyFallback(url: string, done: () => void) {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); done() } catch { /* clipboard blocked; no-op */ }
    document.body.removeChild(ta)
  }
```

- [ ] **Step 3: Add `A` / `X` / `C` key handling (host-gated for A/X)**

In `handleKey`, add branches. Replace the `else if (event.code === 'Space')` tail so the chain includes the new keys:

```ts
    } else if (event.code === 'Space') {
      this.tryStart()
    } else if (event.code === 'KeyC') {
      this.copyShareLink(this.shareUrl)
    } else if (event.code === 'KeyA' && this.lobby.hostId === this.youId) {
      if (this.lobby.players.length < MAX_PLAYERS) this.net.send({ t: 'addAi' })
    } else if (event.code === 'KeyX' && this.lobby.hostId === this.youId) {
      const lastAi = [...this.lobby.players].reverse().find((p) => p.isAi)
      if (lastAi) this.net.send({ t: 'removeAi', id: lastAi.id })
    }
```

Note: `KeyC` must be added **before** the existing `KeyT`-in-track branch is reached only if not host; since `C` isn't used elsewhere there's no conflict. Keep `A`/`X` after the track branch so bracket/T handling is unaffected.

- [ ] **Step 4: Make AI rows show `[AI]`, be click-to-remove, and update the open-slot affordance**

Replace the `render()` per-row loop body and the open-slot line:

```ts
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const row = this.playerRows[i]
      row.removeAllListeners('pointerup')
      row.disableInteractive()
      const p = this.lobby.players[i]
      const isHost = this.lobby.hostId === this.youId
      if (!p) {
        // first open slot shows the host's Add-AI affordance
        const firstOpen = this.lobby.players.length === i
        row.setText(isHost && firstOpen ? '+ Add AI  (A)' : '— open slot —')
        row.setColor(hex(isHost && firstOpen ? C.oxide : C.textMuted))
        if (isHost && firstOpen) {
          row.setInteractive({ useHandCursor: true })
          row.on('pointerup', () => {
            if (this.lobby.players.length < MAX_PLAYERS) this.net.send({ t: 'addAi' })
          })
        }
        continue
      }
      const car = carById(p.carId)
      const isRowHost = p.id === this.lobby.hostId
      const isYou = p.id === this.youId
      const star = isRowHost ? '★ ' : '   '
      const tag = p.isAi ? ' [AI]' : ''
      const readyMark = p.ready ? '✓ READY' : '✗ NOT READY'
      row.setText(`${star}${p.name}${isYou ? ' (you)' : ''}${tag}  —  ${car.name}  —  ${readyMark}`)
      row.setColor(hex(isYou ? C.oxide : p.ready ? C.ok : C.textPrimary))
      if (isHost && p.isAi) {
        row.setInteractive({ useHandCursor: true })
        row.on('pointerup', () => this.net.send({ t: 'removeAi', id: p.id }))
      }
    }
```

- [ ] **Step 5: Update the hint bar**

Replace the `this.hint.setText(...)` call at the end of `render()`:

```ts
    this.hint.setText(
      `←/→ change car · Enter/R ready${isHost ? ' · [ / ] or T change track · A add AI · X remove AI' : ''}` +
        ` · C copy link${isHost && canStart ? ' · Space to start' : ''} · Esc leave`,
    )
```

- [ ] **Step 6: Full typecheck + build**

Run: `npm run build`
Expected: PASS (strict TS + Vite build; no unused-var or type errors).

- [ ] **Step 7: Commit**

```bash
git add src/game/scenes/LobbyScene.ts
git commit -m "feat(mp): lobby copy-link button and add/remove AI controls

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Lifecycle test + full verification + manual smoke

**Files:**
- Modify: `tests/net/roomLifecycle.test.ts`

**Interfaces:**
- Consumes: `addAi` (Task 2), `startRace` (unchanged).

- [ ] **Step 1: Add a solo-human-plus-AI start test**

Append to `tests/net/roomLifecycle.test.ts` (add `addAi` to the `roomState` import, and these imports at the top):

```ts
import { addAi } from '../../src/core/net/roomState'
import { ROSTER } from '../../src/data/roster'

const firstUnused = (used: Set<string>) => ROSTER.find((d) => !used.has(d.id)) ?? null
```

Add the test inside the existing top-level `describe`:

```ts
  it('a solo host can start once an AI fills a slot', () => {
    let room = createRoom('SOLO-01', { id: 'h', name: 'Host', carId: 'jackal' }, 'test-circuit')
    room = addAi(room, 'h', firstUnused)      // 1 human + 1 AI
    room = setReady(room, 'h', true)          // AI already ready
    const res = startRace(room, 'h')
    expect(res.ok).toBe(true)
  })
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS (all suites, including the new lifecycle test).

- [ ] **Step 3: Full build + server check + whitespace**

Run: `npm run build && npm run server:check && git diff --check`
Expected: all PASS, no whitespace errors.

- [ ] **Step 4: Commit the test**

```bash
git add tests/net/roomLifecycle.test.ts
git commit -m "test(mp): solo host starts a race against AI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual browser smoke (two servers running)**

Start both: `npm run server` and `npm run dev` (ports 8080 / 5199).

Verify each:
1. Create a room → the room heading shows `ROOM WORD-NN`; click **COPY** → "Copied!" flashes; paste confirms the `?room=` link.
2. Press `A` three times (or click **+ Add AI**) → three `[AI]` rows appear, each `✓ READY`, each a distinct car; the open-slot affordance disappears at 4 cars.
3. Ready up (`Enter`) → **START RACE** enables → `Space` starts → the race runs with AI opponents visibly driving.
4. Results overlay lists the AI drivers by name; **Rematch** returns to the lobby with the AI still present and ready.
5. Press `X` (or click an AI row) → that AI is removed.
6. Two browser windows: host + one human + one AI; host leaves (`Esc`) → the remaining human becomes host (★ moves) and the room persists. Then the last human leaves → room closes cleanly (server logs the host stop; no orphaned race).

---

## Self-Review

**Spec coverage:**
- `LobbyPlayer.isAi` + AI messages → Task 1 ✓
- `addAi`/`removeAi` reducers, human-only handoff, rematch-keeps-AI → Task 2 ✓
- Server picker + routing → Task 3 ✓
- `buildNetworkRace` AI branch + `track` param → Task 4 ✓
- Lobby Copy button + Add/Remove AI + AI-aware render → Task 5 ✓
- `startRace` solo-human-plus-AI (no code change; behavior verified) → Task 6 ✓
- All reducer/setup tests → Tasks 2, 4, 6 ✓

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `addAi(room, requesterId, pickDriver)` and `removeAi(room, requesterId, aiId)` signatures match across Tasks 2/3; `buildNetworkRace(players, weaponsEnabled, track)` matches across Tasks 4's impl, call site, and tests; `ai:<driverId>` prefix (slice(3)) consistent in `roomState.ts` (`aiDriverId`) and `raceSetup.ts`; `TrackDef` imported from `src/data/tracks/testCircuit.ts` (its declaration site) as used elsewhere.
