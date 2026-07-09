import { describe, expect, it } from 'vitest'
import {
  buyOverchargedTurbo,
  buyRamPlating,
  buySabotage,
  repayLoan,
  settleLoanAfterRace,
  takeLoan,
} from '../../../src/core/economy/blackMarket'
import { LOAN, OVERCHARGED_TURBO, RAM_PLATING, SABOTAGE } from '../../../src/data/blackMarket'
import { applyRaceOutcome, createCareer } from '../../../src/core/progression/career'

const rich = () => ({ ...createCareer(), cash: 50000 })

describe('black market purchases', () => {
  it('buys ram plating once and charges for it', () => {
    const c = buyRamPlating(rich())!
    expect(c.ramPlating).toBe(true)
    expect(c.cash).toBe(50000 - RAM_PLATING.price)
    expect(buyRamPlating(c)).toBeNull() // already stocked
  })

  it('buys overcharged turbo and sabotage once each', () => {
    const c1 = buyOverchargedTurbo(rich())!
    expect(c1.overTurbo).toBe(true)
    expect(c1.cash).toBe(50000 - OVERCHARGED_TURBO.price)
    expect(buyOverchargedTurbo(c1)).toBeNull()

    const c2 = buySabotage(rich())!
    expect(c2.sabotage).toBe(true)
    expect(c2.cash).toBe(50000 - SABOTAGE.price)
    expect(buySabotage(c2)).toBeNull()
  })

  it('refuses sales the player cannot afford', () => {
    const broke = { ...createCareer(), cash: 10 }
    expect(buyRamPlating(broke)).toBeNull()
    expect(buyOverchargedTurbo(broke)).toBeNull()
    expect(buySabotage(broke)).toBeNull()
  })

  it('clears one-race gear after a race, used or not', () => {
    let c = buySabotage(buyOverchargedTurbo(buyRamPlating(rich())!)!)!
    c = applyRaceOutcome(c, { prizeCash: 0, pointsEarned: 0, pickupCash: 0, endDamage: 0, won: false })
    expect(c.ramPlating).toBe(false)
    expect(c.overTurbo).toBe(false)
    expect(c.sabotage).toBe(false)
  })
})

describe('loanshark', () => {
  it('hands over cash and starts the clock; one loan at a time', () => {
    const c = takeLoan(createCareer())!
    expect(c.cash).toBe(500 + LOAN.amount)
    expect(c.loan).toEqual({ owed: LOAN.owed, racesLeft: LOAN.dueRaces })
    expect(takeLoan(c)).toBeNull()
  })

  it('allows early repayment in full', () => {
    const c = { ...takeLoan(createCareer())!, cash: LOAN.owed + 100 }
    const paid = repayLoan(c)!
    expect(paid.loan).toBeNull()
    expect(paid.cash).toBe(100)
    expect(repayLoan(paid)).toBeNull() // nothing to repay
  })

  it('refuses early repayment the player cannot cover', () => {
    const c = { ...takeLoan(createCareer())!, cash: LOAN.owed - 1 }
    expect(repayLoan(c)).toBeNull()
  })

  it('ticks the clock down after each race until due', () => {
    let c = takeLoan(createCareer())!
    for (let i = LOAN.dueRaces; i > 1; i--) {
      const { career, event } = settleLoanAfterRace(c)
      expect(event).toBe('countdown')
      expect(career.loan!.racesLeft).toBe(i - 1)
      c = career
    }
  })

  it('collects in full from winnings when due and affordable', () => {
    const due = { ...takeLoan(createCareer())!, cash: LOAN.owed + 250 }
    due.loan = { owed: LOAN.owed, racesLeft: 1 }
    const { career, event } = settleLoanAfterRace(due)
    expect(event).toBe('collected')
    expect(career.cash).toBe(250)
    expect(career.loan).toBeNull()
  })

  it('sends the enforcers when due and short: all cash, extra damage, debt written off', () => {
    const due = { ...takeLoan(createCareer())!, cash: 200, damage: 30 }
    due.loan = { owed: LOAN.owed, racesLeft: 1 }
    const { career, event } = settleLoanAfterRace(due)
    expect(event).toBe('enforced')
    expect(career.cash).toBe(0)
    expect(career.damage).toBe(30 + LOAN.enforcerDamage)
    expect(career.loan).toBeNull()
  })

  it('caps enforcer damage below a wreck', () => {
    const due = { ...takeLoan(createCareer())!, cash: 0, damage: 90 }
    due.loan = { owed: LOAN.owed, racesLeft: 1 }
    expect(settleLoanAfterRace(due).career.damage).toBe(99)
  })

  it('does nothing without a loan', () => {
    const { career, event } = settleLoanAfterRace(createCareer())
    expect(event).toBe('none')
    expect(career).toEqual(createCareer())
  })
})
