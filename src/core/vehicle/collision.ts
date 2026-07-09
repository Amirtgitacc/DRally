// Pure car-to-car collision response — no Phaser imports. Mass-weighted
// impulse along the contact normal plus a spin kick from the tangential
// scrape, so heavy cars shove light ones and glancing hits twist you round.

export interface CollisionBody {
  x: number
  y: number
  vx: number
  vy: number
  /** relative mass (1 = starter chassis) */
  mass: number
}

export interface CollisionResponse {
  a: { dvx: number; dvy: number; spin: number }
  b: { dvx: number; dvy: number; spin: number }
  /** closing speed along the normal — feeds the damage model */
  impact: number
}

/** Bounciness of car-on-car hits (0 = dead stop, 1 = billiard balls). */
const RESTITUTION = 0.4
/** Heading kick per px/s of tangential scrape, damped by mass. */
const SPIN_SCALE = 0.0009
const MAX_SPIN = 0.22

/**
 * Impulse response for two overlapping cars. Returns null when they are
 * already separating (positions overlapping but velocities diverging).
 */
export function collideCars(a: CollisionBody, b: CollisionBody): CollisionResponse | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return null
  const nx = dx / dist
  const ny = dy / dist

  // closing speed along the normal (positive = moving into each other)
  const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
  if (rel <= 0) return null

  const j = ((1 + RESTITUTION) * rel) / (1 / a.mass + 1 / b.mass)

  // tangential scrape decides which way each car gets twisted
  const tx = -ny
  const ty = nx
  const relT = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty
  const clamp = (v: number) => Math.max(-MAX_SPIN, Math.min(MAX_SPIN, v))
  const spinA = clamp((relT * SPIN_SCALE) / a.mass)
  const spinB = clamp((-relT * SPIN_SCALE) / b.mass)

  return {
    a: { dvx: (-j / a.mass) * nx, dvy: (-j / a.mass) * ny, spin: spinA },
    b: { dvx: (j / b.mass) * nx, dvy: (j / b.mass) * ny, spin: spinB },
    impact: rel,
  }
}
