// Pure race orchestrator — advances the whole race one fixed timestep. No
// Phaser imports. Identical seed + identical command sequence must produce
// identical state and identical events: this is the multiplayer contract.

import { IDLE_INPUT, isAirborne, type CarInput } from '../vehicle/carPhysics'
import { collideCars } from '../vehicle/collision'
import { applyGateCrossing, nextGateIndex } from './progress'
import { segmentsIntersect, turnAmount } from '../track/geometry'
import { racePlacements } from './placementSystem'
import { computeAiCombat, computeAiInput, hasTargetInSights, wantsAutoMine } from './aiControl'
import { damageCarSim, tryFire, updateBullets } from './combatStep'
import { tryDropMine, updateMines } from './minesStep'
import { updatePickups } from './pickupsStep'
import { IMPACT_FX, RAM_DAMAGE, WEAPONS_FREE_DELAY_MS } from '../../data/weapons'
import { RAM_PLATING } from '../../data/blackMarket'
import { impactDamage } from '../combat/damage'
import { stepCarMovement } from './carMovement'
import type { CarSim, RaceEnv, RaceState } from './raceState'
import type { SimEvent } from './simEvents'

const CAR_BODY_RADIUS = 30
const MAX_RACE_MS = 10 * 60 * 1000

export interface PlayerCommand {
  input: CarInput
  fire: boolean
  turbo: boolean
  dropMine: boolean
}

export const IDLE_COMMAND: PlayerCommand = { input: { ...IDLE_INPUT }, fire: false, turbo: false, dropMine: false }

export type CommandSet = Record<string, PlayerCommand>

export function stepRace(state: RaceState, env: RaceEnv, commands: CommandSet, dtMs: number): SimEvent[] {
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
            if (state.autoPilot.mines && state.phase === 'racing' && env.weaponsEnabled && wantsAutoMine(state, car)) {
              tryDropMine(state, car, events)
            }
          } else {
            const cmd = commands[car.id] ?? IDLE_COMMAND
            input = cmd.input
            wantsFire = cmd.fire
            wantsTurbo = cmd.turbo
            if (cmd.dropMine && state.phase === 'racing' && env.weaponsEnabled) {
              tryDropMine(state, car, events)
            }
          }
        }
      } else {
        input = computeAiInput(state, env, car)
        const combat = computeAiCombat(state, env, car)
        wantsFire = combat.fire && env.weaponsEnabled
        wantsTurbo = combat.turbo
        if (combat.dropMine && env.weaponsEnabled) tryDropMine(state, car, events)
      }
    }

    stepCarMovement(state, env, car, input, wantsTurbo, dt, events)

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
  checkAllRivalsDone(state, env, events)
  checkAllHumansDone(state, env, events)
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
    if (car.isPlayer && env.raceEndMode === 'single-player') {
      state.phase = 'finished'
      events.push({ type: 'race-over', reason: 'player-finished' })
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
        damageCarSim(state, env, carA, dmg * scaleFor(carA), events)
        damageCarSim(state, env, carB, dmg * scaleFor(carB), events)
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
function checkAllRivalsDone(state: RaceState, env: RaceEnv, events: SimEvent[]): void {
  if (env.raceEndMode === 'all-humans') return
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

/** all-humans mode: end only when every human car is finished or wrecked, plus a short grace,
 *  with a 10-minute backstop in case of a stalemate. */
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
