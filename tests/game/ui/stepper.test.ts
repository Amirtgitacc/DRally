import { describe, expect, it } from 'vitest'
import { resolveSettingsTap } from '../../../src/game/ui/stepper'

describe('resolveSettingsTap', () => {
  const ROW_WIDTH = 700

  describe('adjustable rows', () => {
    it('decrements for a tap in the left portion', () => {
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, 10)).toBe('decrement')
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, ROW_WIDTH / 2 - 1)).toBe('decrement')
    })

    it('increments for a tap in the right portion', () => {
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, ROW_WIDTH / 2 + 1)).toBe('increment')
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, ROW_WIDTH - 5)).toBe('increment')
    })

    it('treats the exact midpoint as the right (increment) zone', () => {
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, ROW_WIDTH / 2)).toBe('increment')
    })

    it('treats the row edges correctly', () => {
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, 0)).toBe('decrement')
      expect(resolveSettingsTap('adjustable', ROW_WIDTH, ROW_WIDTH)).toBe('increment')
    })
  })

  describe('toggle rows', () => {
    it('always activates regardless of tap x', () => {
      expect(resolveSettingsTap('toggle', ROW_WIDTH, 0)).toBe('activate')
      expect(resolveSettingsTap('toggle', ROW_WIDTH, ROW_WIDTH / 2)).toBe('activate')
      expect(resolveSettingsTap('toggle', ROW_WIDTH, ROW_WIDTH)).toBe('activate')
    })
  })

  describe('action rows', () => {
    it('always activates regardless of tap x', () => {
      expect(resolveSettingsTap('action', ROW_WIDTH, 0)).toBe('activate')
      expect(resolveSettingsTap('action', ROW_WIDTH, ROW_WIDTH / 2)).toBe('activate')
      expect(resolveSettingsTap('action', ROW_WIDTH, ROW_WIDTH)).toBe('activate')
    })
  })
})
