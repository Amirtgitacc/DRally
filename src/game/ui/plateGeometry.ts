/**
 * Polygon for a rectangle centered on (0,0) with the top-right and bottom-left
 * corners cut by `notch` px — the industrial "clipped plate" silhouette.
 * Returns a flat [x0,y0,x1,y1,...] list for Phaser's polygon game object.
 */
export function plateNotchPoints(w: number, h: number, notch: number): number[] {
  const hx = w / 2
  const hy = h / 2
  if (notch <= 0) return [-hx, -hy, hx, -hy, hx, hy, -hx, hy]
  return [
    -hx, -hy, // top-left
    hx - notch, -hy, // top edge, stop short
    hx, -hy + notch, // cut down the right edge
    hx, hy, // bottom-right
    -hx + notch, hy, // bottom edge, stop short
    -hx, hy - notch, // cut up the left edge
  ]
}
