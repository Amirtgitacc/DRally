// Pure championship-ladder logic — the persistent 20-driver ranking the
// player climbs from #20. AI drivers not in the player's race earn points
// in simulated background races each round.

import { RACE_REWARDS, type RaceTier } from '../../data/economy'
import { ROSTER } from '../../data/roster'
import { CAR_CATALOG } from '../../data/cars'
import { DRIVER_TALENT } from '../../data/drivers'
import type { TalentGrade } from '../ai/talent'
import type { UpgradeLevels } from '../vehicle/carSpec'

/** driver id → championship points (the player's points live on CareerState) */
export type Ladder = Record<string, number>

export const PLAYER_ID = '__player'

/** Seeded standings: the scene is established before the player arrives. */
export function initialLadder(): Ladder {
  const ladder: Ladder = {}
  ROSTER.forEach((d, i) => {
    ladder[d.id] = (ROSTER.length - i) * 6
  })
  return ladder
}

export interface StandingRow {
  id: string
  name: string
  points: number
  isPlayer: boolean
}

/** Full 20-row table sorted by points; ties rank the player below rivals. */
export function standings(ladder: Ladder, playerPoints: number): StandingRow[] {
  const rows: StandingRow[] = ROSTER.map((d) => ({
    id: d.id,
    name: d.name,
    points: ladder[d.id] ?? 0,
    isPlayer: false,
  }))
  rows.push({ id: PLAYER_ID, name: 'YOU', points: playerPoints, isPlayer: true })
  return rows.sort((a, b) => b.points - a.points || Number(a.isPlayer) - Number(b.isPlayer))
}

/** 1-based championship rank. */
export function rankOf(ladder: Ladder, playerPoints: number, id: string): number {
  return standings(ladder, playerPoints).findIndex((r) => r.id === id) + 1
}

export function playerRank(ladder: Ladder, playerPoints: number): number {
  return rankOf(ladder, playerPoints, PLAYER_ID)
}

/**
 * AI pace from ladder rank: #1 ≈ 1.00, #20 ≈ 0.94.
 *
 * Deliberately narrow. Difficulty is supposed to come from machinery, not from
 * a multiplier bolted onto the physics (D-017) — and now that rivals fit their
 * own upgrades (rivalUpgrades), the machinery gap is real. Left at the old
 * ±9% on top of a built car, a rank-1 ace with the rubber band behind them
 * would run down a leading player at 955 px/s in a 758 px/s car, which reads as
 * exactly the cheat this game was designed not to have.
 */
export function rivalStrength(rank: number): number {
  return 0.94 + (20 - Math.min(20, Math.max(1, rank))) * 0.0033
}

/**
 * The chassis a rival drives comes from their ladder rank — the top of the
 * ladder drives the top of the catalog. This is what keeps late-career races
 * hard: your upgrades chase their machinery.
 */
export function rivalChassisId(rank: number): string {
  const r = Math.min(20, Math.max(1, rank))
  const idx = Math.min(CAR_CATALOG.length - 1, Math.floor(((20 - r) * CAR_CATALOG.length) / 20))
  return CAR_CATALOG[idx].id
}

/**
 * And so do their upgrades. Rivals used to drive stock cars while the player
 * fitted engines, tires and armor: a mid-tier chassis with tier-3 tires has 40%
 * more grip than a stock top-tier one, so the player could corner faster than
 * an ace no matter how the pace numbers were tuned. Rank #1 runs a fully built
 * car; rank #20 runs it as it left the showroom.
 */
export function rivalUpgrades(rank: number): UpgradeLevels {
  const r = Math.min(20, Math.max(1, rank))
  const tier = Math.max(0, Math.min(3, Math.round(((20 - r) / 19) * 3)))
  return { engine: tier, tires: tier, armor: tier }
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Which talent grades turn up at each prize tier. This — not the purse — is
 * what makes a death race dangerous: the tier used to pick rivals from a window
 * around the player's rank and ignore the tier entirely, so all three races on
 * the sign-up sheet fielded the same drivers for wildly different money.
 */
export const TIER_TALENT_BANDS: Record<RaceTier, TalentGrade[]> = {
  street: [1, 2], // rookies and journeymen
  pro: [2, 3], // journeymen and veterans
  death: [3, 4], // veterans and aces
}

/** The drivers eligible to be entered in a race at this tier. */
export function tierPool(tier: RaceTier): string[] {
  const band = TIER_TALENT_BANDS[tier]
  return ROSTER.filter((d) => band.includes(DRIVER_TALENT[d.id])).map((d) => d.id)
}

/** 3 rivals drawn from the tier's talent band — the field you signed up to face. */
export function pickRivals(tier: RaceTier, rand: () => number): string[] {
  return shuffled(tierPool(tier), rand).slice(0, 3)
}

/** Points for the player's race rivals by finishing order (wrecked earns nothing). */
export function applyRaceLadderResults(
  ladder: Ladder,
  tier: RaceTier,
  rivalPlacements: Array<{ id: string; placement: number; wrecked: boolean }>,
): Ladder {
  const next = { ...ladder }
  for (const r of rivalPlacements) {
    if (r.wrecked || r.placement < 1 || r.placement > 3) continue
    next[r.id] = (next[r.id] ?? 0) + RACE_REWARDS[tier][r.placement - 1].points
  }
  return next
}

/**
 * The two race tiers the player skipped still run: fill each with 3 drivers
 * who weren't in the player's race and award podium points.
 */
export function simulateRound(
  ladder: Ladder,
  playedTier: RaceTier,
  excludeIds: string[],
  rand: () => number,
): Ladder {
  const next = { ...ladder }
  const tiers = (Object.keys(RACE_REWARDS) as RaceTier[]).filter((t) => t !== playedTier)
  const pool = shuffled(
    ROSTER.map((d) => d.id).filter((id) => !excludeIds.includes(id)),
    rand,
  )
  let cursor = 0
  for (const tier of tiers) {
    for (let place = 1; place <= 3 && cursor < pool.length; place++, cursor++) {
      next[pool[cursor]] = (next[pool[cursor]] ?? 0) + RACE_REWARDS[tier][place - 1].points
    }
  }
  return next
}
