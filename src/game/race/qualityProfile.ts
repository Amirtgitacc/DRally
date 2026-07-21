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
  /**
   * Persistent tire-streak marks stamped into a full-track RenderTexture.
   * Off on 'low': each per-frame RenderTexture.beginDraw switches the render
   * target, and on tile-based mobile GPUs that framebuffer switch costs a flat
   * per-frame tax that tanks FPS while cornering. The live tire-smoke puff is a
   * particle (kept), so drifting still reads without the persistent streaks.
   */
  skidMarks: boolean
}

export const QUALITY_PROFILE: Record<ResolvedQuality, QualityProfile> = {
  high: { bloom: true, particleScale: 1, skidMarks: true },
  low: { bloom: false, particleScale: 0.5, skidMarks: false },
}

/** 'auto' defers to the device: touch devices (typically weaker/mobile GPUs) get 'low'. */
export function resolveQuality(setting: QualitySetting, isTouch: boolean): ResolvedQuality {
  if (setting === 'high') return 'high'
  if (setting === 'low') return 'low'
  return isTouch ? 'low' : 'high'
}
