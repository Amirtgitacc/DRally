import { describe, it, expect } from 'vitest'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../../../src/core/net/roomCode'

describe('roomCode', () => {
  it('generates a WORD-NN code that validates', () => {
    // rand=0 picks the first word and digits 00
    const code = generateRoomCode(() => 0)
    expect(code).toMatch(/^[A-Z]+-\d{2}$/)
    expect(isValidRoomCode(code)).toBe(true)
  })

  it('produces different words as rand advances', () => {
    const a = generateRoomCode(() => 0)
    const b = generateRoomCode(() => 0.999)
    expect(a).not.toBe(b)
  })

  it('normalizes user input to canonical form', () => {
    expect(normalizeRoomCode('  tiger-42 ')).toBe('TIGER-42')
    expect(normalizeRoomCode('tiger 42')).toBe('TIGER-42') // space tolerated as separator
  })

  it('rejects malformed codes', () => {
    expect(isValidRoomCode('')).toBe(false)
    expect(isValidRoomCode('TIGER')).toBe(false)
    expect(isValidRoomCode('TIGER-4')).toBe(false)
    expect(isValidRoomCode('12-34')).toBe(false)
  })
})
