// Pure race orchestrator — advances the whole race one fixed timestep. No
// Phaser imports. Identical seed + identical command sequence must produce
// identical state and identical events: this is the multiplayer contract.

import {
  IDLE_INPUT,
  isAirborne,
  justLanded,
  speed,
  stepCar,
  type CarInput,
} from '../vehicle/carPhysics'
import { stepTurboMeter } from '../vehicle/turboMeter'
import { collideCars } from '../vehicle/collision'
import { needsRescue, rescuePose, updateStuckMs } from '../vehicle/rescue'
import { RESCUE } from '../../data/rescue'
import { applyGateCrossing, nextGateIndex } from './progress'
import { distanceToClosedPolyline, segmentsIntersect, turnAmount } from '../track/geometry'
import { racePlacements } from './placementSystem'
import { computeAiCombat, computeAiInput, effectiveSpec, hasTargetInSights, wantsAutoMine } from './aiControl'
import { damageCarSim, tryFire, updateBullets } from './combatStep'
import { tryDropMine, updateMines } from './minesStep'
import { updatePickups } from './pickupsStep'
import {
  IMPACT_FX,
  MINE_BLAST,
  RAM_DAMAGE,
  TURBO,
  WALL_DAMAGE,
  WEAPONS_FREE_DELAY_MS,
} from '../../data/weapons'
import { OVERCHARGED_TURBO, RAM_PLATING } from '../../data/blackMarket'
import { impactDamage } from '../combat/damage'
import type { CarSim, RaceEnv, RaceState } from './raceState'
import type { SimEvent } from './simEvents'

const CAR_RADIUS = 34
const CAR_BODY_RADIUS = 30
const TIRE_RADIUS = 24
const OFF_TRACK_DRAG = 1.4

export interface PlayerCommand {
  input: CarInput
  fire: boolean
  turbo: boolean
  dropMine: boolean
}

export const IDLE_COMMAND: PlayerCommand = { input: { ...IDLE_INPUT }, fire: false, turbo: false, dropMine: false }

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
    let input: CarInput = IDLE_INPUT
    let wantsFire = false
    let wantsTurbo = false

    if (!locked && !car.wrecked) {
      if (car.isPlayer) {
        if (car.finishedAt === null) {
          if (state.autoPilot && car.ai) {
            // scripted difficulty runs: the player drives itself
            input = computeAiInput(state, env, car)
            const curvature = Math.min(1, turnAmount(env.centerline, car.ai.lineIdx, 20) / 1.1)
            wantsFire = state.autoPilot.fire && hasTargetInSights(state, car)
            wantsTurbo = state.autoPilot.turbo && curvature < 0.12 && car.turbo > 0.35
            if (state.autoPilot.mines && state.phase === 'racing' && wantsAutoMine(state, car)) {
              tryDropMine(state, car, events)
            }
          } else {
            input = command.input
            wantsFire = command.fire
            wantsTurbo = command.turbo
            if (command.dropMine && state.phase === 'racing' && env.weaponsEnabled) {
              tryDropMine(state, car, events)
            }
          }
        }
      } else {
        input = computeAiInput(state, env, car)
        const combat = computeAiCombat(state, env, car)
        wantsFire = combat.fire && env.weaponsEnabled
        wantsTurbo = combat.turbo
        if (combat.dropMine) tryDropMine(state, car, events)
      }
    }

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
    // the overcharged mix cooks your own engine while boosting — it can wreck you
    if (turboActive && overcharged) {
      damageCarSim(state, car, OVERCHARGED_TURBO.selfDamagePerSec * dt, events)
    }

    // record for renderer: what this car did on this step
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
    // a car in the air clears the scenery, but never the tire wall: a mine
    // launch that sailed into the infield left the car beached in there
    if (!isAirborne(car.state)) applyOffTrackDrag(env, car, dt)
    resolveBarrierCollisions(state, env, car, events)
    updateStuckRescue(state, env, car, dt, events)

    car.gunCooldown = Math.max(0, car.gunCooldown - dt)
    if (wantsFire && weaponsFree && !car.wrecked && (car.finishedAt === null || !car.isPlayer)) {
      tryFire(state, car, events)
    }

    if (state.phase !== 'countdown' && !car.wrecked) checkGateCrossing(state, env, car, events)
  }

  resolveCarCollisions(state, env, events)
  updateBullets(state, env, dt, events)
  updateMines(state, env, events)
  updatePickups(state, env, events)
  state.placementOrder = racePlacements(state.cars, env.gates)
  checkAllRivalsDone(state, events)
  return events
}

// ---------------------------------------------------------------- track/gates

