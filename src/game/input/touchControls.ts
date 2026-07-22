import Phaser from 'phaser'
import { loadSettings } from '../state/settings'
import { C, type TypeToken } from '../ui/theme'
import { text } from '../ui/widgets'
import {
  computeTouchLayout,
  heldButtonActions,
  pointInCircle,
  pointInPad,
  STEER_ZONE_SLOP,
  type CircleControl,
  type TouchLayout,
} from './touchScheme'
import type { InputManager } from './inputManager'
import type { GameAction } from './inputTypes'

const DEPTH = 1000
// forgiveness around a button before a drifting finger counts as released
const TOUCH_SLOP = 24

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
 * The steer dial is a point-to-go analog stick: its raw thumb vector goes to
 * InputManager via `setTouchStick`, and RaceScene.readPlayerInput turns it into
 * a heading-seeking steer + distance-based throttle. Fire/mine/turbo/handbrake/
 * brake go through `setTouchButton`.
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
  // analog thumb vector, screen space (y-down), clamped to the unit circle
  private stickX = 0
  private stickY = 0
  private steering = false

  private hiddenOnFinish = false
  /** live count labels on the fire/mine/turbo buttons, updated from RaceScene */
  private readonly readouts = new Map<GameAction, Phaser.GameObjects.Text>()
  /** held controls, polled each frame so a missed pointerup cannot stick */
  private readonly held: Array<{
    action: GameAction | null
    pos: CircleControl
    pointerId: number | null
    press: (pointerId: number) => void
    release: () => void
  }> = []

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
    const zoneW = pad.halfWidth * 2 + STEER_ZONE_SLOP * 2
    const zoneH = pad.halfHeight * 2 + STEER_ZONE_SLOP * 2
    // Only the initial grab is gated to the dial zone. Once grabbed, the finger
    // is tracked anywhere on screen by syncHeldButtons and released only when it
    // actually lifts — so dragging outside the dial keeps steering (floating stick).
    const steerZone = scene.add.zone(pad.x, pad.y, zoneW, zoneH).setInteractive()
    steerZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onSteerMove(p))
    steerZone.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) this.onSteerMove(p) })
    this.container.add(steerZone)

    // -- hold buttons -------------------------------------------------------
    this.addHoldButton(this.layout.brake, 'BRK', C.concrete, 'action', 'brake',
      () => this.input.setTouchButton('brake', true),
      () => this.input.setTouchButton('brake', false),
    )
    this.addHoldButton(this.layout.handbrake, 'HB', C.oxideDim, 'action', 'handbrake',
      () => this.input.setTouchButton('handbrake', true),
      () => this.input.setTouchButton('handbrake', false),
    )
    this.addHoldButton(this.layout.turbo, 'TURBO', C.turbo, 'caption', 'turbo',
      () => this.input.setTouchButton('turbo', true),
      () => this.input.setTouchButton('turbo', false),
      'subtitle', C.turbo,
    )
    if (options.weaponsEnabled) {
      this.addHoldButton(this.layout.fire, 'FIRE', C.danger, 'caption', 'fire',
        () => this.input.setTouchButton('fire', true),
        () => this.input.setTouchButton('fire', false),
        'heading', C.ammo,
      )
      this.addHoldButton(this.layout.mine, 'MINE', C.warn, 'micro', 'mine',
        () => this.input.setTouchButton('mine', true),
        () => this.input.setTouchButton('mine', false),
        'subtitle', C.textPrimary,
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
    this.addPressFeedback(pauseCircle, C.surfaceHud)
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
    this.muteCircle.on('pointerdown', () => {
      this.muteCircle.setFillStyle(C.oxide, Math.min(1, this.hitAlpha + 0.45))
    })
    this.muteCircle.on('pointerup', () => this.options.onMuteToggle())
    this.muteCircle.on('pointerout', () => this.refreshMute())
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
    this.syncHeldButtons()
    if (finished) {
      if (!this.hiddenOnFinish) {
        this.hiddenOnFinish = true
        this.container.setVisible(false)
        this.input.clearTouch()
      }
      return
    }
    // re-assert the raw stick vector every frame: InputManager.reset() (pause)
    // clears it, and a held finger produces no repeat event to restore it.
    this.input.setTouchStick(this.steering ? this.stickX : 0, this.steering ? this.stickY : 0, this.steering)
    for (const action of heldButtonActions(this.held)) this.input.setTouchButton(action, true)
  }

  destroy() {
    this.input.clearTouch()
    this.container.destroy(true)
  }

  /**
   * Derive held state from where fingers actually are, every frame. Events
   * alone are not enough: opening the pause overlay fires pointerout under a
   * still-pressed finger, and a touch that ends off-control may deliver no
   * pointerup at all. Re-acquiring from live pointers keeps the two in sync.
   */
  private syncHeldButtons() {
    const down = this.scene.input.manager.pointers.filter((p) => p.isDown)
    const owned = new Set(this.held.map((e) => e.pointerId).filter((id): id is number => id !== null))
    if (this.steerPointerId !== null) owned.add(this.steerPointerId)

    for (const entry of this.held) {
      const owner = entry.pointerId === null ? undefined : down.find((p) => p.id === entry.pointerId)
      if (owner && pointInCircle(owner.x, owner.y, entry.pos, TOUCH_SLOP)) continue
      const previous = entry.pointerId
      entry.release()
      if (previous !== null) owned.delete(previous)

      const candidate = down.find((p) => !owned.has(p.id) && pointInCircle(p.x, p.y, entry.pos))
      if (candidate) {
        entry.press(candidate.id)
        owned.add(candidate.id)
      }
    }

    // Floating stick: once a finger has grabbed the dial, follow it wherever it
    // goes (no pad bounds check) and release only when it lifts. A new grab is
    // only accepted from inside the dial zone.
    const steerOwner =
      this.steerPointerId === null ? undefined : down.find((p) => p.id === this.steerPointerId)
    if (steerOwner) {
      this.onSteerMove(steerOwner)
    } else {
      if (this.steerPointerId !== null) {
        owned.delete(this.steerPointerId)
        this.onSteerRelease({ id: this.steerPointerId } as Phaser.Input.Pointer)
      }
      const candidate = down.find(
        (p) => !owned.has(p.id) && p.wasTouch && pointInPad(p.x, p.y, this.layout.steerPad, STEER_ZONE_SLOP),
      )
      if (candidate) this.onSteerMove(candidate)
    }
  }

  private addHoldButton(
    pos: CircleControl,
    label: string,
    color: number,
    size: TypeToken,
    action: GameAction | null,
    onDown: () => void,
    onUp: () => void,
    valueSize?: TypeToken,
    valueColor: number = C.textPrimary,
  ) {
    // FIRE (the only danger-red button) reads as the primary action, so its
    // body carries a stronger accent tint than the utility buttons.
    const strong = color === C.danger
    const gfx = this.scene.add.graphics()
    const draw = (pressed: boolean) => this.drawGlossyButton(gfx, pos, color, pressed, strong)
    draw(false)

    // a fully transparent circle owns the pointer geometry; the graphics above
    // is non-interactive and just paints the glossy body.
    const hit = this.scene.add.circle(pos.x, pos.y, pos.r, 0x000000, 0.001).setInteractive()

    // dark glossy bodies take light type at full strength (>7:1 on every accent).
    // a live-count button rides its label high and shows the number below.
    const hasValue = valueSize !== undefined && action !== null
    const t = text(this.scene, pos.x, hasValue ? pos.y - pos.r * 0.42 : pos.y, label, {
      face: 'display', size, color: C.textPrimary, origin: [0.5, 0.5],
    })
    const objs: Phaser.GameObjects.GameObject[] = [gfx, hit, t]
    if (hasValue) {
      const v = text(this.scene, pos.x, pos.y + pos.r * 0.16, '', {
        face: 'mono', size: valueSize!, color: valueColor, origin: [0.5, 0.5],
      })
      this.readouts.set(action!, v)
      objs.push(v)
    }

    const entry = {
      action,
      pos,
      pointerId: null as number | null,
      press: (pointerId: number) => {
        if (entry.pointerId !== null) return
        entry.pointerId = pointerId
        draw(true)
        onDown()
      },
      release: () => {
        if (entry.pointerId === null) return
        entry.pointerId = null
        draw(false)
        onUp()
      },
    }
    this.held.push(entry)

    // pointerdown gives an immediate response; syncHeldButtons() then owns the
    // held state from live pointer positions, so a finger resting on a control
    // through a pause is re-acquired rather than left dead.
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      entry.press(p.id)
    })

    this.container.add(objs)
  }

  /** Push live ammo / mines / turbo counts onto the buttons (called each frame). */
  setReadouts(r: { ammo: number; mines: number; turbo: number }) {
    this.readouts.get('fire')?.setText(String(r.ammo))
    this.readouts.get('mine')?.setText(String(r.mines))
    this.readouts.get('turbo')?.setText(`${Math.round(r.turbo * 100)}%`)
  }

  /**
   * A round action button in the reference's glossy language: soft accent halo,
   * dark top-lit body, an accent tint (stronger for FIRE), a top sheen, and a
   * bright accent rim. All static fills — no tween, so it stays reducedFlash-safe.
   */
  private drawGlossyButton(
    g: Phaser.GameObjects.Graphics,
    pos: CircleControl,
    accent: number,
    pressed: boolean,
    strong: boolean,
  ) {
    const { x, y, r } = pos
    const a = this.hitAlpha
    g.clear()

    // accent halo
    g.fillStyle(accent, (pressed ? 0.34 : 0.16) * Math.min(1, a + 0.4))
    g.fillCircle(x, y, r + 7)

    // dark body, lit from the top
    g.fillGradientStyle(C.buttonFace, C.buttonFace, C.buttonFace2, C.buttonFace2, Math.min(1, a + 0.28))
    g.fillCircle(x, y, r)

    // accent tint — how much colour bleeds through the body
    const tint = strong ? (pressed ? 0.58 : 0.42) : pressed ? 0.32 : 0.2
    g.fillStyle(accent, tint)
    g.fillCircle(x, y, r * 0.9)

    // top sheen
    g.fillStyle(0xffffff, pressed ? 0.06 : 0.1)
    g.fillCircle(x, y - r * 0.32, r * 0.55)

    // inner depth ring + bright accent rim
    g.lineStyle(2, C.surfaceHud, 0.55)
    g.strokeCircle(x, y, r - 6)
    g.lineStyle(pressed ? 5 : 4, accent, Math.min(1, a + 0.5))
    g.strokeCircle(x, y, r - 2)
  }

  private onSteerMove(p: Phaser.Input.Pointer) {
    // isTouchDevice() is true on hybrid laptops; a mouse must never drive the
    // car with a throttle it cannot release, so only a real touch grabs the stick.
    if (!p.wasTouch) return
    this.steerPointerId = p.id
    const pad = this.layout.steerPad
    let dx = (p.x - pad.x) / pad.halfWidth
    let dy = (p.y - pad.y) / pad.halfWidth
    const len = Math.hypot(dx, dy)
    if (len > 1) { dx /= len; dy /= len }
    this.stickX = dx
    this.stickY = dy
    this.steering = true
    this.drawPad()
  }

  private onSteerRelease(p: Phaser.Input.Pointer) {
    if (this.steerPointerId !== null && p.id !== this.steerPointerId) return
    this.steerPointerId = null
    this.stickX = 0
    this.stickY = 0
    this.steering = false
    this.drawPad()
  }

  /**
   * The round point-to-go stick. The knob follows the thumb across the whole
   * disc; each rim arrow lights amber in proportion to how far the stick points
   * that way, so the player sees the aimed direction. All static fills —
   * reducedFlash-safe.
   */
  private drawPad() {
    const { x, y, halfWidth } = this.layout.steerPad
    const r = halfWidth
    const a = this.hitAlpha
    const g = this.padGfx
    g.clear()

    // faint outer halo, dark top-lit body, twin rings
    g.fillStyle(C.oxide, 0.1)
    g.fillCircle(x, y, r + 6)
    g.fillGradientStyle(C.buttonFace, C.buttonFace, C.buttonFace2, C.buttonFace2, Math.min(1, a + 0.24))
    g.fillCircle(x, y, r)
    g.lineStyle(4, C.oxide, Math.min(1, a + 0.4))
    g.strokeCircle(x, y, r - 2)
    g.lineStyle(2, C.line, 0.7)
    g.strokeCircle(x, y, r * 0.62)

    // rim arrows, each lit by the stick's component toward it
    const ar = r * 0.78 // arrow tip distance from center
    const s = r * 0.12 // arrow half-size
    const base = 0.28
    const arrow = (comp: number) => ({
      color: comp > 0.05 ? C.amber : C.textPrimary,
      alpha: comp > 0.05 ? Math.min(1, base + comp * 0.72) : base,
    })
    const up = arrow(-this.stickY)
    g.fillStyle(up.color, up.alpha)
    g.fillTriangle(x, y - ar - s, x - s, y - ar + s, x + s, y - ar + s)
    const dn = arrow(this.stickY)
    g.fillStyle(dn.color, dn.alpha)
    g.fillTriangle(x, y + ar + s, x - s, y + ar - s, x + s, y + ar - s)
    const lf = arrow(-this.stickX)
    g.fillStyle(lf.color, lf.alpha)
    g.fillTriangle(x - ar - s, y, x - ar + s, y - s, x - ar + s, y + s)
    const rt = arrow(this.stickX)
    g.fillStyle(rt.color, rt.alpha)
    g.fillTriangle(x + ar + s, y, x + ar - s, y - s, x + ar - s, y + s)

    // knob follows the thumb across the disc
    const knobR = r * 0.33
    const travel = r - knobR - 6
    const kx = x + this.stickX * travel
    const ky = y + this.stickY * travel
    g.fillStyle(C.oxideDim, 0.9)
    g.fillCircle(kx, ky, knobR + 3)
    g.fillGradientStyle(C.oxide, C.oxide, C.oxideDim, C.oxideDim, 1)
    g.fillCircle(kx, ky, knobR)
    g.lineStyle(2, C.buttonFace2, 0.7)
    g.strokeCircle(kx, ky, knobR * 0.55)
    g.fillStyle(0xffffff, 0.18)
    g.fillCircle(kx, ky - knobR * 0.32, knobR * 0.45)
  }

  /** Tap feedback for the momentary system buttons, which have no held state. */
  private addPressFeedback(circle: Phaser.GameObjects.Arc, base: number) {
    circle.on('pointerdown', () => circle.setFillStyle(C.oxide, Math.min(1, this.hitAlpha + 0.45)))
    const restore = () => circle.setFillStyle(base, this.hitAlpha)
    circle.on('pointerup', restore)
    circle.on('pointerout', restore)
  }

  /** Repaint the mute button — also called when mute is toggled by keyboard. */
  refreshMute() {
    const muted = loadSettings().muted
    this.muteLabel.setText(muted ? 'UNMUTE' : 'MUTE')
    this.muteCircle.setFillStyle(muted ? C.danger : C.surfaceHud, this.hitAlpha)
  }
}
