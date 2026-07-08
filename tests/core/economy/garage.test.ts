import { describe, expect, it } from 'vitest'
import {
  buyCar,
  buyMines,
  buyUpgrade,
  carNetPrice,
  repairStep,
  repairStepCost,
  tradeInValue,
  upgradeCost,
  upgradesValue,
} from '../../../src/core/economy/garage'
import { createCareer, type CareerState } from '../../../src/core/progression/career'

const rich = (over: Partial<CareerState> = {}): CareerState => ({
  ...createCareer(),
  cash: 50000,
  ...over,
})

describe('repair', () => {
  it('charges per 10% step and reduces damage', () => {
    const c = repairStep(rich({ damage: 43 }))!
    expect(c.damage).toBe(33)
    expect(c.cash).toBe(50000 - 25)
  })

  it('charges proportionally for the final partial step', () => {
    expect(repairStepCost(4)).toBe(10)
    const c = repairStep(rich({ damage: 4 }))!
    expect(c.damage).toBe(0)
  })

  it('refuses when undamaged or broke', () => {
    expect(repairStep(rich({ damage: 0 }))).toBeNull()
    expect(repairStep({ ...createCareer(), cash: 5, damage: 50 })).toBeNull()
  })
})

describe('upgrades', () => {
  it('prices the next tier and respects chassis caps', () => {
    const c = rich() // jackal: engine cap 1
    expect(upgradeCost(c, 'engine')).toBe(1000)
    const upgraded = buyUpgrade(c, 'engine')!
    expect(upgraded.upgrades.engine).toBe(1)
    expect(upgraded.cash).toBe(49000)
    expect(upgradeCost(upgraded, 'engine')).toBeNull() // capped
    expect(buyUpgrade(upgraded, 'engine')).toBeNull()
  })

  it('refuses when broke', () => {
    expect(buyUpgrade({ ...createCareer(), cash: 100 }, 'engine')).toBeNull()
  })
})

describe('buying mines', () => {
  it('sells one pack per race', () => {
    const c = buyMines(rich())!
    expect(c.mines).toBe(6)
    expect(c.cash).toBe(50000 - 450)
    expect(buyMines(c)).toBeNull() // already stocked
  })

  it('refuses when broke', () => {
    expect(buyMines({ ...createCareer(), cash: 100 })).toBeNull()
  })
})

describe('buying cars', () => {
  it('applies 25% trade-in of car plus upgrades', () => {
    let c = rich()
    c = buyUpgrade(c, 'tires')! // $500 on a $500 jackal
    expect(upgradesValue(c)).toBe(500)
    expect(tradeInValue(c)).toBe(250)
    expect(carNetPrice(c, 'marauder')).toBe(2600 - 250)

    const cashBefore = c.cash
    const bought = buyCar(c, 'marauder')!
    expect(bought.carId).toBe('marauder')
    expect(bought.cash).toBe(cashBefore - 2350)
    expect(bought.upgrades).toEqual({ engine: 0, tires: 0, armor: 0 })
    expect(bought.damage).toBe(0)
  })

  it('refuses same car or insufficient funds', () => {
    expect(buyCar(rich(), 'jackal')).toBeNull()
    expect(buyCar({ ...createCareer(), cash: 100 }, 'basilisk')).toBeNull()
  })
})
