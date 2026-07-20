import { describe, expect, it } from 'vitest'
import { ALL_TRACKS } from '../../../src/data/tracks'
import { catmullRomClosed, distanceToClosedPolyline, lineTangentAt } from '../../../src/core/track/geometry'
import { resolveDecorations, resolveSetPieces } from '../../../src/core/track/setPieces'
import { buildRaceEnv } from '../../../src/core/race/raceEnvBuilder'
import { clearRescuePose, rescuePose } from '../../../src/core/vehicle/rescue'
import { randomPickupLayout } from '../../../src/core/track/pickups'
import { createSeededRandom } from '../../../src/core/race/random'
import { effectiveCarSpec } from '../../../src/core/vehicle/carSpec'
import { carById } from '../../../src/data/cars'
import { PICKUPS } from '../../../src/data/weapons'

const CAR_RADIUS = 34
const CAR_DIAMETER = 60 // body circle used in car-to-car collision is r30

const spec = effectiveCarSpec(carById('jackal'), { engine: 0, tires: 0, armor: 0 })
const opts = { playerSpec: spec, weaponsEnabled: true, hasPlating: false, hasOverTurbo: false, raceEndMode: 'single-player' as const }

/** Signed lateral of a point relative to the nearest centerline sample. */
function lateralOf(centerline: { x: number; y: number }[], p: { x: number; y: number }) {
  let best = 0
  let bestD = Infinity
  centerline.forEach((c, i) => {
    const d = Math.hypot(c.x - p.x, c.y - p.y)
    if (d < bestD) { bestD = d; best = i }
  })
  const t = lineTangentAt(centerline, best)
  const c = centerline[best]
  return (p.x - c.x) * -t.y + (p.y - c.y) * t.x
}

