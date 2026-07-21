import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { mpCarById, MP_CAR_OPTIONS } from '../../data/mpCars'
import { ALL_TRACKS, trackById } from '../../data/tracks'
import { MAX_PLAYERS, type LobbyPlayer, type LobbySnapshot, type ServerMsg } from '../../core/net/protocol'
import { NetClient } from '../net/netClient'
import { isTouchDevice } from '../input/device'
import { C, hex } from '../ui/theme'
import { flavor, keyGuideBar, text, type KeyGuideHandle, type KeyGuideItem } from '../ui/widgets'
import { SAFE, backPlate, card, drawPlate, notchedButton, type ButtonHandle } from '../ui/mobile'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage, type DeferredImageHandle } from '../ui/deferredImage'

// 2×2 roster grid of large touch cards, laid over the steel notice board baked
// into bg-lobby. Each cell is big enough for a thumbnail + readout + touch
// controls at phone scale.
const CARD_W = 820
const CARD_H = 220
const THUMB_MAX_W = 250
const THUMB_MAX_H = 165

/** Top-down roof sprite key for a chassis + livery, matching the roster/race
 *  convention: base livery → `car-top-<id>`, else `car-top-<id>-<variant>`
 *  (see protocol RaceCarInfo.variantId). */
function topTextureFor(carId: string, variantId: string): string {
  return variantId && variantId !== 'base' ? `car-top-${carId}-${variantId}` : `car-top-${carId}`
}

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
  /** chamfered plate body, repainted per state (isYou / empty) so the border
   *  can recolour without recreating the plate. */
  body: Phaser.GameObjects.Graphics
  /** invisible full-card hit rect — the add/remove-AI tap surface. */
  frame: Phaser.GameObjects.Rectangle
  poster: DeferredImageHandle
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
  private startTile!: ButtonHandle
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
    sceneBackground(this, 'bg-lobby', { veil: 0.4 })

    // --- Header band: BACK · ROOM CODE · COPY CODE -------------------------
    const headY = 96
    backPlate(this, 'MULTIPLAYER', () => this.leave(), { x: SAFE.left + 160, y: headY, w: 320 })

    card(this, cx, headY, 520, 88)
    text(this, cx, headY, `ROOM  ${this.lobby.code}`, {
      size: 'title', face: 'display', weight: 700, letterSpacing: 3,
      color: C.textPrimary, stroke: C.shadow, strokeThickness: 6, origin: [0.5, 0.5],
    })

    notchedButton(this, SAFE.right - 155, headY, {
      w: 290, h: 88, label: 'COPY CODE', size: 'action', onActivate: () => this.copyRoomCode(),
    })
    this.copiedLabel = text(this, SAFE.right - 155, headY + 60, '', {
      size: 'caption', color: C.ok, origin: [0.5, 0.5],
    })

    // --- Track selector: host-only chevrons flank a TRACK · NAME readout ----
    const trackY = 222
    card(this, cx, trackY, 1520, 96, undefined, { accent: C.oxideDim })
    this.trackText = text(this, cx, trackY, '', {
      size: 'subtitle', face: 'display', weight: 600, letterSpacing: 2,
      color: C.textPrimary, origin: [0.5, 0.5],
    })
    // Host-only tap arrows for track cycling (mirrors [ / ] / T). Hidden
    // entirely for non-hosts each render — see render()/renderTrackControls().
    this.trackLeft = text(this, cx - 700, trackY, '‹', { size: 'title', color: C.oxide, origin: [0.5, 0.5] })
    this.trackRight = text(this, cx + 700, trackY, '›', { size: 'title', color: C.oxide, origin: [0.5, 0.5] })

    // --- 2×2 roster grid ----------------------------------------------------
    const colDX = 425
    const rowY = [430, 680]
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const cardCx = cx + (i % 2 === 0 ? -colDX : colDX)
      const cardCy = rowY[Math.floor(i / 2)]
      const textX = cardCx - 60

      const body = this.add.graphics().setPosition(cardCx, cardCy)
      this.paintCardBody(body, C.line, false)

      // invisible full-card hit rect (kept for the add/remove-AI wiring).
      const frame = this.add.rectangle(cardCx, cardCy, CARD_W, CARD_H, 0x000000, 0)

      // slot index plate marker, top-left.
      text(this, cardCx - CARD_W / 2 + 30, cardCy - CARD_H / 2 + 26, `${i + 1}`, {
        size: 'body', face: 'mono', color: C.textMuted, origin: [0.5, 0.5],
      })

      const poster = deferredImage(this, cardCx - 250, cardCy, 'car-top-jackal', THUMB_MAX_W, THUMB_MAX_H)
      poster.image.setVisible(false)

      const name = text(this, textX, cardCy - 60, '', {
        size: 'body', face: 'display', weight: 600, letterSpacing: 1, origin: [0, 0.5], wordWrapWidth: CARD_W / 2 + 40,
      })
      const car = text(this, textX, cardCy - 8, '', {
        size: 'bodySm', face: 'mono', color: C.textSecondary, origin: [0, 0.5], wordWrapWidth: CARD_W / 2 + 40,
      })
      // Own-card-only change-car arrows, flanking the car thumbnail. Padding
      // bleeds up into the (inert) slot-marker/thumbnail space so the tap
      // target clears well past 88px without reaching the ready pill — see
      // renderOwnControls().
      const carLeft = text(this, cardCx - 390, cardCy, '‹', { size: 'title', color: C.oxide, origin: [0.5, 0.5] }).setVisible(false)
      const carRight = text(this, cardCx - 110, cardCy, '›', { size: 'title', color: C.oxide, origin: [0.5, 0.5] }).setVisible(false)
      // Own-card-only ready-toggle pill, drawn behind the `ready` text below
      // so the status readout stays on top of the button chrome.
      const readyBtn = this.add
        .rectangle(cardCx + 30, cardCy + 48, 230, 56, C.surfaceTile, 0.85)
        .setStrokeStyle(2, C.oxide, 1)
        .setVisible(false)
      const ready = text(this, textX, cardCy + 48, '', { size: 'bodySm', face: 'display', weight: 600, letterSpacing: 1, origin: [0, 0.5] })
      const note = text(this, textX, cardCy + 86, '', {
        size: 'caption', color: C.textMuted, origin: [0, 0.5],
      })
      const slot = text(this, cardCx + 40, cardCy, '', { size: 'action', face: 'display', weight: 600, letterSpacing: 2, origin: [0.5, 0.5] })
      this.cards.push({ body, frame, poster, name, car, ready, note, slot, carLeft, carRight, readyBtn })
    }

    this.statusText = text(this, cx, 850, '', {
      size: 'body', color: C.danger, origin: [0.5, 0.5], wordWrapWidth: 1200, align: 'center',
    })

    this.startTile = notchedButton(this, cx, 952, {
      w: 900, h: 96, label: 'START RACE', size: 'title', variant: 'primary', onActivate: () => this.tryStart(),
    })

    flavor(this, cx, GAME_HEIGHT - 26, 'Career progress is untouched — this is a standalone quick race.')

    // Touch has no keyboard chips to show — a short hint replaces the strip;
    // desktop keeps the chip bar exactly as before.
    if (this.touch) {
      this.touchHint = text(this, 24, 20, '', { size: 'caption', color: C.textSecondary, origin: [0, 0] })
    } else {
      this.keyGuide = keyGuideBar(this)
    }

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

  /** Repaint a card's chamfered plate body for its current state. */
  private paintCardBody(body: Phaser.GameObjects.Graphics, border: number, emphasize: boolean) {
    drawPlate(body, CARD_W, CARD_H, {
      face: C.surfacePlate,
      faceAlpha: emphasize ? 0.96 : 0.9,
      border,
      borderWidth: emphasize ? 3 : 2,
      chamfer: 16,
      rivets: true,
      glow: emphasize ? 2 : 0,
      glowColor: C.oxide,
    })
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
    // Leaving/disconnecting a lobby returns to Multiplayer setup (its parent),
    // per the new nav — not the Single Player hub.
    this.scene.start('Multiplayer')
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

    card.poster.setKey(topTextureFor(p.carId, p.variantId), THUMB_MAX_W, THUMB_MAX_H)
    card.poster.image.setVisible(true)

    // host/you/AI tags, pulled straight from live roster state.
    const tags: string[] = []
    if (isYou) tags.push('YOU')
    if (p.id === this.lobby.hostId) tags.push('HOST')
    if (p.isAi) tags.push('AI')
    card.name.setText(tags.length ? `${p.name}  ·  ${tags.join(' · ')}` : p.name)
    card.name.setColor(hex(isYou ? C.oxide : C.textPrimary))
    card.car.setText(liveryLabel ? `${carName} · ${liveryLabel}` : carName)
    card.ready.setText(p.ready ? '✓ READY' : '✗ NOT READY')
    card.ready.setColor(hex(p.ready ? C.ok : C.textMuted))
    this.paintCardBody(card.body, isYou ? C.oxide : C.border, isYou)

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
    this.paintCardBody(card.body, C.line, false)
    if (isHostViewer && isFirstOpen) {
      card.slot.setText('+  ADD AI')
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

    // Bleeds up into the inert slot-marker/thumbnail space, not toward the
    // ready pill — see the padInteractive() doc comment.
    padInteractive(card.carLeft, { left: 42, right: 42, top: 70, bottom: 20 })
    padInteractive(card.carRight, { left: 42, right: 42, top: 70, bottom: 20 })
    card.carLeft.on('pointerup', () => this.changeCar(p, -1))
    card.carRight.on('pointerup', () => this.changeCar(p, 1))

    // Comfortable pill hit zone around the READY status readout.
    padInteractive(card.readyBtn, { left: 10, right: 10, top: 16, bottom: 16 })
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
    this.trackText.setText(`TRACK · ${track.name}`)
    this.renderTrackControls(isHost)

    for (let i = 0; i < MAX_PLAYERS; i++) {
      const card = this.cards[i]
      card.frame.removeAllListeners('pointerup')
      card.frame.disableInteractive()
      card.poster.image.setVisible(false)
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
    this.startTile.setState({ selected: false, enabled: canStart })
    if (isHost) {
      this.startTile.setLabel(canStart ? 'START RACE' : 'Waiting for all players…')
    } else {
      this.startTile.setLabel('Waiting for host…')
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
