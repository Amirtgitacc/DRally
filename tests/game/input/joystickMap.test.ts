import { describe, expect, it } from 'vitest'
import { joystickToActions } from '../../../src/game/input/joystickMap'

describe('joystickToActions', () => {
  it('returns no actions inside the deadzone', () => {
    expect(joystickToActions(0, 0)).toEqual({ accelerate: false, brake: false, steerLeft: false, steerRight: false })
    expect(joystickToActions(0.1, -0.1)).toEqual({ accelerate: false, brake: false, steerLeft: false, steerRight: false })
  })

  it('maps full up to accelerate only', () => {
    expect(joystickToActions(0, -1)).toEqual({ accelerate: true, brake: false, steerLeft: false, steerRight: false })
  })

  it('maps full down to brake only', () => {
    expect(joystickToActions(0, 1)).toEqual({ accelerate: false, brake: true, steerLeft: false, steerRight: false })
  })

  it('maps left and right past the steer threshold', () => {
    expect(joystickToActions(-1, 0).steerLeft).toBe(true)
    expect(joystickToActions(-1, 0).steerRight).toBe(false)
    expect(joystickToActions(1, 0).steerRight).toBe(true)
  })

  it('maps a diagonal to steer + accelerate together', () => {
    const r = joystickToActions(0.8, -0.8)
    expect(r.accelerate).toBe(true)
    expect(r.steerRight).toBe(true)
    expect(r.brake).toBe(false)
    expect(r.steerLeft).toBe(false)
  })

  it('treats out-of-range magnitudes like the extreme', () => {
    expect(joystickToActions(0, -2).accelerate).toBe(true)
    expect(joystickToActions(2, 0).steerRight).toBe(true)
  })
})
