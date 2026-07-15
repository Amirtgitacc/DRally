# Multiplayer Phase 1: Race Sim Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the race simulation out of `RaceScene` into a plain serializable `RaceState` plus a deterministic `stepRace(state, env, command, dtMs)` reducer in `src/core/race/`, and drive it with the existing `FixedStepClock` — with no perceptible single-player change.

**Architecture:** New core modules own all simulation state and rules (movement, combat, mines, pickups, AI control, progress, placements, phase flow). `stepRace` mutates a plain-data `RaceState` in place and returns typed `SimEvent[]`; it is deterministic (all randomness from `state.rngState`) and Phaser-free, so a Node server can later run it unchanged. `RaceScene` becomes a renderer: it builds the static `RaceEnv` + car setups, steps the sim on a fixed 60 Hz clock, and maps state + events to sprites, particles, audio, camera, and HUD.

**Tech Stack:** TypeScript (strict), Vitest, Phaser (presentation only). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-15-multiplayer-design.md`

## Global Constraints

- `src/core/` must stay Phaser-free and browser-independent. Importing from `src/data/` is allowed (established convention, see `src/core/progression/ladder.ts`).
- `RaceState` must be JSON-serializable: no functions, class instances, `Infinity`, `NaN`, or `undefined` field values (use `null`).
- Determinism: identical seed + identical command sequence ⇒ identical state and events. All gameplay randomness flows through `state.rngState`. The scene may keep its own RNG for cosmetics only.
- Preserve every race lifecycle invariant from `AGENTS.md`: pause freezes everything, abandon = committed DNF, weapons-off disables player and AI weapons, difficulty changes rival pace only.
- Preserve debug hooks: `__step`, `__autoPilot`, `__getRace`, `__raceSummary`, `__setDrive`, `__setCarState`, `__applyDamage`, `__launch`, `__dropMineAt`, `__pickups`, `__setTrack`, `__restartRace`, seed output.
- Single-player behavior must not change perceptibly. Exact per-race outcomes for a given old seed MAY differ (RNG call order shifts); feel, rules, and pacing must not.
- After each task: `npm test` and `npm run build` must pass. Before declaring the plan complete: also `git diff --check` and a browser smoke test.
- Simulation time is `state.simTimeMs`, advanced only by `stepRace`. Never use `Date.now()`, `performance.now()`, or Phaser clocks inside `src/core/`.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/race/random.ts` (modify) | Add serializable-state PRNG step (`initialRngState`, `nextRandom`) |
| `src/core/race/raceState.ts` (create) | `RacePhase`, `RaceState`, `CarSim`, `CarAiSim`, `BulletSim`, `MineSim`, `PickupSim`, `RaceEnv`, `CarSetup`, `createRaceState` |
| `src/core/race/simEvents.ts` (create) | `SimEvent` typed union (sim → renderer) |
| `src/core/race/aiControl.ts` (create) | AI driving/combat decisions, `effectiveSpec`, `progressScore` |
| `src/core/race/combatStep.ts` (create) | Damage/wreck, gun fire, bullet update |
| `src/core/race/minesStep.ts` (create) | Mine drop, arming, detonation, blast application |
| `src/core/race/pickupsStep.ts` (create) | Pickup collection, respawn relocation, type mix |
| `src/core/race/stepRace.ts` (create) | Orchestrator: phase flow, per-car update, collisions, placements |
| `src/core/race/placementSystem.ts` (moved from `src/game/race/`) | Placement ordering (already pure) |
| `src/game/scenes/RaceScene.ts` (modify) | Becomes renderer + input + career/results glue |
| `tests/core/race/*.test.ts` (create) | Unit + determinism + serialization tests |

---

### Task 1: Serializable PRNG state

**Files:**
- Modify: `src/core/race/random.ts`
- Test: `tests/core/race/random.test.ts` (extend existing)

**Interfaces:**
- Produces: `initialRngState(seed: number): number`, `nextRandom(ref: { rngState: number }): number` — same sequence as `createSeededRandom(seed)`, but state lives in a plain number field so it can sit inside `RaceState` and serialize.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/race/random.test.ts`:

```ts
import { createSeededRandom, initialRngState, nextRandom } from '../../../src/core/race/random'

describe('stateful PRNG', () => {
  it('matches createSeededRandom exactly for the same seed', () => {
    const closure = createSeededRandom(12345)
    const ref = { rngState: initialRngState(12345) }
    for (let i = 0; i < 100; i++) expect(nextRandom(ref)).toBe(closure())
  })

  it('survives JSON round-trip mid-stream', () => {
    const a = { rngState: initialRngState(999) }
    for (let i = 0; i < 10; i++) nextRandom(a)
    const b = JSON.parse(JSON.stringify(a)) as { rngState: number }
    expect(nextRandom(b)).toBe(nextRandom(a))
  })

  it('falls back to the same default state as createSeededRandom for seed 0', () => {
    const closure = createSeededRandom(0)
    const ref = { rngState: initialRngState(0) }
    expect(nextRandom(ref)).toBe(closure())
  })
})
```

(If the existing file lacks `describe`/`it` imports, follow its existing import style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/race/random.test.ts`
Expected: FAIL — `initialRngState` is not exported.

- [ ] **Step 3: Implement**

Append to `src/core/race/random.ts`:

```ts
/** Initial PRNG state for a seed — same normalization createSeededRandom applies. */
export function initialRngState(seed: number): number {
  return (seed >>> 0) || 0x6d2b79f5
}

/**
 * Advance the PRNG whose state lives in a plain serializable field.
 * Produces the identical sequence to createSeededRandom(seed) when
 * ref.rngState started as initialRngState(seed).
 */
export function nextRandom(ref: { rngState: number }): number {
  let state = ref.rngState | 0
  state = (state + 0x6d2b79f5) | 0
  ref.rngState = state
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/race/random.test.ts` — Expected: PASS.
Run: `npm test` and `npm run build` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/race/random.ts tests/core/race/random.test.ts
git commit -m "feat(core): serializable PRNG state for race sim"
```

---

### Task 2: RaceState types, SimEvent union, and createRaceState factory

**Files:**
- Create: `src/core/race/raceState.ts`
- Create: `src/core/race/simEvents.ts`
- Modify: `src/game/race/raceRuntime.ts` (re-export `RacePhase` from core)
- Move: `src/game/race/placementSystem.ts` → `src/core/race/placementSystem.ts`
- Test: `tests/core/race/raceState.test.ts`

**Interfaces:**
- Consumes: `initialRngState`, `nextRandom` (Task 1); existing core: `CarState`, `CarInput`, `CarPhysicsSpec`, `IDLE_INPUT`, `GROUNDED` from `../vehicle/carPhysics`; `RaceProgress`, `createProgress` from `./progress`; `Gate`, `Vec2` from `../track/geometry`; `AiTuning` from `../ai/driver`; `PickupType`, `randomPickupLayout` from `../track/pickups`; `PICKUPS` from `../../data/weapons`; `RaceTier` from `../../data/economy`.
- Produces (used by every later task):

```ts
export type RacePhase = 'countdown' | 'racing' | 'finished'

export interface CarAiSim {
  lineIdx: number
  lookAheadSamples: number
  speedScale: number
  tuning: AiTuning
  spec: CarPhysicsSpec
  /** talent grade (1..4) — decides lead-target aiming */
  grade: number
  aimSpread: number
  mineCooldownMs: number
  rubberBandGain: number
}

export interface CarSim {
  id: string
  isPlayer: boolean
  state: CarState
  prevPos: Vec2
  progress: RaceProgress
  finishedAt: number | null
  lapStartAt: number
  lapTimes: number[]
  damage: number
  wrecked: boolean
  ammo: number
  turbo: number
  turboDepleted: boolean
  gunCooldown: number
  burstEndsAt: number
  restEndsAt: number
  cash: number
  mines: number
  lastMineAt: number
  mass: number
  stuckMs: number
  armorTier: number
  ai: CarAiSim | null
  /** what the car did on the last step — renderer reads this for brake lights, exhaust, skids */
  lastInput: CarInput
  lastTurboActive: boolean
}

export interface BulletSim { id: number; x: number; y: number; vx: number; vy: number; ttl: number; ownerId: string }
export interface MineSim { id: number; x: number; y: number; droppedAt: number; ownerId: string }
export interface PickupSim { type: PickupType; x: number; y: number; respawnAt: number | null }

