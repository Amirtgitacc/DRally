# Multiplayer Phase 3 — Networked Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the race on the authoritative Node server (`stepRace` at 30 ticks/sec, snapshot broadcast) and render it on clients as interpolated snapshots ~100 ms behind, so two browser tabs finish a full race together and see final standings.

**Architecture:** The server builds a `RaceEnv` from the room's track, builds career-independent `CarSetup[]` from lobby players, and steps `stepRace` at a fixed 30 Hz, broadcasting a trimmed `RaceSnapshot` + that tick's `SimEvent[]` each tick. Clients stop calling `stepRace`; a `NetworkSource` buffers snapshots, interpolates each car's `CarState` at `renderTime = latestServerTime − 100 ms`, and writes the result into `this.sim` so the existing `RaceScene` render/HUD/camera/VFX code runs unchanged. `RaceScene` gains a `mode: 'career' | 'network'` seam that bypasses single-player lifecycle (career/offer/results/pause) in network mode, and a configurable local car id replacing the hardcoded `'player'` / `cars[0]` assumptions.

**Tech Stack:** TypeScript (strict), Phaser 3, Vite, Vitest, Node + `ws` (run via `tsx`).

## Global Constraints

- Career state is never read or written by multiplayer: no `saveCareer`/`loadCareer`/`getCurrentOffer`/`setCurrentOffer`/career-mutation calls on the network path. Only `deathrally-mp-name`/`deathrally-mp-car` localStorage keys are permitted (Phase 2 rule).
- `src/core/` stays Phaser-free and JSON-serializable. `stepRace` determinism contract holds: same seed + same command sequence ⇒ identical state and events.
- Single-player behavior must remain byte-identical. `mode` defaults to `'career'`; `raceEndMode` defaults to `'single-player'`; local car id defaults to `'player'`. The determinism tests and single-player browser smoke are the regression guard.
- Preserve `__step`, `__autoPilot`, `__getRace`, `__raceSummary`, seed output, and track-selection debug hooks in `RaceScene`.
- Server owns gameplay randomness; clients receive cosmetic-only data. `RaceSnapshot` must NOT contain `rngState` or AI internals (`CarAiSim.spec`/`tuning`).
- Fixed simulation timestep on the server is `1000 / 30` ms, passed to `stepRace` every tick regardless of real timer jitter.
- MP presets: any `CAR_CATALOG` car at stock stats; no career upgrades, no persistent damage.
- Every MP screen is keyboard navigable with a visible route back; respect `reducedShake`/`reducedFlash` for any new effect.

---

## Task 1: `RaceSnapshot` + protocol messages

**Files:**
- Create: `src/core/net/snapshot.ts`
- Modify: `src/core/net/protocol.ts`
- Test: `tests/net/snapshot.test.ts`

**Interfaces:**
- Consumes: `RaceState`, `CarSim`, `BulletSim`, `MineSim`, `PickupSim`, `RacePhase` from `src/core/race/raceState.ts`; `CarState`, `CarInput` from `src/core/vehicle/carPhysics.ts`; `RaceProgress` from `src/core/race/progress.ts`; `PlayerCommand` from `src/core/race/stepRace.ts`; `SimEvent` from `src/core/race/simEvents.ts`.
- Produces:
  - `interface CarSnapshot { id: string; isPlayer: boolean; state: CarState; damage: number; wrecked: boolean; finishedAt: number | null; turbo: number; ammo: number; mines: number; progress: RaceProgress; lapTimes: number[]; lastInput: CarInput; lastTurboActive: boolean }`
  - `interface RaceSnapshot { simTimeMs: number; phase: RacePhase; countdownAnnounced: number; raceStartAt: number; cars: CarSnapshot[]; bullets: BulletSim[]; mines: MineSim[]; pickups: PickupSim[]; placementOrder: string[] }`
  - `function toRaceSnapshot(state: RaceState): RaceSnapshot`
  - `interface RaceCarInfo { id: string; name: string; color: number; chassisId: string; isAi: boolean }`
  - `interface RaceStanding { id: string; name: string; place: number; finishedAt: number | null; wrecked: boolean; lapTimes: number[] }`
  - Extended `ClientMsg` with `{ t: 'start' }`, `{ t: 'input'; command: PlayerCommand }`, `{ t: 'rematch' }`.
  - Extended `ServerMsg` with `{ t: 'raceStart'; seed: number; trackId: string; laps: number; roster: RaceCarInfo[]; youId: string }`, `{ t: 'snapshot'; snap: RaceSnapshot; events: SimEvent[] }`, `{ t: 'raceEnd'; standings: RaceStanding[] }`.
  - `export type RaceStartPayload = Omit<Extract<ServerMsg, { t: 'raceStart' }>, 't'>` — the scene-handoff shape consumed by Tasks 9 & 11.

- [ ] **Step 1: Write the failing test**

```ts
// tests/net/snapshot.test.ts
import { describe, it, expect } from 'vitest'
import { createRaceState, type RaceEnv, type CarSetup } from '../../src/core/race/raceState'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture' // see note below

function twoCarState() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
    { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
  ]
  return { state: createRaceState(env, setups, 1234), env }
}

describe('toRaceSnapshot', () => {
  it('captures per-car render + standings fields', () => {
    const { state } = twoCarState()
    const snap = toRaceSnapshot(state)
    expect(snap.cars).toHaveLength(2)
    expect(snap.cars[0].id).toBe('a')
    expect(snap.cars[0].state.x).toBe(state.cars[0].state.x)
    expect(snap.phase).toBe(state.phase)
    expect(snap.placementOrder).toEqual(state.placementOrder)
  })

  it('survives a JSON round-trip unchanged', () => {
    const { state } = twoCarState()
    const snap = toRaceSnapshot(state)
    const round = JSON.parse(JSON.stringify(snap))
    expect(round).toEqual(snap)
  })

  it('excludes rngState and AI internals (cosmetic-only contract)', () => {
    const { state } = twoCarState()
    const json = JSON.stringify(toRaceSnapshot(state))
    expect(json).not.toContain('rngState')
    expect(json).not.toContain('tuning')
    expect(json).not.toContain('speedScale')
  })
})
```

Note: if `tests/helpers/raceEnvFixture.ts` does not exist, create a minimal one that builds a small closed track env via `buildRaceEnv` (Task 4) — but Task 1 runs first, so for Task 1 build the fixture inline using the existing pure geometry helpers (`catmullRomClosed`, `buildGates`, `buildRacingLine`, `closedPolylineLength`, `offsetClosedPolyline`, `spacedPointsAlong`) with a simple 4-point square of controls. Copy the env-field shape from `RaceScene.create()` lines 248–261. Keep `weaponsEnabled: false` to avoid pickups/weapons noise.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- snapshot`
Expected: FAIL — `toRaceSnapshot` is not defined / module not found.

- [ ] **Step 3: Implement `snapshot.ts`**

```ts
// src/core/net/snapshot.ts
import type { RaceState, BulletSim, MineSim, PickupSim, RacePhase } from '../race/raceState'
import type { CarState, CarInput } from '../vehicle/carPhysics'
import type { RaceProgress } from '../race/progress'

export interface CarSnapshot {
  id: string
  isPlayer: boolean
  state: CarState
  damage: number
  wrecked: boolean
  finishedAt: number | null
  turbo: number
  ammo: number
  mines: number
  progress: RaceProgress
  lapTimes: number[]
  lastInput: CarInput
  lastTurboActive: boolean
}

export interface RaceSnapshot {
  simTimeMs: number
  phase: RacePhase
  countdownAnnounced: number
  raceStartAt: number
  cars: CarSnapshot[]
  bullets: BulletSim[]
  mines: MineSim[]
  pickups: PickupSim[]
  placementOrder: string[]
}

