import Phaser from 'phaser'
import { loadSettings } from '../state/settings'
import { C, type TypeToken } from '../ui/theme'
import { text } from '../ui/widgets'
import {
  computeTouchLayout,
  driveAxisFromTouch,
  isSchemeActive,
  resolveThrottle,
  steerFromPad,
  type CircleControl,
  type TouchLayout,
} from './touchScheme'
import type { InputManager } from './inputManager'

const DEPTH = 1000
// interactive zone padding around the visual pad so a finger landing just
// outside the drawn rect still registers (matches the "~40px slop" spec)
const STEER_ZONE_SLOP = 40

export interface TouchControlsOptions {
  onPause: () => void
  onMuteToggle: () => void
  weaponsEnabled: boolean
}

/**
 * On-screen touch controls for race play, laid out by the pure `touchScheme`
 * module (position/hit-testing only — no Phaser there). This class is purely
 * presentation + Phaser input plumbing: it owns the visuals, tracks pointers
 * per control so multi-touch chords work, and every frame re-asserts the
 * drive axis into InputManager via `update()`.
 *
 * Steering and throttle MUST go through `setTouchAxis` — InputManager derives
 * accelerate/brake/steerLeft/steerRight only from the touch axis, never from
 * the touch button set (see inputManager.ts). Only fire/mine/turbo/handbrake
 * go through `setTouchButton`.
 *
 * All objects live inside one container added to the fixed HUD layer (the
 * non-scrolling hudCam), at DEPTH above the rest of the HUD but below the
 * results overlay (5000).
 */
export class TouchControls {
  private readonly container: Phaser.GameObjects.Container
  private readonly layout: TouchLayout
  private readonly hitAlpha: number

  private readonly padGfx: Phaser.GameObjects.Graphics
  private steerPointerId: number | null = null
  private steer: -1 | 0 | 1 = 0

  private braking = false
  private hiddenOnFinish = false
  private engaged = false
  /** held controls, polled each frame so a missed pointerup cannot stick */
  private readonly held: Array<{ pointerId: number | null; release: () => void }> = []

