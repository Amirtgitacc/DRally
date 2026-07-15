import { describe, expect, it } from 'vitest'
import { createRaceState, type CarSetup, type RaceEnv } from '../../../src/core/race/raceState'
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

describe('createRaceState', () => {
  it('is deterministic for a seed', () => {
    const env = buildTestEnv()
    expect(createRaceState(env, buildTestSetups(), 42)).toEqual(createRaceState(env, buildTestSetups(), 42))
  })

  it('produces a JSON-serializable state that round-trips losslessly', () => {
    const state = createRaceState(buildTestEnv(), buildTestSetups(), 42)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('spawns the player first, on the grid, grounded and idle', () => {
    const state = createRaceState(buildTestEnv(), buildTestSetups(), 42)
    expect(state.cars[0].isPlayer).toBe(true)
    expect(state.cars[0].state.z).toBe(0)
    expect(state.phase).toBe('countdown')
    expect(state.pickups.length).toBeGreaterThan(0)
    expect(state.placementOrder).toHaveLength(2)
  })
})
