// Pure pickup layout helpers. The legacy regular layout remains useful in
// tests/tools; races use the seeded-random layout so bonuses move each round.

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

export interface RandomPickupLayoutOptions {
  /** legal sideways offsets from the centerline, px */
  lateralOffsets: number[]
  /** keep the grid and start/finish approach clean */
  clearRadiusAroundStart: number
  /** desired distance between active pickups, px */
  minDistance: number
  /** bounded search cost for each position */
  attempts?: number
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

/** Pick one seeded-random, track-relative spot away from the grid and other loot. */
export function randomPickupSpot(
  centerline: Vec2[],
  opts: RandomPickupLayoutOptions,
  random: () => number,
  occupied: Vec2[] = [],
): Vec2 {
  if (centerline.length === 0) throw new Error('Cannot place a pickup without a centerline')
  if (opts.lateralOffsets.length === 0) throw new Error('At least one pickup lateral offset is required')

  const start = centerline[0]
  let best: Vec2 | null = null
  let bestClearance = -Infinity
  const attempts = opts.attempts ?? 48

  for (let attempt = 0; attempt < attempts; attempt++) {
    const index = Math.min(centerline.length - 1, Math.floor(random() * centerline.length))
    const p = centerline[index]
    const tangent = lineTangentAt(centerline, index)
    const lateral = opts.lateralOffsets[Math.min(opts.lateralOffsets.length - 1, Math.floor(random() * opts.lateralOffsets.length))]
    const candidate = { x: p.x - tangent.y * lateral, y: p.y + tangent.x * lateral }
    if (Math.hypot(candidate.x - start.x, candidate.y - start.y) < opts.clearRadiusAroundStart) continue

    const clearance = occupied.length === 0
      ? Infinity
      : Math.min(...occupied.map((spot) => Math.hypot(candidate.x - spot.x, candidate.y - spot.y)))
    if (clearance >= opts.minDistance) return candidate
    if (clearance > bestClearance) {
      best = candidate
      bestClearance = clearance
    }
  }

  // Dense/tiny tracks may not satisfy the ideal spacing. Return the safest
  // sampled candidate instead of failing a race setup.
  return best ?? { ...centerline[Math.floor(centerline.length / 2)] }
}

/** Place a fixed, deliberately small type pool at seeded-random positions. */
export function randomPickupLayout(
  centerline: Vec2[],
  types: PickupType[],
  opts: RandomPickupLayoutOptions,
  random: () => number,
): PickupSpot[] {
  const shuffled = [...types]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const spots: PickupSpot[] = []
  for (const type of shuffled) {
    const position = randomPickupSpot(centerline, opts, random, spots)
    spots.push({ type, ...position })
  }
  return spots
}
