import { describe, expect, it } from 'vitest'
import { stepTurboMeter } from '../../../src/core/vehicle/turboMeter'

const tuning = { drainPerSec: 0.5, rechargePerSec: 0.1, restartThreshold: 0.1 }

describe('turbo meter', () => {
  it('turns boost and its effects off on the frame the tank empties', () => {
    const result = stepTurboMeter({ charge: 0.02, depleted: false }, true, true, 0.1, tuning)
    expect(result.active).toBe(false)
    expect(result.state).toEqual({ charge: 0, depleted: true })
  })

  it('does not flicker recharge while boost remains held', () => {
    const result = stepTurboMeter({ charge: 0, depleted: true }, true, true, 1, tuning)
    expect(result.active).toBe(false)
    expect(result.state.charge).toBe(0)
  })

  it('requires release and enough recovered charge before restarting', () => {
    const partial = stepTurboMeter({ charge: 0, depleted: true }, false, true, 0.5, tuning)
    expect(partial.state).toEqual({ charge: 0.05, depleted: true })
    const recovered = stepTurboMeter(partial.state, false, true, 0.5, tuning)
    expect(recovered.state).toEqual({ charge: 0.1, depleted: false })
    expect(stepTurboMeter(recovered.state, true, true, 0.05, tuning).active).toBe(true)
  })
})
