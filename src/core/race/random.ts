/** Small deterministic PRNG suitable for race setup and simulation. */
export function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Initial PRNG state for a seed — same normalization createSeededRandom applies. */
export function initialRngState(seed: number): number {
  return (seed >>> 0) || 0x6d2b79f5
}

/**
 * Advance the PRNG whose state lives in a plain serializable field.
 * Produces the identical sequence to createSeededRandom(seed) when
 * ref.rngState started as initialRngState(seed).
 */
export function nextRandom(ref: { rngState: number }): number {
  let state = ref.rngState | 0
  state = (state + 0x6d2b79f5) | 0
  ref.rngState = state
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randomSeed(): number {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
  return Math.floor(Math.random() * 0xffffffff)
}
