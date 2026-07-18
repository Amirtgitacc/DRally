# Multiplayer: client-side prediction for the local car

**Date:** 2026-07-18
**Status:** Approved, ready for implementation plan
**Scope:** Phase 3 follow-up. Make the local player's own car respond instantly
to input by predicting its movement on the client and reconciling against the
authoritative server, instead of rendering it interpolated ~66ms in the past.

## Motivation

The networked race is authoritative server-side: the client sends input, the
server steps the sim at 30Hz, and the client renders every car interpolated
`INTERP_DELAY_MS` (66ms) behind the newest snapshot. That is correct for
*other* cars, but it means **your own car** also lags its input by the
interpolation delay plus the round trip — steering and throttle feel sluggish
compared to single-player, which simulates locally every frame with zero delay.
This is felt on localhost today and would worsen with real network latency once
the server is hosted remotely.

Client-side prediction removes that felt delay for the local car: simulate it
locally each frame, and correct it smoothly whenever the server disagrees.

## Non-goals

- **No prediction of other cars.** They remain interpolated behind the newest
  snapshot exactly as today.
- **No weapon prediction.** Firing and mine drops stay server-authoritative.
  They feel acceptable now that mine presses are latched server-side. Predicting
  local bullet/mine spawns (and de-duplicating them against server spawns) is
  explicitly deferred.
- **No prediction of car-to-car collisions.** When the local car rams another
  car, the server correction is absorbed by position smoothing. This is the
  standard, accepted trade-off.
