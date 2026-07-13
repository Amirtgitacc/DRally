export interface TurboMeterState {
  charge: number
  /** empty tanks stay locked until the driver releases boost and recovers */
  depleted: boolean
}

export interface TurboMeterTuning {
  drainPerSec: number
  rechargePerSec: number
  restartThreshold: number
}

export interface TurboMeterStep {
  state: TurboMeterState
  active: boolean
}

/**
 * Advance turbo charge without allowing the empty-tank flicker loop where a
 * held boost key alternates one frame of recharge with one frame of VFX.
 */
export function stepTurboMeter(
  state: TurboMeterState,
  wantsTurbo: boolean,
  canBoost: boolean,
  dt: number,
  tuning: TurboMeterTuning,
): TurboMeterStep {
  let charge = Math.min(1, Math.max(0, state.charge))
  let depleted = state.depleted || charge <= 0
  let active = wantsTurbo && canBoost && !depleted && charge > 0

  if (active) charge = Math.max(0, charge - tuning.drainPerSec * Math.max(0, dt))
  else if (!wantsTurbo) charge = Math.min(1, charge + tuning.rechargePerSec * Math.max(0, dt))

  if (charge <= 0) {
    charge = 0
    depleted = true
    active = false
  } else if (!wantsTurbo && charge >= tuning.restartThreshold) {
    depleted = false
  }

  return { state: { charge, depleted }, active }
}
