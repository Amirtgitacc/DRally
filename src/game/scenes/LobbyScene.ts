import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { mpCarById, MP_CAR_OPTIONS } from '../../data/mpCars'
import { ALL_TRACKS, trackById } from '../../data/tracks'
import { MAX_PLAYERS, type LobbyPlayer, type LobbySnapshot, type ServerMsg } from '../../core/net/protocol'
import { NetClient } from '../net/netClient'
import { isTouchDevice } from '../input/device'
import { C, hex } from '../ui/theme'
import { backButton, fitImage, flavor, heading, keyGuideBar, text, tile, type KeyGuideHandle, type KeyGuideItem, type TileHandle } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { artToCanvas } from '../ui/backgroundTransform'
import { posterTextureFor } from '../textures/loadedAssets'

// The bg-lobby template bakes an empty steel notice board into its centre; the
// player-card grid is drawn on it. Art-space rect of the board's inner surface
// (bg-lobby is authored at 1536×1024), mapped through the cover transform.
const BOARD = { cx: 767, cy: 480, w: 835, h: 500 }

const CARD_W = 240
const CARD_H = 470
const CARD_GAP = 22
const POSTER_MAX_W = 205
const POSTER_MAX_H = 290

/**
 * Give a small touch affordance (an arrow glyph, a status pill) a tap target
 * comfortably past its own visual bounds — a bare glyph or thin pill is far
 * under a usable touch-target size at phone scale (the canvas is downscaled
 * ~2.2x on phones). Padding is asymmetric per side so a hit zone can bleed
 * into neighbouring *inert* space (poster art, empty board past the card)
 * rather than into another affordance's own hit zone.
 *
 * Phaser's custom `hitArea` rectangle is in the object's own unscaled local
 * frame — (0,0) at its top-left, (width,height) at its bottom-right —
 * regardless of `setOrigin`, so padding each side out from 0/width/height is
 * exactly the padding applied on that visual side.
 */
function padInteractive(
  obj: Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle,
  pad: { left?: number; right?: number; top?: number; bottom?: number },
) {
  const { left = 0, right = 0, top = 0, bottom = 0 } = pad
  obj.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-left, -top, obj.width + left + right, obj.height + top + bottom),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  })
}

/** One roster slot: a fixed frame whose contents are repainted from the
 *  current LobbySnapshot on every render — objects are reused, never leaked. */
