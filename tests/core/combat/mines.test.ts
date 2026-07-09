import { describe, expect, it } from 'vitest'
import { mineIsArmed, mineIsLive } from '../../../src/core/combat/mines'
import { MINES } from '../../../src/data/weapons'

const mine = { droppedAt: 1000, ownerId: 'sable' }
const tune = MINES

describe('mineIsLive', () => {
  it('cannot be set off by anyone the instant it lands', () => {
    expect(mineIsLive(mine, 'player', 1000, tune)).toBe(false)
    expect(mineIsLive(mine, 'sable', 1000, tune)).toBe(false)
  })

  it('catches a tailgater — the whole point of dropping it', () => {
    // the mine lands 55px off the dropper's tail, so a pursuer glued to the
    // bumper is ~35px away and reaches it in 35/600s ≈ 58ms at racing speed
    const timeToReachMineMs = (35 / 600) * 1000
    expect(tune.fuseMs).toBeLessThan(timeToReachMineMs)
    expect(mineIsLive(mine, 'player', 1000 + timeToReachMineMs, tune)).toBe(true)
  })

  it('never blows up the car that dropped it', () => {
    expect(mineIsLive(mine, 'sable', 1000 + 150, tune)).toBe(false)
    expect(mineIsLive(mine, 'sable', 1000 + tune.ownerSafeMs - 1, tune)).toBe(false)
  })

  it('lets the owner back onto their own mine once they have cleared the area', () => {
    expect(mineIsLive(mine, 'sable', 1000 + tune.ownerSafeMs, tune)).toBe(true)
  })

  it('gives the owner a longer grace than everybody else', () => {
    expect(tune.ownerSafeMs).toBeGreaterThan(tune.fuseMs)
  })
})

describe('mineIsArmed', () => {
  it('looks inert until the fuse burns down, then dangerous to everyone', () => {
    expect(mineIsArmed(mine, 1000 + tune.fuseMs - 1, tune)).toBe(false)
    expect(mineIsArmed(mine, 1000 + tune.fuseMs, tune)).toBe(true)
  })

  it('does not lie: anything that looks armed can kill somebody', () => {
    const now = 1000 + tune.fuseMs
    expect(mineIsArmed(mine, now, tune)).toBe(true)
    expect(mineIsLive(mine, 'player', now, tune)).toBe(true)
  })
})
