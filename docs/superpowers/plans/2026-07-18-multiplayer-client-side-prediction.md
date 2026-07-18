# Multiplayer Client-Side Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Predict the local player's own car on the client each frame and reconcile it against the authoritative server, so steering/throttle feel instant instead of ~66ms delayed.

**Architecture:** Extract the sim's per-car movement into one shared pure function (`stepCarMovement`) used by both the server sim and a new client-side `LocalPredictor`. The predictor advances the local car every frame from local input, and on each server snapshot it snaps to the server's authoritative state, replays not-yet-acknowledged inputs, and eases the correction with a decaying position offset. Other cars stay interpolated behind the newest snapshot exactly as today.

**Tech Stack:** TypeScript (strict), Phaser 3 (client only), `ws` server. Pure sim in `src/core/`, Phaser presentation in `src/game/`, Node WS host in `server/`.

## Global Constraints

- `src/core/` stays Phaser-free and serializable; the movement extraction must not import anything browser-specific.
- `stepRace`'s determinism contract is preserved: identical seed + identical command sequence → identical state and events. Task 1 is a **behavior-preserving refactor** — the existing suite must pass unchanged.
- Sequence numbers / acks are a transport concern: they live in the protocol and transport layers, never in `RaceState` or `RaceSnapshot`.
- Movement-only prediction. Fire, mines, car-to-car collisions, gates, laps stay server-authoritative. The predictor never runs weapons, gates, or car-to-car collision.
- Multiplayer is stock cars, weapons-on, no overcharge, no plating (`hasOverTurbo: false`, `hasPlating: false`).
- Before declaring done: `npm test`, `npm run build`, `npm run server:check`, `git diff --check`.

---

### Task 1: Extract `stepCarMovement` (behavior-preserving refactor)

Move the per-car movement block and its three private helpers out of `stepRace` into a new shared module, and call it from the loop. No behavior change.

**Files:**
- Create: `src/core/race/carMovement.ts`
- Modify: `src/core/race/stepRace.ts` (replace lines ~116–154 with a call; delete moved helpers + constants; fix imports)
- Test: `tests/core/race/carMovement.test.ts`

**Interfaces:**
- Produces: `stepCarMovement(state: RaceState, env: RaceEnv, car: CarSim, input: CarInput, wantsTurbo: boolean, dt: number, events: SimEvent[]): void` — advances one car's turbo meter, core physics, off-track drag, wall collision, and stuck rescue for a single step of `dt` **seconds** (already dilated by the caller). Mutates `car`; may push `car-landed`, `car-rescued`, `wall-hit`, and damage-driven events.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/race/carMovement.test.ts
import { describe, it, expect } from 'vitest'
import { stepCarMovement } from '../../../src/core/race/carMovement'
import { createRaceState, type CarSetup } from '../../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../../helpers/raceEnvFixture'
import type { SimEvent } from '../../../src/core/race/simEvents'

function oneCar() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [{ id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }]
  const state = createRaceState(env, setups, 1)
  state.phase = 'racing'
  return { state, env, car: state.cars[0] }
}