/** Static per-race context — derived from track + career at setup, never serialized per tick. */
export interface RaceEnv {
  centerline: Vec2[]
  racingLine: Vec2[]
  gates: Gate[]
  barriers: Vec2[]
  gateSpacing: number
  trackWidth: number
  laps: number
  tier: RaceTier
  playerSpec: CarPhysicsSpec
  weaponsEnabled: boolean
  hasPlating: boolean
  hasOverTurbo: boolean
}

export interface RaceState {
  simTimeMs: number
  phase: RacePhase
  countdownAnnounced: number
  raceStartAt: number
  trapUntil: number
  slowMoUntil: number
  allRivalsDoneAt: number | null
  rngState: number
  nextBulletId: number
  nextMineId: number
  autoPilot: { fire: boolean; turbo: boolean; mines: boolean } | null
  cars: CarSim[]
  bullets: BulletSim[]
  mines: MineSim[]
  pickups: PickupSim[]
  placementOrder: string[]
}

export interface CarSetup {
  id: string
  isPlayer: boolean
  mass: number
  damage: number
  ammo: number
  mines: number
  armorTier: number
  ai: CarAiSim | null
}

export function createRaceState(env: RaceEnv, setups: CarSetup[], seed: number): RaceState
```

Notes for the implementer:
- `RaceTier` — confirm the exact type of `TrackDef['tier']` in `src/data/tracks/testCircuit.ts` before importing; use whatever type `AI_GUNNER.damageScale` is keyed by.
- `setups[0]` MUST be the player (`isPlayer: true`); code elsewhere uses `state.cars[0]` as the player.
- The player's `armorTier` is set (by the scene, Task 8) to `career.upgrades.armor`, so damage code can treat all cars uniformly.
- `lastMineAt` initializes to `-1e9`, NOT `0`. Sim time starts at 0, so `0 - 0 < dropCooldownMs` would silently block mine drops for the first cooldown window (old code used the large Phaser wall clock and never hit this). `-Infinity` is forbidden (not JSON-serializable).

- [ ] **Step 1: Move placementSystem into core**

```bash
git mv src/game/race/placementSystem.ts src/core/race/placementSystem.ts
```

Fix its imports (they become sibling-relative): `'../../core/race/placement'` → `'./placement'`, `'../../core/race/progress'` → `'./progress'`, `'../../core/track/geometry'` → `'../track/geometry'`. Update the import in `src/game/scenes/RaceScene.ts` from `'../race/placementSystem'` to `'../../core/race/placementSystem'`.

- [ ] **Step 2: Create `src/core/race/simEvents.ts`**

```ts
import type { PickupType } from '../track/pickups'

/** Everything the renderer needs to know that state alone can't tell it. */
export type SimEvent =
  | { type: 'countdown'; count: 3 | 2 | 1 }
  | { type: 'race-started' }
  | { type: 'gun-fired'; carId: string; x: number; y: number; dir: number }
  | { type: 'bullet-hit'; carId: string; x: number; y: number }
  | { type: 'bullet-wall'; x: number; y: number }
  | { type: 'car-wrecked'; carId: string; x: number; y: number }
  | { type: 'car-landed'; carId: string; x: number; y: number }
  | { type: 'cars-collided'; aId: string; bId: string; x: number; y: number; impact: number; rammed: boolean }
  | { type: 'wall-hit'; carId: string; impact: number }
  | { type: 'crash-lurch'; x: number; y: number }
  | { type: 'mine-dropped'; carId: string; mineId: number; x: number; y: number }
  | { type: 'mine-detonated'; mineId: number; x: number; y: number }
  | { type: 'pickup-collected'; carId: string; index: number; pickup: PickupType; x: number; y: number }
  | { type: 'pickup-respawned'; index: number }
  | { type: 'car-rescued'; carId: string }
  | { type: 'lap-completed'; carId: string; lapTimeMs: number }
  | { type: 'car-finished'; carId: string }
  | { type: 'race-over'; reason: 'player-finished' | 'player-wrecked' | 'rivals-done' }
```

- [ ] **Step 3: Write the failing test**

Create `tests/core/race/raceState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRaceState, type CarSetup, type RaceEnv } from '../../../src/core/race/raceState'
import { buildGates, catmullRomClosed, closedPolylineLength, offsetClosedPolyline, spacedPointsAlong } from '../../../src/core/track/geometry'
import { buildRacingLine } from '../../../src/core/track/racingLine'
import { ALL_TRACKS } from '../../../src/data/tracks'
import { STARTER_CAR } from '../../../src/data/cars'

export function buildTestEnv(overrides: Partial<RaceEnv> = {}): RaceEnv {
  const track = ALL_TRACKS[0]
  const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
  const racingLine = buildRacingLine(centerline, { maxOffset: track.width / 2 - 34 - 8 })
  const gates = buildGates(centerline, track.gateCount, track.width / 2 + track.shoulder)
  const barriers: { x: number; y: number }[] = []
  for (const side of [1, -1]) {
    const wallLine = offsetClosedPolyline(centerline, side * (track.width / 2 + track.shoulder + 24))
    for (const p of spacedPointsAlong(wallLine, 54)) barriers.push(p)
  }
  return {
    centerline,
    racingLine,
    gates,
    barriers,
    gateSpacing: closedPolylineLength(centerline) / track.gateCount,
    trackWidth: track.width,
    laps: track.laps,
    tier: track.tier,
    playerSpec: { ...STARTER_CAR },
    weaponsEnabled: true,
    hasPlating: false,
    hasOverTurbo: false,
    ...overrides,
  }
}

export function buildTestSetups(): CarSetup[] {
  const base = { damage: 0, ammo: 20, mines: 3, armorTier: 0, mass: 1 }
  return [
    { id: 'player', isPlayer: true, ai: null, ...base },
    {
      id: 'rival-1',
      isPlayer: false,
      ...base,
      ai: {
        lineIdx: 0, lookAheadSamples: 10, speedScale: 0.95,
        tuning: { steerGain: 3, brakeCurvature: 0.5, cornerSpeedScale: 0.6, avoidGain: 1 },
        spec: { ...STARTER_CAR }, grade: 2, aimSpread: 0.1, mineCooldownMs: 6000, rubberBandGain: 0.02,
      },
    },
  ]
}

