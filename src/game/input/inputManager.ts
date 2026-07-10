import Phaser from 'phaser'
import { loadSettings } from '../state/settings'
import type { GameAction } from './inputTypes'
import type { SerializedBindings } from './inputTypes'

const GAMEPAD_BUTTON: Partial<Record<GameAction, number>> = {
  fire: 0,
  mine: 1,
  handbrake: 2,
  turbo: 5,
  pause: 9,
}

/** Converts configurable keyboard/gamepad state into named game actions. */
export class InputManager {
  private keys = new Map<string, Phaser.Input.Keyboard.Key>()
  private previous = new Map<GameAction, boolean>()
  private current = new Map<GameAction, boolean>()
  private bindings!: SerializedBindings

  constructor(private readonly scene: Phaser.Scene) {
    this.reload()
  }

  reload() {
    this.keys.clear()
    this.bindings = loadSettings().bindings
    const keyboard = this.scene.input.keyboard
    if (!keyboard) return
    for (const codes of Object.values(this.bindings)) {
      for (const code of codes) {
        if (!this.keys.has(code)) this.keys.set(code, keyboard.addKey(code))
      }
    }
  }

  update() {
    const pad = navigator.getGamepads?.()[0] ?? null
    const axisX = pad?.axes[0] ?? 0
    const axisY = pad?.axes[1] ?? 0
    for (const [action, codes] of Object.entries(this.bindings) as Array<[GameAction, string[]]>) {
      this.previous.set(action, this.current.get(action) ?? false)
      let down = codes.some((code) => this.keys.get(code)?.isDown === true)
      const button = GAMEPAD_BUTTON[action]
      if (button !== undefined) down ||= pad?.buttons[button]?.pressed === true
      if (action === 'accelerate') down ||= axisY < -0.35 || (pad?.buttons[7]?.value ?? 0) > 0.25
      if (action === 'brake') down ||= axisY > 0.35 || (pad?.buttons[6]?.value ?? 0) > 0.25
      if (action === 'steerLeft') down ||= axisX < -0.3
      if (action === 'steerRight') down ||= axisX > 0.3
      this.current.set(action, down)
    }
  }

  down(action: GameAction): boolean {
    return this.current.get(action) ?? false
  }

  justDown(action: GameAction): boolean {
    return this.down(action) && !(this.previous.get(action) ?? false)
  }

  matches(action: GameAction, code: string): boolean {
    return this.bindings[action].includes(code)
  }
}
