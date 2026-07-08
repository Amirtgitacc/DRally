// Pure pickup layout — scatters pickups along the track centerline in a
// repeating pattern with alternating lateral offsets. Deterministic, so the
// same track always produces the same loot line.

import { lineTangentAt, type Vec2 } from './geometry'

export type PickupType = 'ammo' | 'turbo' | 'repair' | 'cash' | 'trap'

export interface PickupSpot {
  type: PickupType
  x: number
  y: number
}

export interface PickupLayoutOptions {
  /** place a pickup every N centerline samples */
  spacingSamples: number
  /** sideways offsets cycled per pickup, px (0 = on the racing line) */
  lateralOffsets: number[]
  /** pickup types cycled in order */
  pattern: PickupType[]
  /** skip spots within this distance of the start point (keep the grid clean) */
  clearRadiusAroundStart: number
}

export function layoutPickups(centerline: Vec2[], opts: PickupLayoutOptions): PickupSpot[] {
  const spots: PickupSpot[] = []
  const start = centerline[0]
  let k = 0
  for (let i = 0; i < centerline.length; i += opts.spacingSamples) {
    const p = centerline[i]
    const t = lineTangentAt(centerline, i)
    const lateral = opts.lateralOffsets[k % opts.lateralOffsets.length]
    const x = p.x - t.y * lateral
    const y = p.y + t.x * lateral
    const type = opts.pattern[k % opts.pattern.length]
    k++
    if (Math.hypot(x - start.x, y - start.y) < opts.clearRadiusAroundStart) continue
    spots.push({ type, x, y })
  }
  return spots
}
