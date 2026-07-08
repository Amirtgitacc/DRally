// Pure track geometry — no Phaser imports. A track is authored as a closed
// loop of control points; everything else (centerline, walls, gates) derives.

export interface Vec2 {
  x: number
  y: number
}

export interface Gate {
  a: Vec2
  b: Vec2
  center: Vec2
  /** unit tangent = direction of travel at this gate */
  tangent: Vec2
}

/** Sample a closed Catmull-Rom spline through the control points. */
export function catmullRomClosed(controls: Vec2[], samplesPerSegment: number): Vec2[] {
  const n = controls.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const p0 = controls[(i - 1 + n) % n]
    const p1 = controls[i]
    const p2 = controls[(i + 1) % n]
    const p3 = controls[(i + 2) % n]
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return out
}

/** Unit tangent (direction of travel) of a closed polyline at index i. */
export function lineTangentAt(points: Vec2[], i: number): Vec2 {
  return tangentAt(points, i)
}

/** How much the line turns (radians, 0..π) between index i and i+ahead. */
export function turnAmount(points: Vec2[], i: number, ahead: number): number {
  const t1 = tangentAt(points, i)
  const t2 = tangentAt(points, (i + ahead) % points.length)
  const dot = Math.max(-1, Math.min(1, t1.x * t2.x + t1.y * t2.y))
  return Math.acos(dot)
}

function tangentAt(points: Vec2[], i: number): Vec2 {
  const n = points.length
  const prev = points[(i - 1 + n) % n]
  const next = points[(i + 1) % n]
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/** Offset a closed polyline sideways. Positive offset = to the left of travel. */
export function offsetClosedPolyline(points: Vec2[], offset: number): Vec2[] {
  return points.map((p, i) => {
    const t = tangentAt(points, i)
    return { x: p.x - t.y * offset, y: p.y + t.x * offset }
  })
}

/** Walk a closed polyline and emit points every `spacing` px of arc length. */
export function spacedPointsAlong(points: Vec2[], spacing: number): Vec2[] {
  const out: Vec2[] = []
  let carried = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    let d = spacing - carried
    while (d <= segLen) {
      const t = d / segLen
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      d += spacing
    }
    carried = (carried + segLen) % spacing
  }
  return out
}

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

/** Min distance from a point to a closed polyline (the track centerline). */
export function distanceToClosedPolyline(p: Vec2, points: Vec2[]): number {
  let min = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = pointSegmentDistance(p, points[i], points[(i + 1) % points.length])
    if (d < min) min = d
  }
  return min
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** Do segments a1-a2 and b1-b2 intersect (properly or at endpoints)? */
export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = orient(b1, b2, a1)
  const d2 = orient(b1, b2, a2)
  const d3 = orient(a1, a2, b1)
  const d4 = orient(a1, a2, b2)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const on = (p: Vec2, q: Vec2, r: Vec2) =>
    orient(p, q, r) === 0 &&
    Math.min(p.x, q.x) <= r.x &&
    r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y &&
    r.y <= Math.max(p.y, q.y)
  return on(b1, b2, a1) || on(b1, b2, a2) || on(a1, a2, b1) || on(a1, a2, b2)
}

/** Evenly spaced perpendicular gates across the track. Gate 0 = start/finish. */
export function buildGates(centerline: Vec2[], count: number, halfWidth: number): Gate[] {
  const n = centerline.length
  const gates: Gate[] = []
  for (let g = 0; g < count; g++) {
    const i = Math.round((g * n) / count) % n
    const c = centerline[i]
    const t = tangentAt(centerline, i)
    const normal = { x: -t.y, y: t.x }
    gates.push({
      a: { x: c.x + normal.x * halfWidth, y: c.y + normal.y * halfWidth },
      b: { x: c.x - normal.x * halfWidth, y: c.y - normal.y * halfWidth },
      center: c,
      tangent: t,
    })
  }
  return gates
}
