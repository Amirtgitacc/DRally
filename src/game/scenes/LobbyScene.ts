import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG, carById } from '../../data/cars'
import { ALL_TRACKS, trackById } from '../../data/tracks'
import { MAX_PLAYERS, type LobbyPlayer, type LobbySnapshot, type ServerMsg } from '../../core/net/protocol'
import { NetClient } from '../net/netClient'
import { C, hex } from '../ui/theme'
import { backButton, heading, hintBar, panel, sectionLabel, text, tile } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'

/**
 * Career-independent lobby: shows the live room roster while players pick a
 * car and ready up. `net`/`youId`/`lobby` are handed over by `MultiplayerScene`
 * on `joined` — this scene owns `net` from here on (closes it on leave/shutdown
 * paths that require it; a server-side close already tears the socket down).
 */
export class LobbyScene extends Phaser.Scene {
  private net!: NetClient
  private youId!: string
  private lobby!: LobbySnapshot

  private transitioning = false
  private playerRows: Phaser.GameObjects.Text[] = []
  private trackText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private hint!: Phaser.GameObjects.Text
  private disconnectTimer?: Phaser.Time.TimerEvent
  private onNetMessage!: (msg: ServerMsg) => void
  private onNetClose!: () => void

  constructor() {
    super('Lobby')
  }

  init(data: { net: NetClient; youId: string; lobby: LobbySnapshot }) {
    this.net = data.net
    this.youId = data.youId
    this.lobby = data.lobby
  }

  create() {
    this.transitioning = false
    this.playerRows = []
    this.disconnectTimer = undefined

    const cx = GAME_WIDTH / 2
    sceneBackground(this, 'bg-menu', { veil: 0.6 })

    heading(this, cx, 110, `ROOM ${this.lobby.code}`)
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${this.lobby.code}`
    text(this, cx, 168, `Share this link to invite: ${shareUrl}`, {
      size: 'body', color: C.textSecondary, origin: [0.5, 0.5],
    })
    text(this, cx, 204, 'Career progress is untouched — this is a standalone quick race.', {
      size: 'caption', color: C.textMuted, origin: [0.5, 0.5],
    })

    panel(this, cx, 560, 1100, 560)
    sectionLabel(this, cx - 500, 300, 'PLAYERS')
    this.trackText = text(this, cx, 340, '', { size: 'bodySm', color: C.textSecondary, origin: [0.5, 0.5] })

    for (let i = 0; i < MAX_PLAYERS; i++) {
      this.playerRows.push(text(this, cx, 420 + i * 90, '', { size: 'action', origin: [0.5, 0.5] }))
    }

    this.statusText = text(this, cx, 790, '', {
      size: 'body', color: C.danger, origin: [0.5, 0.5], wordWrapWidth: 1200, align: 'center',
    })

    const startTile = tile(this, cx, 960, 700, 80, 'START — networked race lands in Phase 3', { size: 'action' })
    startTile.setState(false, false)

    this.hint = hintBar(this, '')
    backButton(this, () => this.leave())

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)

    this.onNetMessage = (msg) => this.handleMessage(msg)
    this.onNetClose = () => this.handleClose()
    this.net.onMessage(this.onNetMessage)
    this.net.onClose(this.onNetClose)

    this.events.once('shutdown', () => {
      kb.off('keydown', onKey)
      if (this.disconnectTimer) {
        this.disconnectTimer.remove(false)
        this.disconnectTimer = undefined
      }
      this.net.offMessage(this.onNetMessage)
      this.net.offClose(this.onNetClose)
    })

    this.render()
  }

  private handleKey(event: KeyboardEvent) {
    if (this.transitioning) return
    if (event.code === 'Escape') { this.leave(); return }

    const me = this.lobby.players.find((p) => p.id === this.youId)
    if (!me) return

    if (event.code === 'ArrowLeft') this.changeCar(me, -1)
    else if (event.code === 'ArrowRight') this.changeCar(me, 1)
    else if (event.code === 'Enter' || event.code === 'KeyR') {
      this.net.send({ t: 'ready', ready: !me.ready })
    } else if (
      this.lobby.hostId === this.youId &&
      (event.code === 'BracketLeft' || event.code === 'BracketRight' || event.code === 'KeyT')
    ) {
      this.cycleTrack(event.code === 'BracketLeft' ? -1 : 1)
    }
  }

  private changeCar(me: LobbyPlayer, delta: number) {
    const idx = CAR_CATALOG.findIndex((c) => c.id === me.carId)
    const next = CAR_CATALOG[(idx + delta + CAR_CATALOG.length) % CAR_CATALOG.length]
    this.net.send({ t: 'setCar', carId: next.id })
  }

  private cycleTrack(delta: number) {
    const idx = ALL_TRACKS.findIndex((t) => t.id === this.lobby.trackId)
    const next = ALL_TRACKS[(idx + delta + ALL_TRACKS.length) % ALL_TRACKS.length]
    this.net.send({ t: 'setTrack', trackId: next.id })
  }

  private handleMessage(msg: ServerMsg) {
    if (msg.t === 'lobby') {
      this.lobby = msg.lobby
      this.setStatus('')
      this.render()
    } else if (msg.t === 'error') {
      this.setStatus(msg.message)
    }
    // 'joined' is only ever sent once, pre-Lobby — nothing to do with it here.
  }

  /** Unexpected server-side close (crash, network drop) — don't strand the player. */
  private handleClose() {
    if (this.transitioning) return
    this.setStatus('Disconnected from server')
    this.disconnectTimer = this.time.delayedCall(1200, () => this.goToMenu())
  }

  /** Esc / back button: a deliberate, committed leave. */
  private leave() {
    if (this.transitioning) return
    this.net.send({ t: 'leave' })
    this.net.close()
    this.goToMenu()
  }

  private goToMenu() {
    if (this.transitioning) return
    this.transitioning = true
    this.scene.start('Menu')
  }

  private setStatus(message: string) {
    this.statusText.setText(message)
  }

  /** Rebuild the dynamic panel content from `this.lobby`. Reuses row objects — no leaks. */
  private render() {
    const isHost = this.lobby.hostId === this.youId
    const track = trackById(this.lobby.trackId)
    this.trackText.setText(`TRACK: ${track.name}${isHost ? '   ( [ / ]  or T to change )' : ''}`)

    for (let i = 0; i < MAX_PLAYERS; i++) {
      const row = this.playerRows[i]
      const p = this.lobby.players[i]
      if (!p) {
        row.setText('— open slot —')
        row.setColor(hex(C.textMuted))
        continue
      }
      const car = carById(p.carId)
      const isRowHost = p.id === this.lobby.hostId
      const isYou = p.id === this.youId
      const star = isRowHost ? '★ ' : '   '
      const readyMark = p.ready ? '✓ READY' : '✗ NOT READY'
      row.setText(`${star}${p.name}${isYou ? ' (you)' : ''}  —  ${car.name}  —  ${readyMark}`)
      row.setColor(hex(isYou ? C.oxide : p.ready ? C.ok : C.textPrimary))
    }

    this.hint.setText(
      `←/→ change car · Enter/R ready${isHost ? ' · [ / ] or T change track' : ''} · Esc leave`,
    )
  }
}
