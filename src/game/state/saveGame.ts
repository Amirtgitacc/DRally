// Thin localStorage wrapper around the pure career serializers.

import {
  createCareer,
  deserializeCareer,
  serializeCareer,
  type CareerState,
} from '../../core/progression/career'

const KEY = 'deathrally-career-v1'

// localStorage can throw (private browsing, storage disabled, itch.io iframes
// with blocked third-party storage) — the game must still run, just without
// persistence.
function readStore(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function hasSavedCareer(): boolean {
  return readStore() !== null
}

export function loadCareer(): CareerState {
  const raw = readStore()
  if (raw) {
    const career = deserializeCareer(raw)
    if (career) return career
  }
  const fresh = createCareer()
  saveCareer(fresh)
  return fresh
}

export function saveCareer(c: CareerState) {
  try {
    localStorage.setItem(KEY, serializeCareer(c))
  } catch {
    // no persistence available — play on with in-memory state
  }
}

export function resetCareer(): CareerState {
  const fresh = createCareer()
  saveCareer(fresh)
  return fresh
}
