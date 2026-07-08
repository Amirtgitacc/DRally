import { describe, expect, it } from 'vitest'
import { computePlacements, ordinal, type PlacementEntry } from '../../../src/core/race/placement'

const racing = (id: string, gates: number, dist: number): PlacementEntry => ({
  id,
  gatesPassed: gates,
  distToNextGate: dist,
  finishedAtMs: null,
})

describe('computePlacements', () => {
  it('ranks by gates passed, then distance to next gate', () => {
    const order = computePlacements([racing('a', 5, 100), racing('b', 7, 500), racing('c', 7, 80)])
    expect(order).toEqual(['c', 'b', 'a'])
  })

  it('finished cars beat racing cars, earlier finish first', () => {
    const order = computePlacements([
      racing('slow', 20, 10),
      { id: 'second', gatesPassed: 31, distToNextGate: 0, finishedAtMs: 62000 },
      { id: 'winner', gatesPassed: 31, distToNextGate: 0, finishedAtMs: 61000 },
    ])
    expect(order).toEqual(['winner', 'second', 'slow'])
  })

  it('ranks wrecked cars last regardless of progress', () => {
    const order = computePlacements([
      racing('slow', 3, 50),
      { id: 'wreckedLeader', gatesPassed: 25, distToNextGate: 10, finishedAtMs: null, wrecked: true },
      { id: 'finisher', gatesPassed: 31, distToNextGate: 0, finishedAtMs: 60000 },
    ])
    expect(order).toEqual(['finisher', 'slow', 'wreckedLeader'])
  })

  it('orders multiple wrecked cars by progress at time of wreck', () => {
    const order = computePlacements([
      { id: 'wreckedEarly', gatesPassed: 4, distToNextGate: 10, finishedAtMs: null, wrecked: true },
      { id: 'wreckedLate', gatesPassed: 20, distToNextGate: 10, finishedAtMs: null, wrecked: true },
    ])
    expect(order).toEqual(['wreckedLate', 'wreckedEarly'])
  })

  it('does not mutate the input array', () => {
    const entries = [racing('a', 1, 10), racing('b', 2, 10)]
    computePlacements(entries)
    expect(entries[0].id).toBe('a')
  })
})

describe('ordinal', () => {
  it('formats english ordinals', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
  })
})
