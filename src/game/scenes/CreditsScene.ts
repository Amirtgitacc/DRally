import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { C } from '../ui/theme'
import { backButton, flavor, heading, panel, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'

export class CreditsScene extends Phaser.Scene {
  constructor() { super('Credits') }
  create() {
    sceneBackground(this, 'bg-records', { veil: 0.62 })
    heading(this, GAME_WIDTH / 2, 100, 'CREDITS')
    panel(this, GAME_WIDTH / 2, 520, 1000, 650, { stroke: C.border, strokeAlpha: 1 })
    text(this, GAME_WIDTH / 2, 270, ['DEATHRALLY — WORKING TITLE', '', 'An original browser combat-racing game.', 'Design, code, procedural art and synthesized audio', 'created for this project.', '', 'Built with Phaser, TypeScript and Vite.', 'Oswald and JetBrains Mono distributed under their licenses.', '', 'Inspired by the spirit of 1990s top-down racers;', 'no original game assets, names, copy, branding or layouts are used.'].join('\n'), { size: 'bodyLg', color: C.textBody, align: 'center', lineSpacing: 12, origin: [0.5, 0] })
    flavor(this, GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Esc / Enter: menu')

    // Touch zone: full-screen tap to go back (added before backButton so it has lower depth)
    this.add
      .zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setInteractive()
      .on('pointerup', () => this.scene.start('Menu'))

    backButton(this, () => this.scene.start('Menu'))
    const kb = this.input.keyboard!
    const back = () => this.scene.start('Menu')
    kb.on('keydown-ESC', back); kb.on('keydown-ENTER', back)
    this.events.once('shutdown', () => { kb.off('keydown-ESC', back); kb.off('keydown-ENTER', back) })
  }
}
