import { describe, expect, it } from 'vitest'
import {
  TOUCH_HUD_SCALE,
  anchorBottom,
  anchorRight,
  gearTagFontScale,
  gearTagY,
  hudScale,
  STATUS_PLATE_X,
  statusBarX,
  statusBarWidth,
  statusPlateWidth,
  statusValueX,
} from '../../../src/game/race/hudScale'

describe('hudScale', () => {
  it('is exactly 1 on non-touch devices — every multiplication by it is a no-op', () => {
    expect(hudScale(false)).toBe(1)
  })

  it('is TOUCH_HUD_SCALE on touch devices, within the recommended 1.35-1.5 legibility range', () => {
    expect(hudScale(true)).toBe(TOUCH_HUD_SCALE)
    expect(TOUCH_HUD_SCALE).toBeGreaterThanOrEqual(1.35)
    expect(TOUCH_HUD_SCALE).toBeLessThanOrEqual(1.5)
  })

  it('never shrinks the HUD — the scale only ever grows it', () => {
    expect(TOUCH_HUD_SCALE).toBeGreaterThan(1)
  })
})

describe('anchorRight', () => {
  it('matches plain "width - dist" at scale 1 (desktop is unchanged)', () => {
    expect(anchorRight(1920, 28, 1)).toBe(1920 - 28)
    expect(anchorRight(1920, 320, 1)).toBe(1920 - 320)
  })

  it('grows the element inward (leftward) as scale increases, never past the right edge', () => {
    const atRest = anchorRight(1920, 320, 1)
    const grown = anchorRight(1920, 320, TOUCH_HUD_SCALE)
    expect(grown).toBeLessThan(atRest)
    expect(grown).toBeLessThan(1920)
  })

  it('reproduces the standings HUD box anchor exactly (320 * 1.4 = 448)', () => {
    expect(anchorRight(1920, 320, TOUCH_HUD_SCALE)).toBe(1920 - 448)
  })
})