describe('track set pieces', () => {
  for (const track of ALL_TRACKS) {
    describe(track.name, () => {
      const centerline = catmullRomClosed(track.controls, track.samplesPerSegment)
      const pieces = resolveSetPieces(track, centerline)
      const halfW = track.width / 2

      it('authors at least one splitter and resolves deterministically', () => {
        expect(track.setPieces!.length).toBeGreaterThan(0)
        expect(pieces).toEqual(resolveSetPieces(track, centerline))
        for (const sp of track.setPieces!) {
          expect(sp.control).toBeGreaterThanOrEqual(0)
          expect(sp.control).toBeLessThan(track.controls.length)
        }
      })

      it('every ground-level set piece is a real obstacle with collision', () => {
        for (const sp of track.setPieces!.filter((p) => !p.overhead)) {
          expect(sp.circles.length, `${sp.texture} has no collision circles`).toBeGreaterThan(0)
        }
      })

      it('never authors a retired obstacle texture', () => {
        const retired = [
          'set-container-cluster', 'set-crane-buffer', 'set-valve-manifold',
          'set-boulder-cluster', 'set-scrap-pile', 'set-cable-spool',
          'set-wreck', 'set-conveyor',
        ]
        for (const sp of [...track.setPieces!, ...(track.decorations ?? [])]) {
          expect(retired, `${sp.texture} is retired`).not.toContain(sp.texture)
        }
      })

      it('decorations resolve deterministically, carry no collision, and stay beyond the barriers', () => {
        const decorations = resolveDecorations(track, centerline)
        expect(track.decorations!.length).toBeGreaterThan(0)
        expect(decorations).toEqual(resolveDecorations(track, centerline))
        const clearance = track.width / 2 + track.shoulder + 24 // barrier line
        for (const d of decorations) {
          expect(d, `${d.texture} must not carry circles`).not.toHaveProperty('circles')
          const dist = distanceToClosedPolyline({ x: d.x, y: d.y }, centerline)
          expect(dist, `${d.texture} anchor sits inside the barrier clearance`).toBeGreaterThanOrEqual(clearance)
        }
      })

      it('every collidable circle leaves a fair lane on the road', () => {
        for (const piece of pieces.filter((p) => !p.overhead)) {
          for (const c of piece.circles) {
            const lat = lateralOf(centerline, c)
            const laneLeft = halfW - (lat + c.r)
            const laneRight = lat - c.r + halfW
            expect(
              Math.max(laneLeft, laneRight),
              `${piece.texture} circle leaves no drivable lane`,
            ).toBeGreaterThanOrEqual(CAR_DIAMETER + 25)
          }
        }
      })

      it('overhead spans carry no collision', () => {
        for (const piece of pieces.filter((p) => p.overhead)) {
          expect(piece.circles).toHaveLength(0)
        }
      })

      it('the racing line clears every obstacle circle by a car radius', () => {
        const env = buildRaceEnv(track, opts)
        for (const c of env.obstacleCircles) {
          const d = distanceToClosedPolyline({ x: c.x, y: c.y }, env.racingLine)
          expect(d, `racing line passes through an obstacle (d=${d.toFixed(1)}, r=${c.r})`).toBeGreaterThanOrEqual(c.r + CAR_RADIUS)
        }
      })

      it('seeded pickups never spawn inside an obstacle', () => {
        const env = buildRaceEnv(track, opts)
        for (const seed of [1, 42, 987654]) {
          const rng = createSeededRandom(seed)
          const spots = randomPickupLayout(env.centerline, [...PICKUPS.types], {
            lateralOffsets: [...PICKUPS.lateralOffsets],
            clearRadiusAroundStart: PICKUPS.clearRadiusAroundStart,
            minDistance: PICKUPS.minDistance,
            obstacles: env.obstacleCircles,
          }, rng)
          for (const s of spots) {
            for (const c of env.obstacleCircles) {
              expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeGreaterThan(c.r + CAR_RADIUS)
            }
          }
        }
      })

      it('rescue drop points clear every obstacle', () => {
        const env = buildRaceEnv(track, opts)
        for (const gate of env.gates) {
          const pose = clearRescuePose(
            rescuePose(gate.a, gate.b, gate.tangent),
            gate.a, gate.b, env.obstacleCircles, CAR_RADIUS + 6,
          )
          for (const c of env.obstacleCircles) {
            expect(Math.hypot(pose.x - c.x, pose.y - c.y)).toBeGreaterThanOrEqual(c.r + CAR_RADIUS)
          }
        }
      })

      it('builds an identical env twice — obstacles included', () => {
        const a = buildRaceEnv(track, opts)
        const b = buildRaceEnv(track, opts)
        expect(a.obstacles).toEqual(b.obstacles)
        expect(a.obstacleCircles).toEqual(b.obstacleCircles)
        expect(a.racingLine).toEqual(b.racingLine)
      })
    })
  }

  it('a car overlapping an obstacle circle is pushed out by the wall response', async () => {
    const { buildRaceEnvFixture } = await import('../../helpers/raceEnvFixture')
    const { createRaceState } = await import('../../../src/core/race/raceState')
    const { stepRace, IDLE_COMMAND } = await import('../../../src/core/race/stepRace')
    const env = buildRaceEnvFixture()
    const circle = { x: env.gates[2].center.x, y: env.gates[2].center.y, r: 45 }
    env.obstacleCircles = [circle]
    const state = createRaceState(env, [{ id: 'player', isPlayer: true, ai: null, mass: 1, damage: 0, ammo: 0, mines: 0, armorTier: 0 }], 7)
    state.phase = 'racing'
    const car = state.cars[0]
    car.state.x = circle.x + 10
    car.state.y = circle.y
    car.state.vx = -200
    stepRace(state, env, { player: IDLE_COMMAND }, 16)
    const d = Math.hypot(car.state.x - circle.x, car.state.y - circle.y)
    expect(d).toBeGreaterThanOrEqual(45 + CAR_RADIUS - 1e-6)
  })
})
