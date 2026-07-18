import { describe, expect, it } from 'vitest'
import { artToCanvas, coverTransform } from '../../../src/game/ui/backgroundTransform'

/**
 * The menu overlays transparent hover rects + labels on top of plates that are
 * BAKED into the 1920×1080 background art. If the overlay is placed in raw
 * canvas coordinates while the art is drawn through a `cover()` transform, the
 * two drift apart whenever the art size differs from the canvas. These tests
 * pin the art-space → canvas-space mapping the menu now derives its geometry
 * from, so plates and rings can never separate again.
 */

const CANVAS_W = 1920
const CANVAS_H = 1080

// Authored art-space plate centres, measured against menu-peykan-background.webp.
const PLATE_ART_Y = [224, 323, 412, 505, 595, 688, 779, 874]
const PLATE_ART_X = 1580

describe('coverTransform', () => {
  it('is the identity when art exactly matches the canvas (cover scale 1.0)', () => {
    const t = coverTransform(CANVAS_W, CANVAS_H, 1920, 1080)
    expect(t.scale).toBe(1)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(0)
  })

  it('maps every authored plate centre onto itself under the identity transform', () => {
    const t = coverTransform(CANVAS_W, CANVAS_H, 1920, 1080)
    for (const ay of PLATE_ART_Y) {
      const p = artToCanvas(t, PLATE_ART_X, ay)
      expect(p.x).toBe(PLATE_ART_X)
      expect(p.y).toBe(ay)
    }
  })

  it('upscales and vertically centres a square (non-16:9) source, cropping top/bottom', () => {
    // 1000×1000 art on a 1920×1080 canvas: width drives the cover scale.
    const t = coverTransform(CANVAS_W, CANVAS_H, 1000, 1000)
    expect(t.scale).toBeCloseTo(1.92, 6) // max(1920/1000, 1080/1000)
    expect(t.offsetX).toBeCloseTo(0, 6) // (1920 - 1000*1.92)/2
    expect(t.offsetY).toBeCloseTo(-420, 6) // (1080 - 1000*1.92)/2
    // The art centre still lands on the canvas centre.
    const c = artToCanvas(t, 500, 500)
    expect(c.x).toBeCloseTo(960, 6)
    expect(c.y).toBeCloseTo(540, 6)
    // The art top-left is pushed above the visible canvas top.
    const tl = artToCanvas(t, 0, 0)
    expect(tl.x).toBeCloseTo(0, 6)
    expect(tl.y).toBeCloseTo(-420, 6)
  })

  it('crops left/right for a source wider than 16:9 (height drives the scale)', () => {
    // 1920×960 art: taller-than-canvas after scaling, so height drives cover and
    // the sides overflow with a negative horizontal offset.
    const t = coverTransform(CANVAS_W, CANVAS_H, 1920, 960)
    expect(t.scale).toBeCloseTo(1.125, 6) // max(1.0, 1080/960)
    expect(t.offsetX).toBeCloseTo(-120, 6) // (1920 - 1920*1.125)/2
    expect(t.offsetY).toBeCloseTo(0, 6)
    const c = artToCanvas(t, 960, 480)
    expect(c.x).toBeCloseTo(960, 6)
    expect(c.y).toBeCloseTo(540, 6)
  })
})
