import type { RaceTier } from '../economy'
import type { TrackDef } from './types'
import { BLACKTIDE_EXCHANGE } from './blacktideExchange'
import { GLASSBURN_WORKS } from './glassburnWorks'
import { IRONVEIL_ASCENT } from './ironveilAscent'

export type { TrackDef, TrackDecoration, TrackEnvironment, TrackEnvironmentKind } from './types'
export { BLACKTIDE_EXCHANGE, GLASSBURN_WORKS, IRONVEIL_ASCENT }

/** Venues per prize tier — each round's sign-up rolls one per tier. */
export const TRACKS_BY_TIER: Record<RaceTier, TrackDef[]> = {
  street: [BLACKTIDE_EXCHANGE],
  pro: [GLASSBURN_WORKS],
  death: [IRONVEIL_ASCENT],
}

/** Every venue, in tier order — the venues gallery and debug tooling walk this. */
export const ALL_TRACKS: TrackDef[] = [BLACKTIDE_EXCHANGE, GLASSBURN_WORKS, IRONVEIL_ASCENT]

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
export const DUEL_TRACK = IRONVEIL_ASCENT
