import type { PickupType } from '../track/pickups'

/** Everything the renderer needs to know that state alone can't tell it. */
export type SimEvent =
  | { type: 'countdown'; count: 3 | 2 | 1 }
  | { type: 'race-started' }
  | { type: 'gun-fired'; carId: string; x: number; y: number; dir: number }
  | { type: 'bullet-hit'; carId: string; x: number; y: number }
  | { type: 'bullet-wall'; x: number; y: number }
  | { type: 'car-wrecked'; carId: string; x: number; y: number }
  | { type: 'car-landed'; carId: string; x: number; y: number }
  | { type: 'cars-collided'; aId: string; bId: string; x: number; y: number; impact: number; rammed: boolean }
  | { type: 'wall-hit'; carId: string; impact: number }
  | { type: 'crash-lurch'; x: number; y: number }
  | { type: 'mine-dropped'; carId: string; mineId: number; x: number; y: number }
  | { type: 'mine-detonated'; mineId: number; x: number; y: number }
  | { type: 'pickup-collected'; carId: string; index: number; pickup: PickupType; x: number; y: number }
  | { type: 'pickup-respawned'; index: number }
  | { type: 'car-rescued'; carId: string }
  | { type: 'lap-completed'; carId: string; lapTimeMs: number }
  | { type: 'car-finished'; carId: string }
  | { type: 'race-over'; reason: 'player-finished' | 'player-wrecked' | 'rivals-done' }