interface PlayerCard {
  frame: Phaser.GameObjects.Rectangle
  poster: Phaser.GameObjects.Image
  name: Phaser.GameObjects.Text
  car: Phaser.GameObjects.Text
  ready: Phaser.GameObjects.Text
  note: Phaser.GameObjects.Text
  /** big centred label for empty slots ('+ ADD AI' / '— OPEN SLOT —') */
  slot: Phaser.GameObjects.Text
  /** Tap targets for the local player's own card (car-change arrows); visible
   *  on any pointer-capable device, gated on `isYou`, not on `this.touch` —
   *  see renderOwnControls(). */
  carLeft: Phaser.GameObjects.Text
  carRight: Phaser.GameObjects.Text
  /** Tap target for the local player's own card (ready-toggle pill behind
   *  `ready`'s text); same isYou-only gating as carLeft/carRight above. */
  readyBtn: Phaser.GameObjects.Rectangle
}

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
  private cards: PlayerCard[] = []
  private trackText!: Phaser.GameObjects.Text
  private trackLeft!: Phaser.GameObjects.Text
  private trackRight!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private touch = false
  /** desktop: keyboard chip strip. touch: short replacement hint — see create(). */
  private keyGuide?: KeyGuideHandle
  private touchHint?: Phaser.GameObjects.Text
  private startTile!: TileHandle
  private copiedLabel!: Phaser.GameObjects.Text
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
    this.cards = []
    this.disconnectTimer = undefined
    this.touch = isTouchDevice()

    const cx = GAME_WIDTH / 2
    const bg = sceneBackground(this, 'bg-lobby', { veil: 0.25 })

    heading(this, cx, 110, `ROOM ${this.lobby.code}`)

    const copyTile = tile(this, cx + 430, 110, 190, 56, 'COPY CODE', { size: 'bodySm' })
    copyTile.rect.setInteractive({ useHandCursor: true })
    copyTile.rect.on('pointerup', () => this.copyRoomCode())
    this.copiedLabel = text(this, cx + 430, 150, '', {
      size: 'caption', color: C.ok, origin: [0.5, 0.5],
    })

    // the board baked into the template art, in canvas space
    const t = bg.transform()
    const board = artToCanvas(t, BOARD.cx, BOARD.cy)
    const boardH = BOARD.h * t.scale

    this.trackText = text(this, board.x, board.y - boardH / 2 + 45, '', {
      size: 'bodySm', color: C.textSecondary, origin: [0.5, 0.5],
    })
    // Host-only tap arrows for track cycling (mirrors [ / ] / T). Hidden
    // entirely for non-hosts each render — see render()/renderTrackControls().
    this.trackLeft = text(this, board.x - 260, this.trackText.y, '‹', { size: 'action', color: C.oxide, origin: [0.5, 0.5] })
    this.trackRight = text(this, board.x + 260, this.trackText.y, '›', { size: 'action', color: C.oxide, origin: [0.5, 0.5] })

    const cardCy = board.y + 40
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const cardCx = board.x + (i - (MAX_PLAYERS - 1) / 2) * (CARD_W + CARD_GAP)
      const frame = this.add
        .rectangle(cardCx, cardCy, CARD_W, CARD_H, C.surfaceTile, 0.55)
        .setStrokeStyle(2, C.border, 1)
      const poster = this.add.image(cardCx, cardCy - 75, 'car-poster-jackal').setVisible(false)
      const name = text(this, cardCx, cardCy + 90, '', {
        size: 'bodySm', origin: [0.5, 0.5], align: 'center', wordWrapWidth: CARD_W - 20,
      })
      const car = text(this, cardCx, cardCy + 124, '', {
        size: 'caption', color: C.textSecondary, origin: [0.5, 0.5], align: 'center', wordWrapWidth: CARD_W - 20,
      })
      // Own-card-only change-car arrows, flanking the car readout. Padding
      // bleeds upward into the (non-interactive) name/poster area so the tap
      // target clears ~100 canvas px tall without reaching the ready pill
      // below — see renderOwnControls().
      const carLeft = text(this, cardCx - 70, cardCy + 124, '‹', { size: 'action', color: C.oxide, origin: [0.5, 0.5] }).setVisible(false)
      const carRight = text(this, cardCx + 70, cardCy + 124, '›', { size: 'action', color: C.oxide, origin: [0.5, 0.5] }).setVisible(false)
      // Own-card-only ready-toggle pill, drawn behind the `ready` text below
      // so the status readout stays on top of the button chrome.
      const readyBtn = this.add
        .rectangle(cardCx, cardCy + 162, 170, 44, C.surfaceTile, 0.85)
        .setStrokeStyle(2, C.oxide, 1)
        .setVisible(false)
      const ready = text(this, cardCx, cardCy + 162, '', { size: 'bodySm', origin: [0.5, 0.5] })
      const note = text(this, cardCx, cardCy + 192, '', {
        size: 'caption', color: C.textMuted, origin: [0.5, 0.5],
      })
      const slot = text(this, cardCx, cardCy, '', { size: 'action', origin: [0.5, 0.5] })
      this.cards.push({ frame, poster, name, car, ready, note, slot, carLeft, carRight, readyBtn })
    }

    this.statusText = text(this, cx, 850, '', {
      size: 'body', color: C.danger, origin: [0.5, 0.5], wordWrapWidth: 1200, align: 'center',
    })

    this.startTile = tile(this, cx, 950, 700, 80, '', { size: 'action' })
    this.startTile.rect.setInteractive({ useHandCursor: true })
    this.startTile.rect.on('pointerup', () => this.tryStart())

    flavor(this, cx, GAME_HEIGHT - 28, 'Career progress is untouched — this is a standalone quick race.')

    // Touch has no keyboard chips to show — a short hint replaces the strip;
    // desktop keeps the chip bar exactly as before.
    if (this.touch) {
      this.touchHint = text(this, 24, 20, '', { size: 'caption', color: C.textSecondary, origin: [0, 0] })
    } else {
      this.keyGuide = keyGuideBar(this)
    }
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
      this.copyRoomCode()
    } else if (event.code === 'KeyA' && this.lobby.hostId === this.youId) {
      if (this.lobby.players.length < MAX_PLAYERS) this.net.send({ t: 'addAi' })
    } else if (event.code === 'KeyX' && this.lobby.hostId === this.youId) {
      const lastAi = [...this.lobby.players].reverse().find((p) => p.isAi)
      if (lastAi) this.net.send({ t: 'removeAi', id: lastAi.id })
    }
  }

  /** Copy the room code (friends type it into JOIN, or use ?room= links);
   *  async clipboard first, hidden-textarea fallback. */
  private copyRoomCode() {
    const code = this.lobby.code
    const done = () => {
      this.copiedLabel.setText('Copied!')
      this.time.delayedCall(1200, () => this.copiedLabel.setText(''))
    }
    const nav = navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } }
    if (nav.clipboard?.writeText) {
      nav.clipboard.writeText(code).then(done).catch(() => this.copyFallback(code, done))
    } else {
      this.copyFallback(code, done)
    }
  }

  private copyFallback(value: string, done: () => void) {
    const ta = document.createElement('textarea')
    ta.value = value
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

  /** Repaint one roster card for a joined player. */
  private renderPlayerCard(card: PlayerCard, p: LobbyPlayer, isHostViewer: boolean) {
    const isYou = p.id === this.youId
    const spec = mpCarById(p.carId)
    // mpCarById resolves catalog chassis + MP-only guest cars (e.g. Anahita);
    // carById alone would throw on the latter (see task-7de-report.md).
    const carName = spec?.name ?? p.carId
    const liveryLabel = spec?.variants.find((v) => v.key === p.variantId)?.label

    card.poster.setTexture(posterTextureFor(p.carId, p.variantId)).setVisible(true)
    fitImage(card.poster, POSTER_MAX_W, POSTER_MAX_H)

    const star = p.id === this.lobby.hostId ? '★ ' : ''
    const tag = p.isAi ? ' [AI]' : ''
    card.name.setText(`${star}${p.name}${isYou ? ' (you)' : ''}${tag}`)
    card.name.setColor(hex(isYou ? C.oxide : C.textPrimary))
    card.car.setText(liveryLabel ? `${carName}\n${liveryLabel}` : carName)
    card.ready.setText(p.ready ? '✓ READY' : '✗ NOT READY')
    card.ready.setColor(hex(p.ready ? C.ok : C.textMuted))
    card.frame.setStrokeStyle(2, isYou ? C.oxide : C.border, 1)

    if (isHostViewer && p.isAi) {
      card.note.setText('tap to remove (X)')
      card.frame.setInteractive({ useHandCursor: true })
      card.frame.on('pointerup', () => this.net.send({ t: 'removeAi', id: p.id }))
    } else {
      card.note.setText('')
    }
  }

  /** Repaint one roster card for an empty slot. */
  private renderEmptyCard(card: PlayerCard, isHostViewer: boolean, isFirstOpen: boolean) {
    card.frame.setStrokeStyle(2, C.border, 0.5)
    if (isHostViewer && isFirstOpen) {
      card.slot.setText('+ ADD AI  (A)')
      card.slot.setColor(hex(C.oxide))
      card.frame.setInteractive({ useHandCursor: true })
      card.frame.on('pointerup', () => {
        if (this.lobby.players.length < MAX_PLAYERS) this.net.send({ t: 'addAi' })
      })
    } else {
      card.slot.setText('— open slot —')
      card.slot.setColor(hex(C.textMuted))
    }
  }

  /**
   * Wire (or hide) the local player's own touch affordances on one card:
   * change-car arrows and the ready-toggle pill. Torn down and rebuilt every
   * render so they always track whichever slot `youId` currently occupies —
   * the roster can reorder (a player ahead of you leaves) between renders.
   * Sends the exact same messages as the ←/→ and Enter/R key handlers.
   */
  private renderOwnControls(card: PlayerCard, p: LobbyPlayer | undefined, isYou: boolean) {
    card.carLeft.removeAllListeners('pointerup')
    card.carRight.removeAllListeners('pointerup')
    card.readyBtn.removeAllListeners('pointerup')
    card.carLeft.disableInteractive()
    card.carRight.disableInteractive()
    card.readyBtn.disableInteractive()

    if (!isYou || !p) {
      card.carLeft.setVisible(false)
      card.carRight.setVisible(false)
      card.readyBtn.setVisible(false)
      return
    }

    card.carLeft.setVisible(true)
    card.carRight.setVisible(true)
    card.readyBtn.setVisible(true)
    card.readyBtn.setStrokeStyle(2, p.ready ? C.ok : C.oxide, 1)

    // Bleeds up into the inert name/poster space, not down toward the ready
    // pill — see the padInteractive() doc comment.
    padInteractive(card.carLeft, { left: 42, right: 42, top: 70 })
    padInteractive(card.carRight, { left: 42, right: 42, top: 70 })
    card.carLeft.on('pointerup', () => this.changeCar(p, -1))
    card.carRight.on('pointerup', () => this.changeCar(p, 1))

    // Bleeds down past the card's own bottom edge into empty board space,
    // not up toward the car-change arrows above.
    padInteractive(card.readyBtn, { left: 10, right: 10, bottom: 86 })
    card.readyBtn.on('pointerup', () => this.net.send({ t: 'ready', ready: !p.ready }))
  }

  /** Host-only track-cycle arrows beside the track readout — hidden entirely
   *  for non-hosts, mirroring the [ / ] / T keyboard gate exactly. */
  private renderTrackControls(isHost: boolean) {
    this.trackLeft.removeAllListeners('pointerup')
    this.trackRight.removeAllListeners('pointerup')
    this.trackLeft.disableInteractive()
    this.trackRight.disableInteractive()
    this.trackLeft.setVisible(isHost)
    this.trackRight.setVisible(isHost)
    if (!isHost) return

    padInteractive(this.trackLeft, { left: 45, right: 45, top: 45, bottom: 45 })
    padInteractive(this.trackRight, { left: 45, right: 45, top: 45, bottom: 45 })
    this.trackLeft.on('pointerup', () => this.cycleTrack(-1))
    this.trackRight.on('pointerup', () => this.cycleTrack(1))
  }

  /** Rebuild the dynamic board content from `this.lobby`. Reuses card objects — no leaks. */
  private render() {
    const isHost = this.lobby.hostId === this.youId
    const track = trackById(this.lobby.trackId)
    this.trackText.setText(`TRACK: ${track.name}${isHost ? '   ( [ / ]  or T to change )' : ''}`)
    this.renderTrackControls(isHost)

    for (let i = 0; i < MAX_PLAYERS; i++) {
      const card = this.cards[i]
      card.frame.removeAllListeners('pointerup')
      card.frame.disableInteractive()
      card.poster.setVisible(false)
      card.name.setText('')
      card.car.setText('')
      card.ready.setText('')
      card.note.setText('')
      card.slot.setText('')

      const p = this.lobby.players[i]
      if (p) this.renderPlayerCard(card, p, isHost)
      else this.renderEmptyCard(card, isHost, this.lobby.players.length === i)
      this.renderOwnControls(card, p, p?.id === this.youId)
    }

    const canStart = this.canStart()
    this.startTile.setState(false, canStart)
    if (isHost) {
      this.startTile.label.setText(canStart ? 'START RACE' : 'Waiting for all players…')
    } else {
      this.startTile.label.setText('Waiting for host…')
    }

    if (this.touch) {
      this.touchHint!.setText(
        isHost
          ? 'Tap your card ‹ › for car · READY to toggle · ‹ › by TRACK to change it · add/remove AI cards by tapping them'
          : 'Tap your card ‹ › for car · READY to toggle · tap COPY CODE or BACK as needed',
      )
    } else {
      const guide: KeyGuideItem[] = [
        { key: '←/→', label: 'change car' },
        { key: 'Enter/R', label: 'ready' },
      ]
      if (isHost) {
        guide.push(
          { key: '[ / ] · T', label: 'track' },
          { key: 'A', label: 'add AI' },
          { key: 'X', label: 'remove AI' },
        )
      }
      guide.push({ key: 'C', label: 'copy code' })
      if (isHost && canStart) guide.push({ key: 'Space', label: 'start' })
      guide.push({ key: 'Esc', label: 'leave' })
      this.keyGuide!.setItems(guide)
    }
  }
}
