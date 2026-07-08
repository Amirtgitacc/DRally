// Pure race placement — no Phaser imports.
// Finished cars rank by finish time, then racing cars by progress (gates
// passed, then distance remaining to the next gate), then wrecked cars last.

export interface PlacementEntry {
  id: string
  gatesPassed: number
  /** px from the car to its next gate (ignored once finished) */
  distToNextGate: number
  finishedAtMs: number | null
  wrecked?: boolean
}

/** Returns car ids ordered 1st → last. */
export function computePlacements(entries: PlacementEntry[]): string[] {
  const rank = (e: PlacementEntry) => (e.finishedAtMs !== null ? 0 : e.wrecked ? 2 : 1)
  return [...entries]
    .sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      if (ra === 0) return a.finishedAtMs! - b.finishedAtMs!
      if (a.gatesPassed !== b.gatesPassed) return b.gatesPassed - a.gatesPassed
      return a.distToNextGate - b.distToNextGate
    })
    .map((e) => e.id)
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd" */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
