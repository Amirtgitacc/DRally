// Pure RaceEnv construction — no Phaser imports. Same track + options always
// produce an identical env, which lets both RaceScene and the headless server
// build byte-identical race geometry from a trackId.

import type { TrackDef } from '../../data/tracks/testCircuit'
import type { CarPhysicsSpec } from '../vehicle/carPhysics'
import type { Vec2 } from '../track/geometry'
import type { RaceEnv } from './raceState'
import { buildGates, catmullRomClosed, closedPolylineLength, offsetClosedPolyline, spacedPointsAlong } from '../track/geometry'
import { buildRacingLine } from '../track/racingLine'

const CAR_RADIUS = 34 // matches RaceScene CAR_RADIUS used for racing-line inset

/** Tire-wall positions — mirrors RaceScene.buildWorld's old inline loop, minus the Phaser image. */
export function computeBarriers(centerline: Vec2[], halfWidth: number, shoulder: number): Vec2[] {
  const shoulderHalf = halfWidth + shoulder
  const barriers: Vec2[] = []
  for (const side of [1, -1]) {
    const wallLine = offsetClosedPolyline(centerline, side * (shoulderHalf + 24))
    for (const p of spacedPointsAlong(wallLine, 54)) barriers.push(p)
  }
  return barriers
}

export interface BuildEnvOptions {
  playerSpec: CarPhysicsSpec
  weaponsEnabled: boolean
  hasPlating: boolean
  hasOverTurbo: boolean
  raceEndMode: 'single-player' | 'all-humans'
}

export function buildRaceEnv(track: TrackDef, opts: BuildEnvOptions): RaceEnv {
  const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
  const racingLine = buildRacingLine(centerline, { maxOffset: track.width / 2 - CAR_RADIUS - 8 })
  const gates = buildGates(centerline, track.gateCount, track.width / 2 + track.shoulder)
  const gateSpacing = closedPolylineLength(centerline) / track.gateCount
  const barriers = computeBarriers(centerline, track.width / 2, track.shoulder)
  return {
    centerline, racingLine, gates, barriers, gateSpacing,
    trackWidth: track.width, laps: track.laps, tier: track.tier,
    playerSpec: opts.playerSpec, weaponsEnabled: opts.weaponsEnabled,
    hasPlating: opts.hasPlating, hasOverTurbo: opts.hasOverTurbo,
    raceEndMode: opts.raceEndMode,
  }
}
