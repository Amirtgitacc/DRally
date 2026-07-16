# Multiplayer: AI grid fill + copyable room code

**Date:** 2026-07-17
**Status:** Approved, ready for implementation plan
**Scope:** Phase 3 follow-up. Let a lobby host add AI opponents to fill empty
grid slots, and make the existing room code one-click copyable.

## Motivation

Two gaps in the current networked lobby:

1. A race needs two humans to start (`players.length >= 2`). A solo host who
   wants a quick game against bots can't. The protocol already reserves an
   `isAi` flag and a comment ("AI fills remaining grid slots at race time"),
   but nothing implements it.
2. The room code (`TIGER-42`) already exists and is shown at the top of the
   lobby with a `?room=` share link, but there's no quick way to copy it.

## Non-goals

- No refactor of single-player `RaceScene`. Its rival-building branch stays as
  is; the server gets its own pure AI builder. Some conceptual duplication of
  the rival-setup shape is accepted for this phase.
- No AI difficulty selector. AI skill varies naturally from the roster.
- No change to the room-code **format** — `WORD-NN` is kept.
- No per-car career data on the server (unchanged from Phase 3).

## Design

### 1. Data model — AI live in the room roster

AI participants become real entries in `room.players`, flagged so human-only
logic can skip them.

```ts
interface LobbyPlayer {
  id: string
  name: string
  carId: string
  ready: boolean
  isAi: boolean   // NEW — false for humans
}
```

| Field    | Human            | AI                                                    |
|----------|------------------|-------------------------------------------------------|
| `id`     | random UUID      | `"ai:<driverId>"` (e.g. `ai:vex`) — unique per driver |
| `name`   | typed name       | roster driver name (e.g. "Vex")                       |
| `carId`  | player's pick    | `rivalChassisId(rank)` — the chassis they'll drive    |
| `ready`  | toggled          | **always `true`**                                     |
| `isAi`   | `false`          | `true`                                                |

**Rank / skill assignment.** `ROSTER` (`src/data/roster.ts`) is seeded
strongest-first. When the host adds an AI, the server picks a **random unused**
roster driver and assigns `rank = ROSTER index + 1`. That rank feeds the same
career-independent helpers single-player uses:

- `rivalChassisId(rank)` → chassis (also the `carId` shown in the lobby, so the
  displayed car is truthful)
- `rivalUpgrades(rank)` → `armorTier` and `ai.spec` via `effectiveCarSpec`
- `rivalStrength(rank)` + `talentOf(driverId)` → `ai.speedScale` via `talentPace`
- `styleForGrade(talent.grade)` → look-ahead / tuning

"Unused" means no existing AI in the room already uses that driver id, so the
`ai:<driverId>` ids stay unique and no two bots share a name.

### 2. Protocol — two new host-only messages

```ts
ClientMsg =
  | ...
  | { t: 'addAi' }               // host adds one AI to the next open slot
  | { t: 'removeAi'; id: string } // host removes a specific AI
```

Server guards for both:
- ignore if sender is not the room host (`NOT_HOST`),
- `addAi`: refuse if room is full (`>= MAX_PLAYERS`) or every roster driver is
  already in the room,
- `removeAi`: refuse (no-op) if `id` is not an AI in this room — a human can
  never be removed this way.

No new `ServerErrorCode` values are required; `NOT_HOST` and `ROOM_FULL` cover
the failures. `addAi` when the roster is exhausted is a silent no-op (broadcast
unchanged) rather than an error, since the UI already hides the affordance when
the room is full.

### 3. Pure reducers (`src/core/net/roomState.ts`)

```ts
// Appends a ready AI for a random unused roster driver. Host-only; no-op if
// full or roster exhausted. `pickDriver` is injected for deterministic tests.
addAi(room, requesterId, pickDriver: (usedIds: Set<string>) => RosterDriver | null): RoomState

// Removes the AI with this id. Host-only; no-op on unknown id or a human id.
removeAi(room, requesterId, aiId): RoomState
```

`addAi` computes the driver's rank and resulting `carId` at insertion time so
the lobby row is truthful. The random pick is injected (a `pickUnusedDriver`
helper wrapping `Math.random` on the server) so reducer tests stay
deterministic.

### 4. Lifecycle edge cases

- **`leaveRoom`** must hand the host role to the first remaining **human**, not
  a bot. If no humans remain after the leave, the room closes (`return null`) —
  a room must never persist as bots-only. This changes the current
  "hand to `players[0]`" logic.
- **`startRace`** keeps `total players >= 2 && allReady`. Because AI are always
  ready, `allReady` already passes for a solo human + AI. The `>= 2` guard now
  admits 1 human + 1 AI. No signature change.
- **`rematch`** clears `ready` for humans only; AI stay `ready: true` (they have
  no way to un-ready). Simplest: `ready: p.isAi ? true : false`.

