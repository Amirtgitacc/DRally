# Multiplayer Car Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each multiplayer car its own size-based performance identity (small = faster/twitchier, big = slower/grippier/tougher) at a fully-upgraded power level, kept in a tight band so every car stays competitive.

**Architecture:** A new pure `mpBalance` module derives each MP car's physics spec and damage-resistance from a shared center tilted by car size. Cars gain optional `spec`/`damageResist` overrides; the sim consumes them when present and falls back to today's behavior when absent, so single-player is completely inert. The server assigns the overrides per human; the client predicts the local car with the same pure function. Specs are never serialized — both sides derive them from `carId` deterministically.

**Tech Stack:** TypeScript (strict), Phaser (presentation only), Vitest, Node `ws` server.

## Global Constraints

- **Multiplayer only.** Do not change single-player rules, economy, upgrades, ladder, or the boss duel. SP must be byte-identical.
- `src/core/` stays browser-independent and serializable — no Phaser imports in core.
- Simulation randomness comes only from the race offer seed; `mpBalance` must be a pure function of `carId` (no `Math.random`, no `Date.now`).
- Persistence/protocol contracts unchanged: MP specs are derived on both client and server from `carId`, never added to snapshots or save schema.
- Before declaring done: run `npm test`, `npm run build`, and `git diff --check`. Browser-test the MP race flow.
- Determinism: server authoritative car (`car.spec = mpCarSpec(id)`) and client predictor (`env.playerSpec = mpCarSpec(localId)`) must use the identical value so prediction matches.

**Tilt formula (locked):**
- Size axis: `t = clamp((sizeScale - 1.05) / 0.15, -1, +1)`
- Centers: `topSpeed 640, accel 850, grip 8.2, turnRate 4.0`
- `topSpeed, accel = center * (1 - 0.05*t)` (small faster)
- `grip, turnRate = center * (1 + 0.06*t)` (big grippier)
- `damageResist = 1 - 0.10*t` (big tougher; multiplier on incoming damage)
- All other spec fields reuse each car's real base values; `mass`/`sizeScale` use real data.

---

### Task 1: Pure `mpBalance` module

**Files:**
- Create: `src/core/vehicle/mpBalance.ts`
- Test: `tests/core/vehicle/mpBalance.test.ts`

**Interfaces:**
- Consumes: `mpCarById` from `src/data/mpCars.ts`, `STARTER_CAR` from `src/data/cars.ts`, `CarPhysicsSpec` from `src/core/vehicle/carPhysics.ts`.
- Produces:
  - `mpCarSpec(carId: string): CarPhysicsSpec`
  - `mpDamageResist(carId: string): number`

- [ ] **Step 1: Write the failing test**

