import { randomPickupSpot, type PickupType } from '../track/pickups'
import { repairDamage } from '../combat/damage'
import { nextRandom } from './random'
import { GUN, PICKUPS, TURBO } from '../../data/weapons'
import type { CarSim, PickupSim, RaceEnv, RaceState } from './raceState'
import type { SimEvent } from './simEvents'

// ---------------------------------------------------------------- pickups

export function updatePickups(state: RaceState, env: RaceEnv, events: SimEvent[]): void {
  for (let index = 0; index < state.pickups.length; index++) {
    const p = state.pickups[index]
    if (p.respawnAt !== null) {
      if (state.simTimeMs >= p.respawnAt) {
        relocatePickup(state, env, p)
        p.respawnAt = null
        events.push({ type: 'pickup-respawned', index })
      }
      continue
    }
    for (const car of state.cars) {
      if (car.wrecked) continue
      if (Math.hypot(car.state.x - p.x, car.state.y - p.y) < PICKUPS.radius) {
        collectPickup(state, p, index, car, events)
        break
      }
    }
  }
}

function collectPickup(state: RaceState, p: PickupSim, index: number, car: CarSim, events: SimEvent[]): void {
  switch (p.type) {
    case 'ammo':
      car.ammo = Math.min(GUN.ammoMax, car.ammo + PICKUPS.ammoAmount)
      break
    case 'turbo':
      car.turbo = Math.min(1, car.turbo + PICKUPS.turboAmount)
      if (car.turbo >= TURBO.restartThreshold) car.turboDepleted = false
      break
    case 'repair':
      car.damage = repairDamage(car.damage, PICKUPS.repairAmount)
      break
    case 'cash':
      car.cash += PICKUPS.cashAmount
      break
    case 'trap':
      if (car.isPlayer) state.trapUntil = state.simTimeMs + PICKUPS.trapDurationMs
      break
  }
  events.push({ type: 'pickup-collected', carId: car.id, index, pickup: p.type, x: p.x, y: p.y })
  p.respawnAt = state.simTimeMs + PICKUPS.respawnMs
}

function relocatePickup(state: RaceState, env: RaceEnv, pickup: PickupSim): void {
  const occupied = state.pickups
    .filter((other) => other !== pickup && other.respawnAt === null)
    .map((other) => ({ x: other.x, y: other.y }))
  const position = randomPickupSpot(
    env.centerline,
    {
      lateralOffsets: [...PICKUPS.lateralOffsets],
      clearRadiusAroundStart: PICKUPS.clearRadiusAroundStart,
      minDistance: PICKUPS.minDistance,
    },
    () => nextRandom(state),
    occupied,
  )
  pickup.type = nextPickupType(state, pickup)
  pickup.x = position.x
  pickup.y = position.y
}

/** Preserve the sparse type mix even as individual slots respawn. */
function nextPickupType(state: RaceState, respawning: PickupSim): PickupType {
  const active = state.pickups.filter((pickup) => pickup !== respawning && pickup.respawnAt === null)
  const caps = new Map<PickupType, number>()
  PICKUPS.types.forEach((type) => caps.set(type, (caps.get(type) ?? 0) + 1))
  const start = Math.floor(nextRandom(state) * PICKUPS.types.length)
  for (let offset = 0; offset < PICKUPS.types.length; offset++) {
    const type = PICKUPS.types[(start + offset) % PICKUPS.types.length]
    const count = active.filter((pickup) => pickup.type === type).length
    if (count < (caps.get(type) ?? 0)) return type
  }
  return 'trap'
}
