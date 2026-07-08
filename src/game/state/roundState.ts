// The race offer the player accepted at sign-up, consumed by RaceScene.
// Kept in memory only — a fresh round is rolled at each sign-up screen.

import type { TrackDef } from '../../data/tracks/testCircuit'

export interface RaceOffer {
  track: TrackDef
  /** roster ids of the 3 rivals on this grid */
  rivalIds: string[]
}

let currentOffer: RaceOffer | null = null

export function setCurrentOffer(offer: RaceOffer) {
  currentOffer = offer
}

/** Null when RaceScene starts without sign-up (shouldn't happen in normal flow). */
export function getCurrentOffer(): RaceOffer | null {
  return currentOffer
}
