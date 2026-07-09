// Black-market tuning — dirty tricks, all one race only (mines live in
// weapons.ts). Prices calibrated against RACE_REWARDS so each item is a
// real spending decision at its tier.

/** Welded plate + spikes: hit harder, hurt less, for one race. */
export const RAM_PLATING = {
  price: 650,
  /** scale on ram damage you DEAL */
  dealScale: 2.2,
  /** scale on ram damage you TAKE */
  takeScale: 0.5,
}

/** Volatile fuel mix: monstrous boost that cooks your own engine. */
export const OVERCHARGED_TURBO = {
  price: 900,
  topSpeedScale: 1.45,
  accelScale: 2.7,
  /** self-damage per second while boosting — it CAN wreck you */
  selfDamagePerSec: 3.5,
  /** the meter also empties faster than a stock turbo */
  drainScale: 1.5,
}

/** Someone loosens a few bolts overnight on the best car in your next grid. */
export const SABOTAGE = {
  price: 1400,
  /** damage % the strongest rival starts the race with */
  rivalStartDamage: 40,
}

/** The loanshark: cash now, more cash later, or a visit from the crew. */
export const LOAN = {
  amount: 3000,
  /** total owed (principal + interest) */
  owed: 4500,
  /** races until the crew comes collecting */
  dueRaces: 3,
  /** damage added when you can't pay and they collect in kind */
  enforcerDamage: 40,
}
