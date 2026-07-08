import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from './config/game'
import { BootScene } from './game/scenes/BootScene'
import { MenuScene } from './game/scenes/MenuScene'
import { RaceScene } from './game/scenes/RaceScene'
import { ResultsScene } from './game/scenes/ResultsScene'
import { GarageScene } from './game/scenes/GarageScene'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0b10',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GarageScene, RaceScene, ResultsScene],
})