- **No change to the 30Hz server tick or the sampling input model.** The server
  keeps applying the latest received command per tick (see "Known
  approximation" below). We do not move to per-input stepping.

## Design

### 1. Shared movement step (DRY, zero-drift by construction)

Prediction only feels right if the client integrates the local car with the
**exact same physics the server runs**. Today that physics lives inline in
`stepRace`'s per-car loop (`stepRace.ts:118-154`): turbo meter, `stepCar`,
airborne/landing, wrecked velocity decay, off-track drag, barrier (wall)
collision, and stuck rescue.

Extract that block into one pure, shared function in a new module
`src/core/race/carMovement.ts`:

```ts
// Advances ONE car's movement for a single fixed step: turbo meter, core
// physics, off-track drag, wall collision, stuck rescue. No car-to-car
// collision, no weapons, no gates — those stay in stepRace. Pure; mutates
// `car` in place and may push events (car-landed, rescue, wall impacts).
export function stepCarMovement(
  state: RaceState,
  env: RaceEnv,
  car: CarSim,
  input: CarInput,
  wantsTurbo: boolean,
  dt: number,            // already dilated seconds, as stepRace computes it
  events: SimEvent[],
): void
```

Move the three helpers used only by that block —
`applyOffTrackDrag`, `resolveBarrierCollisions`, `updateStuckRescue` — into
`carMovement.ts` as well. `stepRace` imports `stepCarMovement` and calls it in
place of the extracted lines; **fire, gate crossing, car-to-car collision,
bullets, mines, pickups, placements all stay exactly where they are.** This is
a behavior-preserving refactor: the full existing suite must stay green with no
test changes, and `stepRace`'s determinism contract is unchanged.

The client predictor imports the same `stepCarMovement` and calls it on the
local car only.

### 2. Protocol — input sequence numbers + server acknowledgement

Reconciliation needs the client to know which of its inputs the server has
already accounted for.

```ts
// ClientMsg: input gains a monotonic per-client sequence number
| { t: 'input'; command: PlayerCommand; seq: number }

// ServerMsg: snapshot gains per-player last-applied seq
| { t: 'snapshot'; snap: RaceSnapshot; events: SimEvent[]; acks: Record<string, number> }
```

`acks` is a map because a snapshot is broadcast identically to every client
(`broadcastRaw`); each client reads `acks[youId]`. The sequence number is a
transport concern and stays **out** of `RaceState`/`RaceSnapshot` (core purity
and the snapshot's cosmetic-only contract are preserved) — the server attaches
`acks` when it builds the snapshot message.

Backward-compat / validation: `seq` must be a finite number; `index.ts`'s
`isValidCommand` gate (or a sibling check) rejects an input message with a
missing/NaN `seq`. A client that never sends `seq` (there is none — we own both
ends) is not a concern.

### 3. Server — track last-applied seq, emit acks (`server/raceHost.ts`)

```
setInput(playerId, command, seq):
  if command.dropMine: mineLatched[playerId] = true   // unchanged
  commands[playerId] = command
  lastSeq[playerId]  = seq                              // NEW

each tick, when emitting the snapshot message:
  acks = { ...lastSeq }                                 // NEW
  onTick({ t: 'snapshot', snap, events, acks })
```

`server/index.ts` `input` case passes `msg.seq` into `setInput`. `lastSeq`
reflects the seq of the command that was current at the tick — i.e. the newest
input the server had when it stepped — which is exactly what the client must
treat as "processed."

### 4. Client predictor (`src/game/race/localPredictor.ts`, new)

Owns the predicted local car and the unacknowledged-input history.

```ts
interface PendingInput { seq: number; command: PlayerCommand; dtMs: number }

class LocalPredictor {
  // predicted local car (a CarSim cloned from the server's authoritative one)
  // pending: inputs sent but not yet acked, in send order
  // smoothOffset: {x, y} decaying visual correction

  // Called each frame with the command just sent and the frame delta.
  // Advances the predicted car one step via stepCarMovement.
  predict(command: PlayerCommand, dtMs: number): void

  // Called when a snapshot arrives: adopt the server's authoritative local-car
  // state, drop inputs with seq <= ack, replay the rest, and fold the resulting
  // position change into smoothOffset so rendering doesn't snap.
  reconcile(serverLocalCar: CarSim, ackSeq: number): void

  // The car state to render this frame: predicted position + decaying offset.
  readonly renderState: CarState
  readonly car: CarSim   // for turbo/other movement-derived HUD fields
}
```

**Predict (per frame):** compute `dt` from `dtMs` the same way `stepRace` does
(slow-mo dilation from the predictor's own `state.slowMoUntil`, which is
effectively 1.0 in MP), then `stepCarMovement(predState, env, predCar,
command.input, command.turbo, dt, throwaway)`.

**Reconcile (per snapshot):**
1. Copy the server's authoritative local car (position, velocity, heading,
   turbo, turboDepleted, wrecked) into the predicted car. Damage, ammo, mines,
   progress, lapTimes remain server-owned (weapons/laps are authoritative).
2. `pending = pending.filter(p => p.seq > ackSeq)`.
3. Replay each remaining pending input in order via `stepCarMovement` using its
   stored `dtMs`.
4. `smoothOffset += previousRenderPos - newPredictedPos`; clamp its magnitude to
   a cap (e.g. 200px) so a huge correction — respawn, wreck — snaps instead of
   sliding across the screen.

**Render (per frame):** `renderState.position = predictedPosition + smoothOffset`,
then decay `smoothOffset *= SMOOTH_DECAY` (≈0.80 per frame) toward zero. Heading
follows the predicted heading directly (rotational corrections read as far less
jarring than positional ones).

### 5. Wiring into `NetworkSource` (`src/game/race/raceSource.ts`)

`NetworkSource` keeps interpolating **other** cars unchanged, but the local car
is now driven by the predictor.

- Construction: build a `LocalPredictor` seeded from the skeleton's local car.
- Input send: today `sendInput(cmd)` fire-and-forgets. Change so the source
  owns the seq counter — a new/renamed method records the command for this
  frame, assigns `seq`, sends `{ t: 'input', command, seq }`, and hands the
  command to `predictor.predict(...)`.
- `ingest(nowMs, deltaMs, command)` gains the frame's `command`:
  1. `predictor.predict(command, deltaMs)`.
  2. Process buffered snapshots: on each new one, `predictor.reconcile(localCar,
     msg.acks[youId])`.
  3. Interpolate every car **except** `youId` into the skeleton (existing loop,
     now skipping the local car).
  4. Overwrite `skeleton.cars[local].state` with `predictor.renderState`, and
     copy predicted `turbo`/`turboDepleted` for the boost HUD.
- `acks` must ride alongside the buffered snapshot so reconciliation can read
  the ack for the snapshot it is adopting. Buffer entries become
  `{ snap, acks }` (or a parallel array); the newest entry's `acks[youId]` is
  used when adopting that snapshot's authoritative state.

The interpolation clock, buffer cap, starve/catch-up handling, and event
draining from Fix A all stay as-is.

### 6. Scene wiring (`src/game/scenes/RaceScene.ts`)

The network branch of `update()` currently does:

```
sendInput(buildPlayerCommand())
ingest(now, delta)
```

Change to build the command once, then pass it through the source so it is both
sent and predicted with the same object and the same frame delta:

```
const command = buildPlayerCommand()
this.netSource!.sendLocalInput(command)   // assigns seq, sends, predicts
this.netSource!.ingest(this.time.now, delta, command)
```

(Exact method split — one call vs. two — is an implementation detail; the
requirement is that the command sent to the server and the command predicted
locally are identical and paired with the same `delta`.) Everything else in the
scene (HUD, camera, event handling) already reads `netSource.state` and needs no
change — the local car simply now holds predicted values.

### 7. Known approximation (documented, intentional)

The server samples the **latest** command once per 30Hz tick and integrates it
over the whole 33ms, while the client integrated its per-frame commands over
~16ms sub-steps. The two integrations differ slightly, so the predicted car is
never a byte-perfect match to the server. This is inherent to a sampling server
and is exactly what continuous reconciliation (30×/sec) plus position smoothing
absorb. We accept it rather than moving the server to per-input stepping.

## Files touched

| File | Change |
|------|--------|
| `src/core/race/carMovement.ts` *(new)* | `stepCarMovement` + moved `applyOffTrackDrag`, `resolveBarrierCollisions`, `updateStuckRescue` |
| `src/core/race/stepRace.ts` | Call `stepCarMovement` from the per-car loop (behavior-preserving) |
| `src/core/net/protocol.ts` | `seq` on `input`; `acks` on `snapshot` |
| `server/raceHost.ts` | Track `lastSeq` per player; emit `acks` each tick |
| `server/index.ts` | Validate + forward `msg.seq` to `setInput` |
| `src/game/race/localPredictor.ts` *(new)* | Predict / reconcile / smooth the local car |
| `src/game/race/raceSource.ts` | Own seq counter; predict local car; interpolate others; buffer `acks` |
| `src/game/scenes/RaceScene.ts` | Pass the frame command into the source |
| `tests/` | Movement-parity, predictor reconciliation/smoothing, protocol/snapshot fixtures |

## Testing (pure/unit where possible)

- **Movement parity:** stepping a car through the new `stepCarMovement` yields
  identical state to a reference run of the pre-refactor inline block (guard
  against extraction drift). In practice: the full existing `stepRace` suite
  passing unchanged is the primary parity guarantee; add one focused test that
  `stepCarMovement` moves a car under throttle and applies off-track drag.
- **Predictor reconciliation:** after `predict`-ing several inputs, a
  `reconcile` that acks a subset drops exactly the acked inputs and replays the
  rest; predicted position after replay reflects only unacked inputs.
- **Predictor smoothing:** a reconcile that moves the authoritative position by
  a small delta does not snap `renderState` (offset absorbs it) and the offset
  decays toward zero over subsequent frames; a delta beyond the clamp snaps.
- **Server acks:** `RaceHost` emits `acks[playerId]` equal to the newest seq
  passed to `setInput` before the tick.
- **Protocol/fixtures:** existing snapshot/protocol tests updated for the new
  `acks` field and `seq`.
- UI feel (RaceScene) is browser-tested manually, not unit-tested.

## Verification

- `npm test`, `npm run build`, `npm run server:check`, `git diff --check`.
- Browser smoke (two tabs + an AI): your own car steers/accelerates with no
  perceptible delay; other cars stay smooth; ramming a rival produces at most a
  brief smoothed correction, not a rubber-band; wrecking/respawn snaps cleanly;
  weapons and lap/standings still behave. Confirm the existing single-player
  race is visually unchanged (shared-movement refactor did not alter feel).