/** Trimmed, serializable projection of RaceState. Excludes rngState + AI internals. */
export function toRaceSnapshot(state: RaceState): RaceSnapshot {
  return {
    simTimeMs: state.simTimeMs,
    phase: state.phase,
    countdownAnnounced: state.countdownAnnounced,
    raceStartAt: state.raceStartAt,
    cars: state.cars.map((c) => ({
      id: c.id,
      isPlayer: c.isPlayer,
      state: { ...c.state },
      damage: c.damage,
      wrecked: c.wrecked,
      finishedAt: c.finishedAt,
      turbo: c.turbo,
      ammo: c.ammo,
      mines: c.mines,
      progress: { ...c.progress },
      lapTimes: [...c.lapTimes],
      lastInput: { ...c.lastInput },
      lastTurboActive: c.lastTurboActive,
    })),
    bullets: state.bullets.map((b) => ({ ...b })),
    mines: state.mines.map((m) => ({ ...m })),
    pickups: state.pickups.map((p) => ({ ...p })),
    placementOrder: [...state.placementOrder],
  }
}
```

- [ ] **Step 4: Extend `protocol.ts`**

Add the type-only imports at the top and the new members. `protocol.ts` currently has no imports; add:

```ts
import type { PlayerCommand } from '../race/stepRace'
import type { SimEvent } from '../race/simEvents'
import type { RaceSnapshot } from './snapshot'

export interface RaceCarInfo {
  id: string
  name: string
  /** livery tint applied over the shared car texture */
  color: number
  /** CAR_CATALOG id → texture key `car-top-${chassisId}` */
  chassisId: string
  /** always false in Phase 3 (AI grid fill is deferred) */
  isAi: boolean
}

export interface RaceStanding {
  id: string
  name: string
  place: number
  finishedAt: number | null
  wrecked: boolean
  lapTimes: number[]
}
```

Extend the unions:

```ts
export type ClientMsg =
  | { t: 'create'; name: string; carId: string; trackId: string }
  | { t: 'join'; code: string; name: string; carId: string }
  | { t: 'setCar'; carId: string }
  | { t: 'setTrack'; trackId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'leave' }
  | { t: 'start' }
  | { t: 'input'; command: PlayerCommand }
  | { t: 'rematch' }

export type ServerMsg =
  | { t: 'joined'; youId: string; lobby: LobbySnapshot }
  | { t: 'lobby'; lobby: LobbySnapshot }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'raceStart'; seed: number; trackId: string; laps: number; roster: RaceCarInfo[]; youId: string }
  | { t: 'snapshot'; snap: RaceSnapshot; events: SimEvent[] }
  | { t: 'raceEnd'; standings: RaceStanding[] }
```

- [ ] **Step 5: Run tests + build to verify pass**

Run: `npm test -- snapshot && npm run server:check`
Expected: PASS (3 tests); `server:check` clean (protocol types compile server-side).

- [ ] **Step 6: Commit**

```bash
git add src/core/net/snapshot.ts src/core/net/protocol.ts tests/net/snapshot.test.ts tests/helpers/raceEnvFixture.ts
git commit -m "feat(net): RaceSnapshot projection + phase-3 protocol messages"
```

---

## Task 2: `stepRace` accepts per-car commands

**Files:**
- Modify: `src/core/race/stepRace.ts:51` (signature + the player-input block 82–102)
- Modify: `src/game/scenes/RaceScene.ts:284` (call site)
- Test: `tests/race/stepRaceCommands.test.ts`
- Modify (if present): any existing `stepRace` test that passes a single `command` — update to the new signature.

**Interfaces:**
- Consumes: `PlayerCommand`, `IDLE_COMMAND` (existing).
- Produces:
  - `type CommandSet = Record<string, PlayerCommand>`
  - New signature: `function stepRace(state: RaceState, env: RaceEnv, commands: CommandSet, dtMs: number): SimEvent[]`
  - Each `isPlayer` car with `finishedAt === null` and no autopilot drives from `commands[car.id] ?? IDLE_COMMAND`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/race/stepRaceCommands.test.ts
import { describe, it, expect } from 'vitest'
import { stepRace, type CommandSet } from '../../src/core/race/stepRace'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'

const FIXED = 1000 / 30

function twoHumans() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
    { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null },
  ]
  return { env, setups }
}

const throttle = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }
const idle = { input: { throttle: 0, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }

describe('stepRace CommandSet', () => {
  it('drives each human car from its own command', () => {
    const { env, setups } = twoHumans()
    const state = createRaceState(env, setups, 7)
    const cmds: CommandSet = { a: throttle, b: idle }
    for (let i = 0; i < 200; i++) stepRace(state, env, cmds, FIXED) // past countdown
    const a = state.cars.find((c) => c.id === 'a')!
    const b = state.cars.find((c) => c.id === 'b')!
    expect(Math.hypot(a.state.vx, a.state.vy)).toBeGreaterThan(Math.hypot(b.state.vx, b.state.vy))
  })

  it('is deterministic for the same CommandSet sequence + seed', () => {
    const run = () => {
      const { env, setups } = twoHumans()
      const state = createRaceState(env, setups, 7)
      const cmds: CommandSet = { a: throttle, b: throttle }
      for (let i = 0; i < 200; i++) stepRace(state, env, cmds, FIXED)
      return JSON.stringify(state)
    }
    expect(run()).toEqual(run())
  })

  it('single-player: { player } path matches a lone car', () => {
    const env = buildRaceEnvFixture()
    const setups: CarSetup[] = [{ id: 'player', isPlayer: true, mass: 1000, damage: 0, ammo: 30, mines: 2, armorTier: 0, ai: null }]
    const state = createRaceState(env, setups, 42)
    for (let i = 0; i < 200; i++) stepRace(state, env, { player: throttle }, FIXED)
    expect(state.cars[0].state.x).not.toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- stepRaceCommands`
Expected: FAIL — `stepRace` current signature takes one `command`; `CommandSet` not exported.

- [ ] **Step 3: Change the signature + input resolution**

In `src/core/race/stepRace.ts`:

```ts
export type CommandSet = Record<string, PlayerCommand>

export function stepRace(state: RaceState, env: RaceEnv, commands: CommandSet, dtMs: number): SimEvent[] {
```

Replace the human-input branch (current lines 94–101, the `else` under `if (state.autoPilot && car.ai)`) so it resolves this car's command:

```ts
} else {
  const cmd = commands[car.id] ?? IDLE_COMMAND
  input = cmd.input
  wantsFire = cmd.fire
  wantsTurbo = cmd.turbo
  if (cmd.dropMine && state.phase === 'racing' && env.weaponsEnabled) {
    tryDropMine(state, car, events)
  }
}
```

Everything else in the car loop is unchanged (autopilot branch, AI branch).

- [ ] **Step 4: Update the single-player call site**

`src/game/scenes/RaceScene.ts:284` — change:

```ts
const events = stepRace(this.sim, this.env, { [this.localCarId]: command }, this.clock.stepMs)
```

(`this.localCarId` is introduced in Task 10 and defaults to `'player'`. Until Task 10 lands, use the literal `{ player: command }`; Task 10 swaps it to `this.localCarId`.)

Update any existing `stepRace(...)` test that passed a bare `command` to pass `{ player: command }`.

- [ ] **Step 5: Run tests + full suite**

Run: `npm test -- stepRaceCommands && npm test`
Expected: PASS (3 new tests); full suite green (determinism/serialization tests still pass under the new signature).

- [ ] **Step 6: Commit**

```bash
git add src/core/race/stepRace.ts src/game/scenes/RaceScene.ts tests/
git commit -m "feat(core): stepRace resolves a command per human car (CommandSet)"
```

---

## Task 3: Race-end policy (`all-humans` mode)

**Files:**
- Modify: `src/core/race/raceState.ts:60-73` (`RaceEnv` gains `raceEndMode`)
- Modify: `src/core/race/simEvents.ts:22` (`race-over` reason union)
- Modify: `src/core/race/stepRace.ts` (`checkGateCrossing` finish branch 186–193; `checkAllRivalsDone` 330–346)
- Test: `tests/race/raceEndPolicy.test.ts`

**Interfaces:**
- Consumes: `RaceEnv`, `RaceState`, `SimEvent`.
- Produces:
  - `RaceEnv.raceEndMode: 'single-player' | 'all-humans'`
  - New `race-over` reason literal `'all-humans-done'`.
  - `all-humans` end rule: race ends when every `isPlayer` car has `finishedAt !== null || wrecked`, plus a 3000 ms grace, or when `simTimeMs` exceeds `raceStartAt + MAX_RACE_MS` (10 minutes) as a backstop.

- [ ] **Step 1: Write the failing test**

