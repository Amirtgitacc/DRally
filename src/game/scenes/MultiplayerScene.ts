import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG } from '../../data/cars'
import { ALL_TRACKS } from '../../data/tracks'
import { isValidRoomCode, normalizeRoomCode } from '../../core/net/roomCode'
import { NetClient } from '../net/netClient'
import type { ServerMsg } from '../../core/net/protocol'
import { C, hex } from '../ui/theme'
import { backButton, flavor, heading, tile, text, type TileHandle, wireTiles } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { openNativeText } from '../ui/nativeInput'
import { isTouchDevice } from '../input/device'

const NAME_KEY = 'deathrally-mp-name'
const CAR_KEY = 'deathrally-mp-car'
const NAME_MAX = 16
const CODE_MAX = 12
const ROW_COUNT = 5
const NAME_ROW = 0
const CAR_ROW = 1
const CODE_ROW = 2
const CREATE_ROW = 3
const JOIN_ROW = 4

/**
 * Career-independent entry point for online quick-race: pick a driver name and
 * car, then create a fresh room or join one by code. Never touches career
 * (`deathrally-career*`) storage — only the dedicated `deathrally-mp-*` keys.
 */
export class MultiplayerScene extends Phaser.Scene {
  private selected = 0
  private name = ''
  private carIndex = 0
  private code = ''
  private busy = false
  private rows: TileHandle[] = []
  private statusText!: Phaser.GameObjects.Text
  private helperText!: Phaser.GameObjects.Text
  private disposeNativeInput?: () => void
  /** The in-flight (not-yet-joined) client, if any — ours to close on error/back-out. */
  private pendingNet?: NetClient

  constructor() {
    super('Multiplayer')
  }

  create() {
    this.selected = 0
    this.busy = false
    this.rows = []
    this.pendingNet = undefined
    this.disposeNativeInput = undefined

    this.name = localStorage.getItem(NAME_KEY)?.slice(0, NAME_MAX) ?? ''
    const savedCarId = localStorage.getItem(CAR_KEY)
    const savedCarIndex = savedCarId ? CAR_CATALOG.findIndex((c) => c.id === savedCarId) : -1
    this.carIndex = savedCarIndex >= 0 ? savedCarIndex : 0
    this.code = ''

    const cx = GAME_WIDTH / 2
    sceneBackground(this, 'bg-menu', { veil: 0.6 })

    heading(this, cx, 100, 'MULTIPLAYER · QUICK RACE')
    text(this, cx, 155, 'Career progress is untouched — this is a standalone quick race.', {
      size: 'body', color: C.textSecondary, origin: [0.5, 0.5],
    })

    this.rows.push(tile(this, cx, 300, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 410, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 520, 900, 90, '', { size: 'action' }))
    this.rows.push(tile(this, cx, 650, 900, 90, '', { accent: C.oxideDim }))
    this.rows.push(tile(this, cx, 760, 900, 90, ''))

    // sits in the gap above CREATE ROOM — only shown while CREATE is highlighted
    this.helperText = text(this, cx, 585, '', { size: 'caption', color: C.textSecondary, origin: [0.5, 0.5] })

    this.statusText = text(this, cx, 850, '', { size: 'body', color: C.danger, origin: [0.5, 0.5], wordWrapWidth: 1200, align: 'center' })

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

    flavor(this, cx, GAME_HEIGHT - 52, 'Type to edit name/code · ←/→ change car · ↑/↓ navigate · Enter select · Esc back')

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
    if (this.selected === CREATE_ROW) { this.attemptCreate(); return }
    if (this.selected === JOIN_ROW) { this.attemptJoin(); return }
  }

  private changeCar(delta: number) {
    this.carIndex = (this.carIndex + delta + CAR_CATALOG.length) % CAR_CATALOG.length
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
    net.send({ t: 'create', name, carId: CAR_CATALOG[this.carIndex].id, trackId: ALL_TRACKS[0].id })
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
    net.send({ t: 'join', code, name, carId: CAR_CATALOG[this.carIndex].id })
  }

  private handleMessage(msg: ServerMsg, net: NetClient) {
    if (this.pendingNet !== net) return
    if (msg.t === 'joined') {
      localStorage.setItem(NAME_KEY, this.name.trim())
      localStorage.setItem(CAR_KEY, CAR_CATALOG[this.carIndex].id)
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
    const car = CAR_CATALOG[this.carIndex]
    this.rows[NAME_ROW].label.setText(`DRIVER NAME\n${this.name || 'TYPE A NAME'}`)
    this.rows[CAR_ROW].label.setText(`CAR\n◄ ${car.name} ►`)
    this.rows[CODE_ROW].label.setText(`ROOM CODE — TO JOIN A FRIEND\n${this.code || 'e.g. TIGER-42'}`)
    this.rows[CREATE_ROW].label.setText(this.busy ? 'CONNECTING…' : 'CREATE ROOM')
    this.rows[JOIN_ROW].label.setText(this.busy ? 'CONNECTING…' : 'JOIN ROOM')

    this.rows.forEach((row, i) => {
      const enabled = i === CREATE_ROW || i === JOIN_ROW ? !this.busy : true
      row.setState(i === this.selected, enabled)
    })

    // the typed code is only ever read by JOIN — grey it out so it never
    // reads as an input CREATE ROOM will pick up.
    if (this.selected === CREATE_ROW) this.rows[CODE_ROW].label.setColor(hex(C.textMuted))
    this.helperText.setText(this.selected === CREATE_ROW ? 'a fresh code will be generated for you' : '')

    this.statusText.setColor(hex(C.danger))
  }
}
