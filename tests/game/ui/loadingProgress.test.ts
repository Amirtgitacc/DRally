import { describe, expect, it } from 'vitest'
import { clampProgress, formatLoadPercent, progressBarWidth } from '../../../src/game/ui/loadingProgress'

describe('clampProgress', () => {
  it('passes through in-range values', () => {
    expect(clampProgress(0)).toBe(0)
    expect(clampProgress(0.42)).toBe(0.42)
    expect(clampProgress(1)).toBe(1)
  })

  it('clamps below 0 and above 1', () => {
    expect(clampProgress(-0.5)).toBe(0)
    expect(clampProgress(1.2)).toBe(1)
  })

  it('treats NaN as 0', () => {
    expect(clampProgress(NaN)).toBe(0)
  })
})

describe('progressBarWidth', () => {
  it('scales the track width by the clamped ratio', () => {
    expect(progressBarWidth(0, 700)).toBe(0)
    expect(progressBarWidth(0.5, 700)).toBe(350)
    expect(progressBarWidth(1, 700)).toBe(700)
  })

  it('clamps out-of-range ratios before scaling', () => {
    expect(progressBarWidth(-1, 700)).toBe(0)
    expect(progressBarWidth(2, 700)).toBe(700)
  })
})

describe('formatLoadPercent', () => {
  it('formats whole percentages', () => {
    expect(formatLoadPercent(0)).toBe('0%')
    expect(formatLoadPercent(1)).toBe('100%')
  })

  it('rounds to the nearest whole percent', () => {
    expect(formatLoadPercent(0.333)).toBe('33%')
    expect(formatLoadPercent(0.005)).toBe('1%')
    expect(formatLoadPercent(0.994)).toBe('99%')
  })

  it('clamps before formatting', () => {
    expect(formatLoadPercent(-0.2)).toBe('0%')
    expect(formatLoadPercent(1.5)).toBe('100%')
  })
})