  private readonly muteCircle: Phaser.GameObjects.Arc
  private readonly muteLabel: Phaser.GameObjects.Text

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private readonly input: InputManager,
    private readonly options: TouchControlsOptions,
  ) {
    // allow simultaneous touches (steer + brake + fire + turbo). addPointer
    // accumulates toward Phaser's cap, so only top up to the target rather
    // than adding every race.
    const WANTED_POINTERS = 4
    const missing = WANTED_POINTERS - scene.input.manager.pointersTotal
    if (missing > 0) scene.input.addPointer(missing)

    const settings = loadSettings()
    this.hitAlpha = Math.max(settings.touchOpacity, 0.2)
    this.layout = computeTouchLayout(settings.touchMirrored)

    this.container = scene.add.container(0, 0).setDepth(DEPTH)
    layer.add(this.container)

    // -- steer pad --------------------------------------------------------
    this.padGfx = scene.add.graphics()
    this.container.add(this.padGfx)
    this.drawPad()

    const pad = this.layout.steerPad
    const leftArrow = text(scene, pad.x - pad.halfWidth * 0.5, pad.y, '<', {
      face: 'display', size: 'heading', color: C.textPrimary, origin: [0.5, 0.5],
    })
    const rightArrow = text(scene, pad.x + pad.halfWidth * 0.5, pad.y, '>', {
      face: 'display', size: 'heading', color: C.textPrimary, origin: [0.5, 0.5],
    })
    this.container.add([leftArrow, rightArrow])

    const zoneW = pad.halfWidth * 2 + STEER_ZONE_SLOP * 2
    const zoneH = pad.halfHeight * 2 + STEER_ZONE_SLOP * 2
    const steerZone = scene.add.zone(pad.x, pad.y, zoneW, zoneH).setInteractive()
    steerZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onSteerMove(p))
    steerZone.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) this.onSteerMove(p) })
    steerZone.on('pointerup', (p: Phaser.Input.Pointer) => this.onSteerRelease(p))
    steerZone.on('pointerout', (p: Phaser.Input.Pointer) => this.onSteerRelease(p))
    this.container.add(steerZone)

    // -- hold buttons -------------------------------------------------------
    this.addHoldButton(this.layout.brake, 'BRK', C.concrete, 'action',
      () => { this.braking = true },
      () => { this.braking = false },
    )
    this.addHoldButton(this.layout.handbrake, 'HB', C.oxideDim, 'action',
      () => this.input.setTouchButton('handbrake', true),
      () => this.input.setTouchButton('handbrake', false),
    )
    this.addHoldButton(this.layout.turbo, 'TURBO', C.turbo, 'caption',
      () => this.input.setTouchButton('turbo', true),
      () => this.input.setTouchButton('turbo', false),
    )
    if (options.weaponsEnabled) {
      this.addHoldButton(this.layout.fire, 'FIRE', C.danger, 'subtitle',
        () => this.input.setTouchButton('fire', true),
        () => this.input.setTouchButton('fire', false),
      )
      this.addHoldButton(this.layout.mine, 'MINE', C.warn, 'micro',
        () => this.input.setTouchButton('mine', true),
        () => this.input.setTouchButton('mine', false),
      )
    }

    // -- pause --------------------------------------------------------------
    const pausePos = this.layout.pause
    const pauseCircle = scene.add
      .circle(pausePos.x, pausePos.y, pausePos.r, C.surfaceHud, this.hitAlpha)
      .setStrokeStyle(3, C.oxide, Math.min(1, this.hitAlpha + 0.3))
      .setInteractive()
    const pauseLabel = text(scene, pausePos.x, pausePos.y, 'II', {
      face: 'display', size: 'subtitle', color: C.textPrimary, origin: [0.5, 0.5],
    })
    pauseCircle.on('pointerup', () => this.options.onPause())
    this.container.add([pauseCircle, pauseLabel])

    // -- mute -----------------------------------------------------------
    const mutePos = this.layout.mute
    this.muteCircle = scene.add
      .circle(mutePos.x, mutePos.y, mutePos.r, C.surfaceHud, this.hitAlpha)
      .setStrokeStyle(3, C.oxide, Math.min(1, this.hitAlpha + 0.3))
      .setInteractive()
    this.muteLabel = text(scene, mutePos.x, mutePos.y, 'MUTE', {
      face: 'display', size: 'micro', color: C.textPrimary, origin: [0.5, 0.5],
    })
    this.muteCircle.on('pointerup', () => {
      this.options.onMuteToggle()
      this.refreshMute()
    })
    this.container.add([this.muteCircle, this.muteLabel])
    this.refreshMute()
  }

  /**
   * Called every frame by the scene, immediately before InputManager.update().
   * Re-asserts the drive axis unconditionally: InputManager.reset() (which
   * runs on pause) clears the touch axis, and without this per-frame
   * reassertion the car would stop responding to a held pad after resume
   * until the next touch event.
   */
  update(finished: boolean) {
    this.releaseStalePointers()
    const schemeActive = isSchemeActive(this.engaged, finished)
    const throttle = resolveThrottle({ schemeActive, braking: this.braking })
    const axis = driveAxisFromTouch(this.steer, throttle)
    this.input.setTouchAxis(axis.x, axis.y)

    if (finished && !this.hiddenOnFinish) {
      this.hiddenOnFinish = true
      this.container.setVisible(false)
      this.input.clearTouch()
    }
  }

  destroy() {
    this.input.clearTouch()
    this.container.destroy(true)
  }

  /**
   * A pointerup can be missed when the scene pauses under a held finger, or
   * when a touch ends outside its control. Polling pointer liveness stops a
   * held action from sticking on after the finger is gone.
   */
  private releaseStalePointers() {
    for (const entry of this.held) {
      if (entry.pointerId === null) continue
      const pointer = this.scene.input.manager.pointers.find((p) => p.id === entry.pointerId)
      if (!pointer || !pointer.isDown) entry.release()
    }
    if (this.steerPointerId !== null) {
      const pointer = this.scene.input.manager.pointers.find((p) => p.id === this.steerPointerId)
      if (!pointer || !pointer.isDown) {
        this.steerPointerId = null
        this.steer = 0
        this.drawPad()
      }
    }
  }

  private addHoldButton(
    pos: CircleControl,
    label: string,
    color: number,
    size: TypeToken,
    onDown: () => void,
    onUp: () => void,
  ) {
    const circle = this.scene.add
      .circle(pos.x, pos.y, pos.r, color, this.hitAlpha)
      .setStrokeStyle(3, color, Math.min(1, this.hitAlpha + 0.3))
      .setInteractive()
    const t = text(this.scene, pos.x, pos.y, label, {
      face: 'display', size, color: C.textPrimary, origin: [0.5, 0.5],
    })

    const entry: { pointerId: number | null; release: () => void } = {
      pointerId: null,
      release: () => {
        entry.pointerId = null
        circle.setFillStyle(color, this.hitAlpha)
        onUp()
      },
    }
    this.held.push(entry)

    circle.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.engaged = true
      entry.pointerId = p.id
      circle.setFillStyle(color, Math.min(1, this.hitAlpha + 0.45))
      onDown()
    })
    const onPointerRelease = (p: Phaser.Input.Pointer) => {
      if (entry.pointerId !== null && p.id !== entry.pointerId) return
      entry.release()
    }
    circle.on('pointerup', onPointerRelease)
    circle.on('pointerout', onPointerRelease)

    this.container.add([circle, t])
  }

  private onSteerMove(p: Phaser.Input.Pointer) {
    this.engaged = true
    this.steerPointerId = p.id
    const { steerLeft, steerRight } = steerFromPad(p.x, this.layout.steerPad)
    this.steer = steerLeft ? -1 : steerRight ? 1 : 0
    this.drawPad()
  }

  private onSteerRelease(p: Phaser.Input.Pointer) {
    if (this.steerPointerId !== null && p.id !== this.steerPointerId) return
    this.steerPointerId = null
    this.steer = 0
    this.drawPad()
  }

  private drawPad() {
    const { x, y, halfWidth, halfHeight } = this.layout.steerPad
    const left = x - halfWidth
    const top = y - halfHeight
    const w = halfWidth * 2
    const h = halfHeight * 2
    const radius = 16

    this.padGfx.clear()
    this.padGfx.fillStyle(C.surfaceHud, this.hitAlpha)
    this.padGfx.fillRoundedRect(left, top, w, h, radius)

    // steady tint on the active half — no tweened flash (reducedFlash-safe)
    if (this.steer !== 0) {
      const highlightAlpha = Math.min(1, this.hitAlpha + 0.35)
      this.padGfx.fillStyle(C.amber, highlightAlpha)
      if (this.steer < 0) {
        this.padGfx.fillRoundedRect(left, top, halfWidth, h, { tl: radius, bl: radius, tr: 0, br: 0 })
      } else {
        this.padGfx.fillRoundedRect(x, top, halfWidth, h, { tl: 0, bl: 0, tr: radius, br: radius })
      }
    }

    this.padGfx.lineStyle(3, C.oxide, Math.min(1, this.hitAlpha + 0.3))
    this.padGfx.strokeRoundedRect(left, top, w, h, radius)
  }

  private refreshMute() {
    const muted = loadSettings().muted
    this.muteLabel.setText(muted ? 'UNMUTE' : 'MUTE')
    this.muteCircle.setFillStyle(muted ? C.danger : C.surfaceHud, this.hitAlpha)
  }
}
