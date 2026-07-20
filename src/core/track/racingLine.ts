// The line a driver takes, as opposed to the middle of the road.
//
// The AI used to chase the centerline. That is both a longer path and a slower
// one: it turns through the full angle of every corner instead of straightening
// it out, so the cornering model brakes for a bend the car could have taken
// nearly flat. Aces averaged 63% of their own top speed.
//
// The line is found by relaxation. Each sample may slide sideways within the
// corridor; on every pass we pull it toward the midpoint of its neighbours,
// which is the move that reduces curvature. Repeat and the line settles wide
// on entry, tight at the apex, wide on exit — the shape a driver draws.

import type { Vec2 } from './geometry'

export interface RacingLineOptions {
  /** how far the line may stray from the centerline, px */
  maxOffset: number
  /** relaxation passes; more = smoother, with diminishing returns */
  iterations?: number
  /** how far each pass moves a point toward its neighbours' midpoint, 0..1 */
  rate?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Unit normal (left of travel) of a closed polyline at index i. */
function normalAt(points: Vec2[], i: number): Vec2 {
  const n = points.length
  const prev = points[(i - 1 + n) % n]
  const next = points[(i + 1) % n]
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

/**
 * Offsets, one per centerline sample, of the line a driver would take.
 * Positive = left of travel. Kept separate from the points so callers can see
 * how far off-centre the line runs without recomputing anything.
 */
export function racingLineOffsets(centerline: Vec2[], opts: RacingLineOptions): number[] {
  const n = centerline.length
  const iterations = opts.iterations ?? 240
  const rate = opts.rate ?? 0.35
  const normals = centerline.map((_, i) => normalAt(centerline, i))
  const offsets = new Array<number>(n).fill(0)

  for (let pass = 0; pass < iterations; pass++) {
    const next = offsets.slice()
    for (let i = 0; i < n; i++) {
      const prev = centerline[(i - 1 + n) % n]
      const here = centerline[i]
      const after = centerline[(i + 1) % n]
      const np = normals[(i - 1 + n) % n]
      const na = normals[(i + 1) % n]
      const oPrev = offsets[(i - 1 + n) % n]
      const oNext = offsets[(i + 1) % n]

      // where the neighbours currently sit, and the midpoint between them
      const ax = prev.x + np.x * oPrev
      const ay = prev.y + np.y * oPrev
      const bx = after.x + na.x * oNext
      const by = after.y + na.y * oNext
      const midx = (ax + bx) / 2
      const midy = (ay + by) / 2

      // only the sideways part of that move is available to us
      const along = (midx - here.x) * normals[i].x + (midy - here.y) * normals[i].y
      next[i] = clamp(offsets[i] + (along - offsets[i]) * rate, -opts.maxOffset, opts.maxOffset)
    }
    for (let i = 0; i < n; i++) offsets[i] = next[i]
  }
  return offsets
}

export interface LineObstacle {
  /** centerline sample index nearest the obstacle circle */
  index: number
  /** signed lateral offset of the circle center, along the left normal */
  lateral: number
  /** circle radius, px */
  radius: number
}

export interface AvoidObstaclesOptions {
  /** corridor half-width the line may use (same as RacingLineOptions.maxOffset) */
  maxOffset: number
  /** how far the line must stay from a circle's edge (car radius + margin) */
  clearance: number
  /** blend window on each side of the obstacle, in samples */
  windowSamples: number
}

/**
 * Push racing-line offsets sideways around static obstacles. For each circle
 * the side with more corridor room wins; samples inside a cosine window are
 * pushed (never pulled) toward a lateral that clears the circle by
 * `clearance`. The result stays within ±maxOffset — authored obstacles are
 * expected to leave at least one lane wide enough, which the catalog tests
 * enforce.
 */
export function avoidLineObstacles(
  offsets: number[],
  obstacles: LineObstacle[],
  opts: AvoidObstaclesOptions,
): number[] {
  const n = offsets.length
  const out = offsets.slice()
  for (const ob of obstacles) {
    const clear = ob.radius + opts.clearance
    const roomLeft = opts.maxOffset - (ob.lateral + clear)
    const roomRight = ob.lateral - clear + opts.maxOffset
    const side = roomLeft >= roomRight ? 1 : -1
    const target = clamp(ob.lateral + side * clear, -opts.maxOffset, opts.maxOffset)
    for (let d = -opts.windowSamples; d <= opts.windowSamples; d++) {
      const i = ((ob.index + d) % n + n) % n
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / (opts.windowSamples + 1)))
      // push-only: a line already clear of the circle on the chosen side stays put
      const needsPush = side === 1 ? out[i] < target : out[i] > target
      if (needsPush) out[i] += (target - out[i]) * w
    }
  }
  return out
}

/** The racing line itself: the centerline pushed sideways by those offsets. */
export function buildRacingLine(centerline: Vec2[], opts: RacingLineOptions & { obstacles?: LineObstacle[]; obstacleClearance?: number }): Vec2[] {
  let offsets = racingLineOffsets(centerline, opts)
  if (opts.obstacles && opts.obstacles.length > 0) {
    offsets = avoidLineObstacles(offsets, opts.obstacles, {
      maxOffset: opts.maxOffset,
      clearance: opts.obstacleClearance ?? 42,
      windowSamples: 8,
    })
  }
  return centerline.map((p, i) => {
    const nrm = normalAt(centerline, i)
    return { x: p.x + nrm.x * offsets[i], y: p.y + nrm.y * offsets[i] }
  })
}

/** Sum of turn angle around a closed polyline, radians. Lower = straighter. */
export function totalCurvature(points: Vec2[]): number {
  const n = points.length
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n]
    const b = points[i]
    const c = points[(i + 1) % n]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const bcx = c.x - b.x
    const bcy = c.y - b.y
    const la = Math.hypot(abx, aby) || 1
    const lb = Math.hypot(bcx, bcy) || 1
    const dot = clamp((abx * bcx + aby * bcy) / (la * lb), -1, 1)
    total += Math.acos(dot)
  }
  return total
}