Create `tests/core/vehicle/mpBalance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mpCarSpec, mpDamageResist } from '../../../src/core/vehicle/mpBalance'
import { MP_CAR_OPTIONS } from '../../../src/data/mpCars'

describe('mpCarSpec', () => {
  it('locks the smallest car (marauder, sizeScale 0.90) at the fast/twitchy end', () => {
    const s = mpCarSpec('marauder')
    expect(s.topSpeed).toBeCloseTo(672, 0)
    expect(s.accel).toBeCloseTo(892.5, 1)
    expect(s.grip).toBeCloseTo(7.708, 2)
    expect(s.turnRate).toBeCloseTo(3.76, 2)
  })

  it('locks the largest car (basilisk, sizeScale 1.20) at the slow/grippy end', () => {
    const s = mpCarSpec('basilisk')
    expect(s.topSpeed).toBeCloseTo(608, 0)
    expect(s.accel).toBeCloseTo(807.5, 1)
    expect(s.grip).toBeCloseTo(8.692, 2)
    expect(s.turnRate).toBeCloseTo(4.24, 2)
  })

  it('puts a mid car (jackal, sizeScale 1.00) near the center', () => {
    const s = mpCarSpec('jackal')
    expect(s.topSpeed).toBeCloseTo(650.7, 1)
    expect(s.grip).toBeCloseTo(8.036, 2)
  })

  it('is monotonic: smaller cars are faster and less grippy than bigger cars', () => {
    const bySize = [...MP_CAR_OPTIONS].sort((a, b) => a.sizeScale - b.sizeScale)
    for (let i = 1; i < bySize.length; i++) {
      const small = mpCarSpec(bySize[i - 1].id)
      const big = mpCarSpec(bySize[i].id)
      // strictly monotonic only when sizeScale differs
      if (bySize[i - 1].sizeScale < bySize[i].sizeScale) {
        expect(small.topSpeed).toBeGreaterThan(big.topSpeed)
        expect(small.accel).toBeGreaterThan(big.accel)
        expect(small.grip).toBeLessThan(big.grip)
        expect(small.turnRate).toBeLessThan(big.turnRate)
      }
    }
  })

  it('reuses each car base value for non-tuned fields (drag, brakeForce)', () => {
    const s = mpCarSpec('basilisk')
    expect(s.drag).toBe(0.25)
    expect(s.brakeForce).toBe(1080)
  })

  it('falls back to the starter chassis for an unknown id (no throw)', () => {
    expect(() => mpCarSpec('does-not-exist')).not.toThrow()
    expect(mpCarSpec('does-not-exist')).toEqual(mpCarSpec('jackal'))
  })
})

describe('mpDamageResist', () => {
  it('makes big cars tougher (<1) and small cars softer (>1)', () => {
    expect(mpDamageResist('basilisk')).toBeCloseTo(0.9, 3) // sizeScale 1.20
    expect(mpDamageResist('marauder')).toBeCloseTo(1.1, 3) // sizeScale 0.90
    expect(mpDamageResist('jackal')).toBeCloseTo(1.0333, 3) // sizeScale 1.00
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/vehicle/mpBalance.test.ts`
Expected: FAIL — cannot resolve `src/core/vehicle/mpBalance` / `mpCarSpec is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/core/vehicle/mpBalance.ts`:

```typescript
// Multiplayer-only car balance. Single-player never calls this.
// Every MP car is derived from a shared fully-upgraded power center, then
// tilted by car size: smaller = faster but less grip, bigger = slower but
// grippier and tougher. Pure function of carId (no randomness) so the server
// sim and the client predictor derive identical specs from the same chassis.
import { mpCarById } from '../../data/mpCars'
import { STARTER_CAR } from '../../data/cars'
import type { CarPhysicsSpec } from './carPhysics'

/** Shared MP power center (≈ the roster's average fully-upgraded stats). */
const CENTER = { topSpeed: 640, accel: 850, grip: 8.2, turnRate: 4.0 }

const SIZE_MID = 1.05
const SIZE_HALF_RANGE = 0.15
const SPEED_TILT = 0.05 // topSpeed & accel: small faster
const HANDLING_TILT = 0.06 // grip & turnRate: big grippier
const RESIST_TILT = 0.1 // incoming-damage multiplier: big tougher

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Size axis in [-1, +1]: -1 = smallest MP car, +1 = largest. */
function sizeTilt(sizeScale: number): number {
  return clamp((sizeScale - SIZE_MID) / SIZE_HALF_RANGE, -1, 1)
}

export function mpCarSpec(carId: string): CarPhysicsSpec {
  const base = mpCarById(carId) ?? STARTER_CAR
  const t = sizeTilt(base.sizeScale)
  const speed = 1 - SPEED_TILT * t
  const handling = 1 + HANDLING_TILT * t
  return {
    accel: CENTER.accel * speed,
    brakeForce: base.brakeForce,
    reverseAccel: base.reverseAccel,
    topSpeed: CENTER.topSpeed * speed,
    reverseTopSpeed: base.reverseTopSpeed,
    turnRate: CENTER.turnRate * handling,
    grip: CENTER.grip * handling,
    handbrakeGrip: base.handbrakeGrip,
    drag: base.drag,
    steerSaturationSpeed: base.steerSaturationSpeed,
  }
}

/** Incoming-damage multiplier for an MP car (1 = neutral, <1 tougher). */
export function mpDamageResist(carId: string): number {
  const base = mpCarById(carId) ?? STARTER_CAR
  return 1 - RESIST_TILT * sizeTilt(base.sizeScale)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/vehicle/mpBalance.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/vehicle/mpBalance.ts tests/core/vehicle/mpBalance.test.ts
git commit -m "feat(mp): pure size-based car balance module"
```

