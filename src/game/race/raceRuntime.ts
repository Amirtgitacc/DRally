export type RacePhase = 'countdown' | 'racing' | 'finished'

export interface RaceRuntime {
  phase: RacePhase
  seed: number
  raceStartAt: number
  resultCommitted: boolean
}

export function createRaceRuntime(seed: number): RaceRuntime {
  return { phase: 'countdown', seed, raceStartAt: 0, resultCommitted: false }
}

export function startRace(runtime: RaceRuntime, now: number): RaceRuntime {
  return runtime.phase === 'countdown' ? { ...runtime, phase: 'racing', raceStartAt: now } : runtime
}

export function finishRace(runtime: RaceRuntime): RaceRuntime {
  return runtime.resultCommitted ? runtime : { ...runtime, phase: 'finished', resultCommitted: true }
}