describe('stepCarMovement', () => {
  it('accelerates a car under throttle', () => {
    const { state, env, car } = oneCar()
    const x0 = car.state.x
    const events: SimEvent[] = []
    for (let i = 0; i < 30; i++) {
      stepCarMovement(state, env, car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, false, 1 / 60, events)
      state.simTimeMs += 1000 / 60
    }
    expect(Math.hypot(car.state.x - x0, car.state.y - car.state.y)).toBeGreaterThan(0)
    expect(car.state.vx * car.state.vx + car.state.vy * car.state.vy).toBeGreaterThan(0)
  })

  it('records lastInput/lastTurboActive for the renderer', () => {
    const { state, env, car } = oneCar()
    const input = { throttle: 0.5, brake: 0, steer: 0.2, handbrake: false }
    stepCarMovement(state, env, car, input, false, 1 / 60, [])
    expect(car.lastInput).toEqual(input)
    expect(typeof car.lastTurboActive).toBe('boolean')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/race/carMovement.test.ts`
Expected: FAIL — `stepCarMovement` is not exported from a module that doesn't exist yet.

- [ ] **Step 3: Create `carMovement.ts` with the extracted code**

Move the exact logic — do not rewrite it. The body of `stepCarMovement` is `stepRace.ts` lines 116–154 verbatim (from `const overcharged` through the `updateStuckRescue(...)` call). The three helpers and the three constants move with it.

```ts
// src/core/race/carMovement.ts
// One car's movement for a single fixed step: turbo meter, core physics,
// off-track drag, wall collision, stuck rescue. Shared by the server sim
// (stepRace) and the client-side predictor (localPredictor) so both integrate
// the local car identically. No car-to-car collision, weapons, or gates here.
import { isAirborne, justLanded, speed, stepCar, type CarInput } from '../vehicle/carPhysics'
import { stepTurboMeter } from '../vehicle/turboMeter'
import { needsRescue, rescuePose, updateStuckMs } from '../vehicle/rescue'
import { RESCUE } from '../../data/rescue'
import { distanceToClosedPolyline } from '../track/geometry'
import { effectiveSpec } from './aiControl'
import { damageCarSim } from './combatStep'
import { impactDamage } from '../combat/damage'
import { MINE_BLAST, TURBO, WALL_DAMAGE } from '../../data/weapons'
import { OVERCHARGED_TURBO } from '../../data/blackMarket'
import { nextGateIndex } from './progress'
import type { CarSim, RaceEnv, RaceState } from './raceState'
import type { SimEvent } from './simEvents'

const CAR_RADIUS = 34
const TIRE_RADIUS = 24
const OFF_TRACK_DRAG = 1.4

export function stepCarMovement(
  state: RaceState,
  env: RaceEnv,
  car: CarSim,
  input: CarInput,
  wantsTurbo: boolean,
  dt: number,
  events: SimEvent[],
): void {
  const locked = state.phase === 'countdown'

  // Empty turbo stays locked while the button is held. Without that latch,
  // a zero tank alternated recharge/boost every frame and left the VFX on.
  const overcharged = car.isPlayer && env.hasOverTurbo
  const drain = TURBO.drainPerSec * (overcharged ? OVERCHARGED_TURBO.drainScale : 1)
  const turboStep = stepTurboMeter(
    { charge: car.turbo, depleted: car.turboDepleted },
    wantsTurbo,
    !car.wrecked && !locked && !isAirborne(car.state),
    dt,
    { drainPerSec: drain, rechargePerSec: TURBO.rechargePerSec, restartThreshold: TURBO.restartThreshold },
  )
  car.turbo = turboStep.state.charge
  car.turboDepleted = turboStep.state.depleted
  const turboActive = turboStep.active
  if (turboActive && overcharged) {
    damageCarSim(state, car, OVERCHARGED_TURBO.selfDamagePerSec * dt, events)
  }

  car.lastInput = input
  car.lastTurboActive = turboActive

  car.prevPos = { x: car.state.x, y: car.state.y }
  const before = car.state
  car.state = stepCar(car.state, input, effectiveSpec(state, env, car, turboActive), dt, MINE_BLAST.gravity)
  if (justLanded(before, car.state)) {
    events.push({ type: 'car-landed', carId: car.id, x: car.state.x, y: car.state.y })
  }
  if (car.wrecked) {
    const decay = Math.exp(-3 * dt)
    car.state.vx *= decay
    car.state.vy *= decay
  }
  if (!isAirborne(car.state)) applyOffTrackDrag(env, car, dt)
  resolveBarrierCollisions(state, env, car, events)
  updateStuckRescue(state, env, car, dt, events)
}

function applyOffTrackDrag(env: RaceEnv, car: CarSim, dt: number): void {
  const dist = distanceToClosedPolyline({ x: car.state.x, y: car.state.y }, env.centerline)
  if (dist > env.trackWidth / 2) {
    const decay = Math.exp(-OFF_TRACK_DRAG * dt)
    car.state.vx *= decay
    car.state.vy *= decay
  }
}

function updateStuckRescue(state: RaceState, env: RaceEnv, car: CarSim, dt: number, events: SimEvent[]): void {
  if (state.phase !== 'racing' || car.wrecked || car.finishedAt !== null || isAirborne(car.state)) {
    car.stuckMs = 0
    return
  }
  const sample = {
    speed: speed(car.state),
    offCenter: distanceToClosedPolyline({ x: car.state.x, y: car.state.y }, env.centerline),
    halfWidth: env.trackWidth / 2,
  }
  car.stuckMs = updateStuckMs(car.stuckMs, sample, dt * 1000, RESCUE)
  if (!needsRescue(car.stuckMs, RESCUE)) return

  car.stuckMs = 0
  const gate = env.gates[nextGateIndex(car.progress) % env.gates.length]
  const pose = rescuePose(gate.a, gate.b, gate.tangent)
  car.state = { ...car.state, ...pose, z: 0, vz: 0, vx: 0, vy: 0 }
  car.prevPos = { x: pose.x, y: pose.y }
  events.push({ type: 'car-rescued', carId: car.id })
}

function resolveBarrierCollisions(state: RaceState, env: RaceEnv, car: CarSim, events: SimEvent[]): void {
  const s = car.state
  const minDist = CAR_RADIUS + TIRE_RADIUS
  for (const b of env.barriers) {
    const dx = s.x - b.x
    const dy = s.y - b.y
    if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) continue
    const dist = Math.hypot(dx, dy)
    if (dist > 0 && dist < minDist) {
      const nx = dx / dist
      const ny = dy / dist
      s.x = b.x + nx * minDist
      s.y = b.y + ny * minDist
      const vn = s.vx * nx + s.vy * ny
      if (vn < 0) {
        s.vx -= 1.5 * vn * nx
        s.vy -= 1.5 * vn * ny
        s.vx *= 0.8
        s.vy *= 0.8
        const impact = Math.abs(vn)
        if (impact > WALL_DAMAGE.threshold && !isAirborne(s)) {
          damageCarSim(state, car, impactDamage(impact, WALL_DAMAGE), events)
        }
        if (impact > 160) {
          events.push({ type: 'wall-hit', carId: car.id, impact })
        }
      }
    }
  }
}
```

- [ ] **Step 4: Update `stepRace.ts` to call it**

In the per-car loop, replace lines 116–154 (from the `// Empty turbo stays locked…` comment through `updateStuckRescue(state, env, car, dt, events)`) with a single call:

```ts
    stepCarMovement(state, env, car, input, wantsTurbo, dt, events)
```

Then delete from `stepRace.ts`: the now-moved functions `applyOffTrackDrag`, `updateStuckRescue`, `resolveBarrierCollisions`, and the constants `CAR_RADIUS` and `TIRE_RADIUS` (keep `CAR_BODY_RADIUS` — still used by `resolveCarCollisions`; keep `OFF_TRACK_DRAG` deleted since it moved). Add `import { stepCarMovement } from './carMovement'`. Run `npm run build` and remove any imports that strict TypeScript now reports as unused (candidates: `stepTurboMeter`, `stepCar`, `justLanded`, `updateStuckMs`, `needsRescue`, `rescuePose`, `RESCUE`, `distanceToClosedPolyline`, `TURBO`, `OVERCHARGED_TURBO`, `MINE_BLAST`, `WALL_DAMAGE`, `impactDamage`, `speed`) — but **keep any still referenced elsewhere in `stepRace.ts`** (e.g. `isAirborne`, `effectiveSpec`, `damageCarSim`, `speed` if used by other functions). Let the build be the authority.

- [ ] **Step 5: Run the full suite + build**

Run: `npx vitest run tests/core/race/carMovement.test.ts && npm test && npm run build`
Expected: new tests PASS; all existing tests PASS unchanged; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/race/carMovement.ts src/core/race/stepRace.ts tests/core/race/carMovement.test.ts
git commit -m "refactor(sim): extract shared stepCarMovement from stepRace"
```

---

### Task 2: Protocol — input `seq` + snapshot `acks`

**Files:**
- Modify: `src/core/net/protocol.ts`
- Test: `tests/core/net/protocol.test.ts`

**Interfaces:**
- Produces: `input` ClientMsg gains `seq: number`; `snapshot` ServerMsg gains `acks: Record<string, number>`.

- [ ] **Step 1: Write the failing test**

Add to `tests/core/net/protocol.test.ts`:

```ts
it('input carries a seq and snapshot carries per-player acks', () => {
  const input: ClientMsg = {
    t: 'input', seq: 7,
    command: { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false },
  }
  expect(input.t === 'input' && input.seq).toBe(7)

  const snap: ServerMsg = { t: 'snapshot', snap: {} as any, events: [], acks: { a: 3, b: 5 } }
  expect(snap.t === 'snapshot' && snap.acks.a).toBe(3)
})
```

(Add `ClientMsg`/`ServerMsg` to the existing import from `../../../src/core/net/protocol` if not already imported.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/net/protocol.test.ts`
Expected: FAIL — `seq`/`acks` are not on the types (vitest transpiles, so this surfaces via the `.toBe` assertions on `undefined`, and `npm run build` fails to compile).

- [ ] **Step 3: Update the protocol types**

```ts
// in ClientMsg union — replace the input variant:
  | { t: 'input'; command: PlayerCommand; seq: number }

// in ServerMsg union — replace the snapshot variant:
  | { t: 'snapshot'; snap: RaceSnapshot; events: SimEvent[]; acks: Record<string, number> }
```

- [ ] **Step 4: Run test + build**

Run: `npx vitest run tests/core/net/protocol.test.ts && npm run build`
Expected: the protocol test PASSES; `npm run build` now FAILS in `server/` and `src/game/` where `input`/`snapshot` are constructed without the new fields — that is expected and fixed in Tasks 3 and 5. (Run `npm run server:check` too; same expected failures.)

- [ ] **Step 5: Commit**

```bash
git add src/core/net/protocol.ts tests/core/net/protocol.test.ts
git commit -m "feat(net): add input seq and snapshot acks to the protocol"
```

---

### Task 3: Server — track last-applied seq, emit acks

**Files:**
- Modify: `server/raceHost.ts`
- Modify: `server/index.ts`
- Test: `tests/net/raceHost.test.ts`

**Interfaces:**
- Consumes: `stepCarMovement` (indirectly, via `stepRace`); protocol `acks`.
- Produces: `RaceHost.setInput(playerId: string, command: PlayerCommand, seq: number)`; each emitted `snapshot` message includes `acks[playerId]` = the newest seq passed to `setInput` before that tick.

- [ ] **Step 1: Write the failing test**

Add to `tests/net/raceHost.test.ts`:

```ts
it('emits acks equal to the newest seq applied before the tick', () => {
  vi.useFakeTimers()
  const host = racingHost()
  const msgs: Array<{ acks: Record<string, number> }> = []
  host.start((m) => msgs.push(m as any), () => {})

  host.setInput('a', cmd(false), 4)
  host.setInput('a', cmd(false), 9) // newest before the tick
  vi.advanceTimersByTime(34)

  expect(msgs.at(-1)!.acks.a).toBe(9)
  host.stop()
})
```

(`racingHost` and `cmd` already exist in this file from the mine-latch tests. Update the two existing `host.setInput('a', cmd(true))` / `cmd(false)` calls in that file to pass a seq argument, e.g. `host.setInput('a', cmd(true), 1)` — see Step 3's signature change.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/net/raceHost.test.ts`
Expected: FAIL — `setInput` takes 2 args and the snapshot message has no `acks`.

- [ ] **Step 3: Update `raceHost.ts`**

Add a `lastSeq` map, accept `seq` in `setInput`, and attach `acks` when emitting each snapshot:

```ts
// field, next to `mineLatched`:
  private lastSeq: Record<string, number> = {}

// setInput gains seq:
  setInput(playerId: string, command: PlayerCommand, seq: number): void {
    if (command.dropMine) this.mineLatched[playerId] = true
    this.commands[playerId] = command
    this.lastSeq[playerId] = seq
  }

// in the tick, change the onTick emit to include acks:
        const events = stepRace(this.state, this.env, this.tickCommands(), TICK_MS)
        this.mineLatched = {}
        onTick({ t: 'snapshot', snap: toRaceSnapshot(this.state), events, acks: { ...this.lastSeq } })
```

- [ ] **Step 4: Update `server/index.ts`**

Validate `seq` and forward it. In `isValidCommand`, keep it command-only; add the seq check at the call site in the `input` case:

```ts
      case 'input': {
        if (!conn.code || !conn.playerId) return
        const host = hosts.get(conn.code)
        if (host && isValidCommand(msg.command) && typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
          host.setInput(conn.playerId, msg.command, msg.seq)
        }
        return
      }
```

- [ ] **Step 5: Run tests + server typecheck**

Run: `npx vitest run tests/net/raceHost.test.ts && npm run server:check`
Expected: raceHost tests PASS; `server:check` clean.

- [ ] **Step 6: Commit**

```bash
git add server/raceHost.ts server/index.ts tests/net/raceHost.test.ts
git commit -m "feat(server): track last-applied input seq and emit per-player acks"
```

---

### Task 4: `LocalPredictor`

The client-side predictor: owns the local car's predicted "truth", replays unacked inputs on reconcile, and eases corrections with a decaying offset. Keeps the predicted truth separate from the rendered (offset-adjusted) position so smoothing never feeds back into the simulation.

**Files:**
- Create: `src/game/race/localPredictor.ts`
- Test: `tests/game/localPredictor.test.ts`

**Interfaces:**
- Consumes: `stepCarMovement`; `CarSim`, `RaceEnv`, `RaceState` from core; `CarSnapshot` from `core/net/snapshot`; `PlayerCommand` from `core/race/stepRace`.
- Produces:
  - `new LocalPredictor(state, env, seedCar)` — clones `seedCar` as the internal truth.
  - `predict(seq, command, dtMs)` — steps the truth one frame.
  - `reconcile(server: CarSnapshot, ackSeq: number)` — adopts server movement fields, drops acked inputs, replays the rest, folds the correction into the offset (snaps if beyond `SNAP_DISTANCE`).
  - `writeInto(renderCar: CarSim)` — decays the offset and writes truth+offset movement fields into `renderCar`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/game/localPredictor.test.ts
import { describe, it, expect } from 'vitest'
import { LocalPredictor } from '../../src/game/race/localPredictor'
import { createRaceState, type CarSetup } from '../../src/core/race/raceState'
import { buildRaceEnvFixture } from '../helpers/raceEnvFixture'
import { toRaceSnapshot } from '../../src/core/net/snapshot'
import type { PlayerCommand } from '../../src/core/race/stepRace'

const throttle: PlayerCommand = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }

function setup() {
  const env = buildRaceEnvFixture()
  const setups: CarSetup[] = [{ id: 'a', isPlayer: true, mass: 1000, damage: 0, ammo: 0, mines: 0, armorTier: 0, ai: null }]
  const state = createRaceState(env, setups, 1)
  state.phase = 'racing'
  return { env, state, car: state.cars[0] }
}

describe('LocalPredictor', () => {
  it('predicts forward so the local car moves without a server snapshot', () => {
    const { env, state, car } = setup()
    const pred = new LocalPredictor(state, env, car)
    const x0 = car.state.x
    for (let i = 1; i <= 5; i++) pred.predict(i, throttle, 1000 / 60)
    const render = { ...car, state: { ...car.state } }
    pred.writeInto(render as any)
    expect(render.state.x).not.toBe(x0)
  })

  it('drops acked inputs and replays only the unacked ones on reconcile', () => {
    const { env, state, car } = setup()
    const pred = new LocalPredictor(state, env, car)
    for (let i = 1; i <= 5; i++) pred.predict(i, throttle, 1000 / 60)

    // server authoritative snapshot: car still near the start line, ack=3
    const serverCar = toRaceSnapshot(state).cars[0]
    pred.reconcile(serverCar, 3) // drops seq 1..3, replays 4,5

    const render = { ...car, state: { ...car.state } }
    pred.writeInto(render as any)
    // replayed 2 frames of throttle from the server start pos → moved, but less
    // than the 5-frame local prediction would have.
    expect(render.state.x).toBeGreaterThanOrEqual(serverCar.state.x)
  })

  it('eases a small correction instead of snapping, and decays it to zero', () => {
    const { env, state, car } = setup()
    const pred = new LocalPredictor(state, env, car)
    pred.predict(1, throttle, 1000 / 60)

    const serverCar = toRaceSnapshot(state).cars[0]
    serverCar.state = { ...serverCar.state, x: serverCar.state.x + 20 } // 20px server correction
    pred.reconcile(serverCar, 1) // all acked; truth becomes server pos

    const r1 = { ...car, state: { ...car.state } }; pred.writeInto(r1 as any)
    const r2 = { ...car, state: { ...car.state } }; pred.writeInto(r2 as any)
    // offset present on frame 1, smaller on frame 2 (decaying toward truth)
    const off1 = Math.abs(r1.state.x - serverCar.state.x)
    const off2 = Math.abs(r2.state.x - serverCar.state.x)
    expect(off1).toBeGreaterThan(0)
    expect(off2).toBeLessThan(off1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game/localPredictor.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `localPredictor.ts`**

```ts
// src/game/race/localPredictor.ts
// Client-side prediction for the local car. Advances a private "truth" copy of
// the car each frame via the same stepCarMovement the server runs, and on each
// server snapshot snaps to the authoritative state + replays unacked inputs.
// Corrections are eased with a decaying render offset kept OUT of the truth, so
// smoothing never feeds back into the simulation.
import { stepCarMovement } from '../../core/race/carMovement'
import type { PlayerCommand } from '../../core/race/stepRace'
import type { CarSim, RaceEnv, RaceState } from '../../core/race/raceState'
import type { CarSnapshot } from '../../core/net/snapshot'

const SMOOTH_DECAY = 0.80   // per-frame render-offset decay toward zero
const SNAP_DISTANCE = 200   // px; corrections beyond this snap instead of sliding

interface PendingInput { seq: number; command: PlayerCommand; dtMs: number }

function cloneCar(c: CarSim): CarSim {
  return {
    ...c,
    state: { ...c.state },
    prevPos: { ...c.prevPos },
    progress: { ...c.progress },
    lapTimes: [...c.lapTimes],
    lastInput: { ...c.lastInput },
  }
}

export class LocalPredictor {
  private readonly truth: CarSim
  private pending: PendingInput[] = []
  private offsetX = 0
  private offsetY = 0

  constructor(
    private readonly state: RaceState,
    private readonly env: RaceEnv,
    seedCar: CarSim,
  ) {
    this.truth = cloneCar(seedCar)
  }

  /** Advance the predicted truth one frame with the command just sent. */
  predict(seq: number, command: PlayerCommand, dtMs: number): void {
    this.pending.push({ seq, command, dtMs })
    this.step(command, dtMs)
  }

  /** Adopt the server's authoritative movement state, drop acked inputs, replay
   *  the rest, and fold the resulting jump into the render offset. */
  reconcile(server: CarSnapshot, ackSeq: number): void {
    const renderX = this.truth.state.x + this.offsetX
    const renderY = this.truth.state.y + this.offsetY

    // adopt authoritative movement fields (weapons/laps stay server-owned elsewhere)
    this.truth.state = { ...server.state }
    this.truth.prevPos = { x: server.state.x, y: server.state.y }
    this.truth.turbo = server.turbo
    this.truth.turboDepleted = false // not in the snapshot; re-derives within a few steps
    this.truth.wrecked = server.wrecked
    this.truth.finishedAt = server.finishedAt
    this.truth.progress = { ...server.progress }
    this.truth.stuckMs = 0

    this.pending = this.pending.filter((p) => p.seq > ackSeq)
    for (const p of this.pending) this.step(p.command, p.dtMs)

    // keep the rendered position continuous across the correction, then ease it
    const nextOffX = renderX - this.truth.state.x
    const nextOffY = renderY - this.truth.state.y
    if (Math.hypot(nextOffX, nextOffY) > SNAP_DISTANCE) {
      this.offsetX = 0
      this.offsetY = 0
    } else {
      this.offsetX = nextOffX
      this.offsetY = nextOffY
    }
  }

  /** Decay the offset and write truth+offset movement fields into the render car. */
  writeInto(renderCar: CarSim): void {
    this.offsetX *= SMOOTH_DECAY
    this.offsetY *= SMOOTH_DECAY
    renderCar.state = {
      ...this.truth.state,
      x: this.truth.state.x + this.offsetX,
      y: this.truth.state.y + this.offsetY,
    }
    renderCar.turbo = this.truth.turbo
    renderCar.turboDepleted = this.truth.turboDepleted
    renderCar.lastInput = { ...this.truth.lastInput }
    renderCar.lastTurboActive = this.truth.lastTurboActive
    renderCar.wrecked = this.truth.wrecked
  }

  private step(command: PlayerCommand, dtMs: number): void {
    // No slow-mo dilation client-side (slowMoUntil isn't in the snapshot); the
    // 30Hz reconcile corrects the small difference. dt in seconds.
    stepCarMovement(this.state, this.env, this.truth, command.input, command.turbo, dtMs / 1000, [])
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/game/localPredictor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/race/localPredictor.ts tests/game/localPredictor.test.ts
git commit -m "feat(net): client-side LocalPredictor with reconcile + smoothing"
```

---

### Task 5: Wire prediction into `NetworkSource` and `RaceScene`

Drive the local car from the predictor: interpolate other cars as today, keep the local car's non-movement fields from the server, and overwrite its movement with predicted+smoothed values.

**Files:**
- Modify: `src/game/race/raceSource.ts`
- Modify: `src/game/scenes/RaceScene.ts`
- Test: `tests/game/networkSource.test.ts`

**Interfaces:**
- Consumes: `LocalPredictor`; protocol `acks`.
- Produces: `NetworkSource.sendLocalInput(command: PlayerCommand): void` (assigns seq, sends `{ t:'input', command, seq }`, predicts); `ingest(nowMs, deltaMs)` now reconciles + writes the predicted local car. `RaceCarInfo`/render contract unchanged for the scene.

- [ ] **Step 1: Write the failing test**

Add to `tests/game/networkSource.test.ts`:

```ts
it('drives the local car from prediction, not interpolation', () => {
  const net = fakeNet()
  const src = new NetworkSource(net as any, { seed: 1, trackId: 'test-circuit', laps: 3, roster, youId: 'a' }, spec)
  net.emit({ t: 'snapshot', snap: snapAt(0, 0), events: [], acks: { a: 0 } })

  // send several throttle inputs (predicted locally) with no newer snapshot
  const throttle = { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false }
  for (let i = 0; i < 6; i++) { src.sendLocalInput(throttle); src.ingest(0, 1000 / 60) }

  // local car 'a' has moved from prediction even though the only snapshot had it at rest
  const a = src.state.cars.find((c) => c.id === 'a')!
  expect(Math.hypot(a.state.x - 0, a.state.y)).toBeGreaterThan(0)
  // an 'input' message was sent with a seq
  const inputs = net.sent.filter((m: any) => m.t === 'input')
  expect(inputs.length).toBeGreaterThan(0)
  expect(typeof inputs[0].seq).toBe('number')
})
```

Also update the existing `snapAt` helper and every `net.emit({ t: 'snapshot', ... })` in this file to include `acks: {}` (or `{ a: 0 }`), since the snapshot message now requires `acks`. Update the `sendInput forwards an input message` test to call `src.sendLocalInput(...)` and assert the sent message has `t: 'input'` and a numeric `seq`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game/networkSource.test.ts`
Expected: FAIL — `sendLocalInput` doesn't exist; snapshot emits lack `acks` (type error under build).

- [ ] **Step 3: Update `NetworkSource`**

Buffer acks alongside snapshots, own the seq counter, build the predictor, and split local vs. interpolated cars.

```ts
// add imports
import { LocalPredictor } from './localPredictor'

// buffer entry now carries acks; replace the buffer field + onMsg
  private readonly buffer: Array<{ snap: RaceSnapshot; acks: Record<string, number> }> = []
  private predictor!: LocalPredictor
  private seq = 0
  private lastReconciledSimMs = -1

  private readonly onMsg = (msg: ServerMsg): void => {
    if (msg.t === 'snapshot') {
      this.buffer.push({ snap: msg.snap, acks: msg.acks })
      if (this.buffer.length > SNAPSHOT_BUFFER_CAP) this.buffer.shift()
      this.pendingEvents.push(...msg.events)
    } else if (msg.t === 'raceEnd') {
      this.raceEndCbs.forEach((cb) => cb(msg.standings))
    }
  }
```

In the constructor, after `this.skeleton = createRaceState(...)`, build the predictor from the local car:

```ts
    const localCar = this.skeleton.cars.find((c) => c.id === this.youId)!
    this.predictor = new LocalPredictor(this.skeleton, this.env, localCar)
```

Add the send+predict method (replacing the old `sendInput`):

```ts
  /** Assign a seq, send the input, and predict the local car forward one frame.
   *  Call once per frame before ingest(). */
  sendLocalInput(command: PlayerCommand): void {
    this.seq += 1
    this.net.send({ t: 'input', command, seq: this.seq })
    // dtMs is supplied on ingest; predict there so truth advances with the same
    // frame delta the renderer uses. Stash the command for this frame.
    this.pendingCommand = command
  }
```

Add a `private pendingCommand: PlayerCommand | null = null` field. Then rewrite the bracket-consuming part of `ingest` so it: (a) predicts with the frame delta, (b) reconciles against the newest snapshot once per new snapshot, (c) interpolates non-local cars, (d) writes the predicted local car. Replace the per-car loop:

```ts
  ingest(_nowMs: number, deltaMs: number): void {
    if (this.buffer.length === 0) return
    const latest = this.buffer[this.buffer.length - 1].snap
    const target = latest.simTimeMs - INTERP_DELAY_MS

    if (!this.clockStarted) { this.renderTimeMs = target; this.clockStarted = true }
    else {
      this.renderTimeMs += deltaMs
      if (target - this.renderTimeMs > INTERP_DELAY_MS) this.renderTimeMs = target
      if (this.renderTimeMs > latest.simTimeMs) this.renderTimeMs = latest.simTimeMs
    }

    // 1. predict the local car forward with this frame's command
    if (this.pendingCommand) {
      this.predictor.predict(this.seq, this.pendingCommand, deltaMs)
      this.pendingCommand = null
    }

    // 2. reconcile against the newest snapshot, once per new snapshot
    const newest = this.buffer[this.buffer.length - 1]
    if (newest.snap.simTimeMs > this.lastReconciledSimMs) {
      const serverLocal = newest.snap.cars.find((c) => c.id === this.youId)
      if (serverLocal) this.predictor.reconcile(serverLocal, newest.acks[this.youId] ?? 0)
      this.lastReconciledSimMs = newest.snap.simTimeMs
    }

    // 3. interpolate every OTHER car; copy server non-movement fields for the local one
    const br = bracket(this.buffer.map((e) => e.snap), this.renderTimeMs)
    if (br) {
      const { a, b, t } = br
      this.skeleton.phase = b.phase
      this.skeleton.simTimeMs = b.simTimeMs
      this.skeleton.countdownAnnounced = b.countdownAnnounced
      this.skeleton.raceStartAt = b.raceStartAt
      this.skeleton.placementOrder = [...b.placementOrder]
      this.skeleton.bullets = b.bullets.map((x) => ({ ...x }))
      this.skeleton.mines = b.mines.map((x) => ({ ...x }))
      this.skeleton.pickups = b.pickups.map((x) => ({ ...x }))

      for (const car of this.skeleton.cars) {
        const carB = b.cars.find((c) => c.id === car.id)
        if (!carB) continue
        // server-authoritative non-movement fields (both local and remote)
        car.damage = carB.damage
        car.wrecked = carB.wrecked
        car.finishedAt = carB.finishedAt
        car.ammo = carB.ammo
        car.mines = carB.mines
        car.progress = { ...carB.progress }
        car.lapTimes = [...carB.lapTimes]
        car.isPlayer = carB.isPlayer
        if (car.id === this.youId) continue // movement comes from the predictor
        const carA = a.cars.find((c) => c.id === car.id)
        if (!carA) continue
        car.state = lerpCarState(carA.state, carB.state, t)
        car.turbo = carB.turbo
        car.mines = carB.mines
        car.lastInput = { ...carB.lastInput }
        car.lastTurboActive = carB.lastTurboActive
      }
    }

    // 4. write the predicted + smoothed local car
    const localCar = this.skeleton.cars.find((c) => c.id === this.youId)
    if (localCar) this.predictor.writeInto(localCar)
  }
```

Remove the old `sendInput` method and the `renderTimeMs`/`clockStarted` handling is retained (moved above). Keep `dispose()`, `drainEvents()`, `onRaceEnd`, `get state`. Update the `RaceSource` interface: replace `sendInput?(cmd)` with `sendLocalInput(cmd: PlayerCommand): void`.

- [ ] **Step 4: Update `RaceScene.ts`**

In the `mode === 'network'` branch of `update()` (lines ~345–355), build the command once and route it through the source:

```ts
    if (this.mode === 'network') {
      this.inputManager.update()
      if (this.settings.toggleFire && this.inputManager.justDown('fire')) this.fireToggled = !this.fireToggled
      if (this.settings.toggleTurbo && this.inputManager.justDown('turbo')) this.turboToggled = !this.turboToggled
      if (this.inputManager.justDown('mine')) this.mineQueued = true
      this.netSource!.sendLocalInput(this.buildPlayerCommand())
      this.mineQueued = false
      this.netSource!.ingest(this.time.now, delta)
      this.sim = this.netSource!.state
      this.handleSimEvents(this.netSource!.drainEvents())
    } else {
```

(Only the `sendInput` → `sendLocalInput` rename changes; everything else in the branch is unchanged.)

- [ ] **Step 5: Run everything**

Run: `npm test && npm run build && npm run server:check && git diff --check`
Expected: all suites PASS (including the updated `networkSource` tests); build + server:check clean; diff clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/race/raceSource.ts src/game/scenes/RaceScene.ts tests/game/networkSource.test.ts
git commit -m "feat(net): predict local car, interpolate remotes, in NetworkSource"
```

---

## Post-implementation browser smoke (manual)

Two tabs + one AI, per the spec's Verification section:
- Local car steers/accelerates with no perceptible delay; other cars stay smooth.
- Ramming a rival produces at most a brief smoothed correction, not a rubber-band.
- Wreck/respawn snaps cleanly (beyond the 200px clamp).
- Fire, mines, laps, standings, results all still behave.
- The existing single-player race feels visually unchanged (shared-movement refactor is behavior-preserving).
