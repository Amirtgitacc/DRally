// Pure AI driving/combat decisions — transcribed from RaceScene, no Phaser
// imports. The scene still owns applying these decisions (spawning bullets,
// dropping mines, moving cars); this module only decides what to do.

import { aiDrive, lookAheadFor, wrapAngle } from '../ai/driver'
import { shouldTurbo } from '../ai/turbo'
import { leadTarget } from '../combat/aim'
import { mineIsLive } from '../combat/mines'
import { forwardSpeed, type CarInput, type CarPhysicsSpec } from '../vehicle/carPhysics'
import { turnAmount, type Vec2 } from '../track/geometry'
import { nextGateIndex } from './progress'
import { AI_GUNNER, AI_MINES, GUN, MINES, TURBO } from '../../data/weapons'
import { RUBBER_BAND } from '../../data/drivers'
import { OVERCHARGED_TURBO } from '../../data/blackMarket'
import type { CarSim, RaceEnv, RaceState } from './raceState'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** How far a car will swerve to avoid another car or an armed mine ahead. */
const AVOID_RANGE = 150

export function progressScore(env: RaceEnv, car: CarSim): number {
  const gate = env.gates[nextGateIndex(car.progress)]
  const dist = Math.hypot(gate.center.x - car.state.x, gate.center.y - car.state.y)
  return car.progress.gatesPassed + Math.max(0, 1 - dist / env.gateSpacing)
}

export function effectiveSpec(state: RaceState, env: RaceEnv, car: CarSim, turboActive: boolean): CarPhysicsSpec {
  // MP cars carry a per-car spec override; SP humans have none and use env.playerSpec
  let spec = car.spec ?? (car.isPlayer ? env.playerSpec : car.ai!.spec)
  // rank pace and the rubber band are rival-only, even when the debug
  // autopilot has given the player an ai profile to drive with
  if (car.ai && !car.isPlayer) {
    const playerScore = progressScore(env, state.cars[0])
    const aiScore = progressScore(env, car)
    // talented drivers lean on the rubber band less
    const band = clamp(
      1 + car.ai.rubberBandGain * (playerScore - aiScore),
      RUBBER_BAND.min,
      RUBBER_BAND.max,
    )
    // raw pace comes from ladder rank (set at grid build), banded here
    const scale = car.ai.speedScale * band
    spec = { ...spec, topSpeed: spec.topSpeed * scale, accel: spec.accel * scale }
  }
  if (turboActive) {
    // the black market's fuel mix hits far harder than a stock turbo
    const boost = car.isPlayer && env.hasOverTurbo ? OVERCHARGED_TURBO : TURBO
    spec = { ...spec, topSpeed: spec.topSpeed * boost.topSpeedScale, accel: spec.accel * boost.accelScale }
  }
  return spec
}

/** The nearest mine ahead that would actually go off under this car, or null. */
function nearestArmedMineAhead(state: RaceState, car: CarSim, fx: number, fy: number): Vec2 | null {
  const now = state.simTimeMs
  let best: Vec2 | null = null
  let bestD = AI_MINES.dropRange
  for (const mine of state.mines) {
    if (!mineIsLive(mine, car.id, now, MINES)) continue
    const dx = mine.x - car.state.x
    const dy = mine.y - car.state.y
    const d = Math.hypot(dx, dy)
    if (d < bestD && dx * fx + dy * fy > d * 0.6) {
      bestD = d
      best = { x: mine.x, y: mine.y }
    }
  }
  return best
}

export function computeAiInput(state: RaceState, env: RaceEnv, car: CarSim): CarInput {
  const ai = car.ai!
  const line = env.racingLine
  const n = line.length

  let bestD = Infinity
  let bestIdx = ai.lineIdx
  for (let step = 0; step < 30; step++) {
    const i = (ai.lineIdx + step) % n
    const p = line[i]
    const d = Math.hypot(p.x - car.state.x, p.y - car.state.y)
    if (d < bestD) {
      bestD = d
      bestIdx = i
    }
  }
  ai.lineIdx = bestIdx

  // Steering chases a point a fixed distance ahead — pushing it further out
  // just makes the car cut the corner into the inside barrier.
  const target = line[(bestIdx + ai.lookAheadSamples) % n]
  // Braking is the part that must see further the faster we travel. Measured
  // on the racing line, which straightens the corner the centerline exaggerates.
  const spec = effectiveSpec(state, env, car, false)
  const brakeHorizon = lookAheadFor(ai.lookAheadSamples * 2, forwardSpeed(car.state), spec.topSpeed)
  const curvatureAhead = Math.min(1, turnAmount(line, bestIdx, brakeHorizon) / 1.1)

  let avoid: Vec2 | null = null
  let avoidD = AVOID_RANGE
  const fx = Math.cos(car.state.heading)
  const fy = Math.sin(car.state.heading)
  for (const other of state.cars) {
    if (other === car) continue
    const dx = other.state.x - car.state.x
    const dy = other.state.y - car.state.y
    const d = Math.hypot(dx, dy)
    if (d < avoidD && dx * fx + dy * fy > d * 0.3) {
      avoidD = d
      avoid = { x: other.state.x, y: other.state.y }
    }
  }
  // an armed mine on the line is worth more of a swerve than a car is
  const mine = nearestArmedMineAhead(state, car, fx, fy)
  if (mine) avoid = mine

  return aiDrive(car.state, { target, curvatureAhead, avoid }, spec, ai.tuning)
}

