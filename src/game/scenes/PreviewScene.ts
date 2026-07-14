import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ALL_TRACKS } from '../../data/tracks'
import { drawTrackMap } from '../ui/trackMap'
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { backButton, flavor, heading, metalGrain, text } from '../ui/widgets'

export class PreviewScene extends Phaser.Scene {
  private index = 0
  private gfx!: Phaser.GameObjects.Graphics
  private title!: Phaser.GameObjects.Text
  private meta!: Phaser.GameObjects.Text
  constructor() { super('Preview') }
  create() {
    this.index = 0
    metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)
    heading(this, GAME_WIDTH / 2, 70, 'NIGHT CIRCUIT PREVIEW')
    this.gfx = this.add.graphics()
    this.title = text(this, GAME_WIDTH / 2, 790, '', { size: 'heading', origin: [0.5, 0.5] })
    this.meta = text(this, GAME_WIDTH / 2, 850, '', { size: 'bodyLg', color: C.textSecondary, origin: [0.5, 0.5] })
    flavor(this, GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Automatic venue reel · ←/→ browse · Esc menu')
    backButton(this, () => this.scene.start('Menu'))
    const browse = (d: number) => { this.index = (this.index + d + ALL_TRACKS.length) % ALL_TRACKS.length; this.refresh() }
    const kb = this.input.keyboard!
    const left = () => browse(-1); const right = () => browse(1); const back = () => this.scene.start('Menu')
    kb.on('keydown-LEFT', left); kb.on('keydown-RIGHT', right); kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => { kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right); kb.off('keydown-ESC', back) })
    this.time.addEvent({ delay: 3000, loop: true, callback: () => browse(1) })
    this.refresh()
  }
  private refresh() {
    const track = ALL_TRACKS[this.index]; const color = TIER_COLOR[track.tier]
    this.gfx.clear(); drawTrackMap(this.gfx, track, { cx: GAME_WIDTH / 2, cy: 455, width: 1300, height: 620, color, lineWidth: 8, showStart: true, showSurface: true })
    this.title.setText(track.name).setColor(`#${color.toString(16).padStart(6, '0')}`)
    this.meta.setText(`${TIER_LABEL[track.tier]} TIER · ${track.laps} LAPS · ${this.index + 1}/${ALL_TRACKS.length}`)
  }
}
