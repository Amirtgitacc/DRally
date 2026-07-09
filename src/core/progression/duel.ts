// Pure final-duel logic — the career's ending. At rank #1 the champion
// (data/boss.ts) challenges you to a mandatory 1-v-1; win it and the
// career is crowned.

import { BOSS } from '../../data/boss'
import { applyRaceOutcome, type CareerState } from './career'

/** The duel replaces the normal three-race offer at rank #1. */
export function duelAvailable(playerRank: number, champion: boolean): boolean {
  return playerRank === 1 && !champion
}

export interface DuelOutcome {
  won: boolean
  pickupCash: number
  /** player damage at the end of the duel (100 if wrecked) */
  endDamage: number
}

/**
 * Merge the duel into the career. Winning pays the champion's purse and sets
 * the crown; losing costs nothing but the dents — stay #1 and try again.
 * No championship points move: the ladder has nothing left to say.
 */
export function applyDuelOutcome(c: CareerState, o: DuelOutcome): CareerState {
  const base = applyRaceOutcome(c, {
    prizeCash: o.won ? BOSS.prizeCash : 0,
    pointsEarned: 0,
    pickupCash: o.pickupCash,
    endDamage: o.endDamage,
    won: o.won,
  })
  return { ...base, champion: base.champion || o.won }
}