describe('createRaceState', () => {
  it('is deterministic for a seed', () => {
    const env = buildTestEnv()
    expect(createRaceState(env, buildTestSetups(), 42)).toEqual(createRaceState(env, buildTestSetups(), 42))
  })

  it('produces a JSON-serializable state that round-trips losslessly', () => {
    const state = createRaceState(buildTestEnv(), buildTestSetups(), 42)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('spawns the player first, on the grid, grounded and idle', () => {
    const state = createRaceState(buildTestEnv(), buildTestSetups(), 42)
    expect(state.cars[0].isPlayer).toBe(true)
    expect(state.cars[0].state.z).toBe(0)
    expect(state.phase).toBe('countdown')
    expect(state.pickups.length).toBeGreaterThan(0)
    expect(state.placementOrder).toHaveLength(2)
  })
})
```

IMPORTANT: check the real field names of `AiTuning` in `src/core/ai/driver.ts` before writing the test's `tuning` literal — use its actual shape, not the guess above.

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/core/race/raceState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/core/race/raceState.ts`**

Types exactly as in **Interfaces** above, plus the factory. Transcribe spawn logic from `RaceScene.buildCars()` (`spawnAt`, lines 1119–1132) and the AI `lineIdx` snap (lines 1341–1353); pickup layout from `buildPickups()` (lines 982–998), minus all sprite work:

```ts
import { GROUNDED, IDLE_INPUT, type CarState } from '../vehicle/carPhysics'
import { createProgress } from './progress'
import { initialRngState, nextRandom } from './random'
import { randomPickupLayout } from '../track/pickups'
import { PICKUPS } from '../../data/weapons'
import { racePlacements } from './placementSystem'
// ... type-only imports per the Interfaces block

export function createRaceState(env: RaceEnv, setups: CarSetup[], seed: number): RaceState {
  const state: RaceState = {
    simTimeMs: 0, phase: 'countdown', countdownAnnounced: 0, raceStartAt: 0,
    trapUntil: 0, slowMoUntil: 0, allRivalsDoneAt: null,
    rngState: initialRngState(seed), nextBulletId: 1, nextMineId: 1, autoPilot: null,
    cars: [], bullets: [], mines: [], pickups: [], placementOrder: [],
  }
  const rng = () => nextRandom(state)

  const spots = randomPickupLayout(
    env.centerline,
    [...PICKUPS.types],
    {
      lateralOffsets: [...PICKUPS.lateralOffsets],
      clearRadiusAroundStart: PICKUPS.clearRadiusAroundStart,
      minDistance: PICKUPS.minDistance,
    },
    rng,
  )
  state.pickups = spots.map((s) => ({ type: s.type, x: s.x, y: s.y, respawnAt: null }))

  const gate = env.gates[0]
  const normal = { x: -gate.tangent.y, y: gate.tangent.x }
  const heading = Math.atan2(gate.tangent.y, gate.tangent.x)
  const spawnAt = (slot: number): CarState => {
    const row = Math.floor(slot / 2)
    const col = slot % 2
    const back = 80 + row * 120
    const side = (col === 0 ? -1 : 1) * 58
    return {
      x: gate.center.x - gate.tangent.x * back + normal.x * side,
      y: gate.center.y - gate.tangent.y * back + normal.y * side,
      heading, vx: 0, vy: 0, ...GROUNDED,
    }
  }

  state.cars = setups.map((setup, slot) => {
    const carState = spawnAt(slot)
    return {
      id: setup.id, isPlayer: setup.isPlayer, state: carState,
      prevPos: { x: carState.x, y: carState.y },
      progress: createProgress(env.gates.length, env.laps),
      finishedAt: null, lapStartAt: 0, lapTimes: [],
      damage: setup.damage, wrecked: false, ammo: setup.ammo,
      turbo: 1, turboDepleted: false, gunCooldown: 0, burstEndsAt: 0, restEndsAt: 0,
      cash: 0, mines: setup.mines, lastMineAt: -1e9, mass: setup.mass, stuckMs: 0,
      armorTier: setup.armorTier, ai: setup.ai,
      lastInput: { ...IDLE_INPUT }, lastTurboActive: false,
    }
  })

  for (const car of state.cars) {
    if (!car.ai) continue
    let best = 0
    let bestD = Infinity
    env.centerline.forEach((p, i) => {
      const d = Math.hypot(p.x - car.state.x, p.y - car.state.y)
      if (d < bestD) { bestD = d; best = i }
    })
    car.ai.lineIdx = best
  }

  state.placementOrder = racePlacements(state.cars, env.gates)
  return state
}
```

In `src/game/race/raceRuntime.ts`, delete the local `RacePhase` declaration and replace with `export type { RacePhase } from '../../core/race/raceState'`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core/race/raceState.test.ts` — Expected: PASS.
Run: `npm test && npm run build` — Expected: PASS (build confirms the placementSystem move and RacePhase re-export broke nothing).

- [ ] **Step 7: Commit**

```bash
git add -A src/core/race src/game/race tests/core/race/raceState.test.ts src/game/scenes/RaceScene.ts
git commit -m "feat(core): RaceState, SimEvent union, createRaceState factory"
```

---

### Task 3: AI control module

**Files:**
- Create: `src/core/race/aiControl.ts`
- Test: `tests/core/race/aiControl.test.ts`

**Interfaces:**
- Consumes: Task 2 types; `aiDrive`, `lookAheadFor`, `wrapAngle` from `../ai/driver`; `shouldTurbo` from `../ai/turbo`; `leadTarget` from `../combat/aim`; `mineIsLive` from `../combat/mines`; `forwardSpeed` from `../vehicle/carPhysics`; `turnAmount` from `../track/geometry`; `nextGateIndex` from `./progress`; data: `AI_GUNNER`, `AI_MINES`, `GUN`, `MINES`, `RUBBER_BAND` from `../../data/weapons`, `TURBO` from `../../data/weapons`, `OVERCHARGED_TURBO` from `../../data/blackMarket`.
- Produces:

```ts
export function progressScore(env: RaceEnv, car: CarSim): number
export function effectiveSpec(state: RaceState, env: RaceEnv, car: CarSim, turboActive: boolean): CarPhysicsSpec
export function computeAiInput(state: RaceState, env: RaceEnv, car: CarSim): CarInput
export function computeAiCombat(state: RaceState, env: RaceEnv, car: CarSim): { fire: boolean; turbo: boolean; dropMine: boolean }
export function hasTargetInSights(state: RaceState, car: CarSim): boolean
export function wantsAutoMine(state: RaceState, car: CarSim): boolean
```

These are transcriptions of `RaceScene` methods with `this.` context replaced by `(state, env, car)`:

| Source (RaceScene) | Target | Substitutions |
|---|---|---|
| `progressScore` (1453–1457) | `progressScore(env, car)` | `this.gates`→`env.gates`, `this.gateSpacing`→`env.gateSpacing` |
| `effectiveSpec` (1428–1451) | `effectiveSpec(state, env, car, turboActive)` | `this.playerSpec`→`env.playerSpec`, `this.player`→`state.cars[0]`, `this.hasOverTurbo`→`env.hasOverTurbo`, `Phaser.Math.Clamp(v,lo,hi)`→local `clamp` helper |
| `computeAiInput` (1362–1408) | `computeAiInput(state, env, car)` | `this.racingLine`→`env.racingLine`, `this.cars`→`state.cars`, `nearestArmedMineAhead` uses `state.mines` + `now = state.simTimeMs`, keep `const AVOID_RANGE = 150` as a module constant |
| `nearestArmedMineAhead` (1411–1426) | private helper | `this.time.now`→`state.simTimeMs`, `this.mines`→`state.mines` (MineSim has no sprites — same fields otherwise) |
| `hasTargetInSights` (889–902) + `canHit` (904–912) | `hasTargetInSights(state, car)` + private `canHit` | `this.placementOrder`→`state.placementOrder`, `this.phase`→`state.phase`, `car.ai?.talent.grade`→`car.ai?.grade` |
| `burstGate` (929–942) | private helper | `now` = caller passes `state.simTimeMs`; mutates `car.burstEndsAt`/`car.restEndsAt` as before |
| `isBeingChased` (964–978) | private helper | `this.cars`→`state.cars` |
| `maybeAutoDropMine` guard (918–923) | `wantsAutoMine(state, car)` | Returns `boolean` instead of dropping: `car.mines > 0 && state.simTimeMs >= state.raceStartAt + AI_MINES.graceMs && state.simTimeMs - car.lastMineAt > (car.ai?.mineCooldownMs ?? AI_MINES.cooldownMs) && isBeingChased(state, car)` |
| `computeAiCombat` (944–961) | `computeAiCombat(state, env, car)` | Same, but instead of calling `maybeAutoDropMine` it returns `dropMine: state.phase === 'racing' && wantsAutoMine(state, car)`; `this.effectiveSpec(car,false)`→`effectiveSpec(state, env, car, false)` |

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/aiControl.test.ts` (reuse `buildTestEnv`/`buildTestSetups` by importing from `./raceState.test`, or extract them into `tests/core/race/testRace.ts` — extraction preferred; update raceState.test imports accordingly):

```ts
import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { computeAiInput, effectiveSpec, progressScore } from '../../../src/core/race/aiControl'
import { buildTestEnv, buildTestSetups } from './testRace'

describe('aiControl', () => {
  it('computeAiInput is deterministic and in range', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 7)
    const rival = state.cars[1]
    const a = computeAiInput(state, env, rival)
    const b = computeAiInput(createRaceState(env, buildTestSetups(), 7), env, rival)
    expect(a).toEqual(b)
    expect(a.steer).toBeGreaterThanOrEqual(-1)
    expect(a.steer).toBeLessThanOrEqual(1)
  })

  it('rubber band never exceeds configured bounds', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 7)
    const rival = state.cars[1]
    // put the player massively ahead
    state.cars[0].progress = { ...state.cars[0].progress, gatesPassed: 50 }
    const banded = effectiveSpec(state, env, rival, false)
    const raw = rival.ai!.spec
    expect(banded.topSpeed / raw.topSpeed).toBeLessThanOrEqual(rival.ai!.speedScale * 1.5) // sanity ceiling
  })

  it('progressScore grows toward the next gate', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 7)
    const car = state.cars[0]
    const before = progressScore(env, car)
    const gate = env.gates[0]
    car.state.x = gate.center.x
    car.state.y = gate.center.y
    expect(progressScore(env, car)).toBeGreaterThan(before)
  })
})
```

Replace the `1.5` sanity ceiling with `RUBBER_BAND.max` imported from `src/data/weapons` (exact assertion: `expect(banded.topSpeed / raw.topSpeed).toBeCloseTo(rival.ai!.speedScale * RUBBER_BAND.max, 5)`).

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/core/race/aiControl.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/core/race/aiControl.ts`** per the transcription table. Copy method bodies verbatim from `RaceScene.ts` (line refs in table), applying only the listed substitutions. Do not "improve" logic — parity is the requirement.

- [ ] **Step 4: Run tests** — task test, then `npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/race/aiControl.ts tests/core/race/aiControl.test.ts tests/core/race/testRace.ts tests/core/race/raceState.test.ts
git commit -m "feat(core): pure AI control extracted from RaceScene"
```

---

### Task 4: Combat step (damage, wreck, guns, bullets)

**Files:**
- Create: `src/core/race/combatStep.ts`
- Test: `tests/core/race/combatStep.test.ts`

**Interfaces:**
- Consumes: Task 2/3; `applyDamage` from `../combat/damage`; `armorResistance` from `../vehicle/carSpec`; `isAirborne` from `../vehicle/carPhysics`; `nextRandom`; data `GUN`, `AI_GUNNER` from `../../data/weapons`.
- Produces:

```ts
export function damageCarSim(state: RaceState, car: CarSim, amount: number, events: SimEvent[]): void
export function tryFire(state: RaceState, car: CarSim, events: SimEvent[]): void
export function updateBullets(state: RaceState, env: RaceEnv, dt: number, events: SimEvent[]): void
```

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/combatStep.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { damageCarSim, tryFire, updateBullets } from '../../../src/core/race/combatStep'
import type { SimEvent } from '../../../src/core/race/simEvents'
import { GUN } from '../../../src/data/weapons'
import { buildTestEnv, buildTestSetups } from './testRace'

const racing = (seed = 1) => {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), seed)
  state.phase = 'racing'
  return { env, state }
}

describe('combatStep', () => {
  it('damage accumulates and 100 wrecks the car with an event', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    damageCarSim(state, state.cars[1], 150, events)
    expect(state.cars[1].wrecked).toBe(true)
    expect(events.some((e) => e.type === 'car-wrecked' && e.carId === 'rival-1')).toBe(true)
  })

  it('player wreck ends the race', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    damageCarSim(state, state.cars[0], 150, events)
    expect(state.phase).toBe('finished')
    expect(events.some((e) => e.type === 'race-over' && e.reason === 'player-wrecked')).toBe(true)
  })

  it('damage is ignored during countdown', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 1)
    damageCarSim(state, state.cars[0], 50, [])
    expect(state.cars[0].damage).toBe(0)
  })

  it('firing spends ammo, sets cooldown, spawns a bullet, emits gun-fired', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    const ammoBefore = state.cars[0].ammo
    tryFire(state, state.cars[0], events)
    expect(state.cars[0].ammo).toBe(ammoBefore - 1)
    expect(state.cars[0].gunCooldown).toBeCloseTo(1 / GUN.fireRate)
    expect(state.bullets).toHaveLength(1)
    expect(events.some((e) => e.type === 'gun-fired')).toBe(true)
    tryFire(state, state.cars[0], events) // cooldown blocks
    expect(state.bullets).toHaveLength(1)
  })

  it('a bullet crossing a car damages and shoves it', () => {
    const { env, state } = racing()
    const victim = state.cars[1]
    // place a bullet dead on the victim
    state.bullets.push({ id: 99, x: victim.state.x, y: victim.state.y, vx: 100, vy: 0, ttl: 1, ownerId: 'player' })
    const events: SimEvent[] = []
    updateBullets(state, env, 1 / 60, events)
    expect(victim.damage).toBeGreaterThan(0)
    expect(victim.state.vx).toBeGreaterThan(0)
    expect(state.bullets).toHaveLength(0)
    expect(events.some((e) => e.type === 'bullet-hit' && e.carId === 'rival-1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `src/core/race/combatStep.ts`.**

Transcriptions (verbatim bodies + substitutions):

| Source | Target | Substitutions |
|---|---|---|
| `damageCar` (815–822) | `damageCarSim(state, car, amount, events)` | `_source` param dropped; `armorResistance(car.isPlayer ? career… : car.armorTier)` → `armorResistance(car.armorTier)` (player's armor is baked into `armorTier` at setup); `this.wreckCar(car)` → `wreckCarSim(state, car, events)` |
| `wreckCar` (824–877), sim parts only | private `wreckCarSim` | Keep: `wrecked = true`, player → `state.phase = 'finished'`. Emit `{ type: 'car-wrecked', carId, x, y }` and, for the player, `{ type: 'race-over', reason: 'player-wrecked' }`. ALL visuals (debris, fire glow, scorch, shake, delayedCall) stay in the scene, driven by the event. |
| `tryFire` (688–724) | `tryFire(state, car, events)` | `this.random()`→`nextRandom(state)`; spread: `car.isPlayer ? GUN.playerSpread : car.ai!.aimSpread` unchanged; bullet gets `id: state.nextBulletId++` and `ownerId: car.id`; emit `{ type: 'gun-fired', carId, x: mx, y: my, dir }`; the ammo/cooldown guard, muzzle math, and velocity math verbatim. Audio/muzzle-flash stay scene-side. |
| `updateBullets` (726–764) | `updateBullets(state, env, dt, events)` | `b.owner`→lookup `state.cars.find((c) => c.id === b.ownerId)!`; damage scale `AI_GUNNER.damageScale[env.tier]`; `onBulletHit` (767–784) inlined or private: damage via `damageCarSim`, kick math verbatim, emit `{ type: 'bullet-hit', carId, x: b.x, y: b.y }`; wall check verbatim against `env.barriers` (keep `TIRE_RADIUS = 24` and `CAR_BODY_RADIUS = 30` as module constants — they are sim constants, not visuals), emit `bullet-wall`; `this.phase`→`state.phase`. Bullet-trail particles, sparks, flashes, shake stay scene-side. |

- [ ] **Step 4: Run tests** — task test, then `npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/race/combatStep.ts tests/core/race/combatStep.test.ts
git commit -m "feat(core): combat step — damage, wreck, guns, bullets"
```

---

### Task 5: Mines step

**Files:**
- Create: `src/core/race/minesStep.ts`
- Test: `tests/core/race/minesStep.test.ts`

**Interfaces:**
- Consumes: `mineIsArmed`, `mineIsLive` from `../combat/mines`; `mineBlast` from `../combat/blast`; `launchCar`, `isAirborne` from `../vehicle/carPhysics`; `damageCarSim` (Task 4); data `MINES`, `MINE_BLAST` from `../../data/weapons`.
- Produces:

```ts
export function tryDropMine(state: RaceState, car: CarSim, events: SimEvent[]): void
export function updateMines(state: RaceState, env: RaceEnv, events: SimEvent[]): void
```

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/minesStep.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { tryDropMine, updateMines } from '../../../src/core/race/minesStep'
import type { SimEvent } from '../../../src/core/race/simEvents'
import { MINES } from '../../../src/data/weapons'
import { buildTestEnv, buildTestSetups } from './testRace'

const racing = () => {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), 5)
  state.phase = 'racing'
  return { env, state }
}

describe('minesStep', () => {
  it('drops behind the car, spends a mine, respects cooldown', () => {
    const { state } = racing()
    const events: SimEvent[] = []
    const car = state.cars[0]
    const before = car.mines
    tryDropMine(state, car, events)
    expect(car.mines).toBe(before - 1)
    expect(state.mines).toHaveLength(1)
    expect(events.filter((e) => e.type === 'mine-dropped')).toHaveLength(1)
    tryDropMine(state, car, events) // cooldown blocks
    expect(state.mines).toHaveLength(1)
  })

  it('an armed mine detonates under a rival: damage, launch, event, mine removed', () => {
    const { env, state } = racing()
    const victim = state.cars[1]
    state.mines.push({ id: 1, x: victim.state.x, y: victim.state.y, droppedAt: -100000, ownerId: 'player' })
    const events: SimEvent[] = []
    state.simTimeMs = 10000
    updateMines(state, env, events)
    expect(state.mines).toHaveLength(0)
    expect(victim.damage).toBeGreaterThanOrEqual(MINES.damage * 0.5)
    expect(victim.state.vz).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'mine-detonated')).toBe(true)
  })

  it('the dropper gets an owner grace period', () => {
    const { env, state } = racing()
    const owner = state.cars[0]
    const events: SimEvent[] = []
    tryDropMine(state, owner, events) // dropped right under the owner at simTime 0
    state.simTimeMs = 100 // inside the owner grace
    owner.state.x = state.mines[0].x
    owner.state.y = state.mines[0].y
    updateMines(state, env, events)
    expect(state.mines).toHaveLength(1) // did not blow
  })

  it('an airborne car flies over a live mine', () => {
    const { env, state } = racing()
    const victim = state.cars[1]
    state.mines.push({ id: 1, x: victim.state.x, y: victim.state.y, droppedAt: -100000, ownerId: 'player' })
    victim.state = { ...victim.state, z: 20, vz: 100 }
    state.simTimeMs = 10000
    updateMines(state, env, [])
    expect(state.mines).toHaveLength(1)
  })
})
```

(Adjust the detonation `droppedAt: -100000` if `mineIsLive`'s owner-grace semantics require it — read `src/core/combat/mines.ts` first and mirror its real contract in the test.)

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `src/core/race/minesStep.ts`.**

| Source | Target | Substitutions |
|---|---|---|
| `tryDropMine` (484–512) | same name | `now`→`state.simTimeMs`; mine gets `id: state.nextMineId++`; drop-position math verbatim; emit `{ type: 'mine-dropped', carId, mineId, x, y }`. Sprites/audio scene-side. |
| `updateMines` (514–547) | same name | Loop verbatim minus the blink visuals (`mine.sprite/light/ring` lines deleted — scene renders arming from `mineIsArmed(mine, simTime, MINES)` itself); `this.phase`→`state.phase`; `this.cars`→`state.cars`. |
| `detonateMine` (550–592) | private | `this.random`→`() => nextRandom(state)` passed to `mineBlast`; damage via `damageCarSim(state, car, impulse.damage, events)`; launch math verbatim; emit `{ type: 'mine-detonated', mineId, x, y }`. Explosion FX, scorch, shake scene-side. |

- [ ] **Step 4: Run tests** — task test, then `npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/race/minesStep.ts tests/core/race/minesStep.test.ts
git commit -m "feat(core): mines step — drop, arm, detonate"
```

---

### Task 6: Pickups step

**Files:**
- Create: `src/core/race/pickupsStep.ts`
- Test: `tests/core/race/pickupsStep.test.ts`

**Interfaces:**
- Consumes: `randomPickupSpot`, `PickupType` from `../track/pickups`; `repairDamage` from `../combat/damage`; `nextRandom`; data `GUN`, `MINES`, `PICKUPS`, `TURBO` from `../../data/weapons`.
- Produces: `export function updatePickups(state: RaceState, env: RaceEnv, events: SimEvent[]): void`

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/pickupsStep.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { updatePickups } from '../../../src/core/race/pickupsStep'
import type { SimEvent } from '../../../src/core/race/simEvents'
import { PICKUPS } from '../../../src/data/weapons'
import { buildTestEnv, buildTestSetups } from './testRace'

const racing = () => {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), 9)
  state.phase = 'racing'
  return { env, state }
}

describe('pickupsStep', () => {
  it('driving over a pickup collects it and schedules a respawn', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    const car = state.cars[0]
    car.state.x = p.x
    car.state.y = p.y
    const events: SimEvent[] = []
    updatePickups(state, env, events)
    expect(p.respawnAt).toBe(state.simTimeMs + PICKUPS.respawnMs)
    expect(events.some((e) => e.type === 'pickup-collected' && e.carId === 'player')).toBe(true)
  })

  it('cash pickup pays the collector', () => {
    const { env, state } = racing()
    const p = state.pickups.find((x) => x.type === 'cash')
    if (!p) return // layout may not include one on this seed; keep the test seed-stable if it doesn't
    const car = state.cars[0]
    car.state.x = p.x
    car.state.y = p.y
    updatePickups(state, env, [])
    expect(car.cash).toBe(PICKUPS.cashAmount)
  })

  it('a due respawn relocates the pickup and emits pickup-respawned', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    const oldPos = { x: p.x, y: p.y }
    p.respawnAt = 100
    state.simTimeMs = 200
    const events: SimEvent[] = []
    updatePickups(state, env, events)
    expect(p.respawnAt).toBeNull()
    expect(p.x === oldPos.x && p.y === oldPos.y).toBe(false)
    expect(events.some((e) => e.type === 'pickup-respawned' && e.index === 0)).toBe(true)
  })

  it('trap only traps the player', () => {
    const { env, state } = racing()
    const p = state.pickups[0]
    p.type = 'trap'
    const rival = state.cars[1]
    rival.state.x = p.x
    rival.state.y = p.y
    updatePickups(state, env, [])
    expect(state.trapUntil).toBe(0)
  })
})
```

Fix the `cash` test to be deterministic: pick the seed (or force `state.pickups[0].type = 'cash'`) so the branch always runs — forcing the type is the simpler, deterministic choice; do that instead of the `if (!p) return` guard.

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `src/core/race/pickupsStep.ts`.**

| Source | Target | Substitutions |
|---|---|---|
| `updatePickups` (1019–1038) | same | `now`→`state.simTimeMs`; respawn branch calls private `relocatePickup` then emits `{ type: 'pickup-respawned', index }` (scene handles fade-in + texture swap); collection loop verbatim. |
| `collectPickup` (1040–1073) | private | Switch verbatim (`ammo`/`turbo`/`repair`/`cash`/`trap` including the `turboDepleted` reset and player-only `state.trapUntil = state.simTimeMs + PICKUPS.trapDurationMs`); emit `{ type: 'pickup-collected', carId, index, pickup: p.type, x: p.x, y: p.y }`; toast/audio/sparks scene-side. |
| `relocatePickup` (1075–1096) + `nextPickupType` (1099–1110) | private | `this.random`→`() => nextRandom(state)`; sprite lines deleted; occupied-slot math verbatim. |

- [ ] **Step 4: Run tests** — task test, then `npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/race/pickupsStep.ts tests/core/race/pickupsStep.test.ts
git commit -m "feat(core): pickups step — collect, respawn, relocate"
```

---

### Task 7: stepRace orchestrator + determinism/serialization proof

**Files:**
- Create: `src/core/race/stepRace.ts`
- Test: `tests/core/race/stepRace.test.ts`

**Interfaces:**
- Consumes: everything above, plus `stepCar`, `IDLE_INPUT`, `justLanded`, `isAirborne`, `speed`, `launchCar` from `../vehicle/carPhysics`; `stepTurboMeter` from `../vehicle/turboMeter`; `collideCars` from `../vehicle/collision`; `updateStuckMs`, `needsRescue`, `rescuePose` from `../vehicle/rescue`; `RESCUE` from `../../data/rescue`; `applyGateCrossing`, `nextGateIndex` from `./progress`; `segmentsIntersect`, `distanceToClosedPolyline`, `turnAmount` from `../track/geometry`; `racePlacements` from `./placementSystem`; data `IMPACT_FX`, `RAM_DAMAGE`, `WALL_DAMAGE`, `TURBO`, `WEAPONS_FREE_DELAY_MS` from `../../data/weapons`, `OVERCHARGED_TURBO`, `RAM_PLATING` from `../../data/blackMarket`, `impactDamage` from `../combat/damage`.
- Produces:

```ts
export interface PlayerCommand {
  input: CarInput
  fire: boolean
  turbo: boolean
  dropMine: boolean
}
export const IDLE_COMMAND: PlayerCommand
export function stepRace(state: RaceState, env: RaceEnv, command: PlayerCommand, dtMs: number): SimEvent[]
```

**Structure of `stepRace`** (mirrors `RaceScene.update` 352–449 plus `checkAllRivalsDone` 452–480, `checkGateCrossing` 1461–1480, `applyOffTrackDrag` 1669–1676, `updateStuckRescue` 1682–1702, `resolveBarrierCollisions` 1704–1734, `resolveCarCollisions` 1736–1803):

```ts
export function stepRace(state: RaceState, env: RaceEnv, command: PlayerCommand, dtMs: number): SimEvent[] {
  const events: SimEvent[] = []
  state.simTimeMs += dtMs
  const now = state.simTimeMs

  // -- countdown phase flow (replaces startCountdown's delayedCalls) --
  if (state.phase === 'countdown') {
    const marks = [0, 1000, 2000]
    while (state.countdownAnnounced < 3 && now >= marks[state.countdownAnnounced]) {
      events.push({ type: 'countdown', count: (3 - state.countdownAnnounced) as 3 | 2 | 1 })
      state.countdownAnnounced++
    }
    if (now >= 3000) {
      state.phase = 'racing'
      state.raceStartAt = now
      for (const car of state.cars) car.lapStartAt = now
      events.push({ type: 'race-started' })
    }
  }

  // crash slow-mo dilates movement, not the clock (matches old wall-clock timers)
  const dilation = now < state.slowMoUntil ? IMPACT_FX.crashSlowMoScale : 1
  const dt = (dtMs / 1000) * dilation
  const locked = state.phase === 'countdown'
  const weaponsFree = env.weaponsEnabled && state.phase === 'racing' && now > state.raceStartAt + WEAPONS_FREE_DELAY_MS

  for (const car of state.cars) {
    // input resolution — verbatim from update() 362–393 with:
    //   autoPilot branch driven by state.autoPilot (curvature over env.centerline, threshold 0.12/0.35)
    //   player manual branch: input/fire/turbo from `command`; mine drop:
    //     command.dropMine && state.phase === 'racing' && env.weaponsEnabled → tryDropMine(state, car, events)
    //   AI branch: computeAiInput + computeAiCombat; combat.dropMine → tryDropMine(...)
    //   wantsFire for rivals: combat.fire && env.weaponsEnabled
    // turbo meter — verbatim from 396–413 (env.hasOverTurbo, OVERCHARGED_TURBO, damageCarSim for self-damage)
    // record for renderer:
    //   car.lastInput = input; car.lastTurboActive = turboActive
    // physics — verbatim from 415–428:
    //   prevPos, stepCar(car.state, input, effectiveSpec(state, env, car, turboActive), dt, MINE_BLAST.gravity)
    //   justLanded → events.push({ type: 'car-landed', ... })
    //   wreck velocity decay; applyOffTrackDrag(env, car, dt); resolveBarrierCollisions(state, env, car, events)
    //   updateStuckRescue(state, env, car, dt, events) → 'car-rescued' event on rescue
    // guns — verbatim from 430–433: cooldown decay; wantsFire && weaponsFree && !wrecked &&
    //   (car.finishedAt === null || !car.isPlayer) → tryFire(state, car, events)
    // gates — verbatim from 435 + checkGateCrossing: lap-completed / car-finished events;
    //   player finish → state.phase = 'finished'; events.push({ type: 'race-over', reason: 'player-finished' })
  }

  resolveCarCollisions(state, env, events)
  updateBullets(state, env, dt, events)
  updateMines(state, env, events)
  updatePickups(state, env, events)
  state.placementOrder = racePlacements(state.cars, env.gates)
  checkAllRivalsDone(state, events)
  return events
}
```

Transcription details:
- `applyOffTrackDrag`: `this.track.width / 2` → `env.trackWidth / 2`; keep `OFF_TRACK_DRAG = 1.4` as a module constant.
- `updateStuckRescue`: `this.phase`→`state.phase`; halfWidth from `env.trackWidth / 2`; on rescue set state + `prevPos` and emit `{ type: 'car-rescued', carId }` (camera flash scene-side). `syncCarVisuals` call deleted.
- `resolveBarrierCollisions`: verbatim; on `impact > WALL_DAMAGE.threshold && !isAirborne` → `damageCarSim`; additionally always emit `{ type: 'wall-hit', carId, impact }` when `vn < 0` and `impact > 160` (the scene only uses it for player shake — matching the old `car.isPlayer && impact > 160` condition scene-side).
- `resolveCarCollisions`: verbatim with `env.hasPlating` for `RAM_PLATING`; emit `{ type: 'cars-collided', aId, bId, x: contactX, y: contactY, impact: rel, rammed: rel > RAM_DAMAGE.threshold && !carA.wrecked && !carB.wrecked }`; on `rel > IMPACT_FX.crashSlowMoImpact && (A or B is player)` → `state.slowMoUntil = now + IMPACT_FX.crashSlowMoMs` and emit `{ type: 'crash-lurch', x: contactX, y: contactY }`.
- `checkAllRivalsDone`: verbatim minus toast rendering (scene draws the toast from `state.allRivalsDoneAt` + `simTimeMs`); at `now >= allRivalsDoneAt + 5000` → `state.phase = 'finished'`, emit `{ type: 'race-over', reason: 'rivals-done' }`.
- `checkGateCrossing`: `now` = simTime; lap completion pushes to `car.lapTimes` and emits `{ type: 'lap-completed', carId, lapTimeMs }`; finish emits `car-finished`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/stepRace.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../../src/core/race/raceState'
import { IDLE_COMMAND, stepRace, type PlayerCommand } from '../../../src/core/race/stepRace'
import { FIXED_STEP_MS } from '../../../src/game/race/raceSimulation'
import type { SimEvent } from '../../../src/core/race/simEvents'
import type { RaceState } from '../../../src/core/race/raceState'
import { buildTestEnv, buildTestSetups } from './testRace'

const command = (i: number): PlayerCommand => ({
  input: { throttle: 1, brake: 0, steer: Math.sin(i / 90) * 0.4, handbrake: false },
  fire: i % 300 < 30,
  turbo: i % 600 < 120,
  dropMine: i === 1200,
})

function run(steps: number, seed = 1234) {
  const env = buildTestEnv()
  const state = createRaceState(env, buildTestSetups(), seed)
  const events: SimEvent[] = []
  for (let i = 0; i < steps; i++) events.push(...stepRace(state, env, command(i), FIXED_STEP_MS))
  return { state, events }
}

describe('stepRace', () => {
  it('counts down and starts the race at 3 seconds', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 1)
    const events: SimEvent[] = []
    for (let i = 0; i < Math.ceil(3100 / FIXED_STEP_MS); i++) events.push(...stepRace(state, env, IDLE_COMMAND, FIXED_STEP_MS))
    expect(events.filter((e) => e.type === 'countdown')).toHaveLength(3)
    expect(events.some((e) => e.type === 'race-started')).toBe(true)
    expect(state.phase).toBe('racing')
    expect(state.raceStartAt).toBeGreaterThanOrEqual(3000)
  })

  it('cars are locked during countdown and move after the start', () => {
    const env = buildTestEnv()
    const state = createRaceState(env, buildTestSetups(), 1)
    const x0 = state.cars[0].state.x
    for (let i = 0; i < 60; i++) stepRace(state, env, command(i), FIXED_STEP_MS)
    expect(state.cars[0].state.x).toBe(x0) // locked
    for (let i = 0; i < 600; i++) stepRace(state, env, command(i), FIXED_STEP_MS)
    const moved = Math.hypot(state.cars[0].state.x - x0, state.cars[0].state.y - state.cars[0].prevPos.y)
    expect(moved).toBeGreaterThan(0)
  })

  it('is bit-identical across two runs (determinism)', () => {
    const a = run(60 * 30)
    const b = run(60 * 30)
    expect(a.state).toEqual(b.state)
    expect(a.events).toEqual(b.events)
  })

  it('a JSON snapshot mid-race resumes to an identical future (serialization)', () => {
    const env = buildTestEnv()
    const live = createRaceState(env, buildTestSetups(), 77)
    for (let i = 0; i < 500; i++) stepRace(live, env, command(i), FIXED_STEP_MS)
    const resumed = JSON.parse(JSON.stringify(live)) as RaceState
    for (let i = 500; i < 1000; i++) {
      stepRace(live, env, command(i), FIXED_STEP_MS)
      stepRace(resumed, env, command(i), FIXED_STEP_MS)
    }
    expect(resumed).toEqual(live)
  })

  it('weapons-off env silences player and AI guns and mines', () => {
    const env = buildTestEnv({ weaponsEnabled: false })
    const state = createRaceState(env, buildTestSetups(), 3)
    const events: SimEvent[] = []
    for (let i = 0; i < 60 * 20; i++) events.push(...stepRace(state, env, { ...command(i), fire: true, dropMine: true }, FIXED_STEP_MS))
    expect(events.some((e) => e.type === 'gun-fired' || e.type === 'mine-dropped')).toBe(false)
  })

  it('placements stay in sync and include every car', () => {
    const { state } = run(60 * 10)
    expect([...state.placementOrder].sort()).toEqual(['player', 'rival-1'])
  })
})
```

