// Combat tuning — all numbers live here, not in systems.

export const GUN = {
  /** shots per second */
  fireRate: 10,
  bulletSpeed: 950,
  damagePerHit: 2.4,
  ammoMax: 100,
  /** radians of random spread per shot */
  playerSpread: 0.012,
  aiSpread: 0.035,
  /** bullet lifetime, seconds */
  ttl: 0.85,
  /** px from car center to muzzle */
  muzzleOffset: 48,
}

/** AI opens fire when an enemy is within range and inside this aim cone. */
export const AI_GUNNER = {
  range: 420,
  aimCone: 0.12,
}

/** One-race consumable bought in the garage; dropped behind the car. */
export const MINES = {
  price: 450,
  count: 6,
  damage: 26,
  /** cars this close to a blast also take splash damage */
  blastRadius: 110,
  splashDamage: 10,
  /** arming delay so the owner can clear the drop point */
  armDelayMs: 900,
  triggerRadius: 36,
  dropCooldownMs: 300,
}

export const RAM_DAMAGE = { threshold: 150, scale: 0.04, max: 18 }
export const WALL_DAMAGE = { threshold: 260, scale: 0.025, max: 10 }

export const TURBO = {
  drainPerSec: 0.4,
  rechargePerSec: 0.05,
  accelScale: 1.9,
  topSpeedScale: 1.25,
}

export const PICKUPS = {
  respawnMs: 10000,
  radius: 42,
  ammoAmount: 50,
  repairAmount: 25,
  cashAmount: 200,
  trapDurationMs: 2600,
}

/** Guns stay cold for this long after GO so the field can spread out. */
export const WEAPONS_FREE_DELAY_MS = 2000