describe('status row grid (bottom-left plate)', () => {
  // Each status row is: label (left, x=28) · fill bar · value text
  // (right-anchored). At 1x everything fit; at 1.4x the value text slid
  // ~84px under the bar and the OVERCHARGE label ran ~11px under the bar
  // backdrop. The grid now scales horizontally, bounded so the plate stays
  // clear of the unmirrored touch brake button (hit box starts at x=540).
  //
  // Independent width arithmetic used below (not derived from the helpers):
  // JetBrains Mono's advance is 0.6em, so micro type (13px) is 7.8px/char
  // at 1x and 13 * 0.6 * 1.4 = 10.92px/char at touch scale. The widest
  // values are 9 chars ("100% LEFT", "100 / 100"); the widest label is
  // "OVERCHARGE" (10 chars). statBar's backdrop pads 4px past the fill rect.

  it('reproduces the legacy desktop layout exactly at scale 1', () => {
    expect(STATUS_PLATE_X).toBe(14)
    expect(statusPlateWidth(1)).toBe(390)
    expect(statusValueX(1)).toBe(386)
    expect(statusBarX(1)).toBe(130)
    expect(statusBarWidth(1)).toBe(170)
    expect(gearTagFontScale(1)).toBe(1)
    expect(gearTagY(1080, 1)).toBe(826)
  })

  it('matches the shipped touch numbers (independent literals)', () => {
    // plate width min(390 * 1.4, 510) = 510 → right edge 14 + 510 = 524
    expect(statusPlateWidth(TOUCH_HUD_SCALE)).toBe(510)
    // value anchor keeps the legacy 18px inset from the plate edge: 524 - 18
    expect(statusValueX(TOUCH_HUD_SCALE)).toBe(506)
    // bar column starts at 130 * 1.4 = 182
    expect(statusBarX(TOUCH_HUD_SCALE)).toBeCloseTo(182, 9)
    // bar fills the row minus the scaled 86px value reservation:
    // 506 - 182 - 86 * 1.4 = 203.6
    expect(statusBarWidth(TOUCH_HUD_SCALE)).toBeCloseTo(203.6, 9)
  })

  it('keeps the widest value text clear of the bar backdrop at touch scale', () => {
    // worst case: 9 chars * 10.92px = 98.28px, right-anchored at the value x
    const worstValueLeft = statusValueX(TOUCH_HUD_SCALE) - 9 * 13 * 0.6 * TOUCH_HUD_SCALE
    const backdropRight = statusBarX(TOUCH_HUD_SCALE) + statusBarWidth(TOUCH_HUD_SCALE) + 4
    expect(backdropRight).toBeCloseTo(389.6, 9)
    expect(worstValueLeft).toBeCloseTo(407.72, 9)
    // ≥8px of clear air between bar backdrop and value text
    expect(worstValueLeft - backdropRight).toBeGreaterThanOrEqual(8)
  })

  it('keeps the widest label clear of the bar backdrop at touch scale', () => {
    // "OVERCHARGE": 10 chars * 10.92px = 109.2px from its fixed x=28 anchor
    const labelRight = 28 + 10 * 13 * 0.6 * TOUCH_HUD_SCALE
    const backdropLeft = statusBarX(TOUCH_HUD_SCALE) - 4
    expect(labelRight).toBeCloseTo(137.2, 9)
    expect(backdropLeft).toBeCloseTo(178, 9)
    expect(backdropLeft - labelRight).toBeGreaterThanOrEqual(8)
  })

  it('holds the same clearances at scale 1 (desktop was already clear)', () => {
    const worstValueLeft = statusValueX(1) - 9 * 13 * 0.6
    const backdropRight = statusBarX(1) + statusBarWidth(1) + 4
    expect(worstValueLeft - backdropRight).toBeGreaterThan(0)
    const labelRight = 28 + 10 * 13 * 0.6
    expect(statusBarX(1) - 4 - labelRight).toBeGreaterThan(0)
  })

  it('keeps the plate right edge inside the reserved bottom-left HUD region', () => {
    // brake hit box (unmirrored) starts at x = 620 - 80 = 540; the plate
    // keeps ≥16px of clear air before it
    expect(STATUS_PLATE_X + statusPlateWidth(TOUCH_HUD_SCALE)).toBe(524)
    expect(STATUS_PLATE_X + statusPlateWidth(TOUCH_HUD_SCALE)).toBeLessThanOrEqual(540 - 16)
  })

  it('gear tag: capped font plus lift keeps it inside its band on touch', () => {
    // The 28px band above the plate top (y=854 at 1080p) cannot grow: the
    // steer pad hit zone ends at y=815. Font caps at 1.25x (the legibility
    // floor) and the tag lifts 6px to y=820.
    expect(gearTagFontScale(TOUCH_HUD_SCALE)).toBe(1.25)
    expect(gearTagY(1080, TOUCH_HUD_SCALE)).toBeCloseTo(820, 9)
    // caption (18px) * 1.25 = 22.5px; JetBrains Mono's line box is ~1.32x
    // the font size (measured 33px at a 25.2px font) — allow 1.4x and the
    // tag bottom still clears the plate top border at 854
    expect(gearTagY(1080, TOUCH_HUD_SCALE) + 18 * 1.25 * 1.4).toBeLessThan(854)
    // and its top stays below the steer-pad hit zone (ends y=815) and inside
    // the reserved HUD box (starts y=820)
    expect(gearTagY(1080, TOUCH_HUD_SCALE)).toBeGreaterThan(819.999)
  })
})

describe('anchorBottom', () => {
  it('matches plain "height - dist" at scale 1 (desktop is unchanged)', () => {
    expect(anchorBottom(1080, 30, 1)).toBe(1080 - 30)
    expect(anchorBottom(1080, 130, 1)).toBe(1080 - 130)
  })

  it('grows the element inward (upward) as scale increases, never past the bottom edge', () => {
    const atRest = anchorBottom(1080, 130, 1)
    const grown = anchorBottom(1080, 130, TOUCH_HUD_SCALE)
    expect(grown).toBeLessThan(atRest)
    expect(grown).toBeLessThan(1080)
  })
})
