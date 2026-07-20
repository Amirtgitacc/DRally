import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ALL_TRACKS, type TrackDef } from '../../data/tracks'
import { catmullRomClosed, closedPolylineLength } from '../../core/track/geometry'
import { drawTrackMap } from '../ui/trackMap'
import { C, TIER_COLOR, TIER_LABEL, hex } from '../ui/theme'
import { backButton, fitImage, flavor, heading, sectionLabel, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { trackPosterTextureFor } from '../textures/loadedAssets'
import { whenReady } from '../textures/deferredLoad'
import { loadCareer } from '../state/saveGame'
import { formatTime } from '../../core/race/format'

/** Scale from track px to something that reads as a distance. */
const PX_PER_MILE = 6000

// Poster art is authored portrait 2:3 — it is framed, never cropped to cover.
const POSTER = { cx: 400, cy: 505, w: 400, h: 600 }
const MAP = { cx: 1245, cy: 470, w: 1130, h: 520 }

/** A gallery of every venue: the promo poster plus the layout you will drive. */
export class VenuesScene extends Phaser.Scene {
  private idx = 0
  private mapGfx!: Phaser.GameObjects.Graphics
  private frameGfx!: Phaser.GameObjects.Graphics
  private poster!: Phaser.GameObjects.Image
  private posterCurrentKey = ''
  private posterLabel: Phaser.GameObjects.Text | null = null
  private nameText!: Phaser.GameObjects.Text
  private metaText!: Phaser.GameObjects.Text
  private dotsGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('Venues')
  }

  create() {
    this.idx = 0
    const cx = GAME_WIDTH / 2

    sceneBackground(this, 'bg-race-ops', { veil: 0.52 })
    heading(this, cx, 70, 'VENUES')

    // portrait poster frame (left) + the real centerline-derived map (right):
    // the art sells the venue, the map is the truth of what gets driven
    this.frameGfx = this.add.graphics()
    this.poster = this.add.image(POSTER.cx, POSTER.cy, '__DEFAULT').setVisible(false)
    sectionLabel(this, POSTER.cx - POSTER.w / 2, POSTER.cy - POSTER.h / 2 - 34, 'VENUE POSTER', C.textMuted)
    sectionLabel(this, MAP.cx - MAP.w / 2, POSTER.cy - POSTER.h / 2 - 34, 'CIRCUIT LAYOUT', C.textMuted)

    this.mapGfx = this.add.graphics()
    this.dotsGfx = this.add.graphics()

    ;[-1, 1].forEach((dir) => {
      // arrows stay mono: Oswald has no glyph for ◄ / ► and would fall back mid-string
      const arrow = text(this, cx + dir * 890, GAME_HEIGHT * 0.44, dir < 0 ? '◄' : '►', {
        size: 'title',
        color: C.oxide,
        origin: [0.5, 0.5],
      }).setInteractive({ useHandCursor: true })
      arrow.on('pointerdown', () => this.browse(dir))
      this.tweens.add({ targets: arrow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 })
    })

    this.nameText = text(this, cx, GAME_HEIGHT - 220, '', { size: 'heading', origin: [0.5, 0.5] })
    this.metaText = text(this, cx, GAME_HEIGHT - 155, '', {
      size: 'action',
      color: C.textSecondary,
      align: 'center',
      lineSpacing: 8,
      origin: [0.5, 0],
    })

    flavor(this, cx, GAME_HEIGHT - 60, '←/→ browse · Esc menu')

    backButton(this, () => this.scene.start('Menu'))

    const kb = this.input.keyboard!
    kb.on('keydown-LEFT', () => this.browse(-1))
    kb.on('keydown-RIGHT', () => this.browse(1))
    kb.on('keydown-ESC', () => this.scene.start('Menu'))
    this.events.on('shutdown', () => {
      kb.off('keydown-LEFT')
      kb.off('keydown-RIGHT')
      kb.off('keydown-ESC')
    })

    this.refresh()
  }

  private browse(dir: number) {
    this.idx = (this.idx + dir + ALL_TRACKS.length) % ALL_TRACKS.length
    this.refresh()
  }

  private lapDistance(track: TrackDef): string {
    const line = catmullRomClosed(track.controls, track.samplesPerSegment)
    return (closedPolylineLength(line) / PX_PER_MILE).toFixed(2)
  }

  private refresh() {
    const track = ALL_TRACKS[this.idx]
    const record = loadCareer().records[track.id]
    const color = TIER_COLOR[track.tier]

    // poster inside its tier-colored plate; contain-fit keeps the 2:3 ratio
    this.frameGfx.clear()
    this.frameGfx.fillStyle(C.surfaceSunken, 0.92)
    this.frameGfx.fillRect(POSTER.cx - POSTER.w / 2 - 10, POSTER.cy - POSTER.h / 2 - 10, POSTER.w + 20, POSTER.h + 20)
    this.frameGfx.lineStyle(3, color, 0.9)
    this.frameGfx.strokeRect(POSTER.cx - POSTER.w / 2 - 10, POSTER.cy - POSTER.h / 2 - 10, POSTER.w + 20, POSTER.h + 20)
    const posterKey = trackPosterTextureFor(track.id)
    this.posterCurrentKey = posterKey ?? ''
    this.posterLabel?.destroy()
    this.posterLabel = null
    if (posterKey && this.textures.exists(posterKey)) {
      this.poster.setTexture(posterKey).setVisible(true)
      fitImage(this.poster, POSTER.w, POSTER.h)
    } else {
      this.poster.setVisible(false)
      if (posterKey) {
        // Deferred art still streaming in — the tier-coloured frame above
        // already reads as a placeholder; label it and swap in once ready.
        this.posterLabel = text(this, POSTER.cx, POSTER.cy, 'LOADING ART', {
          size: 'label', color: C.textMuted, origin: [0.5, 0.5],
        })
        whenReady([posterKey], () => {
          // .active guards the scene having shut down before the art landed
          if (!this.poster.active || this.posterCurrentKey !== posterKey) return
          this.poster.setTexture(posterKey).setVisible(true)
          fitImage(this.poster, POSTER.w, POSTER.h)
          this.posterLabel?.destroy()
          this.posterLabel = null
        })
      }
    }

    this.mapGfx.clear()
    drawTrackMap(this.mapGfx, track, {
      cx: MAP.cx,
      cy: MAP.cy,
      width: MAP.w,
      height: MAP.h,
      color,
      lineWidth: 6,
      showStart: true,
      showSurface: true,
    })

    this.nameText.setText(track.name).setColor(hex(color))
    const lap = this.lapDistance(track)
    this.metaText.setText(
      [`${TIER_LABEL[track.tier]} TIER · ${track.laps} laps · ${lap} mi/lap · ${(Number(lap) * track.laps).toFixed(2)} mi total`, record ? `Record: lap ${record.bestLapMs ? formatTime(record.bestLapMs) : '—'} · race ${record.bestRaceMs ? formatTime(record.bestRaceMs) : '—'} · ${record.wins} wins` : 'No record yet.'].join('\n'),
    )

    // position dots — which venue you are looking at
    this.dotsGfx.clear()
    const dotY = GAME_HEIGHT - 82
    const startX = GAME_WIDTH / 2 - ((ALL_TRACKS.length - 1) * 26) / 2
    ALL_TRACKS.forEach((_, i) => {
      this.dotsGfx.fillStyle(i === this.idx ? C.oxide : C.border, 1)
      this.dotsGfx.fillCircle(startX + i * 26, dotY, i === this.idx ? 7 : 5)
    })
  }
}
