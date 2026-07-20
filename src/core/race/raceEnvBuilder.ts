// Pure RaceEnv construction — no Phaser imports. Same track + options always
// produce an identical env, which lets both RaceScene and the headless server
// build byte-identical race geometry from a trackId.

import type { TrackDef } from '../../data/tracks/types'
import type { CarPhysicsSpec } from '../vehicle/carPhysics'
import type { Vec2 } from '../track/geometry'
import type { RaceEnv } from './raceState'
import { buildGates, catmullRomClosed, closedPolylineLength, lineTangentAt, offsetClosedPolyline, spacedPointsAlong } from '../track/geometry'
import { buildRacingLine, type LineObstacle } from '../track/racingLine'
import { resolveSetPieces, type ObstacleCircle } from '../track/setPieces'

const CAR_RADIUS = 34 // matches RaceScene CAR_RADIUS used for racing-line inset
const LINE_OBSTACLE_MARGIN = 8 // extra clearance the racing line keeps beyond the car body

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

/** An obstacle circle projected onto the centerline: sample index + signed lateral. */
function toLineObstacle(centerline: Vec2[], c: ObstacleCircle): LineObstacle {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < centerline.length; i++) {
    const d = Math.hypot(centerline[i].x - c.x, centerline[i].y - c.y)
    if (d < bestD) { bestD = d; best = i }
  }
  const t = lineTangentAt(centerline, best)
  const p = centerline[best]
  // lateral along the left normal (-ty, tx) — same convention everywhere
  const lateral = (c.x - p.x) * -t.y + (c.y - p.y) * t.x
  return { index: best, lateral, radius: c.r }
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
  const obstacles = resolveSetPieces(track, centerline)
  const obstacleCircles = obstacles.flatMap((o) => o.circles)
  const racingLine = buildRacingLine(centerline, {
    maxOffset: track.width / 2 - CAR_RADIUS - 8,
    obstacles: obstacleCircles.map((c) => toLineObstacle(centerline, c)),
    obstacleClearance: CAR_RADIUS + LINE_OBSTACLE_MARGIN,
  })
  const gates = buildGates(centerline, track.gateCount, track.width / 2 + track.shoulder)
  const gateSpacing = closedPolylineLength(centerline) / track.gateCount
  const barriers = computeBarriers(centerline, track.width / 2, track.shoulder)
  return {
    centerline, racingLine, gates, barriers, gateSpacing,
    obstacles, obstacleCircles,
    trackWidth: track.width, laps: track.laps, tier: track.tier,
    playerSpec: opts.playerSpec, weaponsEnabled: opts.weaponsEnabled,
    hasPlating: opts.hasPlating, hasOverTurbo: opts.hasOverTurbo,
    raceEndMode: opts.raceEndMode,
  }
}
