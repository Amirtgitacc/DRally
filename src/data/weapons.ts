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
  /** velocity a hit pushes into the victim (px/s, damped by mass) — hits shove */
  impactKick: 42,
}

/**
 * AI opens fire when an enemy is within range and inside this aim cone.
 *
 * Bursts matter: a rival holding the trigger from your bumper for a whole lap
 * is not difficulty, it is an execution. Firing in bursts caps sustained DPS
 * and gives the player a rhythm to drive around.
 */
export const AI_GUNNER = {
  range: 420,
  aimCone: 0.12,
  /** how long a rival holds the trigger once it opens fire */
  burstMs: 900,
  /** and how long it waits before the next burst */
  restMs: 700,
  /**
   * Rival rounds hit softer than yours, because the grid is three guns pointed
   * at one player and one player's gun pointed at a grid.
   *
   * It used to be 0.5 everywhere, which made the top tier a shooting gallery: a
   * player who aims better than the AI simply wins the fight. The handicap now
   * shrinks as the purse grows — on a death race the aces shoot for full value.
   */
  damageScale: { street: 0.5, pro: 0.75, death: 1.0 } as Record<'street' | 'pro' | 'death', number>,
  /** aces predict where you'll be; everyone else fires at where you were */
  leadTargetFromGrade: 4,
}

/** One-race consumable bought in the garage; dropped behind the car. */
export const MINES = {
  price: 450,
  count: 6,
  damage: 26,
  /** cars this close to a blast also take splash damage */
  blastRadius: 110,
  splashDamage: 10,
  /**
   * The dropper cannot set off their own mine for this long. This used to apply
   * to everyone, which left a mine dropped at a tailgater still asleep when
   * they drove over it — the weapon could not do the one job it exists for.
   */
  ownerSafeMs: 900,
  /**
   * Everyone else gets only a fuse. It has to be shorter than the time a
   * tailgater needs to reach the mine, or the weapon misses the car it was
   * aimed at: the mine lands 55px off the dropper's tail, so a pursuer on the
   * bumper is ~35px away and covers that in 58ms at racing speed.
   */
  fuseMs: 45,
  triggerRadius: 36,
  dropCooldownMs: 300,
}

export const RAM_DAMAGE = { threshold: 150, scale: 0.04, max: 18 }
export const WALL_DAMAGE = { threshold: 260, scale: 0.025, max: 10 }

/**
 * Mine detonation kick: radial shove + spin-out + the launch that puts a car
 * in the air. launchVz 640 against gravity 1600 = 0.8s of airtime and a 128px
 * apex for a direct hit on a mass-1.0 chassis (airtime = 2·vz/gravity).
 * While airborne the car ignores steering and traction — that's the real cost.
 */
export const MINE_BLAST = {
  shove: 420,
  spin: 0.35,
  launchVz: 640,
  /** splashed cars get shoved but barely leave the ground */
  splashLaunchScale: 0.55,
  gravity: 1600,
}

/**
 * Rivals carry mines on the dangerous tiers and drop them on your nose.
 *
 * Counts are per rival, so a death-tier grid multiplies them by three while
 * you carry one pack. A direct hit now costs 26% AND launches you off the
 * tarmac (see MINE_BLAST), so a dense minefield stops being a hazard and
 * starts being an execution. Aces still bring extra via mineAggression.
 */
export const AI_MINES = {
  count: { street: 0, pro: 1, death: 3 } as Record<'street' | 'pro' | 'death', number>,
  /** drop when an enemy trails this close behind */
  dropRange: 190,
  cooldownMs: 2600,
  /** no drops until the packed grid has spread out after GO */
  graceMs: 8000,
  /** and drop the moment a car behind is closing this fast, px/s */
  closingSpeed: 60,
}

export const TURBO = {
  drainPerSec: 0.4,
  rechargePerSec: 0.05,
  accelScale: 1.9,
  topSpeedScale: 1.25,
}

/** How hard a hit lands on the player's senses. Pure feel — no sim effect. */
export const IMPACT_FX = {
  /** white flash on a car that just took a bullet, ms */
  hitFlashMs: 70,
  /** bullet hit on the player: camera shake + red edge flash */
  playerHitShake: 0.0022,
  playerHitFlashAlpha: 0.5,
  /** car-vs-car: closing speed (px/s) above which the world lurches */
  crashSlowMoImpact: 430,
  /** time dilation applied to the sim during a big crash */
  crashSlowMoScale: 0.35,
  crashSlowMoMs: 120,
  /** shake from a crash, scaled by impact and clamped here */
  crashMaxShake: 0.014,
  /** landing after a mine launch */
  landingShake: 0.006,
  landingDustCount: 14,
  /** airborne rendering: px of height that doubles the sprite, shadow throw */
  liftPerScale: 420,
  shadowThrowX: 0.22,
  shadowThrowY: 0.3,
}

/** Turbo feel: flame cone, heat glow, screen streaks, camera pull-back. */
export const TURBO_FX = {
  /** extra camera zoom-out while boosting */
  zoomOut: 0.07,
  /** camera jitter, px, at full boost */
  jitter: 3.2,
  flameTint: 0x66ccff,
  glowTint: 0x3aa8ff,
  /** the volatile mix burns red and shakes harder */
  overchargeFlameTint: 0xff5a2a,
  overchargeGlowTint: 0xff3a10,
  overchargeJitterScale: 2.1,
  /** screen-edge speed streaks */
  streakCount: 22,
  streakColor: 0xbfe6ff,
  overchargeStreakColor: 0xffb08a,
}

export const PICKUPS = {
  respawnMs: 10000,
  radius: 42,
  ammoAmount: 50,
  repairAmount: 25,
  cashAmount: 200,
  /** the skull-marked orb swims your camera for long enough to cost a corner */
  trapDurationMs: 4500,
}

/** Guns stay cold for this long after GO so the field can spread out. */
export const WEAPONS_FREE_DELAY_MS = 2000
