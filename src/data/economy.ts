// Data-driven economy tables. All values are tuning knobs, not code.
// Original values calibrated against research (docs/RESEARCH_NOTES.md) but ours.

export type RaceTier = 'street' | 'pro' | 'death'

export interface PlacementReward {
  cash: number
  points: number
}

/** Rewards by tier for placements 1st..3rd. 4th place or wrecked = nothing. */
export const RACE_REWARDS: Record<RaceTier, PlacementReward[]> = {
  street: [
    { cash: 750, points: 3 },
    { cash: 375, points: 2 },
    { cash: 190, points: 1 },
  ],
  pro: [
    { cash: 3000, points: 5 },
    { cash: 1500, points: 3 },
    { cash: 375, points: 1 },
  ],
  death: [
    { cash: 12000, points: 8 },
    { cash: 6000, points: 7 },
    { cash: 1500, points: 4 },
  ],
}

export const STARTING_CASH = 500

/** Cost to repair 10% damage. */
export const REPAIR_COST_PER_STEP = 25
export const REPAIR_STEP_PERCENT = 10

export type UpgradeKind = 'engine' | 'tires' | 'armor'

/** Tiered upgrades: costs[n] buys tier n+1. Effects compound per tier. */
export const UPGRADES = {
  engine: { costs: [1000, 1600, 2400], topSpeedScale: 1.05, accelScale: 1.08 },
  tires: { costs: [500, 900, 1400], gripScale: 1.12, turnRateScale: 1.05 },
  armor: { costs: [400, 700, 1100], resistancePerTier: 0.85 },
} as const

/** Fraction of car price + upgrades spent refunded when buying a new car. */
export const TRADE_IN_RATE = 0.25
