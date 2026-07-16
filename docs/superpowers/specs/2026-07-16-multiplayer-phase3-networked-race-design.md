# Multiplayer Phase 3 — Networked Race (Design)

**Date:** 2026-07-16
**Status:** Approved (design review with user)
**Depends on:** Phase 1 (sim extraction, `stepRace`), Phase 2 (server + lobby)

## Summary

Turn the lobby into a live race. The authoritative Node server builds the race,
steps `stepRace` at a fixed 30 ticks/sec, and broadcasts per-tick snapshots.
Clients stop stepping the sim locally; they render interpolated snapshots ~100 ms
behind (own car included — **no client prediction yet**, that is Phase 4). The
milestone: two browser tabs finish a full race together and see final standings.

Career state is never read or written (unchanged Phase 2 invariant).

## Decisions made (design review)

| Question | Decision |
|---|---|
| Client render architecture | **Seam in `RaceScene`** — a `RaceSource` abstraction feeds each frame's render data from either the local sim (single-player) or interpolated server snapshots (multiplayer). Rendering/HUD/camera/VFX code is reused unchanged. |
| AI grid fill | **Humans only** this phase. A room races its 2–4 human cars. Career-independent AI fill is deferred to a later phase. |
| Race end | **Standings + per-lap times + rematch** now. A `RACE COMPLETE` overlay ends the race; polished results styling and deployment stay in Phase 5. |
| Own-car rendering | Interpolated like every other car (no prediction). Input lag is acceptable this phase per the sync-model spec. |

## Architecture

```
        ┌──────────────────────── SERVER (per room) ─────────────────────────┐
LOBBY   │ host START (all ready) → build env from trackId,                   │
 ──────▶│ build human setups from lobby cars, createRaceState(seed)          │
RACING  │ 30 Hz loop:  stepRace(state, env, {perCarCommands}, 33.3ms)         │
        │              broadcast { snapshot, events } to all members         │
        │              ◀── each client streams its held input up             │
RESULTS │ all humans finished/wrecked (+grace) → freeze, broadcast standings │
        │ rematch → reset ready flags → back to LOBBY                        │
        └─────────────────────────────────────────────────────────────────────┘
                                     │ ws
        ┌──────────────────────── CLIENT ────────────────────────────────────┐
        │ RaceScene builds the SAME track geometry locally from trackId       │
        │ NetworkSource: buffer snapshots, render ~100 ms behind              │
        │   • car positions/headings interpolated between two snapshots       │
        │   • discrete fields (damage/wrecked/phase) snap to newer snapshot    │
        │   • events → existing VFX/audio/HUD handlers (unchanged)            │
        └─────────────────────────────────────────────────────────────────────┘
```

The room gains a lifecycle: `lobby → racing → results → lobby`.

## Protocol additions (`src/core/net/protocol.ts`)

New client → server messages:

| Msg | Fields | Meaning |
|---|---|---|
| `start` | — | Host-only; begins the race if every player is ready |
| `input` | `command: PlayerCommand` | The sender's held input for the current tick |
| `rematch` | — | From results, return the room to the lobby |

New server → client messages:

| Msg | Fields | Meaning |
|---|---|---|
| `raceStart` | `seed`, `trackId`, `laps`, `roster: RaceCarInfo[]`, `youId` | Everything the client needs to build the scene |
| `snapshot` | `snap: RaceSnapshot`, `events: SimEvent[]` | One tick of state + that tick's transient events |
| `raceEnd` | `standings: RaceStanding[]` | Final placement + lap times per car |

`RaceCarInfo = { id, name, color, chassisId, isAi }` — the per-car identity the
renderer needs for the `carInfo` map (name, livery color, texture). Livery color
is assigned per grid slot from a fixed palette (MP has no career livery).

`RaceStanding = { id, name, place, finishedAt, wrecked, lapTimes }`.

`PlayerCommand` is the existing type from `src/core/race/stepRace.ts`, reused verbatim.

### `RaceSnapshot` (new, `src/core/net/snapshot.ts`)

A trimmed, serializable projection of `RaceState` — everything the renderer and
standings need, nothing the client must not own:

- Per car: `id, x, y, heading, vx, vy, z, damage, wrecked, finishedAt, turbo,
  ammo, mines, progress (lap/gate), lastInput, lastTurboActive`
- `bullets`, `mines`, `pickups` (with respawn state)
- `phase, simTimeMs, countdownAnnounced, placementOrder`

**Excluded on purpose:** `rngState` and AI internals (`CarAiSim.spec/tuning`) —
the spec says clients receive cosmetic-only data; the server owns gameplay
randomness. A pure `toRaceSnapshot(state): RaceSnapshot` builds it.

## Core changes

These are the only changes to `src/core/` gameplay code. Each is guarded so
single-player behavior is byte-identical (protected by the determinism tests).

### 1. Per-car commands in `stepRace`

Today `stepRace(state, env, command, dtMs)` applies one command to the single
`isPlayer` car. Generalize the command argument to resolve a command **per human
car**:

```ts
// commands keyed by car id; a missing entry is treated as IDLE_COMMAND
export type CommandSet = Record<string, PlayerCommand>
export function stepRace(state, env, commands: CommandSet, dtMs): SimEvent[]
```

- Each `isPlayer` car with `finishedAt === null` and no autopilot drives from
  `commands[car.id] ?? IDLE_COMMAND`.
- Single-player call site passes `{ player: command }` → identical result.
- Autopilot and AI paths are unchanged.

Determinism contract is preserved and extended: same `CommandSet` sequence +
same seed ⇒ identical final state, for any number of human cars.

### 2. Race-end policy on `RaceEnv`

Add `raceEndMode: 'single-player' | 'all-humans'` to `RaceEnv`.

- `single-player` (default): current logic — the human finishing sets
  `phase = 'finished'` and emits `race-over`; `checkAllRivalsDone` unchanged.
- `all-humans`: a human finishing sets only that car's `finishedAt`; the race
  ends (phase → `finished`, `race-over` reason `all-humans-done`) once **every**
  human car is finished or wrecked, plus the existing grace window. A max-race-
  time backstop prevents a stuck race from never ending.

RaceScene sets `single-player`; the server sets `all-humans`.

### 3. Pure env/geometry builder

Extract the track-geometry construction that `RaceScene.create()` performs
(centerline via `catmullRomClosed`, racing line, gates, barriers, spacing) into a
pure `src/core/` builder, e.g. `buildRaceEnv(track, opts): RaceEnv`, so the
headless server can build an identical `RaceEnv` from a trackId. RaceScene then
calls the same builder — no behavior change. (Barrier positions must be computed
purely; verify none depend on Phaser objects during extraction.)

## Server (`server/`)

New `server/raceHost.ts` owns per-room race loops; `server/index.ts` routes the
new messages and holds the room lifecycle.

- **`start`** (host, all ready): build env (`all-humans` mode) from the room's
  trackId, build human `CarSetup[]` from lobby players' car choices (stock stats,
  no career), pick a server race seed, `createRaceState`, send `raceStart` to all
  members, begin a 30 Hz `setInterval` loop.
- **Loop tick:** step with each player's latest received `input` command (default
  IDLE), `broadcast({ t:'snapshot', snap: toRaceSnapshot(state), events })`.
- **`input`:** store the sender's latest `PlayerCommand` for their car; applied
  at the next tick. Ignored if the sender is not in a racing room.
- **Race end:** when `state.phase === 'finished'`, stop the loop, compute
  `RaceStanding[]` from `placementOrder`/`finishedAt`/`lapTimes`, send `raceEnd`,
  set room phase `results`.
- **`rematch`:** clear ready flags, room phase → `lobby`, broadcast lobby
  snapshot; clients return to `LobbyScene`.
- **Disconnect mid-race (this phase):** the player's car simply stays idle
  (no command). Graceful AI takeover / DNF is Phase 4.

The fixed dt (`1000/30`) is passed to `stepRace` every tick regardless of real
timer jitter, so the simulation stays deterministic; `setInterval` only paces
broadcasts.

## Client

### `RaceSource` seam (`src/game/race/raceSource.ts`)