```ts
// tests/race/raceEndPolicy.test.ts
import { describe, it, expect } from 'vitest'
import { stepRace, type CommandSet } from '../../src/core/race/stepRace'
import { createRaceState, type CarSetup, type RaceEnv } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'

const FIXED = 1000 / 30
const idle: CommandSet = {}

function race(mode: 'single-player' | 'all-humans') {
  const env: RaceEnv = { ...buildRaceEnvFixture(), raceEndMode: mode }
  const setups: CarSetup[] = [
    { id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null },
    { id: 'b', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null },
  ]
  return { env, state: createRaceState(env, setups, 1) }
}

describe('race-end policy', () => {
  it('all-humans: one human finishing does NOT end the race', () => {
    const { env, state } = race('all-humans')
    // drive past countdown, then force car a finished
    for (let i = 0; i < 100; i++) stepRace(state, env, idle, FIXED)
    state.cars[0].finishedAt = state.simTimeMs
    const events = stepRace(state, env, idle, FIXED)
    expect(events.some((e) => e.type === 'race-over')).toBe(false)
    expect(state.phase).not.toBe('finished')
  })

  it('all-humans: ends after all humans done + grace', () => {
    const { env, state } = race('all-humans')
    for (let i = 0; i < 100; i++) stepRace(state, env, idle, FIXED)
    state.cars[0].finishedAt = state.simTimeMs
    state.cars[1].wrecked = true
    let over = false
    for (let i = 0; i < 120 && !over; i++) {
      const events = stepRace(state, env, idle, FIXED)
      over = events.some((e) => e.type === 'race-over' && e.reason === 'all-humans-done')
    }
    expect(over).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- raceEndPolicy`
Expected: FAIL — `raceEndMode` not on `RaceEnv`; `'all-humans-done'` not a valid reason.

- [ ] **Step 3: Add `raceEndMode` and the new reason**

In `raceState.ts` `RaceEnv`, add:

```ts
  /** 'single-player' (default) ends the race when the sole human finishes;
   *  'all-humans' ends only when every human car is finished or wrecked. */
  raceEndMode: 'single-player' | 'all-humans'
```

In `simEvents.ts`, extend the reason union:

```ts
  | { type: 'race-over'; reason: 'player-finished' | 'player-wrecked' | 'rivals-done' | 'all-humans-done' }
```

- [ ] **Step 4: Branch the end logic in `stepRace.ts`**

Add a constant near the top: `const MAX_RACE_MS = 10 * 60 * 1000`.

In `checkGateCrossing`, guard the phase flip so it only auto-finishes in single-player:

```ts
if (result.finished && car.finishedAt === null) {
  car.finishedAt = now
  events.push({ type: 'car-finished', carId: car.id })
  if (car.isPlayer && env.raceEndMode === 'single-player') {
    state.phase = 'finished'
    events.push({ type: 'race-over', reason: 'player-finished' })
  }
}
```

Add an all-humans end check. Extend `checkAllRivalsDone` to early-return in `all-humans` mode and add a sibling function called from the end of `stepRace` (right after `checkAllRivalsDone(state, events)`):

```ts
function checkAllHumansDone(state: RaceState, env: RaceEnv, events: SimEvent[]): void {
  if (env.raceEndMode !== 'all-humans' || state.phase !== 'racing') return
  const now = state.simTimeMs
  const humans = state.cars.filter((c) => c.isPlayer)
  const allDone = humans.length > 0 && humans.every((c) => c.finishedAt !== null || c.wrecked)
  const timedOut = now >= state.raceStartAt + MAX_RACE_MS
  if (!allDone && !timedOut) {
    state.allRivalsDoneAt = null
    return
  }
  if (state.allRivalsDoneAt === null) state.allRivalsDoneAt = now
  if (timedOut || now >= state.allRivalsDoneAt + 3000) {
    state.phase = 'finished'
    events.push({ type: 'race-over', reason: 'all-humans-done' })
  }
}
```

Guard `checkAllRivalsDone` so it does nothing in `all-humans` mode: add `if (env.raceEndMode === 'all-humans') return` at its top (it takes `env` — update its signature to `(state, env, events)` and the call site to pass `env`). Call `checkAllHumansDone(state, env, events)` immediately after it in `stepRace`.

- [ ] **Step 5: Run tests + full suite**

Run: `npm test -- raceEndPolicy && npm test`
Expected: PASS (2 new tests); full suite green (single-player end behavior unchanged because default mode is `single-player`).

- [ ] **Step 6: Commit**

```bash
git add src/core/race/raceState.ts src/core/race/simEvents.ts src/core/race/stepRace.ts tests/race/raceEndPolicy.test.ts
git commit -m "feat(core): race-end policy — all-humans mode ends only when every human is done"
```

Note: every `RaceEnv` literal now needs `raceEndMode`. Update the one in `RaceScene.create()` (248–261) to `raceEndMode: 'single-player'` and `buildRaceEnvFixture` to default `'single-player'`. The build (`tsc`) will flag any missed literal.

---

## Task 4: Pure `RaceEnv` builder

**Files:**
- Create: `src/core/race/raceEnvBuilder.ts`
- Modify: `src/game/scenes/RaceScene.ts:240-261` (geometry + env build) and `1248-1254` (barrier loop)
- Modify: `tests/helpers/raceEnvFixture.ts` (delegate to `buildRaceEnv`)
- Test: `tests/race/raceEnvBuilder.test.ts`

**Interfaces:**
- Consumes: `TrackDef` from `src/data/tracks/testCircuit.ts`; pure geometry helpers `catmullRomClosed`, `buildGates`, `closedPolylineLength`, `offsetClosedPolyline`, `spacedPointsAlong` from `src/core/track/geometry.ts`; `buildRacingLine` from `src/core/track/racingLine.ts`; `CarPhysicsSpec`; `RaceEnv`.
- Produces:
  - `function computeBarriers(centerline: Vec2[], halfWidth: number, shoulder: number): Vec2[]`
  - `interface BuildEnvOptions { playerSpec: CarPhysicsSpec; weaponsEnabled: boolean; hasPlating: boolean; hasOverTurbo: boolean; raceEndMode: 'single-player' | 'all-humans' }`
  - `function buildRaceEnv(track: TrackDef, opts: BuildEnvOptions): RaceEnv`

- [ ] **Step 1: Write the failing test**

```ts
// tests/race/raceEnvBuilder.test.ts
import { describe, it, expect } from 'vitest'
import { buildRaceEnv, computeBarriers } from '../../src/core/race/raceEnvBuilder'
import { TEST_CIRCUIT } from '../../src/data/tracks/testCircuit'
import { effectiveCarSpec } from '../../src/core/vehicle/carSpec'
import { carById } from '../../src/data/cars'

const spec = effectiveCarSpec(carById('jackal'), { armor: 0, engine: 0, tyres: 0, weapon: 0 } as any)

describe('buildRaceEnv', () => {
  it('produces gates, centerline, barriers and copies track tuning', () => {
    const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    expect(env.gates).toHaveLength(TEST_CIRCUIT.gateCount)
    expect(env.laps).toBe(TEST_CIRCUIT.laps)
    expect(env.trackWidth).toBe(TEST_CIRCUIT.width)
    expect(env.raceEndMode).toBe('all-humans')
    expect(env.barriers.length).toBeGreaterThan(0)
  })

  it('is deterministic — same track ⇒ identical barriers', () => {
    const a = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    const b = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
    expect(a.barriers).toEqual(b.barriers)
  })
})
```

