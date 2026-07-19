import { describe, expect, it } from 'vitest'
import {
  computeTouchLayout,
  steerFromPad,
  resolveThrottle,
  pointInCircle,
  pointInPad,
  driveAxisFromTouch,
  isSchemeActive,
  HUD_RESERVED,
  heldButtonActions,
} from '../../../src/game/input/touchScheme'

describe('computeTouchLayout', () => {
  it('returns a layout with all required controls', () => {
    const layout = computeTouchLayout(false)
    expect(layout.steerPad).toHaveProperty('x')
    expect(layout.steerPad).toHaveProperty('y')
    expect(layout.steerPad).toHaveProperty('halfWidth')
    expect(layout.steerPad).toHaveProperty('halfHeight')
    expect(layout.handbrake).toHaveProperty('x')
    expect(layout.handbrake).toHaveProperty('y')
    expect(layout.handbrake).toHaveProperty('r')
    expect(layout.brake).toHaveProperty('x')
    expect(layout.fire).toHaveProperty('x')
    expect(layout.turbo).toHaveProperty('x')
    expect(layout.mine).toHaveProperty('x')
    expect(layout.pause).toHaveProperty('x')
    expect(layout.mute).toHaveProperty('x')
  })

  describe('mirror symmetry', () => {
    it('mirrors all controls except pause and mute', () => {
      const unmirrored = computeTouchLayout(false)
      const mirrored = computeTouchLayout(true)

      // Pause and mute should not change
      expect(mirrored.pause.x).toBe(unmirrored.pause.x)
      expect(mirrored.pause.y).toBe(unmirrored.pause.y)
      expect(mirrored.mute.x).toBe(unmirrored.mute.x)
      expect(mirrored.mute.y).toBe(unmirrored.mute.y)

      // All other controls should mirror horizontally (x -> 1920 - x)
      expect(mirrored.steerPad.x).toBe(1920 - unmirrored.steerPad.x)
      expect(mirrored.steerPad.y).toBe(unmirrored.steerPad.y)
      expect(mirrored.handbrake.x).toBe(1920 - unmirrored.handbrake.x)
      expect(mirrored.brake.x).toBe(1920 - unmirrored.brake.x)
      expect(mirrored.fire.x).toBe(1920 - unmirrored.fire.x)
      expect(mirrored.turbo.x).toBe(1920 - unmirrored.turbo.x)
      expect(mirrored.mine.x).toBe(1920 - unmirrored.mine.x)
    })
  })

  describe('bounds and margins', () => {
    it('keeps all controls within screen bounds with safe margins in normal mode', () => {
      const layout = computeTouchLayout(false)
      const MIN_MARGIN = 16 // Enforce ≥16px screen margin

      const controls = [
        { ...layout.steerPad, isRect: true },
        layout.handbrake,
        layout.brake,
        layout.fire,
        layout.turbo,
        layout.mine,
        layout.pause,
        layout.mute,
      ]

      controls.forEach((ctrl) => {
        const isRect = (ctrl as any).isRect
        if (isRect) {
          const x = ctrl.x
          const y = ctrl.y
          const hw = (ctrl as any).halfWidth
          const hh = (ctrl as any).halfHeight
          expect(x - hw).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(x + hw).toBeLessThanOrEqual(1920 - MIN_MARGIN)
          expect(y - hh).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(y + hh).toBeLessThanOrEqual(1080 - MIN_MARGIN)
        } else {
          const r = (ctrl as any).r
          expect(ctrl.x - r).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(ctrl.x + r).toBeLessThanOrEqual(1920 - MIN_MARGIN)
          expect(ctrl.y - r).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(ctrl.y + r).toBeLessThanOrEqual(1080 - MIN_MARGIN)
        }
      })
    })

    it('keeps all controls within screen bounds with safe margins in mirrored mode', () => {
      const layout = computeTouchLayout(true)
      const MIN_MARGIN = 16 // Enforce ≥16px screen margin

      const controls = [
        { ...layout.steerPad, isRect: true },
        layout.handbrake,
        layout.brake,
        layout.fire,
        layout.turbo,
        layout.mine,
        layout.pause,
        layout.mute,
      ]

      controls.forEach((ctrl) => {
        const isRect = (ctrl as any).isRect
        if (isRect) {
          const x = ctrl.x
          const y = ctrl.y
          const hw = (ctrl as any).halfWidth
          const hh = (ctrl as any).halfHeight
          expect(x - hw).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(x + hw).toBeLessThanOrEqual(1920 - MIN_MARGIN)
          expect(y - hh).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(y + hh).toBeLessThanOrEqual(1080 - MIN_MARGIN)
        } else {
          const r = (ctrl as any).r
          expect(ctrl.x - r).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(ctrl.x + r).toBeLessThanOrEqual(1920 - MIN_MARGIN)
          expect(ctrl.y - r).toBeGreaterThanOrEqual(MIN_MARGIN)
          expect(ctrl.y + r).toBeLessThanOrEqual(1080 - MIN_MARGIN)
        }
      })
    })
  })

  describe('HUD clearance', () => {
    // regression: the first layout buried the steer pad under the hull/ammo
    // panel and put pause/mute on top of the lap counter and timer.
    it('keeps every control clear of the race HUD regions in both mirror modes', () => {
      for (const mirrored of [false, true]) {
        const layout = computeTouchLayout(mirrored)
        const boxes: Array<{ name: string; x: number; y: number; w: number; h: number }> = [
          {
            name: 'steerPad',
            x: layout.steerPad.x - layout.steerPad.halfWidth,
            y: layout.steerPad.y - layout.steerPad.halfHeight,
            w: layout.steerPad.halfWidth * 2,
            h: layout.steerPad.halfHeight * 2,
          },
        ]
        for (const name of ['handbrake', 'brake', 'fire', 'turbo', 'mine', 'pause', 'mute'] as const) {
          const c = layout[name]
          boxes.push({ name, x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 })
        }

        for (const box of boxes) {
          for (const zone of HUD_RESERVED) {
            const overlaps =
              box.x < zone.x + zone.w &&
              box.x + box.w > zone.x &&
              box.y < zone.y + zone.h &&
              box.y + box.h > zone.y
            expect(
              overlaps,
              `${box.name} overlaps HUD zone ${JSON.stringify(zone)} (mirrored=${mirrored})`,
            ).toBe(false)
          }
        }
      }
    })
  })

  describe('action button spacing', () => {
    it('keeps at least 24px edge gap between action buttons in both mirror modes', () => {
      for (const mirrored of [false, true]) {
        const layout = computeTouchLayout(mirrored)
        const actions = [layout.fire, layout.turbo, layout.mine, layout.brake, layout.handbrake]
        for (let i = 0; i < actions.length; i++) {
          for (let j = i + 1; j < actions.length; j++) {
            const dist = Math.hypot(actions[j].x - actions[i].x, actions[j].y - actions[i].y)
            expect(dist).toBeGreaterThanOrEqual(actions[i].r + actions[j].r + 24)
          }
        }
      }
    })
  })

  describe('no overlapping controls', () => {
    it('has no overlapping controls in normal mode', () => {
      const layout = computeTouchLayout(false)

      // Helper to get bounding circle for pad (treating as circle with radius = diagonal half)
      const padRadius = Math.sqrt(
        layout.steerPad.halfWidth ** 2 + layout.steerPad.halfHeight ** 2
      )
      const padCircle = { x: layout.steerPad.x, y: layout.steerPad.y, r: padRadius }

      const circles = [
        layout.handbrake,
        layout.brake,
        layout.fire,
        layout.turbo,
        layout.mine,
        layout.pause,
        layout.mute,
      ]

      // Check pad vs all circles
      circles.forEach((circ) => {
        const dist = Math.hypot(circ.x - padCircle.x, circ.y - padCircle.y)
        expect(dist).toBeGreaterThanOrEqual(padCircle.r + circ.r - 1) // Allow 1px numerical margin
      })

      // Check each pair of circles
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const c1 = circles[i]
          const c2 = circles[j]
          const dist = Math.hypot(c2.x - c1.x, c2.y - c1.y)
          const minDist = c1.r + c2.r
          expect(dist).toBeGreaterThanOrEqual(minDist - 1) // Allow 1px numerical margin
        }
      }
    })

    it('has no overlapping controls in mirrored mode', () => {
      const layout = computeTouchLayout(true)

      const padRadius = Math.sqrt(
        layout.steerPad.halfWidth ** 2 + layout.steerPad.halfHeight ** 2
      )
      const padCircle = { x: layout.steerPad.x, y: layout.steerPad.y, r: padRadius }

      const circles = [
        layout.handbrake,
        layout.brake,
        layout.fire,
        layout.turbo,
        layout.mine,
        layout.pause,
        layout.mute,
      ]

      circles.forEach((circ) => {
        const dist = Math.hypot(circ.x - padCircle.x, circ.y - padCircle.y)
        expect(dist).toBeGreaterThanOrEqual(padCircle.r + circ.r - 1)
      })

      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const c1 = circles[i]
          const c2 = circles[j]
          const dist = Math.hypot(c2.x - c1.x, c2.y - c1.y)
          const minDist = c1.r + c2.r
          expect(dist).toBeGreaterThanOrEqual(minDist - 1)
        }
      }
    })
  })
})

