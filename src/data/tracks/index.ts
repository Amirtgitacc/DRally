import type { RaceTier } from '../economy'
import { TEST_CIRCUIT, type TrackDef } from './testCircuit'
import { DUST_BOWL } from './dustBowl'
import { SERPENTS_THROAT } from './serpentsThroat'

/** One track per prize tier — the three races on offer every round. */
export const TRACKS_BY_TIER: Record<RaceTier, TrackDef> = {
  street: DUST_BOWL,
  pro: TEST_CIRCUIT,
  death: SERPENTS_THROAT,
}
