import { GROUNDED, IDLE_INPUT, type CarInput, type CarPhysicsSpec, type CarState } from '../vehicle/carPhysics'
import { createProgress, type RaceProgress } from './progress'
import { initialRngState, nextRandom } from './random'
import { randomPickupLayout, type PickupType } from '../track/pickups'
import type { Gate, Vec2 } from '../track/geometry'
import type { ObstacleCircle, ResolvedSetPiece } from '../track/setPieces'
import type { AiTuning } from '../ai/driver'
import type { RaceTier } from '../../data/economy'
import { PICKUPS } from '../../data/weapons'
import { racePlacements } from './placementSystem'

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
  /** relative body size (1.0 = starter); scales this car's collision footprint */
  sizeScale: number
  stuckMs: number
  armorTier: number
  /** when this car's booby-trap loss of control ends (0 = not trapped) — only meaningful for human cars */
  trapUntil: number
  ai: CarAiSim | null
  /** MP-only per-car physics override. Absent in single-player (uses env.playerSpec). */
  spec?: CarPhysicsSpec
  /** MP-only incoming-damage multiplier. Absent falls back to armorResistance(armorTier). */
  damageResist?: number
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
  /** authored set pieces (splitters, buffers, overhead spans) in world space */
  obstacles: ResolvedSetPiece[]
  /** every collision circle of every set piece — physics, pickups, rescue */
  obstacleCircles: ObstacleCircle[]
  gateSpacing: number
  trackWidth: number
  laps: number
  tier: RaceTier
  playerSpec: CarPhysicsSpec
  weaponsEnabled: boolean
  hasPlating: boolean
  hasOverTurbo: boolean
  /** 'single-player' (default) ends the race when the sole human finishes;
   *  'all-humans' ends only when every human car is finished or wrecked. */
  raceEndMode: 'single-player' | 'all-humans'
}

export interface RaceState {
  simTimeMs: number
  phase: RacePhase
  countdownAnnounced: number
  raceStartAt: number
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
  /** relative body size (1.0 = starter). Optional — omitted setups (MP, tests)
   *  default to 1.0, preserving the original single-radius collision behaviour. */
  sizeScale?: number
  damage: number
  ammo: number
  mines: number
  armorTier: number
  ai: CarAiSim | null
  /** MP-only per-car physics override; omit for single-player. */
  spec?: CarPhysicsSpec
  /** MP-only incoming-damage multiplier; omit for single-player. */
  damageResist?: number
}

export function createRaceState(env: RaceEnv, setups: CarSetup[], seed: number): RaceState {
  const state: RaceState = {
    simTimeMs: 0, phase: 'countdown', countdownAnnounced: 0, raceStartAt: 0,
    slowMoUntil: 0, allRivalsDoneAt: null,
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
      obstacles: env.obstacleCircles,
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
      cash: 0, mines: setup.mines, lastMineAt: -1e9, mass: setup.mass, sizeScale: setup.sizeScale ?? 1, stuckMs: 0,
      armorTier: setup.armorTier, trapUntil: 0, ai: setup.ai,
      spec: setup.spec, damageResist: setup.damageResist,
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