/**
 * The gun is bolted to the nose, so "aiming" is really deciding when to pull
 * the trigger. Two things decide it:
 *
 *  - aces fire at where you WILL be (the bullet's intercept point), everyone
 *    else at where you are, which at racing speeds is where you were
 *  - if the race leader is within range, that is who they shoot at; nobody
 *    wastes ammo on a backmarker while the win is driving away
 */
export function hasTargetInSights(state: RaceState, car: CarSim): boolean {
  if (car.ammo <= 0) return false
  const leaderId = state.placementOrder[0]
  const candidates = state.cars.filter((other) => {
    if (other === car || other.wrecked) return false
    if (other.isPlayer && state.phase === 'finished') return false
    return Math.hypot(other.state.x - car.state.x, other.state.y - car.state.y) <= AI_GUNNER.range
  })
  if (!candidates.length) return false

  const leader = candidates.find((c) => c.id === leaderId)
  const targets = leader ? [leader] : candidates
  return targets.some((other) => canHit(car, other))
}

function canHit(car: CarSim, other: CarSim): boolean {
  const grade = car.ai?.grade ?? 1
  const aim =
    grade >= AI_GUNNER.leadTargetFromGrade
      ? leadTarget(car.state, { x: other.state.x, y: other.state.y, vx: other.state.vx, vy: other.state.vy }, GUN.bulletSpeed)
      : { x: other.state.x, y: other.state.y }
  const angle = Math.atan2(aim.y - car.state.y, aim.x - car.state.x)
  return Math.abs(wrapAngle(angle - car.state.heading)) < AI_GUNNER.aimCone
}

/**
 * Rivals shoot in bursts rather than holding the trigger forever. Caps the
 * damage a single tailing car can pour into you, without making them dumb.
 */
function burstGate(car: CarSim, hasTarget: boolean, now: number): boolean {
  if (!hasTarget) {
    car.burstEndsAt = 0
    return false
  }
  if (now < car.restEndsAt) return false
  if (car.burstEndsAt === 0) car.burstEndsAt = now + AI_GUNNER.burstMs
  if (now >= car.burstEndsAt) {
    car.restEndsAt = now + AI_GUNNER.restMs
    car.burstEndsAt = 0
    return false
  }
  return true
}

/** Is somebody close behind and closing? Worth a mine, and worth the turbo. */
function isBeingChased(state: RaceState, car: CarSim): boolean {
  const fx = Math.cos(car.state.heading)
  const fy = Math.sin(car.state.heading)
  for (const other of state.cars) {
    if (other === car || other.wrecked || other.finishedAt !== null) continue
    const dx = other.state.x - car.state.x
    const dy = other.state.y - car.state.y
    const d = Math.hypot(dx, dy)
    if (d >= AI_MINES.dropRange || dx * fx + dy * fy > -d * 0.5) continue
    // closing = their velocity along the gap between us beats ours
    const closing = (car.state.vx - other.state.vx) * (dx / d) + (car.state.vy - other.state.vy) * (dy / d)
    if (closing > AI_MINES.closingSpeed) return true
  }
  return false
}

/**
 * Drop a mine on the nose of anyone tailing close behind — but not in the
 * packed opening seconds, which would just mine the whole grid at the line.
 */
export function wantsAutoMine(state: RaceState, car: CarSim): boolean {
  return (
    car.mines > 0 &&
    state.simTimeMs >= state.raceStartAt + AI_MINES.graceMs &&
    state.simTimeMs - car.lastMineAt > (car.ai?.mineCooldownMs ?? AI_MINES.cooldownMs) &&
    isBeingChased(state, car)
  )
}

export function computeAiCombat(state: RaceState, env: RaceEnv, car: CarSim): { fire: boolean; turbo: boolean; dropMine: boolean } {
  const ai = car.ai!
  const fire = burstGate(car, hasTargetInSights(state, car), state.simTimeMs)
  const dropMine = state.phase === 'racing' && wantsAutoMine(state, car)

  const curvature = Math.min(1, turnAmount(env.racingLine, ai.lineIdx, ai.lookAheadSamples * 2) / 1.1)
  const leader = state.placementOrder[0]
  const leaderCar = state.cars.find((c) => c.id === leader)
  const turbo = shouldTurbo({
    curvatureAhead: curvature,
    turbo: car.turbo,
    forwardSpeed: forwardSpeed(car.state),
    topSpeed: effectiveSpec(state, env, car, false).topSpeed,
    deficit: leaderCar ? progressScore(env, leaderCar) - progressScore(env, car) : 0,
    underAttack: isBeingChased(state, car),
  })
  return { fire, turbo, dropMine }
}
