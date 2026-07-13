import Phaser from 'phaser'
import { CAR_CATALOG } from '../../data/cars'
import { ROSTER } from '../../data/roster'
import { BOSS } from '../../data/boss'
import { paintCarTexture } from '../textures/vehicleTextures'
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
import { LOADED_TEXTURES, LOADED_FX_TEXTURES, LOADED_HERO_TEXTURES, LOADED_TOP_TEXTURES } from '../textures/loadedAssets'

// Authored WebP art (BootScene.preload) replaces the matching procedural
// texture keys; every key NOT loaded stays painted below.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    for (const t of [...LOADED_TEXTURES, ...LOADED_FX_TEXTURES, ...LOADED_HERO_TEXTURES, ...LOADED_TOP_TEXTURES]) this.load.image(t.key, t.url)
  }

  create() {
    for (const car of CAR_CATALOG) {
      paintCarTexture(this, `car-${car.id}`, car.bodyColor, car.accentColor, car.variant)
    }
    // rivals climb the chassis ladder with rank, so every driver gets all
    // three silhouettes in their livery
    for (const d of ROSTER) {
      for (const variant of ['compact', 'muscle', 'sleek'] as const) {
        paintCarTexture(this, `car-${d.id}-${variant}`, d.bodyColor, d.accentColor, variant)
      }
    }
    paintCarTexture(this, `car-${BOSS.id}`, BOSS.bodyColor, BOSS.accentColor, 'sleek')
    // asphalt, dirt, tire-wall, pole, pk-*, spark, and smoke now loaded as WebP
    // (LOADED_TEXTURES / LOADED_FX_TEXTURES)
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
