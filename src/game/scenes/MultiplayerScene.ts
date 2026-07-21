import Phaser from 'phaser'
import { GAME_HEIGHT } from '../../config/game'
import { MP_CAR_OPTIONS } from '../../data/mpCars'
import { ALL_TRACKS } from '../../data/tracks'
import { isValidRoomCode, normalizeRoomCode } from '../../core/net/roomCode'
import { NetClient } from '../net/netClient'
import type { ServerMsg } from '../../core/net/protocol'
import { C, hex } from '../ui/theme'
import { fitImage, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { artToCanvas } from '../ui/backgroundTransform'
import { posterTextureFor } from '../textures/loadedAssets'
import { openNativeText } from '../ui/nativeInput'
import { isTouchDevice } from '../input/device'
import * as glyph from '../ui/glyphs'
import {
  backPlate, notchedButton, screenTitle, SAFE, TOUCH, type ButtonHandle,
} from '../ui/mobile'

const NAME_KEY = 'deathrally-mp-name'
const CAR_KEY = 'deathrally-mp-car'
const LIVERY_KEY = 'deathrally-mp-livery'
const NAME_MAX = 16
const CODE_MAX = 12
const ROW_COUNT = 6
const NAME_ROW = 0
const CAR_ROW = 1
const LIVERY_ROW = 2
const CODE_ROW = 3
const CREATE_ROW = 4
const JOIN_ROW = 5

// Quick-race car choices (MP_CAR_OPTIONS) = the single-player catalog plus
// MP-only guest cars (currently just the 206 Anahita — see src/data/mpCars.ts).

// The bg-mp template bakes an empty steel poster frame into its right third;
// the selected livery's poster is drawn inside it. Art-space rect of the
// frame's inner matte area (bg-mp is authored at 1536×1024), mapped to canvas
// space through the background's cover transform at create time.
const POSTER_FRAME = { cx: 1224, cy: 486, w: 300, h: 505 }

// Left form column geometry (kept clear of the baked poster frame on the right).
const FORM_W = 820
const FORM_CX = SAFE.left + FORM_W / 2

// Field-row glyphs (labels always accompany them, so meaning never rests on the icon).
const ROW_GLYPHS = [glyph.skull, glyph.tire, glyph.spray, glyph.pin]

/**
 * Career-independent entry point for online quick-race: pick a driver name and
 * car, then create a fresh room or join one by code. Never touches career
 * (`deathrally-career*`) storage — only the dedicated `deathrally-mp-*` keys.
 */
export class MultiplayerScene extends Phaser.Scene {
  private selected = 0
  private name = ''
  private carIndex = 0
  private liveryIndex = 0
  private code = ''
  private busy = false
  private rows: ButtonHandle[] = []
  private statusText!: Phaser.GameObjects.Text
  private helperText!: Phaser.GameObjects.Text
  private previewLabel!: Phaser.GameObjects.Text
  private carArt!: Phaser.GameObjects.Image
  private posterMaxW = 0
  private posterMaxH = 0
  private disposeNativeInput?: () => void
  /** The in-flight (not-yet-joined) client, if any — ours to close on error/back-out. */
  private pendingNet?: NetClient
  /** This scene's own listeners on the current client, tracked so shutdown can
   *  detach them — even after ownership of `net` passes to LobbyScene (our
   *  closures would otherwise linger on the handed-off client). */
  private netHandlers?: { net: NetClient; onMsg: (m: ServerMsg) => void; onClose: () => void }

  constructor() {
    super('Multiplayer')
  }

  /** The car currently shown/selected, across the catalog + MP-only cars. */
  private currentCar() {
    return MP_CAR_OPTIONS[this.carIndex]
  }

  /** The chosen livery variant key ('base' | 'a' | 'b'), sent as `variantId`
   *  on the create/join network messages. */
  get livery(): string {
    const car = this.currentCar()
    return car.variants[this.liveryIndex]?.key ?? car.variants[0]?.key ?? 'base'
  }

  create() {
    this.selected = 0
    this.busy = false
    this.rows = []
    this.pendingNet = undefined
    this.netHandlers = undefined
    this.disposeNativeInput = undefined

    this.name = localStorage.getItem(NAME_KEY)?.slice(0, NAME_MAX) ?? ''
    const savedCarId = localStorage.getItem(CAR_KEY)
    const savedCarIndex = savedCarId ? MP_CAR_OPTIONS.findIndex((c) => c.id === savedCarId) : -1
    this.carIndex = savedCarIndex >= 0 ? savedCarIndex : 0
    const savedLiveryKey = localStorage.getItem(LIVERY_KEY)
    const savedLiveryIndex = savedLiveryKey
      ? this.currentCar().variants.findIndex((v) => v.key === savedLiveryKey)
      : -1
    this.liveryIndex = savedLiveryIndex >= 0 ? savedLiveryIndex : 0
    this.code = ''

    const cx = FORM_CX
    const bg = sceneBackground(this, 'bg-mp', { veil: 0.42 })

    // ---- title + standalone-mode note ----
    screenTitle(this, 'MULTIPLAYER · QUICK RACE', { x: SAFE.left, y: 108 })
    text(this, SAFE.left, 176, '⚠  CAREER PROGRESS IS UNTOUCHED', {
      size: 'caption', face: 'display', weight: 600, letterSpacing: 3, color: C.oxide, origin: [0, 0.5],
    })

    // ---- field rows (0..3): label left, value right, with a leading glyph ----
    const rowH = TOUCH.minH + 8
    const rowY = [300, 412, 524, 636]
    const rowLabels = ['DRIVER NAME', 'CAR', 'LIVERY', 'ROOM CODE']
    for (let i = 0; i < 4; i++) {
      this.rows.push(notchedButton(this, cx, rowY[i], {
        w: FORM_W, h: rowH, label: rowLabels[i], value: '', valueColor: C.textPrimary,
        glyph: ROW_GLYPHS[i], size: 'action', align: 'left',
        onFocus: () => { this.selected = i; this.refresh() },
        onActivate: () => { this.selected = i; this.activateSelected() },
      }))
    }

    // caption under ROOM CODE (dynamic CREATE-mode note lives here)
    this.helperText = text(this, cx, 700, '', {
      size: 'caption', color: C.textSecondary, origin: [0.5, 0.5],
    })

    // ---- two equally-prominent primary actions: CREATE ROOM · JOIN ROOM ----
    const actW = (FORM_W - 20) / 2
    const actH = 104
    const actY = 792
    this.rows.push(notchedButton(this, cx - actW / 2 - 10, actY, {
      w: actW, h: actH, label: 'CREATE ROOM', size: 'title', align: 'center', variant: 'primary',
      onFocus: () => { this.selected = CREATE_ROW; this.refresh() },
      onActivate: () => { this.selected = CREATE_ROW; this.activateSelected() },
    }))
    this.rows.push(notchedButton(this, cx + actW / 2 + 10, actY, {
      w: actW, h: actH, label: 'JOIN ROOM', size: 'title', align: 'center', variant: 'primary',
      onFocus: () => { this.selected = JOIN_ROW; this.refresh() },
      onActivate: () => { this.selected = JOIN_ROW; this.activateSelected() },
    }))

    // status / error line, under the actions
    this.statusText = text(this, cx, 880, '', {
      size: 'body', color: C.danger, origin: [0.5, 0.5], wordWrapWidth: FORM_W, align: 'center',
    })

    // ---- car poster, inside the frame baked into the template art ----
    const t = bg.transform()
    const frameCenter = artToCanvas(t, POSTER_FRAME.cx, POSTER_FRAME.cy)
    this.posterMaxW = POSTER_FRAME.w * t.scale
    this.posterMaxH = POSTER_FRAME.h * t.scale
    this.carArt = this.add.image(frameCenter.x, frameCenter.y, posterTextureFor(this.currentCar().id, this.livery))
    fitImage(this.carArt, this.posterMaxW, this.posterMaxH)
    this.previewLabel = text(this, frameCenter.x, frameCenter.y + this.posterMaxH / 2 + 34, '', {
      size: 'action', face: 'display', weight: 700, letterSpacing: 2, color: C.oxide, origin: [0.5, 0.5],
    })

    // deep link: prefill + focus JOIN when the URL carries a valid ?room= code
    const roomParam = new URLSearchParams(window.location.search).get('room')
    if (roomParam) {
      const normalized = normalizeRoomCode(roomParam)
      if (isValidRoomCode(normalized)) {
        this.code = normalized
        this.selected = JOIN_ROW
      }
    }

    backPlate(this, 'MAIN', () => this.backToMenu())

    // Touch and keyboard need different guidance — the keyboard hint is noise on
    // a phone, and it was rendered too small to read there anyway.
    const hint = isTouchDevice()
      ? 'Tap a field to edit  ·  tap the car to change it  ·  tap CREATE or JOIN'
      : 'Type to edit name/code  ·  ←/→ change car/livery  ·  ↑/↓ navigate  ·  Enter select  ·  Esc back'
    text(this, cx, GAME_HEIGHT - 34, hint, {
      size: 'body', face: 'mono', color: C.textSecondary, origin: [0.5, 0.5], wordWrapWidth: FORM_W + 40, align: 'center',
    })

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => {
      kb.off('keydown', onKey)
      this.disposeNativeInput?.()
      this.disposeNativeInput = undefined
      // Detach our own client listeners so they never linger on a client handed
      // off to LobbyScene or discarded on a failed attempt.
      if (this.netHandlers) {
        this.netHandlers.net.offMessage(this.netHandlers.onMsg)
        this.netHandlers.net.offClose(this.netHandlers.onClose)
        this.netHandlers = undefined
      }
    })

    this.refresh()
  }

  private handleKey(event: KeyboardEvent) {
    // while the native (OS) keyboard owns text entry, ignore physical keys so
    // characters aren't counted twice (once via the input, once here).
    if (this.disposeNativeInput) return
    if (event.code === 'ArrowUp') this.selected = (this.selected + ROW_COUNT - 1) % ROW_COUNT
    else if (event.code === 'ArrowDown') this.selected = (this.selected + 1) % ROW_COUNT
    else if (event.code === 'ArrowLeft' && this.selected === CAR_ROW) this.changeCar(-1)
    else if (event.code === 'ArrowRight' && this.selected === CAR_ROW) this.changeCar(1)
    else if (event.code === 'ArrowLeft' && this.selected === LIVERY_ROW) this.changeLivery(-1)
    else if (event.code === 'ArrowRight' && this.selected === LIVERY_ROW) this.changeLivery(1)
    else if (event.code === 'Backspace' && this.selected === NAME_ROW) this.name = this.name.slice(0, -1)
    else if (event.code === 'Backspace' && this.selected === CODE_ROW) this.code = this.code.slice(0, -1)
    else if (event.code === 'Enter' && this.selected === CREATE_ROW) this.attemptCreate()
    else if (event.code === 'Enter' && this.selected === JOIN_ROW) this.attemptJoin()
    else if (event.code === 'Escape') this.backToMenu()
    else if (this.selected === NAME_ROW && event.key.length === 1 && /[a-zA-Z0-9 _-]/.test(event.key) && this.name.length < NAME_MAX) this.name += event.key
    else if (this.selected === CODE_ROW && event.key.length === 1 && /[a-zA-Z0-9 _-]/.test(event.key) && this.code.length < CODE_MAX) this.code += event.key.toUpperCase()
    this.refresh()
  }

  /** What tapping the currently-selected row does (mirrors the Enter/←→ keyboard path). */
  private activateSelected() {
    if (isTouchDevice() && (this.selected === NAME_ROW || this.selected === CODE_ROW)) {
      const isName = this.selected === NAME_ROW
      this.disposeNativeInput?.()
      this.disposeNativeInput = openNativeText({
        value: isName ? this.name : this.code,
        maxLength: isName ? NAME_MAX : CODE_MAX,
        onChange: (v) => { if (isName) this.name = v; else this.code = v.toUpperCase(); this.refresh() },
        onDone: () => { this.disposeNativeInput?.(); this.disposeNativeInput = undefined },
      })
      return
    }
    if (this.selected === CAR_ROW) { this.changeCar(1); this.refresh(); return }
    if (this.selected === LIVERY_ROW) { this.changeLivery(1); this.refresh(); return }
    if (this.selected === CREATE_ROW) { this.attemptCreate(); return }
    if (this.selected === JOIN_ROW) { this.attemptJoin(); return }
  }

  private changeCar(delta: number) {
    this.carIndex = (this.carIndex + delta + MP_CAR_OPTIONS.length) % MP_CAR_OPTIONS.length
    this.liveryIndex = 0 // new chassis — always back to its Factory/base livery
  }

  private changeLivery(delta: number) {
    const variants = this.currentCar().variants
    if (variants.length <= 1) return // e.g. Anahita only has 'base' — nothing to cycle
    this.liveryIndex = (this.liveryIndex + delta + variants.length) % variants.length
  }

  /** Attach this scene's message/close listeners to a fresh client and record
   *  them so shutdown can detach exactly these closures. */
  private wireNet(net: NetClient) {
    const onMsg = (msg: ServerMsg) => this.handleMessage(msg, net)
    const onClose = () => this.handleUnexpectedClose(net)
    net.onMessage(onMsg)
    net.onClose(onClose)
    this.netHandlers = { net, onMsg, onClose }
  }

  private async attemptCreate() {
    if (this.busy) return
    const name = this.name.trim()
    if (!name) { this.setStatus('Enter a driver name first.'); return }

    this.busy = true
    this.setStatus('')
    this.refresh()

    const net = new NetClient()
    this.pendingNet = net
    try {
      await net.connect()
    } catch {
      this.finishAttempt(net, 'Could not reach the multiplayer server.')
      return
    }
    this.wireNet(net)
    net.send({ t: 'create', name, carId: this.currentCar().id, trackId: ALL_TRACKS[0].id, variantId: this.livery })
  }

  private async attemptJoin() {
    if (this.busy) return
    const name = this.name.trim()
    if (!name) { this.setStatus('Enter a driver name first.'); return }
    const code = normalizeRoomCode(this.code)
    if (!isValidRoomCode(code)) { this.setStatus('Enter a valid room code, e.g. TIGER-42.'); return }

    this.busy = true
    this.setStatus('')
    this.refresh()

    const net = new NetClient()
    this.pendingNet = net
    try {
      await net.connect()
    } catch {
      this.finishAttempt(net, 'Could not reach the multiplayer server.')
      return
    }
    this.wireNet(net)
    net.send({ t: 'join', code, name, carId: this.currentCar().id, variantId: this.livery })
  }

  private handleMessage(msg: ServerMsg, net: NetClient) {
    if (this.pendingNet !== net) return
    if (msg.t === 'joined') {
      localStorage.setItem(NAME_KEY, this.name.trim())
      localStorage.setItem(CAR_KEY, this.currentCar().id)
      localStorage.setItem(LIVERY_KEY, this.livery)
      this.pendingNet = undefined
      // ownership of `net` passes to LobbyScene — do not close it here.
      this.scene.start('Lobby', { net, youId: msg.youId, lobby: msg.lobby })
      return
    }
    if (msg.t === 'error') {
      this.finishAttempt(net, msg.message)
    }
    // 'lobby' snapshots are only expected post-join; nothing to do with one here.
  }

  private handleUnexpectedClose(net: NetClient) {
    if (this.pendingNet !== net) return
    this.finishAttempt(net, 'Lost connection to the multiplayer server.', false)
  }

  /** Fail a create/join attempt: discard the client, re-enable the buttons, show why. */
  private finishAttempt(net: NetClient, message: string, close = true) {
    if (close) net.close()
    if (this.pendingNet === net) this.pendingNet = undefined
    if (this.netHandlers?.net === net) this.netHandlers = undefined
    this.busy = false
    this.setStatus(message)
    this.refresh()
  }

  private backToMenu() {
    this.pendingNet?.close()
    this.pendingNet = undefined
    // Multiplayer is a Root-level branch now (Root → Multiplayer), so MAIN
    // returns to Root — not the Single Player hub, which requires a career.
    this.scene.start('Root')
  }

  private setStatus(message: string) {
    this.statusText.setText(message)
  }

  private refresh() {
    const car = this.currentCar()
    const variants = car.variants
    const variant = variants[this.liveryIndex] ?? variants[0]
    const canCycleLivery = variants.length > 1

    // field-row values (label stays static; value carries the current choice)
    const nameSet = this.name.length > 0
    this.rows[NAME_ROW].setValue(nameSet ? this.name : 'TYPE A NAME', nameSet ? C.textPrimary : C.textMuted)
    this.rows[CAR_ROW].setValue(`‹  ${car.name}  ›`, C.oxide)
    this.rows[LIVERY_ROW].setValue(canCycleLivery ? `‹  ${variant.label}  ›` : variant.label, canCycleLivery ? C.oxide : C.textSecondary)
    const codeSet = this.code.length > 0
    const codeMuted = this.selected === CREATE_ROW || !codeSet
    this.rows[CODE_ROW].setValue(codeSet ? this.code : 'e.g. TIGER-42', codeMuted ? C.textMuted : C.textPrimary)

    this.rows[CREATE_ROW].setLabel(this.busy ? 'CONNECTING…' : 'CREATE ROOM')
    this.rows[JOIN_ROW].setLabel(this.busy ? 'CONNECTING…' : 'JOIN ROOM')

    this.rows.forEach((row, i) => {
      const enabled =
        i === CREATE_ROW || i === JOIN_ROW ? !this.busy : i === LIVERY_ROW ? canCycleLivery : true
      row.setState({ selected: i === this.selected, enabled })
    })

    // the typed code is only ever read by JOIN — annotate CREATE so the code
    // never reads as an input CREATE ROOM will pick up.
    this.helperText.setText(
      this.selected === CREATE_ROW
        ? 'CREATE generates a fresh room code for you'
        : 'ROOM CODE joins a friend’s room — needed only for JOIN',
    )

    this.carArt.setTexture(posterTextureFor(car.id, this.livery))
    fitImage(this.carArt, this.posterMaxW, this.posterMaxH)
    this.previewLabel.setText(`${car.name.toUpperCase()} · ${variant.label.toUpperCase()}`)

    this.statusText.setColor(hex(C.danger))
  }
}
