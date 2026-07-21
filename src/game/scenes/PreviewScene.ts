import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { ALL_TRACKS } from '../../data/tracks'
import { drawTrackMap } from '../ui/trackMap'
import { C, TIER_COLOR, TIER_LABEL, hex } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { trackPosterTextureFor } from '../textures/loadedAssets'
import { deferredImage, type DeferredImageHandle } from '../ui/deferredImage'
import {
  SAFE, backPlate, carousel, screenTitle, drawPlate, type CarouselHandle,
} from '../ui/mobile'

// Two equally-prominent panels side by side: authored portrait poster (left),
// live centerline-derived circuit outline (right). Chevrons sit outside both.
const POSTER = { cx: 475, cy: 470, w: 400, h: 600 }
const MAP = { cx: 1245, cy: 470, w: 960, h: 600 }
const CHEVRON_Y = 470
const DOTS_Y = 900

// Bottom informational band (name · tier chip · laps · index).
const BAND_Y = 838
const CHIP = { x: 900, y: BAND_Y, w: 250, h: 56 }
const PROGRESS = { y: 942, h: 5 }
const AUTO_MS = 4000

/**
 * Circuit Preview reel — an informational venue showcase. No sign-up/race
 * action: it browses the real venues (poster + true track map + tier/laps),
 * auto-advancing on a timer that a manual browse resets. Presentation only.
 */
export class PreviewScene extends Phaser.Scene {
  private index = 0
  private frameGfx!: Phaser.GameObjects.Graphics
  private mapGfx!: Phaser.GameObjects.Graphics
  private posterHandle!: DeferredImageHandle
  private nameText!: Phaser.GameObjects.Text
  private tierChipGfx!: Phaser.GameObjects.Graphics
  private tierText!: Phaser.GameObjects.Text
  private lapsText!: Phaser.GameObjects.Text
  private indexText!: Phaser.GameObjects.Text
  private progressGfx!: Phaser.GameObjects.Graphics
  private carouselH!: CarouselHandle
  private autoTimer?: Phaser.Time.TimerEvent

  constructor() { super('Preview') }

  create() {
    this.index = 0
    sceneBackground(this, 'bg-race-ops', { veil: 0.52 })

    screenTitle(this, 'NIGHT CIRCUIT PREVIEW', { x: GAME_WIDTH / 2, y: 96, origin: [0.5, 0.5], slug: false })

    // panel frames (redrawn per track for the tier accent), below the art
    this.frameGfx = this.add.graphics()
    // portrait poster on the left; deferredImage owns its own streaming placeholder
    this.posterHandle = deferredImage(this, POSTER.cx, POSTER.cy, '__WHITE', POSTER.w, POSTER.h)
    // live circuit outline on the right
    this.mapGfx = this.add.graphics()

    // ---- bottom informational band ----
    this.nameText = text(this, 100, BAND_Y, '', {
      size: 'heading', face: 'display', weight: 700, letterSpacing: 3, origin: [0, 0.5],
    })
    this.tierChipGfx = this.add.graphics({ x: CHIP.x, y: CHIP.y })
    this.tierText = text(this, CHIP.x, CHIP.y, '', {
      size: 'action', face: 'display', weight: 700, letterSpacing: 2, origin: [0.5, 0.5],
    })
    // static dividers between chip / laps / index
    const dividers = this.add.graphics()
    dividers.lineStyle(2, C.line, 1)
    ;[1120, 1500].forEach((x) => dividers.lineBetween(x, BAND_Y - 24, x, BAND_Y + 24))
    this.lapsText = text(this, 1300, BAND_Y, '', {
      size: 'action', face: 'mono', color: C.textPrimary, origin: [0.5, 0.5],
    })
    this.indexText = text(this, 1760, BAND_Y, '', {
      size: 'action', face: 'mono', color: C.textSecondary, origin: [1, 0.5],
    })

    // small unobtrusive auto-advance progress line
    this.progressGfx = this.add.graphics()

    // paginated selector owns chevrons + dots + swipe; the scene renders index i
    this.carouselH = carousel(this, ALL_TRACKS.length, (i) => {
      this.index = i
      this.refresh()
      // any advance (auto or manual) restarts the dwell timer + progress line
      if (this.autoTimer) this.autoTimer.elapsed = 0
    }, { chevronY: CHEVRON_Y, dotsY: DOTS_Y })

    // back control (top-left, matches the reference) + Esc, both to Menu
    backPlate(this, 'SINGLE PLAYER', () => this.scene.start('Menu'), { x: SAFE.left + 150, y: 96 })

    const kb = this.input.keyboard!
    const left = () => this.carouselH.prev()
    const right = () => this.carouselH.next()
    const back = () => this.scene.start('Menu')
    kb.on('keydown-LEFT', left)
    kb.on('keydown-RIGHT', right)
    kb.on('keydown-ESC', back)

    this.autoTimer = this.time.addEvent({ delay: AUTO_MS, loop: true, callback: () => this.carouselH.next() })

    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', left)
      kb.off('keydown-RIGHT', right)
      kb.off('keydown-ESC', back)
      this.autoTimer?.remove()
      this.autoTimer = undefined
    })
  }

  update() {
    if (!this.autoTimer) return
    const r = this.autoTimer.getProgress()
    const g = this.progressGfx
    g.clear()
    g.fillStyle(C.surfaceTrack, 0.7)
    g.fillRect(SAFE.left, PROGRESS.y, SAFE.width, PROGRESS.h)
    g.fillStyle(C.oxide, 0.9)
    g.fillRect(SAFE.left, PROGRESS.y, SAFE.width * r, PROGRESS.h)
  }

  private refresh() {
    const track = ALL_TRACKS[this.index]
    const color = TIER_COLOR[track.tier]

    // tier-framed panels
    this.frameGfx.clear()
    for (const p of [POSTER, MAP]) {
      this.frameGfx.fillStyle(C.surfaceSunken, 0.92)
      this.frameGfx.fillRect(p.cx - p.w / 2 - 10, p.cy - p.h / 2 - 10, p.w + 20, p.h + 20)
      this.frameGfx.lineStyle(3, color, 0.9)
      this.frameGfx.strokeRect(p.cx - p.w / 2 - 10, p.cy - p.h / 2 - 10, p.w + 20, p.h + 20)
    }

    // poster (contain-fit inside its frame; handle owns the loading placeholder)
    const posterKey = trackPosterTextureFor(track.id) ?? `track-poster-${track.id}`
    this.posterHandle.setKey(posterKey, POSTER.w, POSTER.h)

    // live circuit outline from the real centerline
    this.mapGfx.clear()
    drawTrackMap(this.mapGfx, track, {
      cx: MAP.cx, cy: MAP.cy, width: MAP.w - 60, height: MAP.h - 60,
      color, lineWidth: 8, showStart: true, showSurface: true,
    })

    // informational band, all real data
    this.nameText.setText(track.name.toUpperCase()).setColor(hex(color))
    drawPlate(this.tierChipGfx, CHIP.w, CHIP.h, {
      face: C.surfacePlate, faceAlpha: 0.95, border: color, borderWidth: 2, chamfer: 8, glow: 1, glowColor: color, rivets: false,
    })
    this.tierText.setText(`${TIER_LABEL[track.tier]} TIER`).setColor(hex(color))
    this.lapsText.setText(`${track.laps} LAPS`)
    this.indexText.setText(`${this.index + 1} / ${ALL_TRACKS.length}`)
  }
}
