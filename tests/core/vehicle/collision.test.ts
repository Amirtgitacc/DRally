import { describe, expect, it } from 'vitest'
import { collideCars, type CollisionBody } from '../../../src/core/vehicle/collision'

const body = (x: number, vx: number, mass = 1, y = 0, vy = 0): CollisionBody => ({ x, y, vx, vy, mass })

describe('car collision response', () => {
  it('is symmetric for equal masses in a head-on hit', () => {
    const r = collideCars(body(0, 100), body(50, -100))!
    expect(r.impact).toBe(200)
    expect(r.a.dvx).toBeCloseTo(-r.b.dvx)
    expect(r.a.dvx).toBeLessThan(0) // a bounces back
    expect(r.b.dvx).toBeGreaterThan(0)
  })

  it('shoves the lighter car harder', () => {
    const r = collideCars(body(0, 100, 1.3), body(50, -100, 0.92))!
    expect(Math.abs(r.b.dvx)).toBeGreaterThan(Math.abs(r.a.dvx))
    // momentum is conserved: m_a * dv_a + m_b * dv_b = 0
    expect(1.3 * r.a.dvx + 0.92 * r.b.dvx).toBeCloseTo(0)
  })

  it('returns null when the cars are separating', () => {
    expect(collideCars(body(0, -100), body(50, 100))).toBeNull()
  })

  it('kills the closing speed plus restitution bounce', () => {
    const a = body(0, 200)
    const b = body(50, 0)
    const r = collideCars(a, b)!
    const relAfter = a.vx + r.a.dvx - (b.vx + r.b.dvx)
    // post-collision they separate at restitution * closing speed
    expect(relAfter).toBeCloseTo(-0.4 * 200)
  })

  it('spins both cars on a glancing hit, in opposite directions', () => {
    // a slides past b: contact along x, velocity difference along y
    const a: CollisionBody = { x: 0, y: 0, vx: 50, vy: 300, mass: 1 }
    const b: CollisionBody = { x: 55, y: 0, vx: 0, vy: 0, mass: 1 }
    const r = collideCars(a, b)!
    expect(r.a.spin).not.toBe(0)
    expect(Math.sign(r.a.spin)).toBe(-Math.sign(r.b.spin))
    expect(Math.abs(r.a.spin)).toBeLessThanOrEqual(0.22)
  })

  it('caps the spin kick', () => {
    const a: CollisionBody = { x: 0, y: 0, vx: 50, vy: 2000, mass: 0.5 }
    const b: CollisionBody = { x: 55, y: 0, vx: 0, vy: 0, mass: 0.5 }
    const r = collideCars(a, b)!
    expect(Math.abs(r.a.spin)).toBe(0.22)
  })
})
