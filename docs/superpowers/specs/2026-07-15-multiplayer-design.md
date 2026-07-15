# Multiplayer Design — Deathrally

**Date:** 2026-07-15
**Status:** Approved (design review with user)

## Summary

A separate "Multiplayer" quick-race mode. One player creates a room and shares a
link/code; up to 4 friends join from their browsers, pick preset cars, and race live
with AI filling the grid. A small authoritative Node server runs the race simulation.
Career state (money, damage, ladder, gear) is never read or written by this mode.

## Decisions made

| Question | Decision |
|---|---|
| Multiplayer type | Online real-time races |
| Audience | Friends via invite link/room code — no accounts, no public matchmaking |
| Career relation | Separate quick-race mode with preset cars/loadouts; zero career impact |
| Race size | Up to 4 humans per room, AI rivals fill the remaining grid slots |
| Netcode model | Authoritative Node server (WebSockets); clients send inputs, receive snapshots |
| Rejected alternatives | P2P host-authoritative (WebRTC fragility, host advantage, host-quit kills race); deterministic lockstep (cross-browser float divergence in `Math.exp`/`Math.sin` causes silent desyncs) |

## Player experience

```
Menu ──▶ Multiplayer ──▶ Create room ──▶ Lobby (code: TIGER-42) ──▶ Race ──▶ Results ──▶ back to Lobby
                    └──▶ Join room ────────────▲   (friends appear as they join,
                         (paste code/link)         host picks track, everyone readies up)
```

- Room code is shareable via URL (`?room=CODE`) and by typing the code manually.
- All players pick from the same preset car/loadout list — fair by construction.
  Presets are defined in `src/data/` from the existing car roster (identical stat
  builds per car, no career upgrades); the exact list is decided in the Phase 2 plan.
- Results screen shows placements, then returns the room to the lobby for a rematch.
- Every screen is keyboard navigable with a visible route back (project invariant).
- Player identity (driver name) stays visible in lobby, race HUD, and results.

## Architecture

```
Deathrally repo
├── src/core/        ◀── already pure & Phaser-free — the server imports THIS
├── src/game/        ◀── Phaser client, new Multiplayer scenes
└── server/          ◀── NEW: Node + TypeScript + `ws` WebSocket server
    ├── rooms        (create/join/leave, lobby state, room codes, ownership handoff)
    └── raceHost     (runs stepRace() at a fixed 30 ticks/sec, broadcasts snapshots)
```

- Plain `ws` library, no framework. Room logic at friends-scale is small; all race
  rules are the existing `src/core/` code reused headless.
- Development: server runs on localhost alongside the Vite dev server.
- Production: deploy to a free tier (Fly.io or Railway) in the final phase.
- The `src/core/` purity boundary (no Phaser imports, serializable state) is what
  makes the server possible; the refactor below strengthens it.

## Phase 1 prerequisite refactor (pure single-player work)

Current blockers found in the codebase assessment:

1. **Variable timestep.** `RaceScene.update(time, delta)` feeds Phaser's variable
   render delta into the sim. A `FixedStepClock` + `FIXED_STEP_MS` already exist in
   `src/game/race/raceSimulation.ts` but are unused by the live loop. Multiplayer
   requires true fixed-step simulation.
2. **Sim/render fusion.** Simulation state lives in scene fields and inside `CarUnit`
   objects that mix plain sim data with Phaser GameObjects, all orchestrated inline
   in the ~2,600-line `RaceScene.ts`.

The refactor: extract a plain serializable `RaceState` plus a pure
`stepRace(state, inputs, rng)` reducer into `src/core/race/`, route the live loop
through `FixedStepClock`, and make `RaceScene` a renderer of `RaceState`.

Constraints:

- Single-player behavior must not change perceptibly.
- Preserve `__step`, `__autoPilot`, race summaries, seed output, and track-selection
  debug hooks — they are the regression harness for this refactor.
- All race lifecycle invariants (pause freezes everything, abandon = committed DNF,
  weapons-off rules, seed-driven randomness, difficulty scope) must survive intact.

Side benefits: unit-testable simulation, replay capability.

## Sync model

| Concern | Approach |
|---|---|
| Tick | Server steps the sim at a fixed 30 ticks/sec; clients send held inputs every tick |
| Other cars & AI | Clients render snapshots ~100 ms in the past, smoothly interpolated |
| Own car | Predicted locally for instant steering feel; reconciled when the server disagrees (ships in its own phase — mode is playable with interpolation-only input lag before this lands) |
| Randomness | Server owns the gameplay race seed; clients receive cosmetic-only derived seeds |
| AI rivals | Simulated on the server via existing pure `aiDrive()`; clients just render them |
| Pause | No pausing other players' races. Esc opens a local overlay; choosing to leave is a personal DNF, race continues for others |
| Disconnect | Disconnected player's car becomes AI-driven for a grace period, then DNF; race continues |
| Host leaves lobby | Room ownership passes to the next player in join order |
| Cheat surface | Server authority only — clients can only send inputs; no further anti-cheat in v1 |

## Explicitly out of scope for v1

Public matchmaking, accounts, career cars/economy/ladder integration, spectating,
in-game chat, mobile-touch multiplayer polish, anti-cheat beyond server authority,
weapons-off multiplayer rooms.

## Phases

Each phase gets its own implementation plan → implement → review cycle. Phase 2 does
not start until the user confirms single-player feels identical after Phase 1.

| Phase | Deliverable | Verified by |
|---|---|---|
| 1 | `RaceState` + `stepRace` extraction, fixed-step loop (no visible change) | `npm test`, `npm run build`, single-player plays identically |
| 2 | Server: rooms, codes, lobby lifecycle; client Multiplayer/Lobby scenes | Two browser tabs see each other in a lobby |
| 3 | Networked race with interpolation only (own car included) | Two tabs finish a full race together |
| 4 | Own-car prediction/reconciliation + disconnect/DNF handling | Race feels responsive; killing a tab mid-race degrades gracefully |
| 5 | Results/rematch loop + deployment to free host | Friend on another network joins via link and completes a race |

## Testing

- Unit tests in `tests/` (project convention — mirrors pure rules):
  - `stepRace` determinism: same seed + same input sequence ⇒ identical final state.
  - Snapshot serialize/deserialize round-trip.
  - Room rules: join/leave/ready/ownership-handoff, room-code validity.
- Netcode behavior is verified by scripted two-tab browser runs (per the project's
  browser smoke-test convention), not unit tests.

## Codebase assessment reference (2026-07-15)

Multiplayer-friendly foundations already present: pure `stepCar()` physics
(`src/core/vehicle/carPhysics.ts`), single seeded RNG stream
(`src/core/race/random.ts`), pure AI (`src/core/ai/driver.ts`), named-action input
layer (`src/game/input/inputManager.ts`), 4-car field with per-tick state well under
a few KB. No existing networking or backend dependencies.