Note on the weapons-off test: player fire is gated by `weaponsFree` (which requires `env.weaponsEnabled`), and the mine gate includes `env.weaponsEnabled` — both must hold even with ammo/mines present.

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `src/core/race/stepRace.ts`** per the structure and transcription details above. Export `IDLE_COMMAND` as `{ input: IDLE_INPUT, fire: false, turbo: false, dropMine: false }` (spread `IDLE_INPUT` into a fresh object to keep callers from aliasing).

- [ ] **Step 4: Run tests** — task test, then `npm test && npm run build`. Expected: PASS. The determinism and serialization tests are the multiplayer contract — if either is flaky, STOP and find the nondeterminism (usually a missed `this.random`/`Math.random` or wall-clock leak) before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/core/race/stepRace.ts tests/core/race/stepRace.test.ts
git commit -m "feat(core): stepRace orchestrator with determinism + serialization proof"
```

---

### Task 8: RaceScene becomes a renderer

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` (the bulk of the task)

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces: no new public API. The scene's public surface (`abandonRace`, `resumeRaceAudio`, scene key `'Race'`, debug hooks) is unchanged.

This task moves `RaceScene` onto the sim. Work through the following sub-steps in order; the scene will not compile until the sweep is complete, so run the verify steps at the end.

- [ ] **Step 1: New scene fields and create()**