describe('steerFromPad', () => {
  it('returns both false inside deadzone', () => {
    const pad = { x: 260, halfWidth: 170 }
    // Center is at x=260, deadzone is 18% of halfWidth = 30.6px
    // So deadzone is roughly [229, 291]
    expect(steerFromPad(260, pad)).toEqual({ steerLeft: false, steerRight: false })
    expect(steerFromPad(250, pad)).toEqual({ steerLeft: false, steerRight: false })
    expect(steerFromPad(270, pad)).toEqual({ steerLeft: false, steerRight: false })
  })

  it('returns steerLeft beyond left deadzone', () => {
    const pad = { x: 260, halfWidth: 170 }
    expect(steerFromPad(100, pad).steerLeft).toBe(true)
    expect(steerFromPad(100, pad).steerRight).toBe(false)
  })

  it('returns steerRight beyond right deadzone', () => {
    const pad = { x: 260, halfWidth: 170 }
    expect(steerFromPad(420, pad).steerRight).toBe(true)
    expect(steerFromPad(420, pad).steerLeft).toBe(false)
  })

  it('clamps beyond pad edges to full steer', () => {
    const pad = { x: 260, halfWidth: 170 }
    // Left edge at x=90, right edge at x=430
    expect(steerFromPad(50, pad).steerLeft).toBe(true)
    expect(steerFromPad(50, pad).steerRight).toBe(false)
    expect(steerFromPad(500, pad).steerRight).toBe(true)
    expect(steerFromPad(500, pad).steerLeft).toBe(false)
  })

  it('respects custom deadzone ratio', () => {
    const pad = { x: 260, halfWidth: 170 }
    // 30% deadzone = 51px
    const result = steerFromPad(310, pad, 0.3)
    expect(result).toEqual({ steerLeft: false, steerRight: false })
    // Beyond 30% deadzone
    const result2 = steerFromPad(320, pad, 0.3)
    expect(result2.steerRight).toBe(true)
  })

  it('steers when the offset lands exactly on the deadzone boundary (strict < is deliberate)', () => {
    // halfWidth 100 with ratio 0.5 keeps the boundary exact in floating point
    const pad = { x: 260, halfWidth: 100 }
    expect(steerFromPad(310, pad, 0.5)).toEqual({ steerLeft: false, steerRight: true })
    expect(steerFromPad(210, pad, 0.5)).toEqual({ steerLeft: true, steerRight: false })
    // just inside the deadzone stays neutral
    expect(steerFromPad(309, pad, 0.5)).toEqual({ steerLeft: false, steerRight: false })
  })

  it('degrades safely when halfWidth is zero', () => {
    const pad = { x: 260, halfWidth: 0 }
    // nonzero offset clamps to full deflection
    expect(steerFromPad(300, pad)).toEqual({ steerLeft: false, steerRight: true })
    expect(steerFromPad(200, pad)).toEqual({ steerLeft: true, steerRight: false })
    // zero offset over zero width must not steer (NaN stays contained)
    expect(steerFromPad(260, pad)).toEqual({ steerLeft: false, steerRight: false })
  })
})

