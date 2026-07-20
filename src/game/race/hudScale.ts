/**
 * Race HUD scaling for touch devices. Pure math only — no Phaser — so both
 * `RaceScene` (drawing the HUD) and `touchScheme` (keeping on-screen controls
 * clear of it) can share the exact same numbers instead of hand-syncing two
 * copies.
 *
 * The 1920x1080 canvas is scaled to fit the phone screen — on a typical
 * landscape phone the CSS width is only ~850-900px, so every HUD pixel
 * renders roughly 2.2x smaller than its logical size. The HUD's smallest
 * type ramps ('micro' 13px, 'label' 17px) end up a few physical pixels tall,
 * which is unreadable. `TOUCH_HUD_SCALE` recovers legibility.
 *
 * Desktop (non-touch) always gets a scale of 1: every call site multiplies
 * a size or offset by this factor, so on desktop that multiplication is a
 * no-op and every desktop pixel stays exactly what it was before this file
 * existed.
 */
export const TOUCH_HUD_SCALE = 1.4

/** The race HUD's scale factor for the current device. */
export function hudScale(isTouch: boolean): number {
  return isTouch ? TOUCH_HUD_SCALE : 1
}

/**
 * Position an element (or a box's edge) a `distFromRight`-px gap from the
 * right edge of a `width`-px screen, then scale that gap by `scale`. At
 * scale 1 this is exactly `width - distFromRight` (identical to the
 * unscaled desktop layout); at scale > 1 the result moves left, growing the
 * element inward from the right edge rather than off-screen.
 */
export function anchorRight(width: number, distFromRight: number, scale: number): number {
  return width - distFromRight * scale
}

/**
 * Position an element (or a box's edge) a `distFromBottom`-px gap from the
 * bottom edge of a `height`-px screen, then scale that gap by `scale`. At
 * scale 1 this is exactly `height - distFromBottom`; at scale > 1 the result
 * moves up, growing the element inward from the bottom edge.
 */
export function anchorBottom(height: number, distFromBottom: number, scale: number): number {
  return height - distFromBottom * scale
}

// --------------------------------------------------------------------------
// Bottom-left status plate row grid (HULL / AMMO / TURBO / MINES).
//
// Each row is: label (left, x=28) · fill bar · value text (right-anchored).
// At scale 1 the row reserved exactly 86px right of the bar for the value
// text (386 - 130 - 170), and the bar started far enough right (130) to
// clear the widest label. Text width scales linearly with the font, so the
// grid scales those same reservations by `scale` — the clearances that held
// at 1x hold at any scale, and every function below returns the legacy
// literal exactly at scale 1.
//
// The plate cannot scale unbounded: the unmirrored touch brake button's hit
// box starts at x=540 (touchScheme.ts), so the width caps at 510 → right
// edge 524, 16px clear. touchScheme's HUD_RESERVED bottom-left box mirrors
// this cap; keep them in sync through statusPlateWidth.
// --------------------------------------------------------------------------

/** Left edge of the status plate — fixed at every scale. */
export const STATUS_PLATE_X = 14

/** Status plate width: 390 at scale 1, capped at 510 (see block comment). */
export function statusPlateWidth(scale: number): number {
  return Math.min(390 * scale, 510)
}

/**
 * Right-anchor x of the row value texts ("87% LEFT", "34 / 100"), keeping
 * the legacy 18px inset from the plate's right edge: 386 at scale 1.
 */
export function statusValueX(scale: number): number {
  return STATUS_PLATE_X + statusPlateWidth(scale) - 18
}

/**
 * Left edge of the row fill bars. Scaling it keeps the widest label
 * ("OVERCHARGE", 10 mono chars = 78px/scale-1x) clear of the bar backdrop:
 * 130 at scale 1, 182 at 1.4 vs. a 137.2px label right edge.
 */
export function statusBarX(scale: number): number {
  return 130 * scale
}

/**
 * Fill-bar width: the row minus the scaled 86px value-text reservation
 * (86 = widest value, 9 mono chars ≈ 70.2px at 1x, + 4px statBar backdrop
 * pad + air). 386 - 130 - 86 = 170 at scale 1, the legacy width.
 */
export function statusBarWidth(scale: number): number {
  return statusValueX(scale) - statusBarX(scale) - 86 * scale
}

/**
 * The black-market gear tag ("RAM PLATING") lives in the 28px band between
 * the steer pad's touch hit zone (ends y=815) and the status plate top
 * (y=854 at 1080p) — a band that cannot grow. So on touch the tag's font
 * caps at 1.25x (the legibility floor) and the tag lifts ~6px so its bottom
 * still clears the plate border. Both are identity at scale 1.
 */
export function gearTagFontScale(scale: number): number {
  return Math.min(scale, 1.25)
}

/** Top y of the gear tag: height-254 at scale 1, height-260 at 1.4. */
export function gearTagY(height: number, scale: number): number {
  return height - 254 - 15 * (scale - 1)
}

/**
 * Bottom margin (px from the screen edge) for the "0 MPH" speed readout.
 * It's origin-anchored [0,1] (bottom-left) and grows upward as its font
 * scales, so at touch scale its top edge climbs toward the MINES pip row
 * above it (pip row: fixed y, radius 7 * scale — see RaceScene.updateHud).
 * 28 at scale 1 (legacy desktop, already clear); pulled in to 4 at touch
 * scale so the bigger glyph's top edge still clears the pips by ~8px+.
 */
export function speedTextBottomMargin(scale: number): number {
  return 28 - 60 * (scale - 1)
}
