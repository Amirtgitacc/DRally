// When a dropped mine is dangerous, and to whom.
//
// A single arming delay for everybody made the weapon useless at the one job it
// exists for. A rival drops a mine 55px off its tail; a car chasing at 600 px/s
// reaches that spot in about 0.1s. With a 900ms delay the mine was still asleep
// when the victim drove over it, and armed itself harmlessly behind them.
//
// The delay is there so the DROPPER doesn't blow itself up. Nobody else should
// be covered by it: they get a short fuse, long enough to see the thing land.

export interface MineFuseTuning {
  /** the dropper cannot set off their own mine for this long, ms */
  ownerSafeMs: number
  /** everyone else is at risk this soon after it lands, ms */
  fuseMs: number
}

export interface FusedMine {
  droppedAt: number
  ownerId: string
}

/** Is this mine live for that car right now? */
export function mineIsLive(mine: FusedMine, carId: string, now: number, tune: MineFuseTuning): boolean {
  const age = now - mine.droppedAt
  return age >= (carId === mine.ownerId ? tune.ownerSafeMs : tune.fuseMs)
}

/** Has it finished its fuse — i.e. should it look armed and dangerous? */
export function mineIsArmed(mine: FusedMine, now: number, tune: MineFuseTuning): boolean {
  return now - mine.droppedAt >= tune.fuseMs
}