describe('resolveThrottle', () => {
  it('accelerates when scheme is active and not braking', () => {
    const result = resolveThrottle({ schemeActive: true, braking: false })
    expect(result).toEqual({ accelerate: true, brake: false })
  })

  it('brakes when scheme is active and braking', () => {
    const result = resolveThrottle({ schemeActive: true, braking: true })
    expect(result).toEqual({ accelerate: false, brake: true })
  })

  it('returns no actions when scheme inactive', () => {
    const result = resolveThrottle({ schemeActive: false, braking: false })
    expect(result).toEqual({ accelerate: false, brake: false })
  })

  it('returns no actions when scheme inactive even if braking is set', () => {
    const result = resolveThrottle({ schemeActive: false, braking: true })
    expect(result).toEqual({ accelerate: false, brake: false })
  })
})

describe('pointInCircle', () => {
  it('returns true for a point inside the circle', () => {
    const circle = { x: 100, y: 100, r: 50 }
    expect(pointInCircle(100, 100, circle)).toBe(true)
    expect(pointInCircle(120, 100, circle)).toBe(true)
    expect(pointInCircle(100, 140, circle)).toBe(true)
  })

  it('returns false for a point outside the circle', () => {
    const circle = { x: 100, y: 100, r: 50 }
    expect(pointInCircle(200, 100, circle)).toBe(false)
    expect(pointInCircle(100, 200, circle)).toBe(false)
  })

  it('returns true for point on the circle edge', () => {
    const circle = { x: 100, y: 100, r: 50 }
    expect(pointInCircle(150, 100, circle)).toBe(true)
  })

  it('respects slop parameter', () => {
    const circle = { x: 100, y: 100, r: 50 }
    expect(pointInCircle(160, 100, circle)).toBe(false)
    expect(pointInCircle(160, 100, circle, 15)).toBe(true)
  })
})

