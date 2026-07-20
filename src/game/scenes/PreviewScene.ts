import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ALL_TRACKS } from '../../data/tracks'
import { drawTrackMap } from '../ui/trackMap'
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { backButton, fitImage, flavor, heading, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { trackPosterTextureFor } from '../textures/loadedAssets'

// Portrait 2:3 poster plate on the left, live circuit map on the right.
const POSTER = { cx: 385, cy: 475, w: 380, h: 570 }
const MAP = { cx: 1230, cy: 445, w: 1100, h: 500 }

export class PreviewScene extends Phaser.Scene {
  private index = 0
  private gfx!: Phaser.GameObjects.Graphics
  private frameGfx!: Phaser.GameObjects.Graphics
  private poster!: Phaser.GameObjects.Image
  private title!: Phaser.GameObjects.Text
  private meta!: Phaser.GameObjects.Text
  constructor() { super('Preview') }
  create() {
    this.index = 0
    sceneBackground(this, 'bg-race-ops', { veil: 0.52 })
    heading(this, GAME_WIDTH / 2, 70, 'NIGHT CIRCUIT PREVIEW')
    this.frameGfx = this.add.graphics()
    this.poster = this.add.image(POSTER.cx, POSTER.cy, '__DEFAULT').setVisible(false)
    this.gfx = this.add.graphics()
    this.title = text(this, GAME_WIDTH / 2, 830, '', { size: 'heading', origin: [0.5, 0.5] })
    this.meta = text(this, GAME_WIDTH / 2, 890, '', { size: 'bodyLg', color: C.textSecondary, origin: [0.5, 0.5] })
    flavor(this, GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Automatic venue reel · ←/→ browse · Esc menu')

    const browse = (d: number) => { this.index = (this.index + d + ALL_TRACKS.length) % ALL_TRACKS.length; this.refresh() }

    // Touch arrows: ‹ › for browsing (left/right)
    const cx = GAME_WIDTH / 2
    ;[-1, 1].forEach((dir) => {
      const arrow = text(this, cx + dir * 890, GAME_HEIGHT * 0.44, dir < 0 ? '‹' : '›', {
        size: 'title',
        color: C.oxide,
        origin: [0.5, 0.5],
      })
      // Pad the tap target well past the glyph's own bounds: at phone scale
      // (~2.2x canvas downscale) a bare title-size glyph hit area is far
      // under the ~44px minimum touch target.
      const pad = 70
      arrow.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-pad, -pad, arrow.width + pad * 2, arrow.height + pad * 2),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      })
      arrow.on('pointerdown', () => browse(dir))
      this.tweens.add({ targets: arrow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 })
    })

    backButton(this, () => this.scene.start('Menu'))
    const kb = this.input.keyboard!
    const left = () => browse(-1); const right = () => browse(1); const back = () => this.scene.start('Menu')
    kb.on('keydown-LEFT', left); kb.on('keydown-RIGHT', right); kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => { kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right); kb.off('keydown-ESC', back) })
    this.time.addEvent({ delay: 3000, loop: true, callback: () => browse(1) })
    this.refresh()
  }
  private refresh() {
    const track = ALL_TRACKS[this.index]; const color = TIER_COLOR[track.tier]
    // tier-framed portrait poster; contain-fit so the 2:3 art is never cropped
    this.frameGfx.clear()
    this.frameGfx.fillStyle(C.surfaceSunken, 0.92)
    this.frameGfx.fillRect(POSTER.cx - POSTER.w / 2 - 10, POSTER.cy - POSTER.h / 2 - 10, POSTER.w + 20, POSTER.h + 20)
    this.frameGfx.lineStyle(3, color, 0.9)
    this.frameGfx.strokeRect(POSTER.cx - POSTER.w / 2 - 10, POSTER.cy - POSTER.h / 2 - 10, POSTER.w + 20, POSTER.h + 20)
    const posterKey = trackPosterTextureFor(track.id)
    if (posterKey) {
      this.poster.setTexture(posterKey).setVisible(true)
      fitImage(this.poster, POSTER.w, POSTER.h)
    } else {
      this.poster.setVisible(false)
    }
    this.gfx.clear(); drawTrackMap(this.gfx, track, { cx: MAP.cx, cy: MAP.cy, width: MAP.w, height: MAP.h, color, lineWidth: 8, showStart: true, showSurface: true })
    this.title.setText(track.name).setColor(`#${color.toString(16).padStart(6, '0')}`)
    this.meta.setText(`${TIER_LABEL[track.tier]} TIER · ${track.laps} LAPS · ${this.index + 1}/${ALL_TRACKS.length}`)
  }
}
