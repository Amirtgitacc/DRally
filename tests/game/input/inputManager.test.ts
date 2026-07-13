import { describe, expect, it, vi } from 'vitest'
import type Phaser from 'phaser'
import { InputManager } from '../../../src/game/input/inputManager'

class FakeKeyboard {
  private listeners = new Map<string, Set<(event: KeyboardEvent) => void>>()
  on(event: string, listener: (event: KeyboardEvent) => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }
  off(event: string, listener: (event: KeyboardEvent) => void) {
    this.listeners.get(event)?.delete(listener)
  }
  emit(event: string, value: Partial<KeyboardEvent>) {
    this.listeners.get(event)?.forEach((listener) => listener(value as KeyboardEvent))
  }
}

describe('InputManager', () => {
  it('tracks DOM event.code bindings instead of passing them to Phaser addKey', () => {
    const keyboard = new FakeKeyboard()
    const scene = { input: { keyboard } } as unknown as Phaser.Scene
    const input = new InputManager(scene)
    const preventDefault = vi.fn()

    keyboard.emit('keydown', { code: 'KeyW', repeat: false, preventDefault })
    input.update()
    expect(input.down('accelerate')).toBe(true)
    expect(input.justDown('accelerate')).toBe(true)
    expect(preventDefault).toHaveBeenCalled()

    input.update()
    expect(input.down('accelerate')).toBe(true)
    expect(input.justDown('accelerate')).toBe(false)

    keyboard.emit('keyup', { code: 'KeyW', preventDefault })
    input.update()
    expect(input.down('accelerate')).toBe(false)
    input.destroy()
  })

  it('clears held inputs when pause or focus loss resets the adapter', () => {
    const keyboard = new FakeKeyboard()
    const input = new InputManager({ input: { keyboard } } as unknown as Phaser.Scene)
    keyboard.emit('keydown', { code: 'KeyW', repeat: false, preventDefault: vi.fn() })
    input.update()
    expect(input.down('accelerate')).toBe(true)

    input.reset()
    expect(input.down('accelerate')).toBe(false)
    input.update()
    expect(input.down('accelerate')).toBe(false)
  })

  it('keeps arrow keys and one-shot actions independent', () => {
    const keyboard = new FakeKeyboard()
    const input = new InputManager({ input: { keyboard } } as unknown as Phaser.Scene)
    const preventDefault = vi.fn()

    keyboard.emit('keydown', { code: 'ArrowLeft', repeat: false, preventDefault })
    keyboard.emit('keydown', { code: 'KeyC', repeat: false, preventDefault })
    input.update()
    expect(input.down('steerLeft')).toBe(true)
    expect(input.down('steerRight')).toBe(false)
    expect(input.justDown('mine')).toBe(true)

    keyboard.emit('keyup', { code: 'ArrowLeft', preventDefault })
    keyboard.emit('keyup', { code: 'KeyC', preventDefault })
    input.update()
    expect(input.down('steerLeft')).toBe(false)
    expect(input.justDown('mine')).toBe(false)
  })
})
