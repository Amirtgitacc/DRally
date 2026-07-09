import { describe, expect, it } from 'vitest'
import { DEFAULT_TURBO_TUNING, shouldTurbo, type TurboContext } from '../../../src/core/ai/turbo'

const cruising: TurboContext = {
  curvatureAhead: 0.05,
  turbo: 1,
  forwardSpeed: 400,
  topSpeed: 700,
  deficit: 0,
  underAttack: false,
}

describe('shouldTurbo', () => {
  it('boosts down a straight with a full tank', () => {
    expect(shouldTurbo(cruising)).toBe(true)
  })

  it('never boosts into a corner, however desperate', () => {
    const hairpin = { ...cruising, curvatureAhead: 0.9, deficit: 10, underAttack: true }
    expect(shouldTurbo(hairpin)).toBe(false)
  })

  it('does not waste boost at top speed', () => {
    expect(shouldTurbo({ ...cruising, forwardSpeed: 699 })).toBe(false)
  })

  it('holds a reserve when the race is under control', () => {
    expect(shouldTurbo({ ...cruising, turbo: 0.2 })).toBe(false)
  })

  it('spends the reserve to chase a car that is getting away', () => {
    expect(shouldTurbo({ ...cruising, turbo: 0.2, deficit: DEFAULT_TURBO_TUNING.chaseDeficit })).toBe(true)
  })

  it('spends the reserve to defend a car on its bumper', () => {
    expect(shouldTurbo({ ...cruising, turbo: 0.2, underAttack: true })).toBe(true)
  })

  it('runs on empty for nobody', () => {
    expect(shouldTurbo({ ...cruising, turbo: 0.1, underAttack: true, deficit: 9 })).toBe(false)
  })

  it('a leading car with a full tank still uses it on the straights', () => {
    expect(shouldTurbo({ ...cruising, deficit: -5 })).toBe(true)
  })
})
