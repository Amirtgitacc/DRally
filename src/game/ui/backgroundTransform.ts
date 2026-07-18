/**
 * Pure geometry for the `cover()` background fit — art-space → canvas-space.
 *
 * Backgrounds are drawn to cover the internal canvas at a uniform scale, centred.
 * Anything overlaid on features baked INTO that art (the menu's plate hover rects
 * and labels) must be placed through the same transform, or it drifts apart from
 * the art whenever the source image size differs from the canvas. Keeping this
 * math dependency-free (no Phaser, no config) lets both the renderer and the unit
 * tests share one source of truth.
 */

export interface BackgroundTransform {
  /** Uniform scale applied to the source art. */
  scale: number
  /** Canvas-space x of the art's left edge (negative when the sides overflow). */
  offsetX: number
  /** Canvas-space y of the art's top edge (negative when top/bottom overflow). */
  offsetY: number
}

/** The cover transform that scales `art` to fill `canvas` without stretching. */
export function coverTransform(
  canvasWidth: number,
  canvasHeight: number,
  artWidth: number,
  artHeight: number,
): BackgroundTransform {
  const scale = Math.max(canvasWidth / artWidth, canvasHeight / artHeight)
  return {
    scale,
    offsetX: (canvasWidth - artWidth * scale) / 2,
    offsetY: (canvasHeight - artHeight * scale) / 2,
  }
}

/** Map an authored art-space point onto canvas space under `t`. */
export function artToCanvas(
  t: BackgroundTransform,
  artX: number,
  artY: number,
): { x: number; y: number } {
  return { x: t.offsetX + artX * t.scale, y: t.offsetY + artY * t.scale }
}
