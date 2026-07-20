// Minimal RaceEnv fixture for tests that don't care about real track content —
// a small closed square track built from the pure geometry helpers, via the
// same buildRaceEnv the game and server use.
import type { RaceEnv } from '../../src/core/race/raceState'
import { buildRaceEnv } from '../../src/core/race/raceEnvBuilder'
import type { TrackDef } from '../../src/data/tracks/types'
import { STARTER_CAR } from '../../src/data/cars'

const SQUARE_CONTROLS = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
]

const SQUARE_TRACK: TrackDef = {
  id: 'fixture-square',
  name: 'Fixture Square',
  laps: 2,
  tier: 'street',
  width: 200,
  shoulder: 40,
  gateCount: 8,
  samplesPerSegment: 16,
  world: { w: 1200, h: 1200 },
  controls: SQUARE_CONTROLS,
}

export function buildRaceEnvFixture(overrides: Partial<RaceEnv> = {}): RaceEnv {
  const env = buildRaceEnv(SQUARE_TRACK, {
    playerSpec: { ...STARTER_CAR },
    weaponsEnabled: false,
    hasPlating: false,
    hasOverTurbo: false,
    raceEndMode: 'single-player',
  })
  return { ...env, ...overrides }
}
