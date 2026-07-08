// Pure upgrade math — turns a base chassis + owned upgrade tiers into the
// physics spec the race actually uses.

import { UPGRADES } from '../../data/economy'
import type { CarSpec } from '../../data/cars'

export interface UpgradeLevels {
  engine: number
  tires: number
  armor: number
}

export const NO_UPGRADES: UpgradeLevels = { engine: 0, tires: 0, armor: 0 }

export function effectiveCarSpec(base: CarSpec, u: UpgradeLevels): CarSpec {
  return {
    ...base,
    topSpeed: base.topSpeed * UPGRADES.engine.topSpeedScale ** u.engine,
    accel: base.accel * UPGRADES.engine.accelScale ** u.engine,
    grip: base.grip * UPGRADES.tires.gripScale ** u.tires,
    turnRate: base.turnRate * UPGRADES.tires.turnRateScale ** u.tires,
  }
}

/** Incoming damage multiplier from armor tiers (1 = no armor, lower = tougher). */
export function armorResistance(armorTier: number): number {
  return UPGRADES.armor.resistancePerTier ** armorTier
}