---

### Task 2: Optional per-car spec + resistance overrides on car state

**Files:**
- Modify: `src/core/race/raceState.ts` (add fields to `CarSim` and `CarSetup`; wire in `createRaceState`)
- Test: `tests/core/race/mpOverrides.test.ts` (create)

**Interfaces:**
- Consumes: `CarPhysicsSpec` (already imported in `raceState.ts`).
- Produces: `CarSim.spec?: CarPhysicsSpec`, `CarSim.damageResist?: number`, and the same two optional fields on `CarSetup`. Absent (`undefined`) preserves today's behavior.

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/mpOverrides.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../../helpers/raceEnvFixture'
import { mpCarSpec } from '../../../src/core/vehicle/mpBalance'

const baseSetup = (over: Partial<CarSetup>): CarSetup => ({
  id: 'p', isPlayer: true, mass: 1, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null, ...over,
})

describe('createRaceState per-car overrides', () => {
  it('copies spec and damageResist onto the car when the setup provides them', () => {
    const env = buildRaceEnvFixture()
    const spec = mpCarSpec('basilisk')
    const state = createRaceState(env, [baseSetup({ spec, damageResist: 0.9 })], 1)
    expect(state.cars[0].spec).toEqual(spec)
    expect(state.cars[0].damageResist).toBe(0.9)
  })

  it('leaves them undefined when the setup omits them (single-player default)', () => {
    const env = buildRaceEnvFixture()
    const state = createRaceState(env, [baseSetup({})], 1)
    expect(state.cars[0].spec).toBeUndefined()
    expect(state.cars[0].damageResist).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/race/mpOverrides.test.ts`
Expected: FAIL — `spec`/`damageResist` are not on the car object (`undefined` vs the spec object), and TS may flag unknown `CarSetup` fields.

- [ ] **Step 3: Add the fields to the types**

In `src/core/race/raceState.ts`, inside `interface CarSim` (after the `ai: CarAiSim | null` line, currently line 54), add:

```typescript
  /** MP-only per-car physics override. Absent in single-player (uses env.playerSpec). */
  spec?: CarPhysicsSpec
  /** MP-only incoming-damage multiplier. Absent falls back to armorResistance(armorTier). */
  damageResist?: number
```

In `interface CarSetup` (after `armorTier: number`, currently line 115), add:

```typescript
  /** MP-only per-car physics override; omit for single-player. */
  spec?: CarPhysicsSpec
  /** MP-only incoming-damage multiplier; omit for single-player. */
  damageResist?: number
```

- [ ] **Step 4: Wire them through `createRaceState`**

In `src/core/race/raceState.ts`, in the `state.cars = setups.map(...)` return object (currently the block around lines 158-167), add these two lines alongside the other setup-copied fields (e.g. right after `armorTier: setup.armorTier, trapUntil: 0, ai: setup.ai,`):

```typescript
      spec: setup.spec, damageResist: setup.damageResist,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/core/race/mpOverrides.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add src/core/race/raceState.ts tests/core/race/mpOverrides.test.ts
git commit -m "feat(mp): optional per-car spec and damageResist on car state"
```

---

### Task 3: Consume the overrides in the simulation

**Files:**
- Modify: `src/core/race/aiControl.ts:29` (spec resolution)
- Modify: `src/core/race/combatStep.ts:17` (damage resistance)
- Test: `tests/core/race/mpSimOverrides.test.ts` (create)

**Interfaces:**
- Consumes: `CarSim.spec`, `CarSim.damageResist` from Task 2.
- Produces: movement uses `car.spec` when present; `damageCarSim` uses `car.damageResist` when present. No signature changes.

- [ ] **Step 1: Write the failing test**

Create `tests/core/race/mpSimOverrides.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../../helpers/raceEnvFixture'
import { effectiveSpec } from '../../../src/core/race/aiControl'
import { damageCarSim } from '../../../src/core/race/combatStep'
import { mpCarSpec } from '../../../src/core/vehicle/mpBalance'

const human = (over: Partial<CarSetup>): CarSetup => ({
  id: 'p', isPlayer: true, mass: 1, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null, ...over,
})

describe('simulation consumes MP per-car overrides', () => {
  it('effectiveSpec uses car.spec for a human when present, not env.playerSpec', () => {
    const env = buildRaceEnvFixture() // env.playerSpec = STARTER_CAR (topSpeed 520)
    const spec = mpCarSpec('marauder') // topSpeed ~672
    const state = createRaceState(env, [human({ spec })], 1)
    const resolved = effectiveSpec(state, env, state.cars[0], false)
    expect(resolved.topSpeed).toBeCloseTo(spec.topSpeed, 3)
    expect(resolved.topSpeed).not.toBeCloseTo(env.playerSpec.topSpeed, 0)
  })

  it('effectiveSpec falls back to env.playerSpec when car.spec is absent (single-player)', () => {
    const env = buildRaceEnvFixture()
    const state = createRaceState(env, [human({})], 1)
    const resolved = effectiveSpec(state, env, state.cars[0], false)
    expect(resolved.topSpeed).toBeCloseTo(env.playerSpec.topSpeed, 3)
  })

  it('damageCarSim scales incoming damage by car.damageResist when present', () => {
    const env = buildRaceEnvFixture({ raceEndMode: 'all-humans' })
    const state = createRaceState(env, [human({ damageResist: 0.5 })], 1)
    state.phase = 'racing' // damageCarSim no-ops during countdown
    damageCarSim(state, env, state.cars[0], 20, [])
    expect(state.cars[0].damage).toBeCloseTo(10, 3) // 20 * 0.5
  })

  it('damageCarSim falls back to armorResistance when damageResist is absent', () => {
    const env = buildRaceEnvFixture({ raceEndMode: 'all-humans' })
    const state = createRaceState(env, [human({ armorTier: 0 })], 1)
    state.phase = 'racing'
    damageCarSim(state, env, state.cars[0], 20, [])
    expect(state.cars[0].damage).toBeCloseTo(20, 3) // resistance 1.0
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/race/mpSimOverrides.test.ts`
Expected: FAIL — first test resolves to `env.playerSpec.topSpeed` (520), and the resistance test still applies full 20 damage.

- [ ] **Step 3: Consume `car.spec` in `effectiveSpec`**

In `src/core/race/aiControl.ts`, change line 29 from:

```typescript
  let spec = car.isPlayer ? env.playerSpec : car.ai!.spec
```

to:

```typescript
  // MP cars carry a per-car spec override; SP humans have none and use env.playerSpec
  let spec = car.spec ?? (car.isPlayer ? env.playerSpec : car.ai!.spec)
```

- [ ] **Step 4: Consume `car.damageResist` in `damageCarSim`**

In `src/core/race/combatStep.ts`, change line 17 from:

```typescript
  const resistance = armorResistance(car.armorTier)
```

to:

```typescript
  // MP cars carry a size-based resistance; SP cars fall back to armor tier
  const resistance = car.damageResist ?? armorResistance(car.armorTier)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/core/race/mpSimOverrides.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 6: Commit**

```bash
git add src/core/race/aiControl.ts src/core/race/combatStep.ts tests/core/race/mpSimOverrides.test.ts
git commit -m "feat(mp): sim consumes per-car spec and damage resistance"
```

---

### Task 4: Assign MP balance to human cars on the server

**Files:**
- Modify: `server/raceSetup.ts` (human branch, currently lines 73-85)
- Modify: `tests/net/raceSetup.test.ts` (extend)

**Interfaces:**
- Consumes: `mpCarSpec`, `mpDamageResist` from Task 1; the `CarSetup.spec`/`.damageResist`/`.sizeScale` fields from Task 2.
- Produces: each human `CarSetup` now has `spec`, `damageResist`, and `sizeScale` set from its chosen chassis.

- [ ] **Step 1: Write the failing test**

In `tests/net/raceSetup.test.ts`, add these imports at the top (next to the existing imports):

```typescript
import { mpCarSpec, mpDamageResist } from '../../src/core/vehicle/mpBalance'
import { mpCarById } from '../../src/data/mpCars'
```

Then add a new test inside the `describe('buildNetworkRace', ...)` block:

```typescript
  it('gives each human its chassis MP spec, resistance, and sizeScale', () => {
    const players: LobbyPlayer[] = [
      { id: 'a', name: 'Ana', carId: 'basilisk', variantId: 'base', ready: true, isAi: false },
      { id: 'b', name: 'Bo', carId: 'marauder', variantId: 'base', ready: true, isAi: false },
    ]
    const { setups } = buildNetworkRace(players, true, track, SEED)
    const a = setups.find((s) => s.id === 'a')!
    const b = setups.find((s) => s.id === 'b')!
    expect(a.spec).toEqual(mpCarSpec('basilisk'))
    expect(a.damageResist).toBeCloseTo(mpDamageResist('basilisk'), 6)
    expect(a.sizeScale).toBe(mpCarById('basilisk')!.sizeScale)
    // bigger basilisk is slower + tougher than the smaller marauder
    expect(a.spec!.topSpeed).toBeLessThan(b.spec!.topSpeed)
    expect(a.damageResist!).toBeLessThan(b.damageResist!)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/net/raceSetup.test.ts`
Expected: FAIL — human setups have no `spec`/`damageResist`; `a.spec` is `undefined`.

- [ ] **Step 3: Set the fields in the human branch**

In `server/raceSetup.ts`, add the import near the other core imports (e.g. after the `effectiveCarSpec` import on line 18):

```typescript
import { mpCarSpec, mpDamageResist } from '../src/core/vehicle/mpBalance'
```

Then, in the human `else` branch, replace the `setups.push({ ... })` object (currently lines 75-84) with:

```typescript
      setups.push({
        id: player.id,
        isPlayer: true,
        mass: car.mass,
        sizeScale: car.sizeScale,
        spec: mpCarSpec(car.id),
        damageResist: mpDamageResist(car.id),
        damage: 0,
        ammo: weaponsEnabled ? GUN.ammoMax : 0,
        mines: weaponsEnabled ? STOCK_MINES : 0,
        armorTier: 0,
        ai: null,
      })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/net/raceSetup.test.ts`
Expected: PASS — including the existing `armorTier === 0` / weapons-off cases, which are unchanged.

- [ ] **Step 5: Commit**

```bash
git add server/raceSetup.ts tests/net/raceSetup.test.ts
git commit -m "feat(mp): assign size-based spec and toughness to human cars"
```

---

### Task 5: Predict the local car with its MP spec (client)

**Files:**
- Modify: `src/game/scenes/RaceScene.ts` (`setupNetworkRace`, currently lines 371-377)
- Modify: `server/index.ts:20-23` (comment tidy only — behavior unchanged)

**Interfaces:**
- Consumes: `mpCarSpec` from Task 1; `raceStart.roster` (has `id`, `chassisId`) and `raceStart.youId`.
- Produces: `this.playerSpec` for a network race equals the local player's MP spec, so `NetworkSource`'s predictor integrates the local car the same way the server does.

This task is presentation glue verified in the browser (Task 6), not by a unit test.

- [ ] **Step 1: Import `mpCarSpec` in RaceScene**

In `src/game/scenes/RaceScene.ts`, add to the imports (near the existing `effectiveCarSpec`/`carById` imports):

```typescript
import { mpCarSpec } from '../../core/vehicle/mpBalance'
```

- [ ] **Step 2: Use the local car's MP spec**

In `setupNetworkRace`, replace the stock-spec line (currently line 372):

```typescript
    // stock chassis with no upgrades — network camera/HUD read spec, never the career
    this.playerSpec = effectiveCarSpec(carById(STARTER_CAR.id), NO_UPGRADES)
```

with:

```typescript
    // predict/render the local car with its own MP balance spec, matching the
    // server (both derive it purely from the chosen chassis id)
    const localChassis = raceStart.roster.find((r) => r.id === raceStart.youId)?.chassisId
    this.playerSpec = mpCarSpec(localChassis ?? STARTER_CAR.id)
```

(Leave the `carById`/`effectiveCarSpec`/`STARTER_CAR`/`NO_UPGRADES` imports in place — they are still used elsewhere in the file, e.g. the single-player path. If `npm run build` reports one of them as now-unused, remove only the genuinely unused import.)

- [ ] **Step 3: Update the stale server comment**

In `server/index.ts`, update the comment on lines 20-22 to reflect that humans now drive per-car specs; `DEFAULT_PLAYER_SPEC` remains only as a benign `env.playerSpec` fallback that MP human cars never consult (they carry `car.spec`):

```typescript
// env.playerSpec fallback for any human car without a per-car spec override.
// In MP every human now carries car.spec = mpCarSpec(chassis) (see raceSetup.ts),
// so this is only a defensive default and no longer the human driving spec.
const DEFAULT_PLAYER_SPEC = effectiveCarSpec(carById(STARTER_CAR.id), NO_UPGRADES)
```

- [ ] **Step 4: Type-check the client change**

Run: `npm run build`
Expected: PASS (strict TypeScript compile + Vite build, no errors).

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/RaceScene.ts server/index.ts
git commit -m "feat(mp): predict local car with its MP balance spec"
```

---

### Task 6: Full verification & browser MP smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — all suites green, including the new `mpBalance`, `mpOverrides`, `mpSimOverrides`, and extended `raceSetup` tests, and every pre-existing test (proves single-player is unchanged).

- [ ] **Step 2: Strict build**

Run: `npm run build`
Expected: PASS (no TS errors).

- [ ] **Step 3: Whitespace/diff hygiene**

Run: `git diff --check`
Expected: no output (no trailing-whitespace or conflict markers).

- [ ] **Step 4: Browser MP smoke test**

Start the dev server and the MP server per project convention (`npm run dev`, plus the websocket server on its configured port), then open two clients into one lobby.

Verify:
- Pick a small car (Pride) in one client and a big car (Vanet) in the other; the small car noticeably pulls ahead on the long straight, the big car holds a tighter cornering line and survives more weapon/wall hits.
- Local car motion is smooth — no rubber-banding or snapping (confirms client prediction matches the server spec).
- Weapons-off MP still disables weapons/mines and black-market entry.
- Single-player: start a normal career race and confirm car feel is unchanged from before.

- [ ] **Step 5: Final commit (if any browser-driven tweaks were needed)**

Only if Step 4 surfaced a fix. Otherwise the feature is complete on the prior commits.

```bash
git add -A
git commit -m "fix(mp): browser-smoke polish for car balance"
```

---

## Self-Review

**Spec coverage:**
- Per-car MP identity from size → Task 1 (`mpCarSpec`), consumed Task 3, assigned Task 4/5. ✓
- Fully-upgraded shared center + tilt formula → Task 1 constants + locked snapshot test. ✓
- Toughness = damage-resist + shoving → `mpDamageResist` (Task 1/3/4) + existing `mass` kept in Task 4 (`mass: car.mass`). ✓
- SP untouched → Tasks 2/3 make overrides optional with fallback; Task 6 Step 1 (full suite) + Step 4 SP check verify. ✓
- `sizeScale` server-side alignment fix → Task 4 sets `sizeScale: car.sizeScale`. ✓
- Determinism / no serialization → `mpCarSpec` pure (Task 1); server and client both derive from `carId` (Task 4/5); no snapshot/protocol change. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code and every run step shows the exact command + expected result.

**Type consistency:** `mpCarSpec(carId: string): CarPhysicsSpec` and `mpDamageResist(carId: string): number` are used with those exact signatures in Tasks 3, 4, 5. `CarSim.spec`/`.damageResist` and `CarSetup.spec`/`.damageResist` (Task 2) match the reads in Tasks 3–4. `raceStart.roster[].chassisId` / `.id` / `raceStart.youId` match the existing usage already in `RaceScene.ts`.
