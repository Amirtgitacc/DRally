import Phaser from 'phaser'
import { paintSkidStampTexture } from '../textures/environmentTextures'
import {
  paintEdgeFlashTexture,
  paintFlameConeTexture,
  paintMineTexture,
  paintRingTexture,
  paintScorchTexture,
} from '../textures/combatTextures'
import {
  paintChevronTexture,
  paintDebrisTexture,
  paintGlowTexture,
} from '../textures/lightTextures'
import { LOADED_TEXTURES, LOADED_FX_TEXTURES, LOADED_HERO_TEXTURES, LOADED_TOP_TEXTURES, LOADED_SCREEN_TEXTURES } from '../textures/loadedAssets'

// Authored WebP art (BootScene.preload) covers cars, surfaces, and FX;
// remaining procedural textures (skid stamps, combat FX, light FX) are
// painted below.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    for (const t of [...LOADED_TEXTURES, ...LOADED_FX_TEXTURES, ...LOADED_HERO_TEXTURES, ...LOADED_TOP_TEXTURES, ...LOADED_SCREEN_TEXTURES]) this.load.image(t.key, t.url)
  }

  create() {
    // asphalt, dirt, tire-wall, pole, pk-*, spark, and smoke now loaded as WebP
    // (LOADED_TEXTURES / LOADED_FX_TEXTURES); cars now load as top-down WebP.
    paintSkidStampTexture(this)
    paintMineTexture(this)
    paintRingTexture(this)
    paintScorchTexture(this)
    paintFlameConeTexture(this)
    paintEdgeFlashTexture(this)
    paintGlowTexture(this) // glow-soft: cat-eye reflectors + light pools, kept (separate from pole)
    paintChevronTexture(this)
    paintDebrisTexture(this)
    this.scene.start('Menu')
  }
}