(Verify the correct upgrades shape for `effectiveCarSpec` against `src/core/vehicle/carSpec.ts` when implementing; adjust the `spec` fixture to the real type rather than `as any` if the signature is simple.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- raceEnvBuilder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

```ts
// src/core/race/raceEnvBuilder.ts
import type { TrackDef } from '../../data/tracks/testCircuit'
import type { CarPhysicsSpec } from '../vehicle/carPhysics'
import type { Vec2 } from '../track/geometry'
import type { RaceEnv } from './raceState'
import { buildGates, catmullRomClosed, closedPolylineLength, offsetClosedPolyline, spacedPointsAlong } from '../track/geometry'
import { buildRacingLine } from '../track/racingLine'

const CAR_RADIUS = 34 // matches RaceScene CAR_RADIUS used for racing-line inset

/** Tire-wall positions — mirrors RaceScene.buildWorld 1248–1254, minus the Phaser image. */
export function computeBarriers(centerline: Vec2[], halfWidth: number, shoulder: number): Vec2[] {
  const shoulderHalf = halfWidth + shoulder
  const barriers: Vec2[] = []
  for (const side of [1, -1]) {
    const wallLine = offsetClosedPolyline(centerline, side * (shoulderHalf + 24))
    for (const p of spacedPointsAlong(wallLine, 54)) barriers.push(p)
  }
  return barriers
}

export interface BuildEnvOptions {
  playerSpec: CarPhysicsSpec
  weaponsEnabled: boolean
  hasPlating: boolean
  hasOverTurbo: boolean
  raceEndMode: 'single-player' | 'all-humans'
}

export function buildRaceEnv(track: TrackDef, opts: BuildEnvOptions): RaceEnv {
  const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
  const racingLine = buildRacingLine(centerline, { maxOffset: track.width / 2 - CAR_RADIUS - 8 })
  const gates = buildGates(centerline, track.gateCount, track.width / 2 + track.shoulder)
  const gateSpacing = closedPolylineLength(centerline) / track.gateCount
  const barriers = computeBarriers(centerline, track.width / 2, track.shoulder)
  return {
    centerline, racingLine, gates, barriers, gateSpacing,
    trackWidth: track.width, laps: track.laps, tier: track.tier,
    playerSpec: opts.playerSpec, weaponsEnabled: opts.weaponsEnabled,
    hasPlating: opts.hasPlating, hasOverTurbo: opts.hasOverTurbo,
    raceEndMode: opts.raceEndMode,
  }
}
```

- [ ] **Step 4: Use the builder in RaceScene (single-player parity)**

Replace `RaceScene.create()` lines 240–261 so geometry + env come from `buildRaceEnv`, keeping the scene's `this.centerline/racingLine/gates/gateSpacing` fields populated from the returned env (the render code and `buildWorld` read them):

```ts
this.env = buildRaceEnv(this.track, {
  playerSpec: this.playerSpec,
  weaponsEnabled: this.career.profile.weaponsEnabled,
  hasPlating: this.hasPlating,
  hasOverTurbo: this.hasOverTurbo,
  raceEndMode: 'single-player',
})
this.centerline = this.env.centerline
this.racingLine = this.env.racingLine
this.gates = this.env.gates
this.gateSpacing = this.env.gateSpacing
this.buildWorld()
this.env.barriers = this.barriers // keep the scene's authored barrier list identity
```

In `buildWorld` (1248–1254), the barrier loop must still create the tire-wall images. Replace the push with a call to the shared computer so positions match exactly:

```ts
for (const p of computeBarriers(this.centerline, halfW, this.track.shoulder)) {
  this.barriers.push(p)
  this.add.image(p.x, p.y, 'tire-wall').setDepth(3)
}
```

(Import `computeBarriers` in RaceScene.) This keeps a single source of truth for wall positions; the previous inline `offsetClosedPolyline`/`spacedPointsAlong` loop is removed.

- [ ] **Step 5: Run tests + build + single-player smoke**

Run: `npm test -- raceEnvBuilder && npm test && npm run build`
Expected: PASS; build clean. Browser smoke: `npm run dev`, run a single-player race — cars, walls, gates, and pickups render exactly as before (this is the SP parity check for the extraction).

- [ ] **Step 6: Commit**

```bash
git add src/core/race/raceEnvBuilder.ts src/game/scenes/RaceScene.ts tests/race/raceEnvBuilder.test.ts tests/helpers/raceEnvFixture.ts
git commit -m "refactor(core): extract pure buildRaceEnv + computeBarriers; RaceScene reuses them"
```

---

## Task 5: Room lifecycle reducers

**Files:**
- Modify: `src/core/net/roomState.ts` (`RoomState` gains `phase`; new reducers)
- Test: `tests/net/roomLifecycle.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `allReady`, `RoomResult`.
- Produces:
  - `RoomState.phase: 'lobby' | 'racing' | 'results'` (existing `createRoom` sets `'lobby'`).
  - `function startRace(room: RoomState, playerId: string): RoomResult` — `NOT_HOST` if not host; returns error `MALFORMED` if not all-ready or fewer than 2 players; else `{ ok: true, room: { ...room, phase: 'racing' } }`.
  - `function endRace(room: RoomState): RoomState` — `{ ...room, phase: 'results' }`.
  - `function rematch(room: RoomState): RoomState` — `{ ...room, phase: 'lobby', players: players.map(ready=false) }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/net/roomLifecycle.test.ts
import { describe, it, expect } from 'vitest'
import { createRoom, setReady, joinRoom, startRace, endRace, rematch } from '../../src/core/net/roomState'

function room2() {
  let r = createRoom('TIGER-42', { id: 'h', name: 'Host', carId: 'jackal' }, 'test-circuit')
  r = joinRoom(r, { id: 'g', name: 'Guest', carId: 'jackal' }).room as any
  return r
}

describe('room lifecycle', () => {
  it('createRoom starts in lobby phase', () => {
    expect(createRoom('X-01', { id: 'h', name: 'H', carId: 'jackal' }, 'test-circuit').phase).toBe('lobby')
  })
  it('startRace requires host', () => {
    const r = room2()
    expect(startRace(r, 'g').ok).toBe(false)
  })
  it('startRace requires all ready and 2+ players', () => {
    let r = room2()
    expect(startRace(r, 'h').ok).toBe(false) // nobody ready
    r = setReady(setReady(r, 'h', true), 'g', true)
    const res = startRace(r, 'h')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.room.phase).toBe('racing')
  })
  it('rematch returns to lobby and clears ready', () => {
    let r = room2()
    r = setReady(setReady(r, 'h', true), 'g', true)
    r = (startRace(r, 'h') as any).room
    r = endRace(r)
    expect(r.phase).toBe('results')
    const back = rematch(r)
    expect(back.phase).toBe('lobby')
    expect(back.players.every((p) => !p.ready)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- roomLifecycle`
Expected: FAIL — `phase` not on `RoomState`; `startRace`/`endRace`/`rematch` not exported.

- [ ] **Step 3: Implement**

Add `phase` to `RoomState` and set it in `createRoom` (`phase: 'lobby'`). Preserve `phase` in `leaveRoom`/`setCar`/`setTrack`/`setReady` (they spread `...room`, so `phase` carries automatically — verify). Add:

```ts
export function startRace(room: RoomState, playerId: string): RoomResult {
  if (room.hostId !== playerId) return { ok: false, error: 'NOT_HOST' }
  if (room.players.length < 2 || !allReady(room)) return { ok: false, error: 'MALFORMED' }
  return { ok: true, room: { ...room, phase: 'racing' } }
}

export function endRace(room: RoomState): RoomState {
  return { ...room, phase: 'results' }
}

export function rematch(room: RoomState): RoomState {
  return { ...room, phase: 'lobby', players: room.players.map((p) => ({ ...p, ready: false })) }
}
```

`toSnapshot` does not need `phase` (the client learns racing via `raceStart`); leave `LobbySnapshot` unchanged.

- [ ] **Step 4: Run tests**

Run: `npm test -- roomLifecycle && npm test`
Expected: PASS (all lifecycle tests); full suite green (Phase 2 room tests still pass — `phase` is additive).

- [ ] **Step 5: Commit**

```bash
git add src/core/net/roomState.ts tests/net/roomLifecycle.test.ts
git commit -m "feat(net): room lifecycle reducers (start/end/rematch, phase field)"
```

---

## Task 6: Career-independent race setup builder

**Files:**
- Create: `server/raceSetup.ts`
- Test: `tests/net/raceSetup.test.ts`

**Interfaces:**
- Consumes: `LobbyPlayer` from `src/core/net/protocol.ts`; `CarSetup` from `src/core/race/raceState.ts`; `RaceCarInfo` from `src/core/net/protocol.ts`; `carById`/`CAR_CATALOG` from `src/data/cars.ts`.
- Produces:
  - `const MP_LIVERY_PALETTE: number[]` (4 distinct tints, one per grid slot).
  - `function buildNetworkRace(players: LobbyPlayer[], weaponsEnabled: boolean): { setups: CarSetup[]; roster: RaceCarInfo[] }` — one entry per player in join order (slot = index). Stock stats: `mass` from the car, `damage: 0`, `ammo: weaponsEnabled ? GUN.ammoMax : 0`, `mines: weaponsEnabled ? <stockMines> : 0`, `armorTier: 0`, `ai: null`, `isPlayer: true`. `roster[i].color = MP_LIVERY_PALETTE[i]`, `chassisId = player.carId`, `isAi: false`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/net/raceSetup.test.ts
import { describe, it, expect } from 'vitest'
import { buildNetworkRace } from '../../server/raceSetup'
import type { LobbyPlayer } from '../../src/core/net/protocol'

const players: LobbyPlayer[] = [
  { id: 'a', name: 'Ana', carId: 'jackal', ready: true },
  { id: 'b', name: 'Bo', carId: 'jackal', ready: true },
]

describe('buildNetworkRace', () => {
  it('one stock setup + roster entry per player, in join order', () => {
    const { setups, roster } = buildNetworkRace(players, true)
    expect(setups.map((s) => s.id)).toEqual(['a', 'b'])
    expect(setups.every((s) => s.isPlayer && s.ai === null && s.damage === 0 && s.armorTier === 0)).toBe(true)
    expect(roster[0].color).not.toBe(roster[1].color) // distinct liveries
    expect(roster.every((r) => !r.isAi)).toBe(true)
  })
  it('weapons off ⇒ zero ammo and mines', () => {
    const { setups } = buildNetworkRace(players, false)
    expect(setups.every((s) => s.ammo === 0 && s.mines === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- raceSetup`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/raceSetup.ts`**

Use `GUN.ammoMax` and the stock mine count from `src/data/weapons.ts` (check the exact export names when implementing — mirror how `RaceScene.buildCarSetups` reads them, e.g. `GUN.ammoMax`; for mines use the catalog/default stock value, not the career `this.career.mines`). Assign `mass` from `carById(player.carId).mass`.

```ts
// server/raceSetup.ts
import type { LobbyPlayer, RaceCarInfo } from '../src/core/net/protocol'
import type { CarSetup } from '../src/core/race/raceState'
import { carById } from '../src/data/cars'
import { GUN } from '../src/data/weapons'

export const MP_LIVERY_PALETTE = [0xff7a1a, 0x3aa0ff, 0x36d17a, 0xd94fd0]
const STOCK_MINES = 3

export function buildNetworkRace(players: LobbyPlayer[], weaponsEnabled: boolean): { setups: CarSetup[]; roster: RaceCarInfo[] } {
  const setups: CarSetup[] = []
  const roster: RaceCarInfo[] = []
  players.forEach((p, i) => {
    const car = carById(p.carId)
    setups.push({
      id: p.id, isPlayer: true, mass: car.mass, damage: 0,
      ammo: weaponsEnabled ? GUN.ammoMax : 0,
      mines: weaponsEnabled ? STOCK_MINES : 0,
      armorTier: 0, ai: null,
    })
    roster.push({ id: p.id, name: p.name, color: MP_LIVERY_PALETTE[i % MP_LIVERY_PALETTE.length], chassisId: p.carId, isAi: false })
  })
  return { setups, roster }
}
```

- [ ] **Step 4: Run tests + server:check**

Run: `npm test -- raceSetup && npm run server:check`
Expected: PASS; server-side typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/raceSetup.ts tests/net/raceSetup.test.ts
git commit -m "feat(server): career-independent network race setup builder"
```

---

## Task 7: Server race host + message routing

**Files:**
- Create: `server/raceHost.ts`
- Modify: `server/index.ts` (route `start`/`input`/`rematch`; hold per-room race host; broadcast helpers)
- Create: `scripts/mp-smoke.mjs` (scripted 2-player ws race smoke)

**Interfaces:**
- Consumes: `buildRaceEnv` (Task 4), `buildNetworkRace` (Task 6), `createRaceState`, `stepRace`/`CommandSet`, `toRaceSnapshot` (Task 1), `startRace`/`endRace`/`rematch` (Task 5), `trackById` from `src/data/tracks`, `RaceStanding`/`RaceCarInfo`/`ServerMsg`.
- Produces:
  - `class RaceHost` with `constructor(env, state, roster, seed, trackId, laps)`, `setInput(playerId, command)`, `start(onTick: (msg) => void, onEnd: (standings) => void)`, `stop()`. Steps at 30 Hz via `setInterval`, `dtMs = 1000/30`. On each tick: apply latest per-player commands, `stepRace`, emit `{ t: 'snapshot', snap, events }`; when `state.phase === 'finished'`, `stop()` and emit standings once.
  - `function computeStandings(state, roster): RaceStanding[]` — ordered by `placementOrder`; `place = index + 1`; `name` from roster.

- [ ] **Step 1: Implement `RaceHost` (with the standings helper)**

```ts
// server/raceHost.ts
import { createRaceState, type RaceEnv, type RaceState } from '../src/core/race/raceState'
import { stepRace, type CommandSet, type PlayerCommand } from '../src/core/race/stepRace'
import { toRaceSnapshot } from '../src/core/net/snapshot'
import type { RaceCarInfo, RaceStanding, ServerMsg } from '../src/core/net/protocol'

const TICK_MS = 1000 / 30

export function computeStandings(state: RaceState, roster: RaceCarInfo[]): RaceStanding[] {
  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name ?? id
  return state.placementOrder.map((id, i) => {
    const car = state.cars.find((c) => c.id === id)!
    return { id, name: nameOf(id), place: i + 1, finishedAt: car.finishedAt, wrecked: car.wrecked, lapTimes: [...car.lapTimes] }
  })
}

export class RaceHost {
  private commands: CommandSet = {}
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    readonly env: RaceEnv,
    private state: RaceState,
    readonly roster: RaceCarInfo[],
    readonly seed: number,
    readonly trackId: string,
    readonly laps: number,
  ) {}

  setInput(playerId: string, command: PlayerCommand): void {
    this.commands[playerId] = command
  }

  start(onTick: (msg: Extract<ServerMsg, { t: 'snapshot' }>) => void, onEnd: (standings: RaceStanding[]) => void): void {
    this.timer = setInterval(() => {
      const events = stepRace(this.state, this.env, this.commands, TICK_MS)
      onTick({ t: 'snapshot', snap: toRaceSnapshot(this.state), events })
      if (this.state.phase === 'finished') {
        this.stop()
        onEnd(computeStandings(this.state, this.roster))
      }
    }, TICK_MS)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
}

export function createRaceHost(env: RaceEnv, roster: RaceCarInfo[], setups: import('../src/core/race/raceState').CarSetup[], seed: number, trackId: string, laps: number): RaceHost {
  return new RaceHost(env, createRaceState(env, setups, seed), roster, seed, trackId, laps)
}
```

- [ ] **Step 2: Wire routing into `server/index.ts`**

Add a per-room host registry `const hosts = new Map<string, RaceHost>()`. Add a race seed source (`Math.floor(Math.random() * 2 ** 31)`). Add cases to the message switch:

```ts
case 'start': {
  if (!conn.code || !conn.playerId) return
  const room = store.get(conn.code)
  if (!room) return
  const res = startRace(room, conn.playerId)
  if (!res.ok) return fail(ws, res.error, res.error === 'NOT_HOST' ? 'Only the host can start' : 'Not everyone is ready')
  store.apply(conn.code, () => res.room)
  const track = trackById(room.trackId)
  const seed = Math.floor(Math.random() * 2 ** 31)
  const { setups, roster } = buildNetworkRace(room.players, /* weaponsEnabled */ true)
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
    },
  )
  return
}
case 'input': {
  if (!conn.code || !conn.playerId) return
  const host = hosts.get(conn.code)
  if (host && msg.command && typeof msg.command === 'object') host.setInput(conn.playerId, msg.command)
  return
}
case 'rematch': {
  if (!conn.code || !conn.playerId) return
  const host = hosts.get(conn.code)
  if (host) { host.stop(); hosts.delete(conn.code) }
  const next = store.apply(conn.code, (r) => rematch(r))
  if (next) broadcast(conn.code) // sends the lobby snapshot; clients return to LobbyScene
  return
}
```

Add `broadcastRaw(code, msg)` (like `broadcast` but sends an arbitrary `ServerMsg` to members).

`DEFAULT_PLAYER_SPEC` — the `RaceEnv.playerSpec` all human cars drive with (see the **Known limitation** below). Define one shared stock spec at module scope:

```ts
import { STARTER_CAR, carById } from '../src/data/cars'
import { effectiveCarSpec } from '../src/core/vehicle/carSpec'
// no-upgrade stock handling; confirm the upgrades key shape from carSpec.ts (mirror RaceScene's effectiveCarSpec call, line 219)
const DEFAULT_PLAYER_SPEC = effectiveCarSpec(carById(STARTER_CAR.id), { armor: 0, engine: 0, tyres: 0, weapon: 0 })
```

**Known limitation (documented, deferred):** `effectiveSpec` resolves `car.isPlayer ? env.playerSpec : car.ai!.spec`, so in `all-humans` mode every human car uses this one `DEFAULT_PLAYER_SPEC` for top speed / accel / grip. Car choice still varies `mass` (per `CarSetup.mass`, affecting collisions), but not handling. Per-car human handling (add `spec` to `CarSim`, fall back to `env.playerSpec` when unset — keeps single-player identical) is a follow-up, listed in the deferred section. This is acceptable for the Phase 3 milestone.

In `handleLeave`, also: if a leaving player empties the room, `hosts.get(code)?.stop(); hosts.delete(code)`.

- [ ] **Step 3: Add the scripted 2-player smoke**

```js
// scripts/mp-smoke.mjs — run against a live `npm run server`
import WebSocket from 'ws'
const URL = 'ws://localhost:8080'
const open = (ws) => new Promise((r) => ws.on('open', r))
const next = (ws) => new Promise((r) => ws.once('message', (d) => r(JSON.parse(String(d)))))

const host = new WebSocket(URL); await open(host)
host.send(JSON.stringify({ t: 'create', name: 'Host', carId: 'jackal', trackId: 'test-circuit' }))
const joined = await next(host) // { t:'joined', youId, lobby }
const code = joined.lobby.code

const guest = new WebSocket(URL); await open(guest)
guest.send(JSON.stringify({ t: 'join', code, name: 'Guest', carId: 'jackal' }))
await next(guest)

host.send(JSON.stringify({ t: 'ready', ready: true }))
guest.send(JSON.stringify({ t: 'ready', ready: true }))
await new Promise((r) => setTimeout(r, 200))

let snaps = 0, started = false
host.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'raceStart') started = true; if (m.t === 'snapshot') snaps++ })
host.send(JSON.stringify({ t: 'start' }))
await new Promise((r) => setTimeout(r, 1500))
console.log(JSON.stringify({ started, snaps, ok: started && snaps > 20 }))
process.exit(started && snaps > 20 ? 0 : 1)
```

- [ ] **Step 4: Verify**

Run: `npm run server:check` (typecheck) then, in one terminal `npm run server`, in another `node scripts/mp-smoke.mjs`.
Expected: `server:check` clean; smoke prints `{"started":true,"snaps":<45ish>,"ok":true}` and exits 0. Snapshots flow at ~30/sec for ~1.5 s.

- [ ] **Step 5: Commit**

```bash
git add server/raceHost.ts server/index.ts scripts/mp-smoke.mjs
git commit -m "feat(server): authoritative 30Hz race host + start/input/rematch routing"
```

---

## Task 8: Client snapshot interpolation (pure)

**Files:**
- Create: `src/game/race/interpolation.ts`
- Test: `tests/game/interpolation.test.ts` (pure math — testable without Phaser)

**Interfaces:**
- Consumes: `CarState` from `src/core/vehicle/carPhysics.ts`; `RaceSnapshot`, `CarSnapshot` from `src/core/net/snapshot.ts`.
- Produces:
  - `const INTERP_DELAY_MS = 100`
  - `function lerpCarState(a: CarState, b: CarState, t: number): CarState` — lerps `x,y,vx,vy,z,vz`; angle-lerps `heading` on the shortest arc.
  - `function bracket(buffer: RaceSnapshot[], renderTimeMs: number): { a: RaceSnapshot; b: RaceSnapshot; t: number } | null` — finds the two snapshots straddling `renderTimeMs` (by `simTimeMs`); clamps to ends; `null` if buffer empty.

- [ ] **Step 1: Write the failing test**

```ts
// tests/game/interpolation.test.ts
import { describe, it, expect } from 'vitest'
import { lerpCarState, bracket } from '../../src/game/race/interpolation'

const cs = (x: number, heading = 0) => ({ x, y: 0, heading, vx: 0, vy: 0, z: 0, vz: 0 })

describe('interpolation', () => {
  it('lerpCarState blends position at t', () => {
    expect(lerpCarState(cs(0), cs(10), 0.5).x).toBe(5)
  })
  it('lerpCarState takes the shortest heading arc across the ±pi seam', () => {
    const r = lerpCarState(cs(0, 3.0), cs(0, -3.0), 0.5).heading
    expect(Math.abs(r)).toBeGreaterThan(3.0) // wraps through pi, not through 0
  })
  it('bracket finds straddling snapshots and t', () => {
    const buf = [{ simTimeMs: 0 } as any, { simTimeMs: 33 } as any, { simTimeMs: 66 } as any]
    const r = bracket(buf, 50)!
    expect(r.a.simTimeMs).toBe(33)
    expect(r.b.simTimeMs).toBe(66)
    expect(r.t).toBeCloseTo((50 - 33) / (66 - 33))
  })
  it('bracket clamps before the first and after the last', () => {
    const buf = [{ simTimeMs: 10 } as any, { simTimeMs: 20 } as any]
    expect(bracket(buf, 0)!.t).toBe(0)
    expect(bracket(buf, 999)!.t).toBe(1)
    expect(bracket([], 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- interpolation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/game/race/interpolation.ts
import type { CarState } from '../../core/vehicle/carPhysics'
import type { RaceSnapshot } from '../../core/net/snapshot'

export const INTERP_DELAY_MS = 100

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

export function lerpCarState(a: CarState, b: CarState, t: number): CarState {
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
    heading: lerpAngle(a.heading, b.heading, t),
    vx: lerp(a.vx, b.vx, t), vy: lerp(a.vy, b.vy, t),
    z: lerp(a.z, b.z, t), vz: lerp(a.vz, b.vz, t),
  }
}

export function bracket(buffer: RaceSnapshot[], renderTimeMs: number): { a: RaceSnapshot; b: RaceSnapshot; t: number } | null {
  if (buffer.length === 0) return null
  if (renderTimeMs <= buffer[0].simTimeMs) return { a: buffer[0], b: buffer[0], t: 0 }
  const last = buffer[buffer.length - 1]
  if (renderTimeMs >= last.simTimeMs) return { a: last, b: last, t: 1 }
  for (let i = 0; i < buffer.length - 1; i++) {
    const a = buffer[i], b = buffer[i + 1]
    if (renderTimeMs >= a.simTimeMs && renderTimeMs <= b.simTimeMs) {
      const span = b.simTimeMs - a.simTimeMs
      return { a, b, t: span === 0 ? 0 : (renderTimeMs - a.simTimeMs) / span }
    }
  }
  return { a: last, b: last, t: 1 }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- interpolation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/race/interpolation.ts tests/game/interpolation.test.ts
git commit -m "feat(game): pure snapshot interpolation helpers (lerp + bracket)"
```

---

## Task 9: `RaceSource` — LocalSource + NetworkSource

**Files:**
- Create: `src/game/race/raceSource.ts`
- Test: `tests/game/networkSource.test.ts` (drives NetworkSource with fake messages — no Phaser)

**Interfaces:**
- Consumes: `NetClient` from `src/game/net/netClient.ts`; `RaceSnapshot` (Task 1); `bracket`, `lerpCarState`, `INTERP_DELAY_MS` (Task 8); `RaceState`, `createRaceState` (for the skeleton); `buildRaceEnv` (Task 4); `RaceCarInfo` (Task 1); `SimEvent`; `PlayerCommand`.
- Produces:
  - `interface RaceSource { readonly youId: string; ingest(nowMs: number, deltaMs: number): void; readonly state: RaceState; drainEvents(): SimEvent[]; sendInput?(cmd: PlayerCommand): void }`
  - `class NetworkSource` — subscribes to `snapshot`/`raceEnd`; keeps a bounded snapshot buffer (cap 30); on `ingest`, advances an internal `renderTimeMs` and writes interpolated `CarState` (plus discrete fields from the newer snapshot) into a persistent `RaceState` skeleton; queues each new snapshot's `events` for `drainEvents`; `sendInput` forwards `{ t: 'input', command }` (throttled to once per ingest). Exposes `onRaceEnd(cb)`.
  - `NetworkSource` is constructed from the `raceStart` payload (`seed`, `trackId`, `roster`, `youId`) + a `NetClient`; it builds `env` via `buildRaceEnv` and a skeleton `RaceState` via `createRaceState` with setups derived from `roster` (stock, `ai: null`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/game/networkSource.test.ts
import { describe, it, expect, vi } from 'vitest'
import { NetworkSource } from '../../src/game/race/raceSource'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import { buildRaceEnv } from '../../src/core/race/raceEnvBuilder'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { TEST_CIRCUIT } from '../../src/data/tracks/testCircuit'
import { effectiveCarSpec } from '../../src/core/vehicle/carSpec'
import { carById } from '../../src/data/cars'

// Minimal fake NetClient capturing handlers + sent messages.
function fakeNet() {
  const msgHandlers: any[] = []
  return {
    sent: [] as any[],
    onMessage: (fn: any) => msgHandlers.push(fn),
    onClose: () => {},
    offMessage: () => {}, offClose: () => {},
    send: function (m: any) { (this as any).sent.push(m) },
    emit: (m: any) => msgHandlers.forEach((h) => h(m)),
  }
}

const spec = effectiveCarSpec(carById('jackal'), { armor: 0, engine: 0, tyres: 0, weapon: 0 } as any)
const roster = [
  { id: 'a', name: 'Ana', color: 1, chassisId: 'jackal', isAi: false },
  { id: 'b', name: 'Bo', color: 2, chassisId: 'jackal', isAi: false },
]

function snapAt(simTimeMs: number, ax: number) {
  const env = buildRaceEnv(TEST_CIRCUIT, { playerSpec: spec, weaponsEnabled: false, hasPlating: false, hasOverTurbo: false, raceEndMode: 'all-humans' })
  const setups: CarSetup[] = roster.map((r) => ({ id: r.id, isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }))
  const s = createRaceState(env, setups, 1)
  s.simTimeMs = simTimeMs
  s.cars[0].state.x = ax
  return toRaceSnapshot(s)
}

describe('NetworkSource', () => {
  it('interpolates car A between two snapshots ~100ms behind', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [] })
    net.emit({ t: 'snapshot', snap: snapAt(100, 100), events: [] })
    net.emit({ t: 'snapshot', snap: snapAt(200, 200), events: [] })
    src.ingest(/* nowMs */ 0, /* delta */ 0) // renderTime = 200 - 100 = 100 → car A at x≈100
    const a = src.state.cars.find((c) => c.id === 'a')!
    expect(a.state.x).toBeGreaterThan(50)
    expect(a.state.x).toBeLessThanOrEqual(100)
  })

  it('drains each snapshot\'s events once', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [{ type: 'race-started' }] })
    src.ingest(0, 0)
    expect(src.drainEvents().some((e) => e.type === 'race-started')).toBe(true)
    expect(src.drainEvents()).toHaveLength(0)
  })

  it('sendInput forwards an input message', () => {
    const net = fakeNet()
    const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
    src.sendInput({ input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false })
    expect(net.sent.some((m) => m.t === 'input')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- networkSource`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `raceSource.ts`**

Implement `NetworkSource` per the interface. Key points: keep a persistent `state: RaceState` (the skeleton) and each `ingest` (a) advances `renderTimeMs` toward `latest.simTimeMs - INTERP_DELAY_MS`, (b) uses `bracket` + `lerpCarState` to set each car's `state`, (c) copies discrete fields (`damage, wrecked, finishedAt, turbo, ammo, mines, progress, lapTimes, lastInput, lastTurboActive, isPlayer`) from the newer bracket snapshot's matching car, (d) copies `phase, simTimeMs, countdownAnnounced, raceStartAt, placementOrder, bullets, mines, pickups` from the newer snapshot. Match cars by `id`. Provide `LocalSource` too (thin: wraps an externally-driven `RaceState`, `drainEvents` returns queued events) for symmetry, or leave `LocalSource` out if RaceScene keeps its existing local loop inline — see Task 11.

Include a constructor that builds `env`/skeleton from the `raceStart` payload, and a `renderTimeMs` initialized on the first snapshot to `snap.simTimeMs - INTERP_DELAY_MS`.

- [ ] **Step 4: Run tests + build**

Run: `npm test -- networkSource && npm run build`
Expected: PASS (3 tests); build clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/race/raceSource.ts tests/game/networkSource.test.ts
git commit -m "feat(game): NetworkSource — buffers + interpolates server snapshots into RaceState"
```

---

## Task 10: Parameterize the local car id in RaceScene

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` — add `private localCarId = 'player'`; replace the `'player'` literals (343, 361, 399, 415, 428, 513, 555, 569, 1043, 1070, 1638, 1680, 1856, 2018) and the `this.sim.cars[0]`-as-player reads (399, 512, 554, 1577, 1683, 1814, 1935, 1941–1942, 1957, 1983, 2016, 2019–2021) with a helper.

**Interfaces:**
- Consumes: nothing new.
- Produces: `private myCar(): CarSim { return this.sim.cars.find((c) => c.id === this.localCarId)!}` and `private myView() { return this.carViews.get(this.localCarId)! }`. All "which car is me" logic routes through `this.localCarId` / `myCar()`.

- [ ] **Step 1: Add the field + helpers**

Add `private localCarId = 'player'` near the other fields, and `myCar()`/`myView()` methods. Default `'player'` keeps single-player identical (the player car is created with `id: 'player'`, Task/line 799, and is `cars[0]`).

- [ ] **Step 2: Replace the `'player'` literals**

At each site from the map:
- 343 `e.carId === this.localCarId`; 361 same; 415 same; 428 `(e.aId === this.localCarId || e.bId === this.localCarId)`; 569 `e.carId === this.localCarId`.
- 399 gun-fired distance: `e.carId === this.localCarId ? 0 : hypot(..., this.myCar().state ...)`.
- 512–513, 554–555: `const player = this.myCar()`; `e.carId === this.localCarId || hypot(...) < R`.
- 1638 `this.myView().sprite`.
- 1680, 1856, 2018, 1043: `this.sim.placementOrder.indexOf(this.localCarId) + 1`.
- 1070 `.filter((r) => r.id !== this.localCarId)`.

- [ ] **Step 3: Replace `cars[0]`-as-player reads**

Every `this.sim.cars[0]` that means "the local player" (updateCamera 1577, updateHud 1814, openPause 1683, debug 1935/1941–1942/1957/1983/2016/2019–2021) becomes `this.myCar()`. Leave any `cars[0]` that genuinely means "first grid car" unchanged only if such a case exists — per the map, all listed `cars[0]` sites mean "the player", so all become `myCar()`.

`buildCarSetups` (792, 799) still creates the player with `id: 'player'` in career mode — unchanged; `localCarId` stays `'player'` there.

- [ ] **Step 4: Verify build + single-player smoke**

Run: `npm run build && npm test`
Expected: build clean, suite green. Browser: `npm run dev`, run a full single-player race — camera follows the player, HUD position/standings correct, pause shows the right position, wall-hit shake/rescue flash/pickup toast all still fire only for the player. (No behavior change — pure indirection.)

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "refactor(race): route 'which car is me' through localCarId (default player)"
```

---

## Task 11: RaceScene network mode seam

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` — `init(data)`, `create()` guards, `update()` seam, `onRaceOver` guard.

**Interfaces:**
- Consumes: `NetworkSource` (Task 9); `NetClient`; `raceStart` payload; `buildRaceEnv` (Task 4).
- Produces: `RaceScene` runs in `mode: 'career' | 'network'`. In network mode it renders `NetworkSource.state` and never touches career/offer/results-career machinery.

- [ ] **Step 1: Add `init` + mode fields**

```ts
private mode: 'career' | 'network' = 'career'
private net?: NetClient
private netSource?: NetworkSource
private raceStart?: { seed: number; trackId: string; laps: number; roster: RaceCarInfo[]; youId: string }

init(data?: { mode?: 'network'; net?: NetClient; raceStart?: RaceStartPayload }) {
  this.mode = data?.mode === 'network' ? 'network' : 'career'
  this.net = data?.net
  this.raceStart = data?.raceStart
}
```

- [ ] **Step 2: Branch `create()`**

Wrap the single-player lifecycle blocks so they run only in career mode, and add the network setup:

- 217–238 (career/offer/seed load): `if (this.mode === 'career') { ...existing... }`.
- Network branch: build `this.track = trackById(this.raceStart!.trackId)`, `this.raceSeed = this.raceStart!.seed`, `this.localCarId = this.raceStart!.youId`, construct `this.netSource = new NetworkSource(this.net!, this.raceStart!, <stockSpec>)`, set `this.env = this.netSource.env`, `this.sim = this.netSource.state`, and populate `this.centerline/racingLine/gates/gateSpacing` from `this.env`.
- 262–263 (`buildCarSetups` + `createRaceState`): career mode only. In network mode the sim/env come from `netSource`; build `this.carInfo` from `this.raceStart!.roster` (`name`, `color`, `textureKey: car-top-${chassisId}`, `chassisId`).
- `buildWorld/buildCarViews/buildPickupViews/buildSharedEffects/buildHud/setupCameras/setupInput/startCountdown` run in BOTH modes (pure render). `setupDebug` both.
- Guard the HUD identity text (1777–1779, reads `this.career`) so network mode uses roster data for the local player instead of `this.career.profile`.

- [ ] **Step 3: Seam `update()`**

```ts
update(_t: number, delta: number) {
  if (this.mode === 'network') {
    this.inputManager.update()
    if (this.settings.toggleFire && this.inputManager.justDown('fire')) this.fireToggled = !this.fireToggled
    if (this.settings.toggleTurbo && this.inputManager.justDown('turbo')) this.turboToggled = !this.turboToggled
    if (this.inputManager.justDown('mine')) this.mineQueued = true
    this.netSource!.sendInput?.(this.buildPlayerCommand())
    this.mineQueued = false
    this.netSource!.ingest(this.time.now, delta)
    this.sim = this.netSource!.state
    this.handleSimEvents(this.netSource!.drainEvents())
  } else {
    // ...existing career loop (inputManager.update, clock.advance/stepRace)...
  }
  // shared render sync (291–300) runs for both modes, reading this.sim
  ...
}
```

- [ ] **Step 4: Guard the results transition**

`onRaceOver` (373–377) and `handleSimEvents`'s `race-over` case: in network mode do NOT call `transitionToResults` (no career). Instead show the MP results overlay (Task 12). Guard `abandonRace`/pause so career mode is unaffected; network Esc is defined in Task 12. Keep `transitionToResults` reachable only in career mode.

- [ ] **Step 5: Verify build**

Run: `npm run build && npm test`
Expected: build clean; suite green (single-player path unchanged; network path compiles). Full browser verification lands in Task 13 once Lobby launches it.

- [ ] **Step 6: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "feat(race): network mode seam — render server snapshots, bypass career lifecycle"
```

---

## Task 12: Multiplayer results overlay + rematch/leave

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` — `showNetworkResults(standings)`, network Esc handling; store latest `raceEnd`.

**Interfaces:**
- Consumes: `RaceStanding` (Task 1); `NetClient`; widgets `panel`, `text`, `tile`, `backButton`, `formatTime`.
- Produces: an in-scene results overlay container shown on `raceEnd`; **Rematch** sends `{ t: 'rematch' }` and, on the next `lobby` message, `this.scene.start('Lobby', { net, youId, lobby })`; **Leave** sends `{ t: 'leave' }`, closes `net`, `this.scene.start('Menu')`.

- [ ] **Step 1: Subscribe to `raceEnd` in NetworkSource → scene callback**

Have `NetworkSource.onRaceEnd(cb)` (Task 9) fire when a `raceEnd` message arrives; RaceScene registers `this.netSource.onRaceEnd((s) => this.showNetworkResults(s))` in create() (network mode).

- [ ] **Step 2: Build the overlay**

`showNetworkResults(standings: RaceStanding[])`: a depth-topped container over the frozen scene with `RACE COMPLETE`, a standings table (place · name · best lap via `formatTime(Math.min(...lapTimes))` or `—`), and two keyboard-navigable tiles: `REMATCH` and `LEAVE`. Respect `reducedFlash` for any entrance effect. Add keyboard nav (↑/↓ + Enter) and a visible back route (Leave). Guard against double-show.

- [ ] **Step 3: Rematch / leave wiring**

- Rematch: `this.net!.send({ t: 'rematch' })`; register a one-shot handler for the next `lobby` message: `this.scene.start('Lobby', { net: this.net, youId: this.localCarId, lobby })`. (LobbyScene already owns `net` from there.)
- Leave: `this.net!.send({ t: 'leave' })`; `this.net!.close()`; `this.scene.start('Menu')`.
- Network Esc (in `setupInput`, network branch): open a small confirm or directly Leave — Phase 3 minimal: Esc triggers the same Leave path. Document it in a comment (pausing model is Phase 4).

Ensure all network message subscriptions are removed on scene `shutdown` (mirror LobbyScene's `offMessage`/`offClose` discipline) so repeated races don't stack handlers.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: clean. Interactive verification in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/RaceScene.ts src/game/race/raceSource.ts
git commit -m "feat(race): multiplayer results overlay with rematch + leave"
```

---

## Task 13: Enable START in the lobby + launch the networked race

**Files:**
- Modify: `src/game/scenes/LobbyScene.ts:70-71` (enable START), `handleKey` (Enter/Space on START for host), `handleMessage` (`raceStart` → launch).

**Interfaces:**
- Consumes: everything above; `NetClient` (owned by LobbyScene, handed to RaceScene).
- Produces: host sees an enabled `START RACE` when all players are ready and ≥2 present; pressing it sends `{ t: 'start' }`; every client, on `raceStart`, hands `net` to `RaceScene` in network mode.

- [ ] **Step 1: Enable the START tile for the host**

Replace lines 70–71. Store the tile; in `render()`, compute `canStart = isHost && this.lobby.players.length >= 2 && this.lobby.players.every((p) => p.ready)`; `startTile.setState(false, canStart)` and set its label to `START RACE` (host) or `Waiting for host…` (non-host). Add a keyboard affordance: in `handleKey`, if host and `canStart` and the key is `Space` (or a dedicated `KeyG` to avoid clashing with Enter=ready), `this.net.send({ t: 'start' })`. Wire the tile's pointer handler to the same when `canStart`.

- [ ] **Step 2: Handle `raceStart`**

In `handleMessage`, add:

```ts
} else if (msg.t === 'raceStart') {
  this.transitioning = true
  // hand net to the race scene; detach lobby handlers first
  this.net.offMessage(this.onNetMessage)
  this.net.offClose(this.onNetClose)
  this.scene.start('Race', {
    mode: 'network',
    net: this.net,
    raceStart: { seed: msg.seed, trackId: msg.trackId, laps: msg.laps, roster: msg.roster, youId: msg.youId },
  })
}
```

Guard the `shutdown` cleanup so it does not double-`offMessage`/close `net` when transitioning to the race (the race scene now owns `net`). Do not `net.close()` on this path.

- [ ] **Step 3: Two-tab acceptance smoke (the milestone)**

Start `npm run server` and `npm run dev`. Tab 1: Menu → MULTIPLAYER → create → note code. Tab 2: `?room=CODE` → join. Both ready up; host presses START.

Expected:
- Both tabs launch the race and show the countdown together.
- Cars move roughly in sync (own car ~100 ms behind input — acceptable this phase).
- Both cars complete the laps; the race ends after both finish; the `RACE COMPLETE` overlay shows standings + best laps.
- Rematch returns both tabs to the lobby (ready cleared); Leave returns to the menu.
- No console errors; the single-player game still runs normally (regression check).

- [ ] **Step 4: Commit**

```bash
git add src/game/scenes/LobbyScene.ts
git commit -m "feat(lobby): enable START, hand off to the networked race on raceStart"
```

---

## Final verification (before finishing the branch)

Run all of:

```bash
npm test            # full suite green (new: snapshot, stepRaceCommands, raceEndPolicy, raceEnvBuilder, roomLifecycle, raceSetup, interpolation, networkSource)
npm run build       # strict tsc + vite build clean
npm run server:check
git diff --check     # no whitespace/conflict markers
```

Browser: single-player race plays identically (regression); two-tab networked race completes end to end (Task 13 smoke). Then use `superpowers:finishing-a-development-branch`.

## Deferred to later phases (carry forward)

- Own-car client prediction + reconciliation (Phase 4) — plugs into the `RaceSource` seam.
- Disconnect → AI takeover / DNF grace (Phase 4). Today a dropped tab leaves its car idle.
- Per-car human handling: today all human cars share `env.playerSpec` (only `mass` varies). Add `spec` to `CarSim` with an `env.playerSpec` fallback so each player's chosen car drives differently, keeping single-player byte-identical.
- AI grid fill for empty slots (career-independent AI setup builder).
- Deployment to a hosted server (Phase 5).
- Phase-2 minors folded here where touched: LobbyScene `carById`/`trackById` fallback on unknown ids; `roomCode.ts` doc-comment fix.
```
