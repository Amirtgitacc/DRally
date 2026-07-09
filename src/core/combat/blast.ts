// Pure mine-detonation response — no Phaser imports. One function turns a
// blast center plus a car into everything the race needs: damage, radial
// shove, spin-out, and the vertical kick that puts the car in the air.
//
// Airborne is the point: while z > 0 the car ignores steering and traction
// (see carPhysics.stepCar), so a mine hit costs you the corner, not just HP.

export interface BlastTuning {
  /** full damage to whoever triggered it */
  damage: number
  /** cars inside blastRadius take this instead */
  splashDamage: number
  blastRadius: number
  /** radial shove at ground zero, px/s */
  shove: number
  /** max random heading kick at ground zero, radians */
  spin: number
  /** upward kick at ground zero, px/s */
  launchVz: number
  /** launch a splashed car gets, as a fraction of a direct hit */
  splashLaunchScale: number
  /** downward pull while airborne, px/s^2 */
  gravity: number
}

export interface BlastTarget {
  x: number
  y: number
  /** relative mass — heavy cars shrug off the shove and barely leave the ground */
  mass: number
  /** true for the car that ran over the mine */
  direct: boolean
}

export interface BlastImpulse {
  damage: number
  dvx: number
  dvy: number
  /** upward velocity to add — 0 means the car stays on the tarmac */
  dvz: number
  /** signed heading kick */
  spin: number
  /** 1 at ground zero, falling off to 0.3 at the blast edge */
  falloff: number
}

/**
 * Impulse for one car. Returns null when the car is outside the blast and
 * didn't trigger it. `rand` returns 0..1 (inject Math.random at the call site)
 * and only decides which way the spin goes.
 */
export function mineBlast(
  target: BlastTarget,
  center: { x: number; y: number },
  tuning: BlastTuning,
  rand: () => number,
): BlastImpulse | null {
  const dx = target.x - center.x
  const dy = target.y - center.y
  const dist = Math.hypot(dx, dy)
  if (!target.direct && dist >= tuning.blastRadius) return null

  const falloff = target.direct ? 1 : Math.max(0.3, 1 - dist / tuning.blastRadius)
  // a car sitting exactly on the mine still has to go somewhere
  const nx = dist > 1 ? dx / dist : 1
  const ny = dist > 1 ? dy / dist : 0

  const shove = (tuning.shove * falloff) / target.mass
  const launch = target.direct ? 1 : tuning.splashLaunchScale * falloff

  return {
    damage: target.direct ? tuning.damage : tuning.splashDamage,
    dvx: nx * shove,
    dvy: ny * shove,
    dvz: (tuning.launchVz * launch) / target.mass,
    spin: (rand() - 0.5) * 2 * tuning.spin * falloff,
    falloff,
  }
}
