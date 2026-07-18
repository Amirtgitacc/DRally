import { type CarSetup, type RaceEnv } from '../../../src/core/race/raceState'
import { buildGates, catmullRomClosed, closedPolylineLength, offsetClosedPolyline, spacedPointsAlong } from '../../../src/core/track/geometry'
import { buildRacingLine } from '../../../src/core/track/racingLine'
import { ALL_TRACKS } from '../../../src/data/tracks'
import { STARTER_CAR } from '../../../src/data/cars'

export function buildTestEnv(overrides: Partial<RaceEnv> = {}): RaceEnv {
  const track = ALL_TRACKS[0]
  const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
  const racingLine = buildRacingLine(centerline, { maxOffset: track.width / 2 - 34 - 8 })
  const gates = buildGates(centerline, track.gateCount, track.width / 2 + track.shoulder)
  const barriers: { x: number; y: number }[] = []
  for (const side of [1, -1]) {
    const wallLine = offsetClosedPolyline(centerline, side * (track.width / 2 + track.shoulder + 24))
    for (const p of spacedPointsAlong(wallLine, 54)) barriers.push(p)
  }
  return {
    centerline,
    racingLine,
    gates,
    barriers,
    gateSpacing: closedPolylineLength(centerline) / track.gateCount,
    trackWidth: track.width,
    laps: track.laps,
    tier: track.tier,
    playerSpec: { ...STARTER_CAR },
    weaponsEnabled: true,
    hasPlating: false,
    hasOverTurbo: false,
    raceEndMode: 'single-player',
    ...overrides,
  }
}

export function buildTestSetups(): CarSetup[] {
  const base = { damage: 0, ammo: 20, mines: 3, armorTier: 0, mass: 1 }
  return [
    { id: 'player', isPlayer: true, ai: null, ...base },
    {
      id: 'rival-1',
      isPlayer: false,
      ...base,
      ai: {
        lineIdx: 0, lookAheadSamples: 10, speedScale: 0.95,
        tuning: { steerGain: 3, corneringCaution: 0.5, minCornerSpeed: 60, dodge: 24 },
        spec: { ...STARTER_CAR }, grade: 2, aimSpread: 0.1, mineCooldownMs: 6000, rubberBandGain: 0.02,
      },
    },
  ]
}
