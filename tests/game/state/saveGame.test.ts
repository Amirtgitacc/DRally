import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCareer, serializeCareer } from '../../../src/core/progression/career'
import { CAREER_KEY, LEGACY_CAREER_KEY, readCareer, resetCareer } from '../../../src/game/state/saveGame'
import { SETTINGS_KEY } from '../../../src/game/state/settings'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  get length() { return this.values.size }
}

describe('career storage migration', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('migrates the legacy key once without losing progress', () => {
    const old = JSON.parse(serializeCareer({ ...createCareer(), cash: 4321, points: 27 }))
    delete old.schemaVersion
    delete old.profile
    delete old.records
    storage.setItem(LEGACY_CAREER_KEY, JSON.stringify(old))

    const migrated = readCareer()!
    expect(migrated.cash).toBe(4321)
    expect(migrated.points).toBe(27)
    expect(migrated.profile.difficulty).toBe('standard')
    expect(storage.getItem(CAREER_KEY)).not.toBeNull()
    expect(storage.getItem(LEGACY_CAREER_KEY)).toBeNull()
  })

  it('does not reset settings when a career is replaced', () => {
    storage.setItem(SETTINGS_KEY, '{"muted":true}')
    const career = resetCareer({ driverName: 'Nova' })
    expect(career.profile.driverName).toBe('Nova')
    expect(storage.getItem(SETTINGS_KEY)).toBe('{"muted":true}')
  })

  it('clears chosen liveries on career reset', () => {
    storage.setItem(CAREER_KEY, JSON.stringify({ ...JSON.parse(serializeCareer(createCareer())), liveries: { jackal: 'a' } }))
    const career = resetCareer()
    expect(career.liveries).toEqual({})
    expect(readCareer()!.liveries).toEqual({})
  })
})
