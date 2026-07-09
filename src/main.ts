import Phaser from 'phaser'
import { DEBUG, GAME_WIDTH, GAME_HEIGHT } from './config/game'
import { BootScene } from './game/scenes/BootScene'
import { MenuScene } from './game/scenes/MenuScene'
import { RaceScene } from './game/scenes/RaceScene'
import { ResultsScene } from './game/scenes/ResultsScene'
import { SignUpScene } from './game/scenes/SignUpScene'
import { RankingScene } from './game/scenes/RankingScene'
import { GarageScene } from './game/scenes/GarageScene'
import { BlackMarketScene } from './game/scenes/BlackMarketScene'
import { CarDealerScene } from './game/scenes/CarDealerScene'
import { VenuesScene } from './game/scenes/VenuesScene'
import { ChampionScene } from './game/scenes/ChampionScene'

const game = new Phaser.Game({
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
  scene: [
    BootScene,
    MenuScene,
    GarageScene,
    BlackMarketScene,
    CarDealerScene,
    VenuesScene,
    SignUpScene,
    RaceScene,
    ResultsScene,
    RankingScene,
    ChampionScene,
  ],
})

// ?debug=1 exposes the game so scripted runs can jump straight to a scene
// (`__game.scene.start('Race')`) instead of walking the menus.
if (DEBUG) (window as unknown as Record<string, unknown>).__game = game
