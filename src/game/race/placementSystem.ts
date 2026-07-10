import { computePlacements, type PlacementEntry } from '../../core/race/placement'
import { nextGateIndex, type RaceProgress } from '../../core/race/progress'
import type { Gate } from '../../core/track/geometry'

export interface PlacementCar {
  id: string
  state: { x: number; y: number }
  progress: RaceProgress
  finishedAt: number | null
  wrecked: boolean
}

export function racePlacements(cars: PlacementCar[], gates: Gate[]): string[] {
  const entries: PlacementEntry[] = cars.map((car) => {
    const gate = gates[nextGateIndex(car.progress)]
    return {
      id: car.id,
      gatesPassed: car.progress.gatesPassed,
      distToNextGate: Math.hypot(gate.center.x - car.state.x, gate.center.y - car.state.y),
      finishedAtMs: car.finishedAt,
      wrecked: car.wrecked,
    }
  })
  return computePlacements(entries)
}
