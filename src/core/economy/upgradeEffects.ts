// Pure "what does this actually do" strings for the shop screens.
//
// Every number here is READ from the data tables (economy.ts, blackMarket.ts,
// weapons.ts). Nothing is hand-written, so a tuning change in data can never
// leave a lying price tag on screen.

import { UPGRADES, type UpgradeKind } from '../../data/economy'
import { LOAN, OVERCHARGED_TURBO, RAM_PLATING, SABOTAGE } from '../../data/blackMarket'
import { MINES } from '../../data/weapons'

export interface StatDelta {
  /** e.g. 'GRIP' */
  stat: string
  /** e.g. '+12%' or '×2.2' */
  text: string
}

/** A scale factor as a signed percentage: 1.12 → '+12%', 0.85 → '-15%'. */
export function percentOf(scale: number): string {
  const pct = Math.round((scale - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

/** A scale factor as a raw multiplier: 2.2 → '×2.2'. Used where ×2 ≠ '+120%' reads better. */
export function multiplierOf(scale: number): string {
  return `×${Number(scale.toFixed(2))}`
}

/** What one more tier of this upgrade buys, as percentages off the data table. */
export function upgradeDeltas(kind: UpgradeKind): StatDelta[] {
  switch (kind) {
    case 'engine':
      return [
        { stat: 'TOP SPEED', text: percentOf(UPGRADES.engine.topSpeedScale) },
        { stat: 'ACCEL', text: percentOf(UPGRADES.engine.accelScale) },
      ]
    case 'tires':
      return [
        { stat: 'GRIP', text: percentOf(UPGRADES.tires.gripScale) },
        { stat: 'TURN', text: percentOf(UPGRADES.tires.turnRateScale) },
      ]
    case 'armor':
      return [{ stat: 'DAMAGE TAKEN', text: percentOf(UPGRADES.armor.resistancePerTier) }]
  }
}

/** e.g. 'TIRES Lv2→Lv3 · GRIP +12% · TURN +5%'. */
export function upgradeLabel(kind: UpgradeKind, currentTier: number): string {
  const deltas = upgradeDeltas(kind)
    .map((d) => `${d.stat} ${d.text}`)
    .join(' · ')
  return `${kind.toUpperCase()} Lv${currentTier}→Lv${currentTier + 1} · ${deltas}`
}

/**
 * Cumulative effect of the tiers already fitted, versus a bare chassis.
 * Shown next to the stat bars so the player can see what they've bought.
 */
export function fittedDeltas(kind: UpgradeKind, tier: number): StatDelta[] {
  if (tier <= 0) return []
  switch (kind) {
    case 'engine':
      return [
        { stat: 'TOP SPEED', text: percentOf(UPGRADES.engine.topSpeedScale ** tier) },
        { stat: 'ACCEL', text: percentOf(UPGRADES.engine.accelScale ** tier) },
      ]
    case 'tires':
      return [
        { stat: 'GRIP', text: percentOf(UPGRADES.tires.gripScale ** tier) },
        { stat: 'TURN', text: percentOf(UPGRADES.tires.turnRateScale ** tier) },
      ]
    case 'armor':
      return [{ stat: 'DAMAGE TAKEN', text: percentOf(UPGRADES.armor.resistancePerTier ** tier) }]
  }
}

export type ShopItem = 'mines' | 'ramPlating' | 'overTurbo' | 'sabotage' | 'loan'

/** What a one-race shop item does, straight off its data table. */
export function itemDeltas(item: ShopItem): StatDelta[] {
  switch (item) {
    case 'mines':
      return [
        { stat: 'MINES', text: `×${MINES.count}` },
        { stat: 'DAMAGE', text: `${MINES.damage}%` },
        { stat: 'SPLASH', text: `${MINES.splashDamage}% @ ${MINES.blastRadius}px` },
      ]
    case 'ramPlating':
      return [
        { stat: 'RAM DAMAGE DEALT', text: multiplierOf(RAM_PLATING.dealScale) },
        { stat: 'TAKEN', text: multiplierOf(RAM_PLATING.takeScale) },
      ]
    case 'overTurbo':
      return [
        { stat: 'TOP SPEED', text: multiplierOf(OVERCHARGED_TURBO.topSpeedScale) },
        { stat: 'ACCEL', text: multiplierOf(OVERCHARGED_TURBO.accelScale) },
        { stat: 'SELF DAMAGE', text: `${OVERCHARGED_TURBO.selfDamagePerSec}%/s` },
      ]
    case 'sabotage':
      return [{ stat: 'TOP RIVAL STARTS AT', text: `${SABOTAGE.rivalStartDamage}% DMG` }]
    case 'loan':
      return [
        { stat: 'CASH NOW', text: `+$${LOAN.amount}` },
        { stat: 'OWED', text: `$${LOAN.owed} IN ${LOAN.dueRaces} RACES` },
      ]
  }
}

/** e.g. 'RAM DAMAGE DEALT ×2.2 · TAKEN ×0.5'. */
export function itemLabel(item: ShopItem): string {
  return itemDeltas(item)
    .map((d) => `${d.stat} ${d.text}`)
    .join(' · ')
}
