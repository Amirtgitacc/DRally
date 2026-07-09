import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ALL_TRACKS } from '../../data/tracks'
import type { TrackDef } from '../../data/tracks/testCircuit'
import type { RaceTier } from '../../data/economy'
import { catmullRomClosed, closedPolylineLength } from '../../core/track/geometry'
import { drawTrackMap } from '../ui/trackMap'

const TIER_LABEL: Record<RaceTier, string> = { street: 'STREET', pro: 'PRO', death: 'DEATH' }
const TIER_COLOR: Record<RaceTier, number> = { street: 0x3fd07f, pro: 0x4f8fd0, death: 0xd23c2f }

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

    this.add
      .text(cx, 70, 'VENUES', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)

    this.mapGfx = this.add.graphics()
    this.dotsGfx = this.add.graphics()

    ;[-1, 1].forEach((dir) => {
      const arrow = this.add
        .text(cx + dir * 700, GAME_HEIGHT * 0.48, dir < 0 ? '◄' : '►', {
          fontFamily: 'monospace',
          fontSize: '54px',
          color: '#f2a33c',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
      arrow.on('pointerdown', () => this.browse(dir))
      this.tweens.add({ targets: arrow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 })
    })

    this.nameText = this.add
      .text(cx, GAME_HEIGHT - 220, '', { fontFamily: 'monospace', fontSize: '42px', color: '#e8e8f0' })
      .setOrigin(0.5)
    this.metaText = this.add
      .text(cx, GAME_HEIGHT - 155, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#9aa0ac',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)

    this.add
      .text(cx, GAME_HEIGHT - 60, '←/→ browse · Esc menu', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#70707e',
      })
      .setOrigin(0.5)

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

    this.nameText.setText(track.name).setColor(`#${color.toString(16).padStart(6, '0')}`)
    const lap = this.lapDistance(track)
    this.metaText.setText(
      `${TIER_LABEL[track.tier]} TIER · ${track.laps} laps · ${lap} mi/lap · ${(Number(lap) * track.laps).toFixed(2)} mi total`,
    )

    // position dots — which venue of six you are looking at
    this.dotsGfx.clear()
    const dotY = GAME_HEIGHT - 105
    const startX = GAME_WIDTH / 2 - ((ALL_TRACKS.length - 1) * 26) / 2
    ALL_TRACKS.forEach((_, i) => {
      this.dotsGfx.fillStyle(i === this.idx ? 0xf2a33c : 0x3a3a46, 1)
      this.dotsGfx.fillCircle(startX + i * 26, dotY, i === this.idx ? 7 : 5)
    })
  }
}
