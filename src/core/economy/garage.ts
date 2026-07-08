// Pure garage transactions — repairs, upgrades, car purchases with trade-in.
// Every function returns a NEW CareerState, or null when the deal is invalid
// (can't afford, capped, nothing to repair). UI just renders what's possible.

import {
  REPAIR_COST_PER_STEP,
  REPAIR_STEP_PERCENT,
  TRADE_IN_RATE,
  UPGRADES,
  type UpgradeKind,
} from '../../data/economy'
import { MINES } from '../../data/weapons'
import { carById } from '../../data/cars'
import type { CareerState } from '../progression/career'

/** Buy a pack of mines for the next race. One pack per race. */
export function buyMines(c: CareerState): CareerState | null {
  if (c.mines > 0 || c.cash < MINES.price) return null
  return { ...c, cash: c.cash - MINES.price, mines: MINES.count }
}

/** Cost to repair the next chunk (up to REPAIR_STEP_PERCENT) of damage. */
export function repairStepCost(damage: number): number {
  const chunk = Math.min(REPAIR_STEP_PERCENT, damage)
  return Math.ceil((chunk / REPAIR_STEP_PERCENT) * REPAIR_COST_PER_STEP)
}

export function repairStep(c: CareerState): CareerState | null {
  if (c.damage <= 0) return null
  const cost = repairStepCost(c.damage)
  if (c.cash < cost) return null
  return { ...c, cash: c.cash - cost, damage: Math.max(0, c.damage - REPAIR_STEP_PERCENT) }
}

/** Cost of the next tier for this kind, or null if the chassis is capped. */
export function upgradeCost(c: CareerState, kind: UpgradeKind): number | null {
  const tier = c.upgrades[kind]
  const cap = carById(c.carId).upgradeCaps[kind]
  if (tier >= cap) return null
  return UPGRADES[kind].costs[tier]
}

export function buyUpgrade(c: CareerState, kind: UpgradeKind): CareerState | null {
  const cost = upgradeCost(c, kind)
  if (cost === null || c.cash < cost) return null
  return {
    ...c,
    cash: c.cash - cost,
    upgrades: { ...c.upgrades, [kind]: c.upgrades[kind] + 1 },
  }
}

/** Money spent on upgrades currently bolted to the car. */
export function upgradesValue(c: CareerState): number {
  return (Object.keys(UPGRADES) as UpgradeKind[]).reduce((sum, kind) => {
    const costs = UPGRADES[kind].costs
    let spent = 0
    for (let t = 0; t < c.upgrades[kind]; t++) spent += costs[t]
    return sum + spent
  }, 0)
}

/** Trade-in credit for the current car including its upgrades. */
export function tradeInValue(c: CareerState): number {
  return Math.round((carById(c.carId).price + upgradesValue(c)) * TRADE_IN_RATE)
}

/** Net price of a new chassis after trade-in. */
export function carNetPrice(c: CareerState, targetId: string): number {
  return carById(targetId).price - tradeInValue(c)
}

/** Buy a new chassis: trade-in applied, upgrades gone, fresh bodywork. */
export function buyCar(c: CareerState, targetId: string): CareerState | null {
  if (targetId === c.carId) return null
  const net = carNetPrice(c, targetId)
  if (c.cash < net) return null
  return {
    ...c,
    cash: c.cash - net,
    carId: targetId,
    upgrades: { engine: 0, tires: 0, armor: 0 },
    damage: 0,
  }
}
