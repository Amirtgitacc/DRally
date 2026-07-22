import Phaser from 'phaser'
import { loadSettings } from '../state/settings'
import type { GameAction, SerializedBindings } from './inputTypes'
import { joystickToActions } from './joystickMap'

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
  private touchAxisX = 0
  private touchAxisY = 0
  private touchButtons = new Set<GameAction>()
  // analog point-to-go stick: raw thumb vector, consumed directionally by
  // RaceScene.readPlayerInput (bypasses the boolean joystickToActions path).
  private touchStickX = 0
  private touchStickY = 0
  private touchStickActive = false

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
    const drive = joystickToActions(this.touchAxisX, this.touchAxisY)

    for (const [action, codes] of Object.entries(this.bindings) as Array<[GameAction, string[]]>) {
      const wasDown = this.current.get(action) ?? false

      let down = codes.some((code) => this.heldCodes.has(code))
      const button = GAMEPAD_BUTTON[action]
      if (button !== undefined) down ||= pad?.buttons[button]?.pressed === true
      if (action === 'accelerate') down ||= axisY < -0.35 || (pad?.buttons[7]?.value ?? 0) > 0.25
      if (action === 'brake') down ||= axisY > 0.35 || (pad?.buttons[6]?.value ?? 0) > 0.25
      if (action === 'steerLeft') down ||= axisX < -0.3
      if (action === 'steerRight') down ||= axisX > 0.3

      // touch source: joystick for drive actions, button set for the rest
      if (action === 'accelerate') down ||= drive.accelerate
      else if (action === 'brake') down ||= drive.brake || this.touchButtons.has('brake')
      else if (action === 'steerLeft') down ||= drive.steerLeft
      else if (action === 'steerRight') down ||= drive.steerRight
      else down ||= this.touchButtons.has(action)

      this.current.set(action, down)
      this.pressedActions.set(action, codes.some((code) => this.pressedCodes.has(code)) || (down && !wasDown))
    }

    this.pressedCodes.clear()
  }

  setTouchAxis(x: number, y: number): void {
    this.touchAxisX = x
    this.touchAxisY = y
  }

  setTouchButton(action: GameAction, down: boolean): void {
    if (down) this.touchButtons.add(action)
    else this.touchButtons.delete(action)
  }

  /** Raw analog thumb vector for the point-to-go stick (screen space, y-down). */
  setTouchStick(x: number, y: number, active: boolean): void {
    this.touchStickX = x
    this.touchStickY = y
    this.touchStickActive = active
  }

  touchStick(): { x: number; y: number; active: boolean } {
    return { x: this.touchStickX, y: this.touchStickY, active: this.touchStickActive }
  }

  clearTouch(): void {
    this.touchAxisX = 0
    this.touchAxisY = 0
    this.touchStickX = 0
    this.touchStickY = 0
    this.touchStickActive = false
    this.touchButtons.clear()
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
    this.clearTouch()
  }

  private isBound(code: string): boolean {
    return Object.values(this.bindings).some((codes) => codes.includes(code))
  }
}
