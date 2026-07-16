// Minimal RaceEnv fixture for tests that don't care about real track content —
// a small closed square track built from the pure geometry helpers.
import type { RaceEnv } from '../../src/core/race/raceState'
import {
  buildGates,
  catmullRomClosed,
  closedPolylineLength,
  offsetClosedPolyline,
  spacedPointsAlong,
} from '../../src/core/track/geometry'
import { buildRacingLine } from '../../src/core/track/racingLine'
import { STARTER_CAR } from '../../src/data/cars'

const SQUARE_CONTROLS = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
]

export function buildRaceEnvFixture(overrides: Partial<RaceEnv> = {}): RaceEnv {
  const samplesPerSegment = 16
  const gateCount = 8
  const trackWidth = 200
  const shoulder = 40

  const centerline = catmullRomClosed(SQUARE_CONTROLS, samplesPerSegment)
  const racingLine = buildRacingLine(centerline, { maxOffset: trackWidth / 2 - 34 - 8 })
  const gates = buildGates(centerline, gateCount, trackWidth / 2 + shoulder)

  const barriers: { x: number; y: number }[] = []
  for (const side of [1, -1]) {
    const wallLine = offsetClosedPolyline(centerline, side * (trackWidth / 2 + shoulder + 24))
    for (const p of spacedPointsAlong(wallLine, 54)) barriers.push(p)
  }

  return {
    centerline,
    racingLine,
    gates,
    barriers,
    gateSpacing: closedPolylineLength(centerline) / gateCount,
    trackWidth,
    laps: 2,
    tier: 'street',
    playerSpec: { ...STARTER_CAR },
    weaponsEnabled: false,
    hasPlating: false,
    hasOverTurbo: false,
    ...overrides,
  }
}
