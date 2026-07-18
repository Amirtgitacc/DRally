import type { CarState } from '../../core/vehicle/carPhysics'
import type { RaceSnapshot } from '../../core/net/snapshot'

// ~2 snapshots of buffer at the 30Hz server rate. Enough to smooth over normal
// arrival jitter while keeping the render only ~66ms behind live, so input feels
// closer to real time. Raise if remote play shows interpolation stutter.
export const INTERP_DELAY_MS = 66

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

export function lerpCarState(a: CarState, b: CarState, t: number): CarState {
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
    heading: lerpAngle(a.heading, b.heading, t),
    vx: lerp(a.vx, b.vx, t), vy: lerp(a.vy, b.vy, t),
    z: lerp(a.z, b.z, t), vz: lerp(a.vz, b.vz, t),
  }
}

export function bracket(buffer: RaceSnapshot[], renderTimeMs: number): { a: RaceSnapshot; b: RaceSnapshot; t: number } | null {
  if (buffer.length === 0) return null
  if (renderTimeMs <= buffer[0].simTimeMs) return { a: buffer[0], b: buffer[0], t: 0 }
  const last = buffer[buffer.length - 1]
  if (renderTimeMs >= last.simTimeMs) return { a: last, b: last, t: 1 }
  for (let i = 0; i < buffer.length - 1; i++) {
    const a = buffer[i], b = buffer[i + 1]
    if (renderTimeMs >= a.simTimeMs && renderTimeMs <= b.simTimeMs) {
      const span = b.simTimeMs - a.simTimeMs
      return { a, b, t: span === 0 ? 0 : (renderTimeMs - a.simTimeMs) / span }
    }
  }
  return { a: last, b: last, t: 1 }
}