describe('pointInPad', () => {
  it('returns true for a point inside the pad', () => {
    const pad = { x: 260, y: 920, halfWidth: 170, halfHeight: 110 }
    expect(pointInPad(260, 920, pad)).toBe(true)
    expect(pointInPad(300, 950, pad)).toBe(true)
    expect(pointInPad(100, 900, pad)).toBe(true)
  })

  it('returns false for a point outside the pad', () => {
    const pad = { x: 260, y: 920, halfWidth: 170, halfHeight: 110 }
    expect(pointInPad(500, 920, pad)).toBe(false)
    expect(pointInPad(260, 1100, pad)).toBe(false)
  })

  it('returns true for point on the pad edge', () => {
    const pad = { x: 260, y: 920, halfWidth: 170, halfHeight: 110 }
    expect(pointInPad(430, 920, pad)).toBe(true) // Right edge
    expect(pointInPad(90, 920, pad)).toBe(true) // Left edge
  })

  it('respects slop parameter', () => {
    const pad = { x: 260, y: 920, halfWidth: 170, halfHeight: 110 }
    expect(pointInPad(450, 920, pad)).toBe(false)
    expect(pointInPad(450, 920, pad, 25)).toBe(true)
  })
})

describe('heldButtonActions', () => {
  // regression: a finger held through a pause gets no repeat event, so
  // InputManager.reset() left the button dead until it was lifted and pressed
  // again. Held actions must be re-asserted every frame.
  it('returns every action still under a finger', () => {
    const held = [
      { action: 'fire', pointerId: 2 },
      { action: 'turbo', pointerId: 3 },
      { action: 'mine', pointerId: null },
    ]
    expect(heldButtonActions(held)).toEqual(['fire', 'turbo'])
  })

  it('ignores controls with no action, such as the brake button', () => {
    expect(heldButtonActions([{ action: null, pointerId: 1 }])).toEqual([])
  })

  it('returns nothing when no button is held', () => {
    expect(heldButtonActions([{ action: 'fire', pointerId: null }])).toEqual([])
  })
})

describe('isSchemeActive', () => {
  // regression: isTouchDevice() is true on hybrid/touchscreen laptops, so a
  // keyboard player there must never get forced auto-acceleration.
  it('stays inactive until the player engages the on-screen controls', () => {
    expect(isSchemeActive(false, false)).toBe(false)
    expect(isSchemeActive(false, true)).toBe(false)
  })

  it('is active only while engaged and the race is unfinished', () => {
    expect(isSchemeActive(true, false)).toBe(true)
    expect(isSchemeActive(true, true)).toBe(false)
  })

  it('produces no throttle at all when not engaged', () => {
    const throttle = resolveThrottle({ schemeActive: isSchemeActive(false, false), braking: false })
    expect(throttle).toEqual({ accelerate: false, brake: false })
    expect(driveAxisFromTouch(0, throttle)).toEqual({ x: 0, y: 0 })
  })
})

describe('driveAxisFromTouch', () => {
  it('steer -1, accelerate', () => {
    expect(driveAxisFromTouch(-1, { accelerate: true, brake: false })).toEqual({ x: -1, y: -1 })
  })

  it('steer -1, brake', () => {
    expect(driveAxisFromTouch(-1, { accelerate: false, brake: true })).toEqual({ x: -1, y: 1 })
  })

  it('steer -1, neither', () => {
    expect(driveAxisFromTouch(-1, { accelerate: false, brake: false })).toEqual({ x: -1, y: 0 })
  })

  it('steer 0, accelerate', () => {
    expect(driveAxisFromTouch(0, { accelerate: true, brake: false })).toEqual({ x: 0, y: -1 })
  })

  it('steer 0, brake', () => {
    expect(driveAxisFromTouch(0, { accelerate: false, brake: true })).toEqual({ x: 0, y: 1 })
  })

  it('steer 0, neither', () => {
    expect(driveAxisFromTouch(0, { accelerate: false, brake: false })).toEqual({ x: 0, y: 0 })
  })

  it('steer 1, accelerate', () => {
    expect(driveAxisFromTouch(1, { accelerate: true, brake: false })).toEqual({ x: 1, y: -1 })
  })

  it('steer 1, brake', () => {
    expect(driveAxisFromTouch(1, { accelerate: false, brake: true })).toEqual({ x: 1, y: 1 })
  })

  it('steer 1, neither', () => {
    expect(driveAxisFromTouch(1, { accelerate: false, brake: false })).toEqual({ x: 1, y: 0 })
  })
})
