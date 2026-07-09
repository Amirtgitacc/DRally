import type { RaceTier } from '../economy'
import { TEST_CIRCUIT, type TrackDef } from './testCircuit'
import { DUST_BOWL } from './dustBowl'
import { SERPENTS_THROAT } from './serpentsThroat'
import { BONEYARD_LOOP } from './boneyardLoop'
import { CINDER_YARDS } from './cinderYards'
import { WIDOWS_COIL } from './widowsCoil'

/** Venues per prize tier — each round's sign-up rolls one per tier. */
export const TRACKS_BY_TIER: Record<RaceTier, TrackDef[]> = {
  street: [DUST_BOWL, BONEYARD_LOOP],
  pro: [TEST_CIRCUIT, CINDER_YARDS],
  death: [SERPENTS_THROAT, WIDOWS_COIL],
}

/** Every venue, in tier order — the venues gallery and debug tooling walk this. */
export const ALL_TRACKS: TrackDef[] = [
  DUST_BOWL,
  BONEYARD_LOOP,
  TEST_CIRCUIT,
  CINDER_YARDS,
  SERPENTS_THROAT,
  WIDOWS_COIL,
]

export function trackById(id: string): TrackDef {
  const t = ALL_TRACKS.find((t) => t.id === id)
  if (!t) throw new Error(`Unknown track id: ${id}`)
  return t
}

export function rollTrack(tier: RaceTier, rand: () => number): TrackDef {
  const list = TRACKS_BY_TIER[tier]
  return list[Math.floor(rand() * list.length)]
}

/** The final duel always runs on the same stage. */
export const DUEL_TRACK = SERPENTS_THROAT
