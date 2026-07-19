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

export function damageCarSim(state: RaceState, env: RaceEnv, car: CarSim, amount: number, events: SimEvent[]): void {
  if (car.wrecked || state.phase === 'countdown') return
  // rivals fit armor too, from their ladder rank — an ace is not a soft target
  const resistance = armorResistance(car.armorTier)
  const result = applyDamage(car.damage, amount, resistance)
  car.damage = result.damage
  if (result.wrecked) wreckCarSim(state, env, car, events)
}

function wreckCarSim(state: RaceState, env: RaceEnv, car: CarSim, events: SimEvent[]): void {
  if (car.wrecked) return
  car.wrecked = true

  events.push({ type: 'car-wrecked', carId: car.id, x: car.state.x, y: car.state.y })

  // In single-player the human wrecking ends the race outright. In all-humans
  // (multiplayer) mode a human wreck must NOT flip the phase: checkAllHumansDone
  // already counts a wrecked human as "done" and ends the race only once EVERY
  // human is done. Flipping here would yank all players to results on the first
  // wreck. The wreck itself + car-wrecked event happen in both modes.
  if (car.isPlayer && env.raceEndMode === 'single-player') {
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

/** Closest approach of the segment (x0,y0)→(x1,y1) to circle center (cx,cy) within radius r.
 *  Bullets cover more than a hit-window per 30Hz tick, so collision must test the
 *  whole swept path — a point check at the end position lets fast rounds tunnel. */
function sweptHit(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number): boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2))
  const px = x0 + t * dx
  const py = y0 + t * dy
  return Math.hypot(cx - px, cy - py) < r
}

export function updateBullets(state: RaceState, env: RaceEnv, dt: number, events: SimEvent[]): void {
  const survivors: RaceState['bullets'] = []
  for (const b of state.bullets) {
    const prevX = b.x
    const prevY = b.y
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
        if (sweptHit(prevX, prevY, b.x, b.y, car.state.x, car.state.y, CAR_BODY_RADIUS + 4)) {
          onBulletHit(state, env, car, b, events)
          dead = true
          break
        }
      }
    }
    if (!dead) {
      const pad = TIRE_RADIUS + 6
      const minX = Math.min(prevX, b.x) - pad
      const maxX = Math.max(prevX, b.x) + pad
      const minY = Math.min(prevY, b.y) - pad
      const maxY = Math.max(prevY, b.y) + pad
      for (const wall of env.barriers) {
        if (wall.x < minX || wall.x > maxX || wall.y < minY || wall.y > maxY) continue
        if (sweptHit(prevX, prevY, b.x, b.y, wall.x, wall.y, TIRE_RADIUS + 4)) {
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
  damageCarSim(state, env, car, damage, events)
  events.push({ type: 'bullet-hit', carId: car.id, x: b.x, y: b.y })

  // every hit shoves the victim a little along the bullet's path
  const bulletSpeed = Math.hypot(b.vx, b.vy) || 1
  const kick = GUN.impactKick / car.mass
  car.state.vx += (b.vx / bulletSpeed) * kick
  car.state.vy += (b.vy / bulletSpeed) * kick
}
