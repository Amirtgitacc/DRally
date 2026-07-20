/**
 * Pure math for the BootScene loading bar. Kept separate from the scene so the
 * clamping/formatting rules are unit-testable without touching Phaser.
 *
 * Phaser's loader `progress` event is documented as 0..1, but this guards
 * against stray values (a slightly-over-1 rounding blip, or NaN before the
 * first file resolves) so the bar never overshoots or reads garbage.
 */

/** Clamp a loader progress value into the renderable 0..1 range. */
export function clampProgress(ratio: number): number {
  if (Number.isNaN(ratio)) return 0
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}

/** Pixel width of the bar fill for a given ratio and the fill track's full width. */
export function progressBarWidth(ratio: number, trackWidth: number): number {
  return clampProgress(ratio) * trackWidth
}

/** "0%".."100%" readout text for the current ratio. */
export function formatLoadPercent(ratio: number): string {
  return `${Math.round(clampProgress(ratio) * 100)}%`
}