Replace the sim-owning fields (`cars`, `bullets`, `mines`, `pickups`, `placementOrder`, `phase`, `raceStartAt`, `trapUntil`, `slowMoUntil`, `allRivalsDoneAt`) with:

```ts
private sim!: RaceState
private env!: RaceEnv
private clock = new FixedStepClock()
private carInfo = new Map<string, { name: string; color: number; textureKey: string; chassisId?: string }>()
private carViews = new Map<string, CarView>()
private bulletViews = new Map<number, Phaser.GameObjects.Image>()
private mineViews = new Map<number, { sprite: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image }>()
private pickupViews: { sprite: Phaser.GameObjects.Image; pulse: Phaser.Tweens.Tween }[] = []
private mineQueued = false
```

`CarView` is the visual half of the old `CarUnit` (sprite, shadow, exhaust, damageSmoke, turboFlame, flameCone, turboGlow, liveryGlow, headlights, taillights, fireGlow) as a scene-local interface. Keep `this.random` (seeded from `raceSeed`) — it is now cosmetics-only (debris scatter, flame flicker, streaks, scorch rotation).

In `create()`: after building geometry, assemble `this.env` (all fields from track/career/gear as specified in Task 2), build `CarSetup[]` + `carInfo` via a new `buildCarSetups()` (the data half of old `buildCars()` 1269–1339: player from career — `armorTier: this.career.upgrades.armor`, damage carry-over, weapons gating; duel boss; rivals from ladder/talent, `grade: talent.grade`; sabotage pre-damage applied to the strongest setup's `damage`), then `this.sim = createRaceState(this.env, setups, this.raceSeed)`, then `buildCarViews()` (the visual half of old `makeUnit`, one view per sim car, including the overcharge tint block), then `buildPickupViews()` (sprite + pulse per `sim.pickups` entry — reuse `startPickupPulse`). `startCountdown()` now only creates the lights/text objects and draws the initial "3" state; subsequent beats come from events (Step 3).

- [ ] **Step 2: The new update()**

```ts
update(_time: number, delta: number) {
  this.inputManager.update()
  if (this.settings.toggleFire && this.inputManager.justDown('fire')) this.fireToggled = !this.fireToggled
  if (this.settings.toggleTurbo && this.inputManager.justDown('turbo')) this.turboToggled = !this.turboToggled
  if (this.inputManager.justDown('mine')) this.mineQueued = true // latch across 0-step frames

  const command = this.buildPlayerCommand()
  this.clock.advance(delta, (_dt) => {
    const events = stepRace(this.sim, this.env, command, this.clock.stepMs)
    this.handleSimEvents(events)
    command.dropMine = false // consumed by the first step this frame
    this.mineQueued = false
  })

  // render sync (every frame, even 0-step frames)
  for (const car of this.sim.cars) {
    const view = this.carViews.get(car.id)!
    this.syncCarVisuals(car, view)
    this.updateCarEffects(car, view)
  }
  this.syncBulletViews()
  this.syncMineViews()
  this.syncPickupViews()
  this.updateCamera(this.sim.simTimeMs)
  this.updateHud(this.sim.simTimeMs)
}

private buildPlayerCommand(): PlayerCommand {
  const drive: DriveOverride = this.autoInput ?? this.readPlayerInput()
  return {
    input: { throttle: drive.throttle, brake: drive.brake, steer: drive.steer, handbrake: drive.handbrake },
    fire: drive.fire ?? (this.settings.toggleFire ? this.fireToggled : this.inputManager.down('fire')),
    turbo: drive.turbo ?? (this.settings.toggleTurbo ? this.turboToggled : this.inputManager.down('turbo')),
    dropMine: drive.dropMine ?? this.mineQueued,
  }
}
```

Notes: the slow-mo dilation and `simulationDeltaSeconds` call are gone (dilation now lives inside `stepRace`); remove the `simulationDeltaSeconds` import. `syncCarVisuals` and `updateCarEffects` keep their existing bodies but take `(car: CarSim, view: CarView)` and read `car.lastInput`/`car.lastTurboActive` instead of loop-local `input`/`turboActive`. `updateCamera`/`updateHud` swap `this.player`→`this.sim.cars[0]`, `this.phase`→`this.sim.phase`, `this.placementOrder`→`this.sim.placementOrder`, `this.trapUntil`→`this.sim.trapUntil`, `now - this.raceStartAt`→`this.sim.simTimeMs - this.sim.raceStartAt`; HUD standings names/colors come from `this.carInfo`. `updateHud` also owns the rivals-done toast now: visible iff `this.sim.allRivalsDoneAt !== null`, text from `Math.ceil((this.sim.allRivalsDoneAt + 5000 - this.sim.simTimeMs) / 1000)`.

- [ ] **Step 3: Event consumer**

```ts
private handleSimEvents(events: SimEvent[]) {
  for (const e of events) {
    switch (e.type) {
      case 'countdown':
        this.drawCountdown(e.count) // lights + text + audioBus.countdownBeep(false)
        break
      case 'race-started':
        this.onRaceStarted() // GO! text, green lights, beep(true), engineStart, fade-out tween
        break
      case 'gun-fired':
        this.onGunFired(e) // bullet sprite into bulletViews (keyed by matching sim bullet id — spawn from latest state.bullets entry), muzzle flash, distance-based audioBus.shot
        break
      case 'bullet-hit':
        this.onBulletHitFx(e) // sparks, flashCar(view), player: shake + edge flash
        break
      case 'bullet-wall':
        this.hitSparks.explode(3, e.x, e.y)
        break
      case 'car-wrecked':
        this.onCarWreckedFx(e) // old wreckCar visuals (829–871): explosion, debris, fireGlow, scorch, tint, shake
        // player wreck → this.time.delayedCall(2200, () => this.transitionToResults(this.sim.simTimeMs, true)) is
        // handled by 'race-over' below — do NOT double-schedule here
        break
      case 'car-landed':
        this.onLandingFx(e) // old onLanding (595–630) minus state math
        break
      case 'cars-collided':
        this.onCarsCollidedFx(e) // rammed → sparks + flashes; player involved && impact > 180 → shake
        break
      case 'wall-hit':
        if (e.carId === 'player' && e.impact > 160) this.shake(90, Math.min(0.006, e.impact / 60000))
        break
      case 'crash-lurch':
        this.crashLurch(e.x, e.y) // visual part only — slowMoUntil already set in sim
        break
      case 'mine-dropped':
        this.onMineDropped(e) // sprite/light/ring into mineViews, audioBus.pickup(true)
        break
      case 'mine-detonated':
        this.onMineDetonatedFx(e) // explosion FX + scorch + conditional shake; destroy mineViews entry
        break
      case 'pickup-collected':
        this.onPickupCollected(e) // audio (player), toast (player), sparks; hide pickupViews[e.index].sprite
        break
      case 'pickup-respawned':
        this.onPickupRespawned(e.index) // retexture, reposition, restart pulse, fade in
        break
      case 'car-rescued':
        if (e.carId === 'player') this.cameraFlash(160, 40, 40, 50)
        break
      case 'lap-completed':
      case 'car-finished':
        break // HUD reads state; no FX today
      case 'race-over':
        this.onRaceOver(e.reason)
        break
    }
  }
}

private onRaceOver(reason: 'player-finished' | 'player-wrecked' | 'rivals-done') {
  if (reason === 'player-finished') this.time.delayedCall(1400, () => this.transitionToResults(this.sim.simTimeMs, false))
  else if (reason === 'player-wrecked') this.time.delayedCall(2200, () => this.transitionToResults(this.sim.simTimeMs, true))
  else this.transitionToResults(this.sim.simTimeMs, false)
}
```

View sync helpers: `syncBulletViews` walks `sim.bullets`, positions existing sprites, creates any missing (defensive), and destroys sprites whose id vanished; `syncMineViews` does the same plus the arm/blink visuals from old `updateMines` (`mineIsArmed(mine, this.sim.simTimeMs, MINES)` + blink math using `this.sim.simTimeMs`); `syncPickupViews` sets position/texture/visibility from `sim.pickups` (visible iff `respawnAt === null`, with the respawn fade driven by the event).

- [ ] **Step 4: Results, pause, abandon**

`transitionToResults(now, playerWrecked, abandoned)`: replace `this.cars`→`this.sim.cars`, `this.placementOrder`→`this.sim.placementOrder`, `this.raceStartAt`→`this.sim.raceStartAt`, `car.name`→`this.carInfo.get(car.id)!.name`. `abandonRace()` uses `this.sim.simTimeMs` and sets `this.sim.phase = 'finished'`. `openPause()` reads position from `this.sim.placementOrder` and `weaponsFree` from `this.env.weaponsEnabled && this.sim.simTimeMs > this.sim.raceStartAt + WEAPONS_FREE_DELAY_MS`; `currentLap(this.sim.cars[0].progress)`. Pause continues to work by `this.scene.pause()` — the update loop stops, so the sim clock stops: freeze invariant preserved by construction.

- [ ] **Step 5: Delete moved logic**

Delete from the scene (now living in core): `updateBullets`, `onBulletHit` (sim math), `tryFire` (sim math — keep only FX in `onGunFired`), `tryDropMine`/`updateMines`/`detonateMine` (sim math), `updatePickups`/`collectPickup`/`relocatePickup`/`nextPickupType`, `computeAiInput`/`computeAiCombat`/`hasTargetInSights`/`canHit`/`burstGate`/`isBeingChased`/`maybeAutoDropMine`/`nearestArmedMineAhead`, `effectiveSpec`/`progressScore`, `damageCar`/`wreckCar` (sim math), `resolveBarrierCollisions`/`resolveCarCollisions`/`applyOffTrackDrag`/`updateStuckRescue`, `checkGateCrossing`, `checkAllRivalsDone`, `updatePlacements`, the `CarUnit`/`DroppedMine`/`Bullet`/`PickupInstance` interfaces, and the countdown `delayedCall` chain. Keep `DriveOverride`. Remove now-unused imports (the TypeScript build will list them).

- [ ] **Step 6: Verify**

Run: `npm test && npm run build` — Expected: PASS, no unused-import errors.
Browser: `npm run dev`, play a full race on default settings. Check feel parity: countdown beats, driving feel, AI behavior, guns/mines/pickups, wreck FX, HUD (bars, standings, lap/time), camera (boost zoom, trap wobble, crash slow-mo), pause → resume (state identical), Esc → abandon → confirm (DNF results), finish → results with correct times/placements/reward.

- [ ] **Step 7: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "refactor(race): RaceScene renders RaceState; sim runs fixed-step via stepRace"
```

---

### Task 9: Debug hooks on the sim + final verification

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` (`setupDebug`, lines equivalent of old 2501–2646)

**Interfaces:**
- Produces: the same `window.__*` API as before, now reading/writing `this.sim`.

- [ ] **Step 1: Re-point every hook**

| Hook | Change |
|---|---|
| `__getRace` / `__raceSummary` | Read from `this.sim.cars` / `this.sim.placementOrder` / `this.sim.phase`; `c.ai?.talent.grade`→`c.ai?.grade`; `chassis: this.carInfo.get(c.id)?.chassisId`; `elapsedMs` from `this.sim.simTimeMs - this.sim.raceStartAt` |
| `__setDrive` | Unchanged (feeds `autoInput`) |
| `__setCarState` | Mutates `this.sim.cars[0].state` + `prevPos` |
| `__applyDamage` | `damageCarSim(this.sim, car, amount, [])` — feed returned-into events array through `handleSimEvents` so wreck FX still fire: `const ev: SimEvent[] = []; damageCarSim(this.sim, car, amount, ev); this.handleSimEvents(ev)` |
| `__launch` | `car.state = launchCar(car.state, vz)` on the sim car |
| `__dropMineAt` | Same state-juggling trick against `this.sim.cars[0]`, calling core `tryDropMine` with an events array routed through `handleSimEvents` |
| `__autoPilot` | Sets `this.sim.autoPilot` and installs/clears `this.sim.cars[0].ai` (same fields; `grade` from the chosen talent profile; `spec: this.env.playerSpec`) |
| `__pickups` | Maps `this.sim.pickups` |
| `__step`, `__restartRace`, `__setTrack`, `__tracks`, `__carSpec`, `__career`, `__gates` | Unchanged |

- [ ] **Step 2: Full verification suite**

Run: `npm test` — Expected: PASS (all suites).
Run: `npm run build` — Expected: PASS.
Run: `git diff --check` — Expected: no output.

Browser (`npm run dev`, then `?debug=1`):
1. `__step(600)` advances the race deterministically with the tab visible or hidden.
2. `__autoPilot({fire:false, mines:false})` drives the player cleanly; `__autoPilot(null)` hands control back.
3. `__getRace()` and `__raceSummary()` return the same shape as before (spot-check fields).
4. `__setTrack('<another track id>')` restarts on that venue.
5. Full manual smoke: countdown → race → pause (Esc) → resume → race → finish → results → ranking. Then once more: pause → abandon → cancel → resume; pause → abandon → confirm → DNF results. Weapons-off career: fire/mine keys do nothing, rivals never shoot.
6. Same seed twice (`__getRace().track` + seed from results screen): with `__autoPilot` and `__step`, two runs of the same seed produce identical `__raceSummary()` output.

- [ ] **Step 3: Commit**

```bash
git add src/game/scenes/RaceScene.ts
git commit -m "refactor(race): debug hooks target the extracted sim"
```

---

## Self-Review Notes

- **Spec coverage:** serializable `RaceState` (Task 2 + round-trip test), pure `stepRace` (Tasks 3–7 + determinism/serialization tests), fixed-step live loop (Task 8 `FixedStepClock`), scene-as-renderer (Task 8), debug hooks preserved (Task 9), single-player parity (Task 8/9 browser checks). Replay capability falls out of Task 7's command-sequence determinism.
- **Known intentional behavior deltas (all invisible):** (1) sim timers now run on sim time instead of the Phaser wall clock — identical while unpaused, and strictly more correct across pauses; (2) RNG call order differs from the old build, so a given old seed replays differently than before the refactor — new races are self-consistent; (3) mine `lastMineAt` sentinel `-1e9` replaces the accidental wall-clock head-start.
- **Type consistency:** `CarSim.ai.grade` replaces `talent: TalentProfile` everywhere (`canHit`, `__getRace`, `__raceSummary`, `__autoPilot`); `ownerId` replaces the `owner` object reference on bullets/mines; `PlayerCommand` is the single player-input surface.
