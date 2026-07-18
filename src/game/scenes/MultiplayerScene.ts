import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG } from '../../data/cars'
import { MP_ONLY_CARS } from '../../data/mpCars'
import { ALL_TRACKS } from '../../data/tracks'
import { isValidRoomCode, normalizeRoomCode } from '../../core/net/roomCode'
import { NetClient } from '../net/netClient'
import type { ServerMsg } from '../../core/net/protocol'
import { C, hex } from '../ui/theme'
import { backButton, fitImage, flavor, heading, tile, text, type TileHandle, wireTiles } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { openNativeText } from '../ui/nativeInput'
import { isTouchDevice } from '../input/device'

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

// Quick-race car choices: the single-player catalog plus MP-only guest cars
// (currently just the 206 Anahita — see src/data/mpCars.ts).
const MP_CAR_OPTIONS = [...CAR_CATALOG, ...MP_ONLY_CARS]

// Selected-car art sits in the right margin the row block never uses.
const ART_CX = 1660
const ART_CY = 560
const ART_MAX_W = 440
const ART_MAX_H = 600

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
  private rows: TileHandle[] = []
  private statusText!: Phaser.GameObjects.Text
  private helperText!: Phaser.GameObjects.Text
  private carArt!: Phaser.GameObjects.Image
  private disposeNativeInput?: () => void
  /** The in-flight (not-yet-joined) client, if any — ours to close on error/back-out. */
  private pendingNet?: NetClient

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

  /** Anahita has no dealer poster (it is never sold) — fall back to its hero cutout. */
  private artTextureFor(carId: string): string {
    return carId === 'anahita' ? 'car-hero-anahita' : `car-poster-${carId}`
  }

  create() {
    this.selected = 0
    this.busy = false
    this.rows = []
    this.pendingNet = undefined
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

    const cx = GAME_WIDTH / 2
    sceneBackground(this, 'bg-menu', { veil: 0.6 })

    heading(this, cx, 100, 'MULTIPLAYER · QUICK RACE')
    text(this, cx, 155, 'Career progress is untouched — this is a standalone quick race.', {
      size: 'body', color: C.textSecondary, origin: [0.5, 0.5],
    })

    this.rows.push(tile(this, cx, 270, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 380, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 490, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 600, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 710, 900, 90, '', { accent: C.oxideDim }))
    this.rows.push(tile(this, cx, 840, 900, 90, ''))

    this.helperText = text(this, cx, 775, '', { size: 'caption', color: C.textSecondary, origin: [0.5, 0.5] })

    // selected car's art, beside the form in the margin the rows never reach
    this.carArt = this.add.image(ART_CX, ART_CY, this.artTextureFor(this.currentCar().id))
    fitImage(this.carArt, ART_MAX_W, ART_MAX_H)

    this.statusText = text(this, cx, 920, '', { size: 'body', color: C.danger, origin: [0.5, 0.5], wordWrapWidth: 1200, align: 'center' })

    // deep link: prefill + focus JOIN when the URL carries a valid ?room= code
    const roomParam = new URLSearchParams(window.location.search).get('room')
    if (roomParam) {
      const normalized = normalizeRoomCode(roomParam)
      if (isValidRoomCode(normalized)) {
        this.code = normalized
        this.selected = JOIN_ROW
      }
    }

    wireTiles(
      this.rows,
      (i) => { this.selected = i; this.refresh() },
      (i) => { this.selected = i; this.activateSelected() },
    )
    backButton(this, () => this.backToMenu())

    flavor(this, cx, GAME_HEIGHT - 52, 'Type to edit name/code · ←/→ change car/livery · ↑/↓ navigate · Enter select · Esc back')

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => {
      kb.off('keydown', onKey)
      this.disposeNativeInput?.()
      this.disposeNativeInput = undefined
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
    net.onMessage((msg) => this.handleMessage(msg, net))
    net.onClose(() => this.handleUnexpectedClose(net))
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
    net.onMessage((msg) => this.handleMessage(msg, net))
    net.onClose(() => this.handleUnexpectedClose(net))
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
    this.busy = false
    this.setStatus(message)
    this.refresh()
  }

  private backToMenu() {
    this.pendingNet?.close()
    this.pendingNet = undefined
    this.scene.start('Menu')
  }

  private setStatus(message: string) {
    this.statusText.setText(message)
  }

  private refresh() {
    const car = this.currentCar()
    const variants = car.variants
    const variant = variants[this.liveryIndex] ?? variants[0]
    const canCycleLivery = variants.length > 1

    this.rows[NAME_ROW].label.setText(`DRIVER NAME\n${this.name || 'TYPE A NAME'}`)
    this.rows[CAR_ROW].label.setText(`CAR\n◄ ${car.name} ►`)
    this.rows[LIVERY_ROW].label.setText(
      canCycleLivery ? `LIVERY\n◄ ${variant.label} ►` : `LIVERY\n${variant.label}`,
    )
    this.rows[CODE_ROW].label.setText(`ROOM CODE — TO JOIN A FRIEND\n${this.code || 'e.g. TIGER-42'}`)
    this.rows[CREATE_ROW].label.setText(this.busy ? 'CONNECTING…' : 'CREATE ROOM')
    this.rows[JOIN_ROW].label.setText(this.busy ? 'CONNECTING…' : 'JOIN ROOM')

    this.rows.forEach((row, i) => {
      const enabled =
        i === CREATE_ROW || i === JOIN_ROW ? !this.busy : i === LIVERY_ROW ? canCycleLivery : true
      row.setState(i === this.selected, enabled)
    })

    // the typed code is only ever read by JOIN — grey it out so it never
    // reads as an input CREATE ROOM will pick up.
    if (this.selected === CREATE_ROW) this.rows[CODE_ROW].label.setColor(hex(C.textMuted))
    this.helperText.setText(this.selected === CREATE_ROW ? 'a fresh code will be generated for you' : '')

    this.carArt.setTexture(this.artTextureFor(car.id))
    fitImage(this.carArt, ART_MAX_W, ART_MAX_H)

    this.statusText.setColor(hex(C.danger))
  }
}
