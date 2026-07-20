import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { BOSS } from '../../data/boss'
import { carById } from '../../data/cars'
import { loadCareer } from '../state/saveGame'
import { C } from '../ui/theme'
import { flavor, heading, prompt, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage } from '../ui/deferredImage'

/** The career's ending — shown once, after beating the champion 1-v-1. */
export class ChampionScene extends Phaser.Scene {
  constructor() {
    super('Champion')
  }

  create() {
    const career = loadCareer()
    const cx = GAME_WIDTH / 2

    sceneBackground(this, 'bg-champion', { veil: 0.3 })

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

    heading(this, cx, GAME_HEIGHT * 0.22, 'CHAMPION', {
      size: 'display',
      color: C.gold,
      strokeThickness: 12,
      glow: true,
    })

    text(this, cx, GAME_HEIGHT * 0.33, `${career.profile.driverName}, ${BOSS.name} is beaten. The ladder is yours.`, {
      size: 'bodyLg',
      origin: [0.5, 0.5],
    })

    // the winning car, front and center
    const car = deferredImage(this, cx, GAME_HEIGHT * 0.47, `car-hero-${career.carId}`, 480, 260).image
    this.tweens.add({ targets: car, y: '-=12', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inout' })

    const record = [
      `Purse            $${BOSS.prizeCash}`,
      `Career winnings  $${career.cash} in the bank`,
      `Record           ${career.wins} wins in ${career.racesRun} races`,
      `Machine          ${carById(career.carId).name}`,
    ].join('\n')
    text(this, cx, GAME_HEIGHT * 0.7, record, {
      size: 'bodyLg',
      color: C.textSecondary,
      lineSpacing: 10,
      align: 'left',
      origin: [0.5, 0.5],
    })

    flavor(this, cx, GAME_HEIGHT * 0.8, 'They will come for your crown now. Every last one of them.')

    prompt(this, cx, GAME_HEIGHT * 0.88, 'ENTER: MENU')

    this.add
      .zone(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setInteractive()
      .on('pointerup', () => this.scene.start('Menu'))

    const kb = this.input.keyboard!
    const back = () => this.scene.start('Menu')
    kb.on('keydown-ENTER', back)
    this.events.once('shutdown', () => kb.off('keydown-ENTER', back))
  }
}
