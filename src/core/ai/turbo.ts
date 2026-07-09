// When a rival lights the turbo.
//
// The old rule was "the track ahead looks straight and the tank is over a
// third" — which on a twisty circuit is almost never, and never at the moment
// it matters. A driver boosts on corner exit as the wheel unwinds, to close a
// gap, and to defend a car that is climbing onto their bumper.

export interface TurboContext {
  /** upcoming corner sharpness, 0 (straight) .. 1 (hairpin) */
  curvatureAhead: number
  /** how much of the tank is left, 0..1 */
  turbo: number
  forwardSpeed: number
  topSpeed: number
  /** gates behind the car we are chasing; negative when we lead */
  deficit: number
  /** a car is on our bumper and closing */
  underAttack: boolean
}

export interface TurboTuning {
  /** the track has to be at least this straight to boost at all */
  maxCurvature: number
  /** never dip below this much fuel on a routine boost */
  reserve: number
  /** boosting at top speed wastes it — only boost below this fraction of top */
  maxSpeedFraction: number
  /** chasing this many gates back, spend the reserve too */
  chaseDeficit: number
  /** defending a pass is worth the reserve */
  defendReserve: number
}

export const DEFAULT_TURBO_TUNING: TurboTuning = {
  maxCurvature: 0.3,
  reserve: 0.3,
  maxSpeedFraction: 0.97,
  chaseDeficit: 2,
  defendReserve: 0.15,
}

export function shouldTurbo(ctx: TurboContext, tune: TurboTuning = DEFAULT_TURBO_TUNING): boolean {
  // no corner is worth boosting into, however desperate
  if (ctx.curvatureAhead > tune.maxCurvature) return false
  // already at the limit: the boost would only burn fuel
  if (ctx.forwardSpeed >= ctx.topSpeed * tune.maxSpeedFraction) return false

  if (ctx.underAttack && ctx.turbo > tune.defendReserve) return true
  if (ctx.deficit >= tune.chaseDeficit && ctx.turbo > tune.defendReserve) return true
  return ctx.turbo > tune.reserve
}