```ts
interface RaceSource {
  frame(nowMs: number): RenderView   // cars/bullets/mines/pickups/phase to draw
  drainEvents(): SimEvent[]          // transient events since last frame
  sendInput?(cmd: PlayerCommand): void
  readonly youId: string             // which car is "me"
}
```

- **`LocalSource`**: wraps the existing `FixedStepClock` + `stepRace` loop.
  `RaceScene` single-player path becomes "source = local", rendering unchanged.
- **`NetworkSource`**: subscribes to `raceStart`/`snapshot`/`raceEnd` via
  `NetClient`; keeps a snapshot buffer keyed by `simTimeMs`; on `frame()`, picks
  the render time `latestServerTime − INTERP_DELAY_MS (100)`, finds the two
  bracketing snapshots, and lerps `x/y/heading/z/velocity`. Discrete fields
  (`damage, wrecked, finishedAt, phase, ammo, mines, turbo, progress`) take the
  newer snapshot. Events from each snapshot are queued for `drainEvents()`.
  `sendInput` forwards a `{ t:'input', command }` at most once per client frame.

`RaceScene` reads its per-frame render data from `source.frame()` and feeds
`source.drainEvents()` into the **existing** `handleSimEvents` switch. The `'player'`
id assumption is replaced by `source.youId` where the scene needs "my car"
(camera follow, HUD focus).

### `NetworkRaceScene` entry / results

- Launched from `LobbyScene` when the host starts (all clients receive
  `raceStart`). It configures `RaceScene` with a `NetworkSource`.
- On `raceEnd`, a `RACE COMPLETE` overlay lists final **standings + per-lap
  times**, with **Rematch** (sends `rematch`) and **Leave** (sends `leave`,
  returns to Menu). Keyboard navigable; visible route back (project invariant).
- Respects `reducedShake`/`reducedFlash` for any new effect.

## Explicitly out of scope for Phase 3

Own-car prediction/reconciliation, disconnect → AI/DNF grace handling, AI grid
fill, deployment to a hosted server, and any pausing model. These are Phases
4–5. A tab that dies mid-race leaves its car idle.

## Testing

Unit tests (`tests/`, mirrors pure rules):

- `stepRace` multi-command determinism: same `CommandSet` sequence + seed ⇒
  identical final `RaceState`, with 2+ human cars.
- Single-player equivalence: `{ player: cmd }` path produces the same result as
  the old single-command signature (regression guard).
- `toRaceSnapshot` serialize → JSON round-trip → deep-equal; confirms `rngState`
  and AI internals are absent.
- Race-end policy: `all-humans` ends only when every human is finished/wrecked
  (+grace); `single-player` unchanged.
- Room lifecycle: `start` requires host + all-ready; `rematch` clears ready and
  returns to lobby; race messages ignored outside a racing room.

Browser smoke (two tabs, per project convention — not unit tested):

- create → join → both ready → host START → both see countdown, cars move in
  sync, both finish → standings appear → rematch returns both to lobby.

## Files (created / modified)

- Create: `src/core/net/snapshot.ts` (`RaceSnapshot`, `toRaceSnapshot`)
- Modify: `src/core/net/protocol.ts` (new messages, `RaceCarInfo`, `RaceStanding`)
- Modify: `src/core/race/stepRace.ts` (`CommandSet`), `raceState.ts` (`raceEndMode`)
- Create: `src/core/race/raceEnvBuilder.ts` (pure `buildRaceEnv`) — extracted from RaceScene
- Create: `server/raceHost.ts`; modify `server/index.ts`, `server/rooms.ts` (room lifecycle)
- Create: `src/game/race/raceSource.ts` (`RaceSource`, `LocalSource`, `NetworkSource`)
- Modify: `src/game/scenes/RaceScene.ts` (read from `RaceSource`, `youId`)
- Modify: `src/game/scenes/LobbyScene.ts` (enable START → launch networked race)
- Create: results overlay (in the networked race scene/flow)
- Modify: `src/game/net/netClient.ts` if new subscription helpers are needed
- Tests under `tests/` mirroring the above.