function checkGateCrossing(state: RaceState, env: RaceEnv, car: CarSim, events: SimEvent[]): void {
  const now = state.simTimeMs
  const gate = env.gates[nextGateIndex(car.progress)]
  if (!segmentsIntersect(car.prevPos, { x: car.state.x, y: car.state.y }, gate.a, gate.b)) return

  const result = applyGateCrossing(car.progress, nextGateIndex(car.progress))
  car.progress = result.progress

  if (result.armed) car.lapStartAt = now
  if (result.lapCompleted) {
    const lapTimeMs = now - car.lapStartAt
    car.lapTimes.push(lapTimeMs)
    car.lapStartAt = now
    events.push({ type: 'lap-completed', carId: car.id, lapTimeMs })
  }
  if (result.finished && car.finishedAt === null) {
    car.finishedAt = now
    events.push({ type: 'car-finished', carId: car.id })
    if (car.isPlayer) {
      state.phase = 'finished'
      events.push({ type: 'race-over', reason: 'player-finished' })
    }
  }
}

function applyOffTrackDrag(env: RaceEnv, car: CarSim, dt: number): void {
  const dist = distanceToClosedPolyline({ x: car.state.x, y: car.state.y }, env.centerline)
  if (dist > env.trackWidth / 2) {
    const decay = Math.exp(-OFF_TRACK_DRAG * dt)
    car.state.vx *= decay
    car.state.vy *= decay
  }
}

/**
 * The safety net. Nothing should be able to strand a car any more, but a car
 * with no way out is an unrecoverable race, so we put it back on the line.
 */
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
        // bouncing off the wall mid-flight is the mine's doing, not a crash
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

function resolveCarCollisions(state: RaceState, env: RaceEnv, events: SimEvent[]): void {
  const now = state.simTimeMs
  const minDist = CAR_BODY_RADIUS * 2
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const carA = state.cars[i]
      const carB = state.cars[j]
      const a = carA.state
      const b = carB.state
      // a launched car passes over the top of the pack
      if (isAirborne(a) || isAirborne(b)) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy)
      if (dist === 0 || dist >= minDist) continue

      const nx = dx / dist
      const ny = dy / dist
      const push = (minDist - dist) / 2
      a.x -= nx * push
      a.y -= ny * push
      b.x += nx * push
      b.y += ny * push

      // mass-weighted impulse + spin kick from the pure collision model
      const response = collideCars(
        { x: a.x, y: a.y, vx: a.vx, vy: a.vy, mass: carA.mass },
        { x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: carB.mass },
      )
      if (!response) continue

      const rel = response.impact
      a.vx += response.a.dvx
      a.vy += response.a.dvy
      b.vx += response.b.dvx
      b.vy += response.b.dvy
      // glancing hits twist the cars — only on real impacts, not pack rubbing
      if (rel > 120) {
        a.heading += response.a.spin
        b.heading += response.b.spin
      }

      const contactX = a.x + dx / 2
      const contactY = a.y + dy / 2

      const rammed = rel > RAM_DAMAGE.threshold && !carA.wrecked && !carB.wrecked
      if (rammed) {
        const dmg = impactDamage(rel, RAM_DAMAGE)
        // black-market ram plating: the player's side of the exchange
        // hits harder and hurts less for one race
        const plated = env.hasPlating && (carA.isPlayer || carB.isPlayer)
        const scaleFor = (c: CarSim) => (!plated ? 1 : c.isPlayer ? RAM_PLATING.takeScale : RAM_PLATING.dealScale)
        damageCarSim(state, carA, dmg * scaleFor(carA), events)
        damageCarSim(state, carB, dmg * scaleFor(carB), events)
      }

      events.push({ type: 'cars-collided', aId: carA.id, bId: carB.id, x: contactX, y: contactY, impact: rel, rammed })

      // a real crunch stops the world for a moment
      if (rel > IMPACT_FX.crashSlowMoImpact && (carA.isPlayer || carB.isPlayer)) {
        state.slowMoUntil = now + IMPACT_FX.crashSlowMoMs
        events.push({ type: 'crash-lurch', x: contactX, y: contactY })
      }
    }
  }
}

/** If every rival is finished or wrecked, give the player a short grace, then end the race. */
function checkAllRivalsDone(state: RaceState, events: SimEvent[]): void {
  const now = state.simTimeMs
  const player = state.cars.find((c) => c.isPlayer)
  if (!player || state.phase !== 'racing' || player.finishedAt !== null || player.wrecked) return
  const rivalsDone = state.cars.every((c) => c.isPlayer || c.finishedAt !== null || c.wrecked)
  if (!rivalsDone) {
    state.allRivalsDoneAt = null
    return
  }
  if (state.allRivalsDoneAt === null) {
    state.allRivalsDoneAt = now
  }
  if (now >= state.allRivalsDoneAt + 5000) {
    state.phase = 'finished'
    events.push({ type: 'race-over', reason: 'rivals-done' })
  }
}
