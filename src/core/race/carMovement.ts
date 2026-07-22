// One car's movement for a single fixed step: turbo meter, core physics,
// off-track drag, wall collision, stuck rescue. Shared by the server sim
// (stepRace) and the client-side predictor (localPredictor) so both integrate
// the local car identically. No car-to-car collision, weapons, or gates here.
import { isAirborne, justLanded, speed, stepCar, type CarInput } from '../vehicle/carPhysics'
import { stepTurboMeter } from '../vehicle/turboMeter'
import { clearRescuePose, needsRescue, rescuePose, updateStuckMs } from '../vehicle/rescue'
import { RESCUE } from '../../data/rescue'
import { distanceToClosedPolyline } from '../track/geometry'
import { effectiveSpec } from './aiControl'
import { damageCarSim } from './combatStep'
import { impactDamage } from '../combat/damage'
import { MINE_BLAST, PICKUPS, TURBO, WALL_DAMAGE } from '../../data/weapons'
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

  // Booby trap: the wheel fights back. A deterministic yaw sway dominates the
  // steering, a fraction of the player's input still gets through, and grip
  // drops so the car slews on its own momentum until the trap expires. Driven
  // off simTimeMs so the server sim and client predictor integrate identically.
  const trapped = !car.wrecked && state.simTimeMs < car.trapUntil
  if (trapped) {
    const sway = Math.sin((state.simTimeMs * 2 * Math.PI) / PICKUPS.trapYawPeriodMs) * PICKUPS.trapSway
    input = {
      throttle: input.throttle,
      brake: 0,
      steer: Math.max(-1, Math.min(1, sway + input.steer * PICKUPS.trapSteerAuthority)),
      handbrake: false,
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
  if (turboActive && overcharged) {
    damageCarSim(state, env, car, OVERCHARGED_TURBO.selfDamagePerSec * dt, events)
  }

  car.lastInput = input
  car.lastTurboActive = turboActive

  car.prevPos = { x: car.state.x, y: car.state.y }
  const before = car.state
  let spec = effectiveSpec(state, env, car, turboActive)
  if (trapped) spec = { ...spec, grip: spec.grip * PICKUPS.trapGripScale }
  car.state = stepCar(car.state, input, spec, dt, MINE_BLAST.gravity)
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
  const pose = clearRescuePose(
    rescuePose(gate.a, gate.b, gate.tangent),
    gate.a, gate.b, env.obstacleCircles, CAR_RADIUS * car.sizeScale + 6,
  )
  car.state = { ...car.state, ...pose, z: 0, vz: 0, vx: 0, vy: 0 }
  car.prevPos = { x: pose.x, y: pose.y }
  events.push({ type: 'car-rescued', carId: car.id })
}

function resolveBarrierCollisions(state: RaceState, env: RaceEnv, car: CarSim, events: SimEvent[]): void {
  for (const b of env.barriers) {
    collideWithCircle(state, env, car, b.x, b.y, TIRE_RADIUS, events)
  }
  // set-piece obstacles (container splitters, boulders…) use the same wall
  // response with their own radii — one collision model, SP and MP identical
  for (const c of env.obstacleCircles) {
    collideWithCircle(state, env, car, c.x, c.y, c.r, events)
  }
}

function collideWithCircle(
  state: RaceState,
  env: RaceEnv,
  car: CarSim,
  cx: number,
  cy: number,
  radius: number,
  events: SimEvent[],
): void {
  const s = car.state
  const minDist = CAR_RADIUS * car.sizeScale + radius
  const dx = s.x - cx
  const dy = s.y - cy
  if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) return
  const dist = Math.hypot(dx, dy)
  if (dist > 0 && dist < minDist) {
    const nx = dx / dist
    const ny = dy / dist
    s.x = cx + nx * minDist
    s.y = cy + ny * minDist
    const vn = s.vx * nx + s.vy * ny
    if (vn < 0) {
      s.vx -= 1.5 * vn * nx
      s.vy -= 1.5 * vn * ny
      s.vx *= 0.8
      s.vy *= 0.8
      const impact = Math.abs(vn)
      if (impact > WALL_DAMAGE.threshold && !isAirborne(s)) {
        damageCarSim(state, env, car, impactDamage(impact, WALL_DAMAGE), events)
      }
      if (impact > 160) {
        events.push({ type: 'wall-hit', carId: car.id, impact })
      }
    }
  }
}
