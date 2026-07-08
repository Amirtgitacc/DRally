import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../../config/game'
import { carById } from '../../data/cars'
import { hasSavedCareer, loadCareer, resetCareer } from '../state/saveGame'
import { audioBus } from '../systems/audio'

export class MenuScene extends Phaser.Scene {
  private careerText!: Phaser.GameObjects.Text

  constructor() {
    super('Menu')
  }

  create() {
    const cx = GAME_WIDTH / 2

    // drifting haze behind everything
    this.add.particles(0, 0, 'smoke', {
      x: { min: 0, max: GAME_WIDTH },
      y: { min: 0, max: GAME_HEIGHT },
      speedX: { min: 8, max: 30 },
      speedY: { min: -4, max: 4 },
      scale: { start: 1.6, end: 2.6 },
      alpha: { start: 0.05, end: 0 },
      lifespan: 9000,
      frequency: 400,
      tint: 0x2a2a3a,
    })

    const title = this.add
      .text(cx, GAME_HEIGHT * 0.3, 'DEATHRALLY', {
        fontFamily: 'monospace',
        fontSize: '84px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
    if (this.game.renderer.type === Phaser.WEBGL) {
      title.postFX.addGlow(0xf2a33c, 3, 0, false, 0.1, 18)
    }

    // player's current car cruising under the title
    const carSprite = this.add
      .image(cx, GAME_HEIGHT * 0.87, `car-${loadCareer().carId}`)
      .setScale(1.8)
      .setAngle(-90)
    this.tweens.add({ targets: carSprite, y: '-=10', duration: 1400, yoyo: true, repeat: -1, ease: 'sine.inout' })

    this.add
      .text(cx, GAME_HEIGHT * 0.44, 'dev build — working title', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8888a0',
      })
      .setOrigin(0.5)

    this.careerText = this.add
      .text(cx, GAME_HEIGHT * 0.55, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)
    this.refreshCareerLine()

    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.66, 'ENTER: GARAGE & RACE', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#e8e8f0',
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 })

    this.add
      .text(cx, GAME_HEIGHT * 0.74, 'N: new career (wipes save)', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#70707e',
      })
      .setOrigin(0.5)

    const kb = this.input.keyboard!
    kb.once('keydown', () => audioBus.unlock()) // browser audio needs a user gesture
    kb.once('keydown-ENTER', () => this.scene.start('Garage'))
    kb.on('keydown-N', () => {
      resetCareer()
      this.refreshCareerLine()
    })
    this.events.on('shutdown', () => kb.off('keydown-N'))
  }

  private refreshCareerLine() {
    if (!hasSavedCareer()) {
      this.careerText.setText('New driver — the Jackal and $500 await.')
      return
    }
    const c = loadCareer()
    this.careerText.setText(
      `${carById(c.carId).name} · $${c.cash} · ${c.points} pts · ${c.wins} wins in ${c.racesRun} races`,
    )
  }
}
