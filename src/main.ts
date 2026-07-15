import '@fontsource/oswald/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/oswald/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

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
import { NewCareerScene } from './game/scenes/NewCareerScene'
import { SettingsScene } from './game/scenes/SettingsScene'
import { MultiplayerScene } from './game/scenes/MultiplayerScene'
import { HallOfFameScene } from './game/scenes/HallOfFameScene'
import { CreditsScene } from './game/scenes/CreditsScene'
import { PreviewScene } from './game/scenes/PreviewScene'
import { PrepareRaceScene } from './game/scenes/PrepareRaceScene'
import { RacePauseScene } from './game/scenes/RacePauseScene'
import { initOrientation } from './game/systems/orientation'

/**
 * Phaser bakes glyph metrics into every Text object the moment it is created.
 * If a webfont lands after a scene has drawn, the layout stays measured against
 * the fallback for the rest of the session. So: load, then boot.
 */
async function fontsReady() {
  const faces = [
    '600 56px Oswald',
    '700 84px Oswald',
    '400 22px "JetBrains Mono"',
    '700 22px "JetBrains Mono"',
  ]
  try {
    await Promise.all(faces.map((f) => document.fonts.load(f)))
    await document.fonts.ready
  } catch {
    // A font failure must never cost the player the game — the CSS stacks in
    // theme.ts fall back to system faces and everything still renders.
  }
}

async function boot() {
  await fontsReady()

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
    input: { gamepad: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [
      BootScene,
      MenuScene,
      NewCareerScene,
      GarageScene,
      BlackMarketScene,
      CarDealerScene,
      VenuesScene,
      SignUpScene,
      PrepareRaceScene,
      RaceScene,
      RacePauseScene,
      ResultsScene,
      RankingScene,
      ChampionScene,
      HallOfFameScene,
      SettingsScene,
      MultiplayerScene,
      CreditsScene,
      PreviewScene,
    ],
  })

  // ?debug=1 exposes the game so scripted runs can jump straight to a scene
  // (`__game.scene.start('Race')`) instead of walking the menus.
  if (DEBUG) (window as unknown as Record<string, unknown>).__game = game

  initOrientation()
}

void boot()
