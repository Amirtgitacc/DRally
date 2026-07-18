import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { mpCarById, MP_CAR_OPTIONS } from '../../data/mpCars'
import { ALL_TRACKS, trackById } from '../../data/tracks'
import { MAX_PLAYERS, type LobbyPlayer, type LobbySnapshot, type ServerMsg } from '../../core/net/protocol'
import { NetClient } from '../net/netClient'
import { C, hex } from '../ui/theme'
import { backButton, heading, hintBar, panel, sectionLabel, text, tile, type TileHandle } from '../ui/widgets'
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
  private startTile!: TileHandle
  private copiedLabel!: Phaser.GameObjects.Text
  private shareUrl = ''
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
    this.shareUrl = shareUrl

    const copyTile = tile(this, cx + 430, 110, 150, 56, 'COPY', { size: 'bodySm' })
    copyTile.rect.setInteractive({ useHandCursor: true })
    copyTile.rect.on('pointerup', () => this.copyShareLink(shareUrl))
    this.copiedLabel = text(this, cx + 430, 150, '', {
      size: 'caption', color: C.ok, origin: [0.5, 0.5],
    })

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

    this.startTile = tile(this, cx, 960, 700, 80, '', { size: 'action' })
    this.startTile.rect.setInteractive({ useHandCursor: true })
    this.startTile.rect.on('pointerup', () => this.tryStart())

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
    } else if (event.code === 'Space') {
      this.tryStart()
    } else if (event.code === 'KeyC') {
      this.copyShareLink(this.shareUrl)
    } else if (event.code === 'KeyA' && this.lobby.hostId === this.youId) {
      if (this.lobby.players.length < MAX_PLAYERS) this.net.send({ t: 'addAi' })
    } else if (event.code === 'KeyX' && this.lobby.hostId === this.youId) {
      const lastAi = [...this.lobby.players].reverse().find((p) => p.isAi)
      if (lastAi) this.net.send({ t: 'removeAi', id: lastAi.id })
    }
  }

  /** Copy the invite link; async clipboard first, hidden-textarea fallback. */
  private copyShareLink(url: string) {
    const done = () => {
      this.copiedLabel.setText('Copied!')
      this.time.delayedCall(1200, () => this.copiedLabel.setText(''))
    }
    const nav = navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } }
    if (nav.clipboard?.writeText) {
      nav.clipboard.writeText(url).then(done).catch(() => this.copyFallback(url, done))
    } else {
      this.copyFallback(url, done)
    }
  }

  private copyFallback(url: string, done: () => void) {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); done() } catch { /* clipboard blocked; no-op */ }
    document.body.removeChild(ta)
  }

  private canStart(): boolean {
    return (
      this.lobby.hostId === this.youId &&
      this.lobby.players.length >= 2 &&
      this.lobby.players.every((p) => p.ready)
    )
  }

  /** Host-only start trigger (keyboard or pointer). Recomputes eligibility at press time. */
  private tryStart() {
    if (this.transitioning) return
    if (!this.canStart()) return
    this.net.send({ t: 'start' })
  }

  private changeCar(me: LobbyPlayer, delta: number) {
    // Cycle the full MP roster (catalog + guest cars) so a guest car like the
    // Anahita is a reachable cycle member. findIndex(-1) → 0 on a first press.
    const idx = MP_CAR_OPTIONS.findIndex((c) => c.id === me.carId)
    const len = MP_CAR_OPTIONS.length
    const next = MP_CAR_OPTIONS[(idx + delta + len) % len]
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
    } else if (msg.t === 'raceStart') {
      this.transitioning = true
      // The race scene owns `net` from here on — detach the lobby's own handlers
      // first so neither scene reacts to messages/close meant for the other.
      this.net.offMessage(this.onNetMessage)
      this.net.offClose(this.onNetClose)
      this.scene.start('Race', {
        mode: 'network',
        net: this.net,
        raceStart: {
          seed: msg.seed,
          trackId: msg.trackId,
          laps: msg.laps,
          roster: msg.roster,
          youId: msg.youId,
        },
      })
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
      row.removeAllListeners('pointerup')
      row.disableInteractive()
      const p = this.lobby.players[i]
      const isHost = this.lobby.hostId === this.youId
      if (!p) {
        // first open slot shows the host's Add-AI affordance
        const firstOpen = this.lobby.players.length === i
        row.setText(isHost && firstOpen ? '+ Add AI  (A)' : '— open slot —')
        row.setColor(hex(isHost && firstOpen ? C.oxide : C.textMuted))
        if (isHost && firstOpen) {
          row.setInteractive({ useHandCursor: true })
          row.on('pointerup', () => {
            if (this.lobby.players.length < MAX_PLAYERS) this.net.send({ t: 'addAi' })
          })
        }
        continue
      }
      // mpCarById resolves catalog chassis + MP-only guest cars (e.g. Anahita);
      // carById alone would throw on the latter (see task-7de-report.md).
      const carName = mpCarById(p.carId)?.name ?? p.carId
      const isRowHost = p.id === this.lobby.hostId
      const isYou = p.id === this.youId
      const star = isRowHost ? '★ ' : '   '
      const tag = p.isAi ? ' [AI]' : ''
      const readyMark = p.ready ? '✓ READY' : '✗ NOT READY'
      row.setText(`${star}${p.name}${isYou ? ' (you)' : ''}${tag}  —  ${carName}  —  ${readyMark}`)
      row.setColor(hex(isYou ? C.oxide : p.ready ? C.ok : C.textPrimary))
      if (isHost && p.isAi) {
        row.setInteractive({ useHandCursor: true })
        row.on('pointerup', () => this.net.send({ t: 'removeAi', id: p.id }))
      }
    }

    const canStart = this.canStart()
    this.startTile.setState(false, canStart)
    if (isHost) {
      this.startTile.label.setText(canStart ? 'START RACE' : 'Waiting for all players…')
    } else {
      this.startTile.label.setText('Waiting for host…')
    }

    this.hint.setText(
      `←/→ change car · Enter/R ready${isHost ? ' · [ / ] or T change track · A add AI · X remove AI' : ''}` +
        ` · C copy link${isHost && canStart ? ' · Space to start' : ''} · Esc leave`,
    )
  }
}
