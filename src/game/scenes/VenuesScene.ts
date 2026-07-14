import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ALL_TRACKS } from '../../data/tracks'
import type { TrackDef } from '../../data/tracks/testCircuit'
import { catmullRomClosed, closedPolylineLength } from '../../core/track/geometry'
import { drawTrackMap } from '../ui/trackMap'
import { C, TIER_COLOR, TIER_LABEL, hex } from '../ui/theme'
import { backButton, flavor, heading, text } from '../ui/widgets'
import { loadCareer } from '../state/saveGame'
import { formatTime } from '../../core/race/format'

/** Scale from track px to something that reads as a distance. */
const PX_PER_MILE = 6000

/** A gallery of every venue: the layout you will be driving, at full size. */
export class VenuesScene extends Phaser.Scene {
  private idx = 0
  private mapGfx!: Phaser.GameObjects.Graphics
  private nameText!: Phaser.GameObjects.Text
  private metaText!: Phaser.GameObjects.Text
  private dotsGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('Venues')
  }

  create() {
    this.idx = 0
    const cx = GAME_WIDTH / 2

    heading(this, cx, 70, 'VENUES')

    this.mapGfx = this.add.graphics()
    this.dotsGfx = this.add.graphics()

    ;[-1, 1].forEach((dir) => {
      // arrows stay mono: Oswald has no glyph for ◄ / ► and would fall back mid-string
      const arrow = text(this, cx + dir * 700, GAME_HEIGHT * 0.48, dir < 0 ? '◄' : '►', {
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

    this.mapGfx.clear()
    drawTrackMap(this.mapGfx, track, {
      cx: GAME_WIDTH / 2,
      cy: GAME_HEIGHT * 0.45,
      width: 1080,
      height: 540,
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

    // position dots — which venue of six you are looking at
    this.dotsGfx.clear()
    const dotY = GAME_HEIGHT - 105
    const startX = GAME_WIDTH / 2 - ((ALL_TRACKS.length - 1) * 26) / 2
    ALL_TRACKS.forEach((_, i) => {
      this.dotsGfx.fillStyle(i === this.idx ? C.oxide : C.border, 1)
      this.dotsGfx.fillCircle(startX + i * 26, dotY, i === this.idx ? 7 : 5)
    })
  }
}
