// localStorage wrapper with one-way v1 -> v2 migration.

import {
  createCareer,
  deserializeCareer,
  serializeCareer,
  type CareerState,
  type DriverProfile,
} from '../../core/progression/career'

export const CAREER_KEY = 'deathrally-career-v2'
export const LEGACY_CAREER_KEY = 'deathrally-career-v1'

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Persistence is optional; gameplay still works when storage is blocked.
  }
}

export function hasSavedCareer(): boolean {
  return readKey(CAREER_KEY) !== null || readKey(LEGACY_CAREER_KEY) !== null
}

/** Read and migrate a career without silently manufacturing one. */
export function readCareer(): CareerState | null {
  const current = readKey(CAREER_KEY)
  if (current) {
    const career = deserializeCareer(current)
    if (career) return career
  }

  const legacy = readKey(LEGACY_CAREER_KEY)
  if (!legacy) return null
  const migrated = deserializeCareer(legacy)
  if (!migrated) return null
  saveCareer(migrated)
  removeKey(LEGACY_CAREER_KEY)
  return migrated
}

export function loadCareer(): CareerState {
  const saved = readCareer()
  if (saved) return saved
  const fresh = createCareer()
  saveCareer(fresh)
  return fresh
}

export function saveCareer(career: CareerState) {
  try {
    localStorage.setItem(CAREER_KEY, serializeCareer(career))
  } catch {
    // no persistence available — play on with in-memory state
  }
}

export function resetCareer(profile: Partial<DriverProfile> = {}): CareerState {
  const fresh = createCareer(profile)
  saveCareer(fresh)
  removeKey(LEGACY_CAREER_KEY)
  return fresh
}
