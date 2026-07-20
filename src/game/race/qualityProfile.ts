/**
 * Presentation-only render quality resolution for RaceScene.
 *
 * This module must never influence simulation state: it only picks which
 * Phaser post-FX and particle emission rates get built, driven purely by the
 * player's settings + device class. Sim state, events, and snapshots are
 * identical across quality levels.
 */

export type QualitySetting = 'auto' | 'high' | 'low'
export type ResolvedQuality = 'high' | 'low'

export interface QualityProfile {
  /** Whether to attach the WebGL bloom post-FX pipeline to the main camera. Vignette is always kept. */
  bloom: boolean
  /** Multiplier applied to particle emitter quantities/frequencies (exhaust, smoke, sparks, trails). */
  particleScale: number
}

export const QUALITY_PROFILE: Record<ResolvedQuality, QualityProfile> = {
  high: { bloom: true, particleScale: 1 },
  low: { bloom: false, particleScale: 0.5 },
}

/** 'auto' defers to the device: touch devices (typically weaker/mobile GPUs) get 'low'. */
export function resolveQuality(setting: QualitySetting, isTouch: boolean): ResolvedQuality {
  if (setting === 'high') return 'high'
  if (setting === 'low') return 'low'
  return isTouch ? 'low' : 'high'
}
