import { describe, expect, it } from 'vitest'
import {
  fittedDeltas,
  itemDeltas,
  itemLabel,
  multiplierOf,
  percentOf,
  upgradeDeltas,
  upgradeLabel,
} from '../../../src/core/economy/upgradeEffects'
import { UPGRADES, type UpgradeKind } from '../../../src/data/economy'
import { RAM_PLATING } from '../../../src/data/blackMarket'
import { effectiveCarSpec } from '../../../src/core/vehicle/carSpec'
import { STARTER_CAR } from '../../../src/data/cars'

const KINDS: UpgradeKind[] = ['engine', 'tires', 'armor']

describe('percentOf / multiplierOf', () => {
  it('signs percentages', () => {
    expect(percentOf(1.12)).toBe('+12%')
    expect(percentOf(0.85)).toBe('-15%')
    expect(percentOf(1)).toBe('+0%')
  })

  it('renders multipliers without trailing zeros', () => {
    expect(multiplierOf(2.2)).toBe('×2.2')
    expect(multiplierOf(0.5)).toBe('×0.5')
    expect(multiplierOf(2)).toBe('×2')
  })
})

describe('upgradeDeltas', () => {
  it('reads the real tuning table, not hand-written strings', () => {
    expect(upgradeDeltas('tires')).toEqual([
      { stat: 'GRIP', text: percentOf(UPGRADES.tires.gripScale) },
      { stat: 'TURN', text: percentOf(UPGRADES.tires.turnRateScale) },
    ])
    expect(upgradeDeltas('engine')[0].text).toBe(percentOf(UPGRADES.engine.topSpeedScale))
    expect(upgradeDeltas('armor')).toEqual([
      { stat: 'DAMAGE TAKEN', text: percentOf(UPGRADES.armor.resistancePerTier) },
    ])
  })

  it('describes every upgrade kind with at least one stat', () => {
    for (const kind of KINDS) expect(upgradeDeltas(kind).length).toBeGreaterThan(0)
  })

  it('armor is the only upgrade that reads as a reduction', () => {
    for (const kind of KINDS) {
      const negatives = upgradeDeltas(kind).filter((d) => d.text.startsWith('-'))
      expect(negatives.length).toBe(kind === 'armor' ? 1 : 0)
    }
  })
})

describe('upgradeLabel', () => {
  it('names the tier step and its effect', () => {
    expect(upgradeLabel('tires', 2)).toBe('TIRES Lv2→Lv3 · GRIP +12% · TURN +5%')
    expect(upgradeLabel('engine', 0)).toBe('ENGINE Lv0→Lv1 · TOP SPEED +5% · ACCEL +8%')
  })
})

describe('fittedDeltas', () => {
  it('says nothing when nothing is fitted', () => {
    for (const kind of KINDS) expect(fittedDeltas(kind, 0)).toEqual([])
  })

  it('compounds across tiers', () => {
    expect(fittedDeltas('tires', 2)).toEqual([
      { stat: 'GRIP', text: percentOf(UPGRADES.tires.gripScale ** 2) },
      { stat: 'TURN', text: percentOf(UPGRADES.tires.turnRateScale ** 2) },
    ])
  })

  it('matches what the physics actually does to the car', () => {
    const tier = 3
    const upgraded = effectiveCarSpec(STARTER_CAR, { engine: tier, tires: 0, armor: 0 })
    const claimed = fittedDeltas('engine', tier).find((d) => d.stat === 'TOP SPEED')!.text
    const realGain = upgraded.topSpeed / STARTER_CAR.topSpeed
    expect(claimed).toBe(percentOf(realGain))
  })
})

describe('itemDeltas', () => {
  it('states the ram plating trade exactly as the data does', () => {
    expect(itemLabel('ramPlating')).toBe(
      `RAM DAMAGE DEALT ${multiplierOf(RAM_PLATING.dealScale)} · TAKEN ${multiplierOf(RAM_PLATING.takeScale)}`,
    )
  })

  it('warns that the overcharged turbo hurts you', () => {
    const selfDamage = itemDeltas('overTurbo').find((d) => d.stat === 'SELF DAMAGE')
    expect(selfDamage).toBeDefined()
  })

  it('describes every shop item', () => {
    for (const item of ['mines', 'ramPlating', 'overTurbo', 'sabotage', 'loan'] as const) {
      expect(itemDeltas(item).length).toBeGreaterThan(0)
      expect(itemLabel(item)).not.toBe('')
    }
  })
})
