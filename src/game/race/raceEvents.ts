export type RaceEvent =
  | { type: 'race-started'; at: number }
  | { type: 'race-paused'; at: number }
  | { type: 'race-resumed'; at: number }
  | { type: 'car-damaged'; carId: string; amount: number }
  | { type: 'car-wrecked'; carId: string }
  | { type: 'lap-completed'; carId: string; lap: number; timeMs: number }
  | { type: 'race-finished'; at: number }
  | { type: 'race-abandoned'; at: number }

export type RaceEventListener = (event: RaceEvent) => void
