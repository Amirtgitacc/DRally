import { describe, expect, it } from 'vitest'
import { DEFAULT_BINDINGS, deserializeBindings, normalizeBindings, rebind, serializeBindings } from '../../../src/game/input/bindings'

describe('input bindings', () => {
  it('provides complete defaults', () => {
    const bindings = normalizeBindings(null)
    expect(bindings.accelerate).toEqual(['ArrowUp', 'KeyW'])
    expect(bindings.pause).toEqual(['Escape'])
  })

  it('round-trips rebinding serialization', () => {
    const rebound = rebind(DEFAULT_BINDINGS, 'fire', 'KeyF')
    expect(deserializeBindings(serializeBindings(rebound))).toEqual(rebound)
  })

  it('falls back per action when saved bindings are malformed', () => {
    const bindings = normalizeBindings({ fire: [], turbo: ['KeyT', 'KeyT', 4] })
    expect(bindings.fire).toEqual(DEFAULT_BINDINGS.fire)
    expect(bindings.turbo).toEqual(['KeyT'])
  })

  it('rejects invalid JSON', () => {
    expect(deserializeBindings('nope')).toBeNull()
  })
})
