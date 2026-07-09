import { describe, expect, it } from 'vitest'
import { needsRescue, rescuePose, updateStuckMs, type StuckSample } from '../../../src/core/vehicle/rescue'
import { RESCUE } from '../../../src/data/rescue'

const stranded: StuckSample = { speed: 0, offCenter: 300, halfWidth: 120 }

describe('updateStuckMs', () => {
  it('counts up while a car crawls off the tarmac', () => {
    let ms = 0
    for (let i = 0; i < 3; i++) ms = updateStuckMs(ms, stranded, 500, RESCUE)
    expect(ms).toBe(1500)
  })

  it('resets the moment the car starts moving again', () => {
    const ms = updateStuckMs(2500, { ...stranded, speed: RESCUE.minSpeed + 1 }, 16, RESCUE)
    expect(ms).toBe(0)
  })

  it('never counts a car that is parked on the racing line', () => {
    // the player sitting still on the tarmac must not be teleported
    const parked: StuckSample = { speed: 0, offCenter: 10, halfWidth: 120 }
    expect(updateStuckMs(9999, parked, 16, RESCUE)).toBe(0)
  })

  it('never counts a car that is off the tarmac but still driving', () => {
    expect(updateStuckMs(9999, { ...stranded, speed: 400 }, 16, RESCUE)).toBe(0)
  })
})

describe('needsRescue', () => {
  it('fires only at the threshold', () => {
    expect(needsRescue(RESCUE.stuckMs - 1, RESCUE)).toBe(false)
    expect(needsRescue(RESCUE.stuckMs, RESCUE)).toBe(true)
  })

  it('takes three seconds of being beached to trigger', () => {
    let ms = 0
    let frames = 0
    while (!needsRescue(ms, RESCUE)) {
      ms = updateStuckMs(ms, stranded, 1000 / 60, RESCUE)
      frames++
    }
    // 60fps × 3s = 180 frames, give or take the frame we cross the line on
    expect(frames).toBeGreaterThanOrEqual(180)
    expect(frames).toBeLessThanOrEqual(181)
  })
})

describe('rescuePose', () => {
  it('drops the car in the middle of the gate, facing down the track', () => {
    const pose = rescuePose({ x: 0, y: 100 }, { x: 0, y: 300 }, { x: 1, y: 0 })
    expect(pose.x).toBe(0)
    expect(pose.y).toBe(200)
    expect(pose.heading).toBeCloseTo(0)
  })

  it('reads the heading from the tangent, not the gate', () => {
    const pose = rescuePose({ x: 100, y: 0 }, { x: 300, y: 0 }, { x: 0, y: -1 })
    expect(pose.heading).toBeCloseTo(-Math.PI / 2)
  })
})
