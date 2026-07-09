// Where to point the gun.
//
// Firing at where a car IS means every shot arrives where it was. A driver
// leads the target: solve for the point the bullet and the car reach together,
// assuming the target holds its current velocity.

import type { Vec2 } from '../track/geometry'

export interface AimTarget extends Vec2 {
  vx: number
  vy: number
}

/**
 * Time for a bullet leaving `from` at `bulletSpeed` to meet a target holding
 * course, or null when it can never catch it (target outrunning the bullet).
 *
 * Solves |target + v·t − from| = bulletSpeed·t for the smaller positive t.
 */
export function interceptTime(from: Vec2, target: AimTarget, bulletSpeed: number): number | null {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const a = target.vx * target.vx + target.vy * target.vy - bulletSpeed * bulletSpeed
  const b = 2 * (dx * target.vx + dy * target.vy)
  const c = dx * dx + dy * dy

  if (Math.abs(a) < 1e-6) {
    // target and bullet travel at the same speed: one linear solution
    if (Math.abs(b) < 1e-6) return null
    const t = -c / b
    return t > 0 ? t : null
  }

  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const root = Math.sqrt(disc)
  const t1 = (-b - root) / (2 * a)
  const t2 = (-b + root) / (2 * a)
  const times = [t1, t2].filter((t) => t > 0).sort((p, q) => p - q)
  return times.length ? times[0] : null
}

/** The point to shoot at. Falls back to the target itself when no lead exists. */
export function leadTarget(from: Vec2, target: AimTarget, bulletSpeed: number): Vec2 {
  const t = interceptTime(from, target, bulletSpeed)
  if (t === null) return { x: target.x, y: target.y }
  return { x: target.x + target.vx * t, y: target.y + target.vy * t }
}