### 5. Race setup — `buildNetworkRace` branches (`server/raceSetup.ts`)

`buildNetworkRace` gains the `track` (for `track.tier`) it needs to tune AI
mines, and branches per player:

```
human → stock CarSetup (unchanged), ai: null,  roster{ isAi:false }
AI    → CarSetup{ ai:{ speedScale, tuning, spec, grade, aimSpread,
                       mineCooldownMs, rubberBandGain, lineIdx, lookAheadSamples } },
        roster{ isAi:true }
```

The AI branch reproduces `RaceScene`'s rival branch, driven by explicit inputs
(driverId, rank, track tier, weapons) instead of career/scene state. There is
**no** `difficultyPaceScale` in multiplayer — use `1.0`.

All grid cars keep a distinct livery from `MP_LIVERY_PALETTE` by grid index
(humans and AI alike), so up to four cars stay visually distinct. AI use their
roster `name`.

AI cars are driven by the sim's existing AI controller inside `RaceHost` — the
same `stepRace` path single-player uses for any car whose `setup.ai` is set. No
per-tick client input is needed for them. **Verify** during implementation that
`RaceHost` steps AI cars without waiting on missing `PlayerCommand` input.

`server/index.ts`'s `start` handler passes the resolved `track` into
`buildNetworkRace` (it already has `track` in scope).

### 6. Lobby UI (`src/game/scenes/LobbyScene.ts`)

```
ROOM  TIGER-42   [ COPY ]              ← new button; flashes "Copied!"
Share this link to invite: …?room=TIGER-42

PLAYERS
★ You (you)     — Karoon  — ✓ READY
  Vex     [AI]  — Shahin  — ✓ READY    ← click row (host) to remove
  — open slot —   [ + Add AI  (A) ]    ← host only, hidden when full

Hint (host): ←/→ car · Enter ready · [ ]/T track · A add AI · X remove AI · C copy · Space start
```

- **Copy** — a `tile` next to the heading, plus the `C` key. Copies the share
  link via `navigator.clipboard.writeText`, with a hidden-`textarea` +
  `execCommand('copy')` fallback if the async API is unavailable (e.g.
  non-secure context). Shows a transient "Copied!" label for ~1.2s.
- **`A`** = add AI (host, room not full) → `{ t: 'addAi' }`.
- **`X`** = remove the last AI in the roster (host) → `{ t: 'removeAi', id }`.
- AI rows are pointer-interactive for host (click to remove that specific AI);
  keyboard users get `X`.
- Non-host players see AI rows read-only.
- `render()` shows `[AI]` after the name and treats AI as ready. The open-slot
  row shows the "+ Add AI (A)" affordance only for the host and only when a slot
  is free.
- `canStart()` is unchanged in shape; it already works once AI count toward
  `players.length` and are ready.

### 7. Tests (`tests/`, pure only)

- `roomState.addAi`: appends a ready AI with a valid unused driver, sets
  truthful `carId`, is host-only, no-ops when full or roster exhausted, never
  duplicates a driver.
- `roomState.removeAi`: removes only AI, host-only, no-op on human/unknown id.
- `roomState.leaveRoom`: hands host to first human; closes room when the last
  human leaves even if AI remain.
- `roomState.startRace`: allows 1 human + 1 AI (total ≥ 2, all ready).
- `roomState.rematch`: humans reset to not-ready, AI stay ready.
- `raceSetup.buildNetworkRace`: AI players yield `ai != null` setups with a
  populated `spec`/`speedScale` and `roster.isAi === true`; humans unchanged.

UI (`LobbyScene`) and the clipboard fallback are browser-tested manually, not
unit-tested (per project testing policy).

## Files touched

| File | Change |
|------|--------|
| `src/core/net/protocol.ts` | `LobbyPlayer.isAi`; `addAi`/`removeAi` ClientMsg; flip `RaceCarInfo.isAi` doc |
| `src/core/net/roomState.ts` | `addAi`/`removeAi` reducers; human-only host handoff; `rematch` keeps AI ready |
| `server/rooms.ts` | `pickUnusedDriver` helper; wire reducers through `RoomStore` |
| `server/index.ts` | handle `addAi`/`removeAi`; pass `track` to `buildNetworkRace` |
| `server/raceSetup.ts` | AI branch building rival-style `CarSetup` + roster entry |
| `src/game/scenes/LobbyScene.ts` | Copy button + `C`; Add/Remove AI (`A`/`X`, click); AI-aware render |
| `tests/` | reducer + `buildNetworkRace` unit tests |

## Verification

- `npm test` (new + existing suites), `npm run build`, `git diff --check`.
- `npm run server:check` for the server tsconfig.
- Browser smoke: create room → Copy link works → add 3 AI → solo-start →
  race runs with AI opponents → results list AI → rematch returns to lobby with
  AI still present. Also: two humans + AI; host leaves and room closes cleanly.
