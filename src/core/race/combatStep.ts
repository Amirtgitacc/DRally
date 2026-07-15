import { applyDamage } from '../combat/damage'
import { armorResistance } from '../vehicle/carSpec'
import { isAirborne } from '../vehicle/carPhysics'
import { AI_GUNNER, GUN } from '../../data/weapons'
import { nextRandom } from './random'
import type { CarSim, RaceEnv, RaceState } from './raceState'
import type { SimEvent } from './simEvents'

const CAR_BODY_RADIUS = 30
const TIRE_RADIUS = 24

// ---------------------------------------------------------------- combat

export function damageCarSim(state: RaceState, car: CarSim, amount: number, events: SimEvent[]): void {
  if (car.wrecked || state.phase === 'countdown') return
  // rivals fit armor too, from their ladder rank — an ace is not a soft target
  const resistance = armorResistance(car.armorTier)
  const result = applyDamage(car.damage, amount, resistance)
  car.damage = result.damage
  if (result.wrecked) wreckCarSim(state, car, events)
}

function wreckCarSim(state: RaceState, car: CarSim, events: SimEvent[]): void {
  if (car.wrecked) return
  car.wrecked = true

  events.push({ type: 'car-wrecked', carId: car.id, x: car.state.x, y: car.state.y })

  if (car.isPlayer) {
    state.phase = 'finished'
    events.push({ type: 'race-over', reason: 'player-wrecked' })
  }
}

export function tryFire(state: RaceState, car: CarSim, events: SimEvent[]): void {
  if (car.ammo <= 0 || car.gunCooldown > 0) return
  car.ammo--
  car.gunCooldown = 1 / GUN.fireRate

  // talent decides how straight a rival shoots
  const spread = car.isPlayer ? GUN.playerSpread : car.ai!.aimSpread
  const dir = car.state.heading + (nextRandom(state) * 2 - 1) * spread
  const mx = car.state.x + Math.cos(car.state.heading) * GUN.muzzleOffset
  const my = car.state.y + Math.sin(car.state.heading) * GUN.muzzleOffset

  state.bullets.push({
    id: state.nextBulletId++,
    x: mx,
    y: my,
    vx: Math.cos(dir) * GUN.bulletSpeed + car.state.vx,
    vy: Math.sin(dir) * GUN.bulletSpeed + car.state.vy,
    ttl: GUN.ttl,
    ownerId: car.id,
  })

  events.push({ type: 'gun-fired', carId: car.id, x: mx, y: my, dir })
}

export function updateBullets(state: RaceState, env: RaceEnv, dt: number, events: SimEvent[]): void {
  const survivors: RaceState['bullets'] = []
  for (const b of state.bullets) {
    b.ttl -= dt
    b.x += b.vx * dt
    b.y += b.vy * dt

    let dead = b.ttl <= 0
    if (!dead) {
      for (const car of state.cars) {
        if (car.id === b.ownerId || car.wrecked) continue
        if (car.isPlayer && state.phase === 'finished') continue
        // bullets pass under a launched car
        if (isAirborne(car.state)) continue
        if (Math.hypot(car.state.x - b.x, car.state.y - b.y) < CAR_BODY_RADIUS + 4) {
          onBulletHit(state, env, car, b, events)
          dead = true
          break
        }
      }
    }
    if (!dead) {
      for (const wall of env.barriers) {
        if (Math.abs(wall.x - b.x) > TIRE_RADIUS + 6 || Math.abs(wall.y - b.y) > TIRE_RADIUS + 6) continue
        if (Math.hypot(wall.x - b.x, wall.y - b.y) < TIRE_RADIUS + 4) {
          events.push({ type: 'bullet-wall', x: b.x, y: b.y })
          dead = true
          break
        }
      }
    }

    if (!dead) survivors.push(b)
  }
  state.bullets = survivors
}

/** A round connects: sparks, a white flash, a shove, and — if it's you — a jolt. */
function onBulletHit(
  state: RaceState,
  env: RaceEnv,
  car: CarSim,
  b: RaceState['bullets'][number],
  events: SimEvent[],
): void {
  const owner = state.cars.find((c) => c.id === b.ownerId)!
  // the rivals' handicap shrinks as the purse grows: full value on a death race
  const damage = GUN.damagePerHit * (owner.isPlayer ? 1 : AI_GUNNER.damageScale[env.tier])
  damageCarSim(state, car, damage, events)
  events.push({ type: 'bullet-hit', carId: car.id, x: b.x, y: b.y })

  // every hit shoves the victim a little along the bullet's path
  const bulletSpeed = Math.hypot(b.vx, b.vy) || 1
  const kick = GUN.impactKick / car.mass
  car.state.vx += (b.vx / bulletSpeed) * kick
  car.state.vy += (b.vy / bulletSpeed) * kick
}
