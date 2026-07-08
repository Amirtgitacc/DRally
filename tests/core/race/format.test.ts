import { describe, expect, it } from 'vitest'
import { formatTime } from '../../../src/core/race/format'

describe('formatTime', () => {
  it('formats minutes, seconds, centiseconds', () => {
    expect(formatTime(0)).toBe('0:00.00')
    expect(formatTime(79780)).toBe('1:19.78')
    expect(formatTime(11790)).toBe('0:11.79')
    expect(formatTime(-5)).toBe('0:00.00')
  })
})
