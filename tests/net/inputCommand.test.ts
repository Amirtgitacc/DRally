import { describe, it, expect } from 'vitest'
import { sanitizeCommand } from '../../server/inputCommand'

const okInput = { throttle: 1, brake: 0, steer: 0, handbrake: false }
const okCommand = { input: okInput, fire: false, turbo: false, dropMine: false }

describe('sanitizeCommand', () => {
  it('accepts a well-formed command unchanged', () => {
    const out = sanitizeCommand(okCommand)
    expect(out).toEqual(okCommand)
  })

  it('rejects a malformed frame (missing input)', () => {
    expect(sanitizeCommand({})).toBeNull()
    expect(sanitizeCommand({ fire: false, turbo: false, dropMine: false })).toBeNull()
    expect(sanitizeCommand(null)).toBeNull()
  })

  it('rejects non-boolean flags', () => {
    expect(sanitizeCommand({ ...okCommand, fire: 1 })).toBeNull()
    expect(sanitizeCommand({ input: { ...okInput, handbrake: 'no' }, fire: false, turbo: false, dropMine: false })).toBeNull()
  })

  it('rejects non-finite numeric fields — NaN/Infinity never reach the sim', () => {
    expect(sanitizeCommand({ ...okCommand, input: { ...okInput, steer: Infinity } })).toBeNull()
    expect(sanitizeCommand({ ...okCommand, input: { ...okInput, steer: -Infinity } })).toBeNull()
    expect(sanitizeCommand({ ...okCommand, input: { ...okInput, throttle: NaN } })).toBeNull()
    expect(sanitizeCommand({ ...okCommand, input: { ...okInput, brake: NaN } })).toBeNull()
  })

  it('clamps finite-but-out-of-range analog values instead of rejecting', () => {
    const out = sanitizeCommand({
      input: { throttle: 5, brake: -3, steer: 9, handbrake: true },
      fire: true, turbo: true, dropMine: true,
    })
    expect(out).not.toBeNull()
    expect(out!.input.throttle).toBe(1)
    expect(out!.input.brake).toBe(0)
    expect(out!.input.steer).toBe(1)
    expect(out!.input.handbrake).toBe(true)
    // negative steer clamps to the lower bound
    const left = sanitizeCommand({ ...okCommand, input: { ...okInput, steer: -9 } })
    expect(left!.input.steer).toBe(-1)
  })
})
