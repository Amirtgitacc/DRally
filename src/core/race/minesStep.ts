import { mineIsLive } from '../combat/mines'
import { mineBlast } from '../combat/blast'
import { isAirborne, launchCar } from '../vehicle/carPhysics'
import { MINES, MINE_BLAST } from '../../data/weapons'
import { damageCarSim } from './combatStep'
import { nextRandom } from './random'
import type { CarSim, MineSim, RaceEnv, RaceState } from './raceState'
import type { SimEvent } from './simEvents'

// ---------------------------------------------------------------- mines

export function tryDropMine(state: RaceState, car: CarSim, events: SimEvent[]): void {
  if (car.mines <= 0 || state.simTimeMs - car.lastMineAt < MINES.dropCooldownMs) return
  car.mines--
  car.lastMineAt = state.simTimeMs
  const cos = Math.cos(car.state.heading)
  const sin = Math.sin(car.state.heading)
  const x = car.state.x - 55 * cos
  const y = car.state.y - 55 * sin

  const mine: MineSim = { id: state.nextMineId++, x, y, droppedAt: state.simTimeMs, ownerId: car.id }
  state.mines.push(mine)
  events.push({ type: 'mine-dropped', carId: car.id, mineId: mine.id, x, y })
}

export function updateMines(state: RaceState, _env: RaceEnv, events: SimEvent[]): void {
  if (state.mines.length === 0) return
  const survivors: MineSim[] = []
  for (const mine of state.mines) {
    let triggered: CarSim | null = null
    for (const car of state.cars) {
      if (car.wrecked) continue
      if (car.isPlayer && state.phase === 'finished') continue
      // a car in the air flies straight over an armed mine
      if (isAirborne(car.state)) continue
      // the dropper gets a long grace; everyone else only gets the fuse
      if (!mineIsLive(mine, car.id, state.simTimeMs, MINES)) continue
      if (Math.hypot(car.state.x - mine.x, car.state.y - mine.y) < MINES.triggerRadius) {
        triggered = car
        break
      }
    }

    if (!triggered) {
      survivors.push(mine)
      continue
    }

    detonateMine(state, mine, triggered, events)
  }
  state.mines = survivors
}

/** Full damage + launch for whoever ran it over, splash for anyone close. */
function detonateMine(state: RaceState, mine: MineSim, triggered: CarSim, events: SimEvent[]): void {
  const tuning = {
    damage: MINES.damage,
    splashDamage: MINES.splashDamage,
    blastRadius: MINES.blastRadius,
    ...MINE_BLAST,
  }
  for (const car of state.cars) {
    if (car.wrecked) continue
    const impulse = mineBlast(
      { x: car.state.x, y: car.state.y, mass: car.mass, direct: car === triggered },
      mine,
      tuning,
      () => nextRandom(state),
    )
    if (!impulse) continue

    damageCarSim(state, car, impulse.damage, events)
    car.state = launchCar(
      {
        ...car.state,
        vx: car.state.vx + impulse.dvx,
        vy: car.state.vy + impulse.dvy,
        heading: car.state.heading + impulse.spin,
      },
      impulse.dvz,
    )
  }

  events.push({ type: 'mine-detonated', mineId: mine.id, x: mine.x, y: mine.y })
}
