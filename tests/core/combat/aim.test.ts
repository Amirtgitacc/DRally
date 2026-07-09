import { describe, expect, it } from 'vitest'
import { interceptTime, leadTarget } from '../../../src/core/combat/aim'

const BULLET = 950

describe('interceptTime', () => {
  it('a stationary target is hit after distance / bulletSpeed', () => {
    const t = interceptTime({ x: 0, y: 0 }, { x: 950, y: 0, vx: 0, vy: 0 }, BULLET)
    expect(t).toBeCloseTo(1)
  })

  it('never catches a target outrunning the bullet', () => {
    const t = interceptTime({ x: 0, y: 0 }, { x: 100, y: 0, vx: BULLET + 200, vy: 0 }, BULLET)
    expect(t).toBeNull()
  })

  it('takes longer to catch a target running away than one closing in', () => {
    const away = interceptTime({ x: 0, y: 0 }, { x: 500, y: 0, vx: 400, vy: 0 }, BULLET)!
    const toward = interceptTime({ x: 0, y: 0 }, { x: 500, y: 0, vx: -400, vy: 0 }, BULLET)!
    expect(away).toBeGreaterThan(toward)
  })

  it('returns the earliest interception, never a negative time', () => {
    const t = interceptTime({ x: 0, y: 0 }, { x: -300, y: 0, vx: 500, vy: 0 }, BULLET)!
    expect(t).toBeGreaterThan(0)
  })
})

describe('leadTarget', () => {
  it('aims ahead of a crossing target', () => {
    const aim = leadTarget({ x: 0, y: 0 }, { x: 950, y: 0, vx: 0, vy: 300 }, BULLET)
    expect(aim.x).toBeCloseTo(950)
    expect(aim.y).toBeGreaterThan(0)
  })

  it('the bullet and the target arrive together', () => {
    const from = { x: 0, y: 0 }
    const target = { x: 600, y: 200, vx: -250, vy: 380 }
    const aim = leadTarget(from, target, BULLET)
    const flight = Math.hypot(aim.x - from.x, aim.y - from.y) / BULLET
    expect(aim.x).toBeCloseTo(target.x + target.vx * flight, 3)
    expect(aim.y).toBeCloseTo(target.y + target.vy * flight, 3)
  })

  it('aims straight at a target it cannot catch, rather than nowhere', () => {
    const target = { x: 100, y: 0, vx: BULLET + 500, vy: 0 }
    expect(leadTarget({ x: 0, y: 0 }, target, BULLET)).toEqual({ x: 100, y: 0 })
  })

  it('leaves a stationary target where it stands', () => {
    expect(leadTarget({ x: 0, y: 0 }, { x: 400, y: 300, vx: 0, vy: 0 }, BULLET)).toEqual({ x: 400, y: 300 })
  })
})
