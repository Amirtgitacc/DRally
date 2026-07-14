import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { C, FONT_DISPLAY } from '../ui/theme'
import type { GameAction } from './inputTypes'
import type { InputManager } from './inputManager'

const JOY_CX = 300
const JOY_CY = GAME_HEIGHT - 300
const JOY_RADIUS = 160
const BTN_X = GAME_WIDTH - 220
const DEPTH = 1000

/**
 * Semi-transparent on-screen controls for touch play. Left: a virtual joystick
 * feeding the drive axis. Right: FIRE / MINE / TURBO. Plus a pause button.
 *
 * All objects live inside the fixed HUD container (the non-scrolling hudCam),
 * so they sit at fixed 1920x1080 coords and are addressed with screen-space
 * pointer coords — the scrolling race camera never moves them. Everything feeds
 * InputManager's touch source; the sim never sees touch directly.
 */
export class TouchControls {
  private readonly objects: Phaser.GameObjects.GameObject[] = []
  private readonly thumb: Phaser.GameObjects.Arc
  private joyPointerId: number | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly input: InputManager,
    onPause: () => void,
  ) {
    // allow simultaneous touches (steer + fire + turbo) — default is a single pointer
    scene.input.addPointer(2)

    // joystick base + thumb
    const base = scene.add.circle(JOY_CX, JOY_CY, JOY_RADIUS, C.surfaceHud, 0.35).setStrokeStyle(3, C.oxide, 0.5)
    this.thumb = scene.add.circle(JOY_CX, JOY_CY, 60, C.oxide, 0.5)
    const joyZone = scene.add.zone(JOY_CX, JOY_CY, JOY_RADIUS * 2.4, JOY_RADIUS * 2.4).setInteractive()
    joyZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onJoyMove(p))
    joyZone.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) this.onJoyMove(p) })
    joyZone.on('pointerup', (p: Phaser.Input.Pointer) => this.onJoyRelease(p))
    joyZone.on('pointerout', (p: Phaser.Input.Pointer) => this.onJoyRelease(p))
    this.objects.push(base, this.thumb, joyZone)

    // right cluster: FIRE / MINE / TURBO (hold to press)
    this.button('FIRE', BTN_X, GAME_HEIGHT - 420, C.danger, 'fire')
    this.button('MINE', BTN_X, GAME_HEIGHT - 280, C.warn, 'mine')
    this.button('TURBO', BTN_X, GAME_HEIGHT - 140, C.turbo, 'turbo')

    // pause, top-right (top-left holds cash/HUD readouts)
    const pause = scene.add.circle(GAME_WIDTH - 70, 70, 44, C.surfaceHud, 0.5).setStrokeStyle(2, C.oxide, 0.6).setInteractive()
    const pauseIcon = scene.add
      .text(GAME_WIDTH - 70, 68, 'II', { fontFamily: FONT_DISPLAY, fontSize: '34px', color: '#e8e8f0' })
      .setOrigin(0.5)
    pause.on('pointerup', onPause)
    this.objects.push(pause, pauseIcon)

    this.objects.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH))
    this.layer.add(this.objects)
  }

  private button(label: string, x: number, y: number, color: number, action: GameAction) {
    const r = this.scene.add.circle(x, y, 62, color, 0.28).setStrokeStyle(3, color, 0.7).setInteractive()
    const t = this.scene.add
      .text(x, y, label, { fontFamily: FONT_DISPLAY, fontSize: '22px', color: '#e8e8f0' })
      .setOrigin(0.5)
    r.on('pointerdown', () => { this.input.setTouchButton(action, true); r.setFillStyle(color, 0.6) })
    const release = () => { this.input.setTouchButton(action, false); r.setFillStyle(color, 0.28) }
    r.on('pointerup', release)
    r.on('pointerout', release)
    r.setDepth(DEPTH)
    t.setDepth(DEPTH)
    this.objects.push(r, t)
  }

  private onJoyMove(p: Phaser.Input.Pointer) {
    this.joyPointerId = p.id
    // screen-space coords — the controls live on the fixed HUD camera
    const dx = Phaser.Math.Clamp((p.x - JOY_CX) / JOY_RADIUS, -1, 1)
    const dy = Phaser.Math.Clamp((p.y - JOY_CY) / JOY_RADIUS, -1, 1)
    this.input.setTouchAxis(dx, dy)
    this.thumb.setPosition(JOY_CX + dx * JOY_RADIUS, JOY_CY + dy * JOY_RADIUS)
  }

  private onJoyRelease(p: Phaser.Input.Pointer) {
    if (this.joyPointerId !== null && p.id !== this.joyPointerId) return
    this.joyPointerId = null
    this.input.setTouchAxis(0, 0)
    this.thumb.setPosition(JOY_CX, JOY_CY)
  }

  destroy() {
    this.input.clearTouch()
    this.objects.forEach((o) => o.destroy())
  }
}
