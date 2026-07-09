// Pure black-market transactions — same contract as garage.ts: every
// function returns a NEW CareerState, or null when the deal is invalid
// (can't afford, already stocked). The UI just renders what's possible.

import { LOAN, OVERCHARGED_TURBO, RAM_PLATING, SABOTAGE } from '../../data/blackMarket'
import type { CareerState } from '../progression/career'

export function buyRamPlating(c: CareerState): CareerState | null {
  if (c.ramPlating || c.cash < RAM_PLATING.price) return null
  return { ...c, cash: c.cash - RAM_PLATING.price, ramPlating: true }
}

export function buyOverchargedTurbo(c: CareerState): CareerState | null {
  if (c.overTurbo || c.cash < OVERCHARGED_TURBO.price) return null
  return { ...c, cash: c.cash - OVERCHARGED_TURBO.price, overTurbo: true }
}

export function buySabotage(c: CareerState): CareerState | null {
  if (c.sabotage || c.cash < SABOTAGE.price) return null
  return { ...c, cash: c.cash - SABOTAGE.price, sabotage: true }
}

/** One loan at a time. No collateral asked — that's what the crew is for. */
export function takeLoan(c: CareerState): CareerState | null {
  if (c.loan) return null
  return { ...c, cash: c.cash + LOAN.amount, loan: { owed: LOAN.owed, racesLeft: LOAN.dueRaces } }
}

/** Settle early, in full. */
export function repayLoan(c: CareerState): CareerState | null {
  if (!c.loan || c.cash < c.loan.owed) return null
  return { ...c, cash: c.cash - c.loan.owed, loan: null }
}

export type LoanEvent =
  /** no loan running */
  | 'none'
  /** clock ticked down, not due yet */
  | 'countdown'
  /** due and paid in full out of your winnings */
  | 'collected'
  /** due and you were short — they took the cash and left a message */
  | 'enforced'

/**
 * Tick the loan clock after a race (call AFTER the race outcome is applied so
 * winnings can cover a due payment). On a missed payment the crew takes all
 * cash, dents the car, and writes the debt off — you can borrow again, but
 * you paid for it.
 */
export function settleLoanAfterRace(c: CareerState): { career: CareerState; event: LoanEvent } {
  if (!c.loan) return { career: c, event: 'none' }
  const racesLeft = c.loan.racesLeft - 1
  if (racesLeft > 0) {
    return { career: { ...c, loan: { ...c.loan, racesLeft } }, event: 'countdown' }
  }
  if (c.cash >= c.loan.owed) {
    return { career: { ...c, cash: c.cash - c.loan.owed, loan: null }, event: 'collected' }
  }
  return {
    career: {
      ...c,
      cash: 0,
      damage: Math.min(99, c.damage + LOAN.enforcerDamage),
      loan: null,
    },
    event: 'enforced',
  }
}
