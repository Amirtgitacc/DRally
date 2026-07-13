import Phaser from 'phaser'
import { loadSettings } from '../state/settings'
import type { GameAction, SerializedBindings } from './inputTypes'

const GAMEPAD_BUTTON: Partial<Record<GameAction, number>> = {
  fire: 0,
  mine: 1,
  handbrake: 2,
  turbo: 5,
  pause: 9,
}

/** Converts configurable DOM keyboard codes and gamepad state into named actions. */
export class InputManager {
  private bindings!: SerializedBindings
  private heldCodes = new Set<string>()
  private pressedCodes = new Set<string>()
  private current = new Map<GameAction, boolean>()
  private pressedActions = new Map<GameAction, boolean>()

  private readonly onBlur = () => this.reset()

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.isBound(event.code)) event.preventDefault()
    if (!event.repeat && !this.heldCodes.has(event.code)) this.pressedCodes.add(event.code)
    this.heldCodes.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (this.isBound(event.code)) event.preventDefault()
    this.heldCodes.delete(event.code)
  }

  constructor(private readonly scene: Phaser.Scene) {
    this.reload()
    scene.input.keyboard?.on('keydown', this.onKeyDown)
    scene.input.keyboard?.on('keyup', this.onKeyUp)
    if (typeof window !== 'undefined') window.addEventListener('blur', this.onBlur)
  }

  reload() {
    this.bindings = loadSettings().bindings
  }

  update() {
    const pad = typeof navigator !== 'undefined' ? navigator.getGamepads?.()[0] ?? null : null
    const axisX = pad?.axes[0] ?? 0
    const axisY = pad?.axes[1] ?? 0

    for (const [action, codes] of Object.entries(this.bindings) as Array<[GameAction, string[]]>) {
      const wasDown = this.current.get(action) ?? false

      let down = codes.some((code) => this.heldCodes.has(code))
      const button = GAMEPAD_BUTTON[action]
      if (button !== undefined) down ||= pad?.buttons[button]?.pressed === true
      if (action === 'accelerate') down ||= axisY < -0.35 || (pad?.buttons[7]?.value ?? 0) > 0.25
      if (action === 'brake') down ||= axisY > 0.35 || (pad?.buttons[6]?.value ?? 0) > 0.25
      if (action === 'steerLeft') down ||= axisX < -0.3
      if (action === 'steerRight') down ||= axisX > 0.3

      this.current.set(action, down)
      this.pressedActions.set(action, codes.some((code) => this.pressedCodes.has(code)) || (down && !wasDown))
    }

    this.pressedCodes.clear()
  }

  down(action: GameAction): boolean {
    return this.current.get(action) ?? false
  }

  justDown(action: GameAction): boolean {
    return this.pressedActions.get(action) ?? false
  }

  matches(action: GameAction, code: string): boolean {
    return this.bindings[action].includes(code)
  }

  destroy() {
    this.scene.input.keyboard?.off('keydown', this.onKeyDown)
    this.scene.input.keyboard?.off('keyup', this.onKeyUp)
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onBlur)
    this.reset()
  }

  reset() {
    this.heldCodes.clear()
    this.pressedCodes.clear()
    this.current.clear()
    this.pressedActions.clear()
  }

  private isBound(code: string): boolean {
    return Object.values(this.bindings).some((codes) => codes.includes(code))
  }
}
