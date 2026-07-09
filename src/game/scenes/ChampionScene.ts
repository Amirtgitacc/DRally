import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { BOSS } from '../../data/boss'
import { carById } from '../../data/cars'
import { loadCareer } from '../state/saveGame'

/** The career's ending — shown once, after beating the champion 1-v-1. */
export class ChampionScene extends Phaser.Scene {
  constructor() {
    super('Champion')
  }

  create() {
    const career = loadCareer()
    const cx = GAME_WIDTH / 2

    // slow golden ember drift behind everything
    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: GAME_WIDTH },
      y: GAME_HEIGHT + 20,
      speedY: { min: -60, max: -20 },
      speedX: { min: -15, max: 15 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 6000,
      frequency: 90,
      tint: [0xc9a227, 0xf2a33c, 0xffe08a],
      blendMode: Phaser.BlendModes.ADD,
    })

    const title = this.add
      .text(cx, GAME_HEIGHT * 0.22, 'CHAMPION', {
        fontFamily: 'monospace',
        fontSize: '120px',
        color: '#c9a227',
        stroke: '#000000',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
    if (this.game.renderer.type === Phaser.WEBGL) {
      title.postFX.addGlow(0xc9a227, 4, 0, false, 0.1, 20)
    }

    this.add
      .text(cx, GAME_HEIGHT * 0.33, `${BOSS.name} is beaten. The ladder is yours, top to bottom.`, {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#e8e8f0',
      })
      .setOrigin(0.5)

    // the winning car, front and center
    const car = this.add.image(cx, GAME_HEIGHT * 0.47, `car-${career.carId}`).setScale(1.9).setAngle(-90)
    this.tweens.add({ targets: car, y: '-=12', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inout' })

    this.add
      .text(
        cx,
        GAME_HEIGHT * 0.7,
        [
          `Purse            $${BOSS.prizeCash}`,
          `Career winnings  $${career.cash} in the bank`,
          `Record           ${career.wins} wins in ${career.racesRun} races`,
          `Machine          ${carById(career.carId).name}`,
        ].join('\n'),
        {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#9aa0ac',
          lineSpacing: 10,
          align: 'left',
        },
      )
      .setOrigin(0.5)

    this.add
      .text(cx, GAME_HEIGHT * 0.8, 'They will come for your crown now. Every last one of them.', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#70707e',
      })
      .setOrigin(0.5)

    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.88, 'ENTER: MENU', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#e8e8f0',
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Menu'))
  }
}
