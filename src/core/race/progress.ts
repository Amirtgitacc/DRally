// Pure lap/checkpoint progression — no Phaser imports.
// Cars spawn just behind the start line (gate 0). Gates must be crossed in
// order; a lap completes on each re-crossing of gate 0 after a full sequence.

export interface RaceProgress {
  /** count of in-order gate crossings, including the initial start-line arm */
  gatesPassed: number
  gateCount: number
  lapsRequired: number
}

export interface CrossingResult {
  progress: RaceProgress
  /** true when this crossing was the initial start-line arm (race lap timing starts) */
  armed: boolean
  lapCompleted: boolean
  finished: boolean
}

export function createProgress(gateCount: number, lapsRequired: number): RaceProgress {
  return { gatesPassed: 0, gateCount, lapsRequired }
}

export function nextGateIndex(p: RaceProgress): number {
  return p.gatesPassed % p.gateCount
}

export function lapsCompleted(p: RaceProgress): number {
  return p.gatesPassed === 0 ? 0 : Math.floor((p.gatesPassed - 1) / p.gateCount)
}

/** Current lap number for display (1-based once armed, clamped to lapsRequired). */
export function currentLap(p: RaceProgress): number {
  return Math.min(lapsCompleted(p) + 1, p.lapsRequired)
}

export function isFinished(p: RaceProgress): boolean {
  return lapsCompleted(p) >= p.lapsRequired
}

/** Apply a gate crossing. Out-of-order gates are ignored (no progress). */
export function applyGateCrossing(p: RaceProgress, crossedGate: number): CrossingResult {
  if (isFinished(p) || crossedGate !== nextGateIndex(p)) {
    return { progress: p, armed: false, lapCompleted: false, finished: isFinished(p) }
  }
  const progress: RaceProgress = { ...p, gatesPassed: p.gatesPassed + 1 }
  return {
    progress,
    armed: p.gatesPassed === 0,
    lapCompleted: lapsCompleted(progress) > lapsCompleted(p),
    finished: isFinished(progress),
  }
}
