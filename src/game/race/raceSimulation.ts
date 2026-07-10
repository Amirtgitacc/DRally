export const FIXED_STEP_MS = 1000 / 60

/** Bounds a render-frame delta before it enters the existing simulation. */
export function simulationDeltaSeconds(deltaMs: number, dilation = 1): number {
  return Math.min(Math.max(0, deltaMs) / 1000, 0.05) * Math.max(0, dilation)
}

/** Reusable accumulator for systems extracted from RaceScene incrementally. */
export class FixedStepClock {
  private accumulatorMs = 0
  constructor(readonly stepMs = FIXED_STEP_MS, readonly maxSteps = 5) {}

  advance(deltaMs: number, step: (seconds: number) => void): number {
    this.accumulatorMs += Math.max(0, deltaMs)
    let steps = 0
    while (this.accumulatorMs >= this.stepMs && steps < this.maxSteps) {
      step(this.stepMs / 1000)
      this.accumulatorMs -= this.stepMs
      steps++
    }
    if (steps === this.maxSteps) this.accumulatorMs = Math.min(this.accumulatorMs, this.stepMs)
    return steps
  }
}
