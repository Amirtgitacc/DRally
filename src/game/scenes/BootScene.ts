import Phaser from 'phaser'
import { CAR_CATALOG } from '../../data/cars'
import { ROSTER } from '../../data/roster'
import { BOSS } from '../../data/boss'
import { paintCarTexture } from '../textures/vehicleTextures'
import {
  paintAsphaltTexture,
  paintDirtTexture,
  paintSkidStampTexture,
  paintSmokeTexture,
  paintTireWallTexture,
} from '../textures/environmentTextures'
import {
  paintBulletTexture,
  paintEdgeFlashTexture,
  paintFlameConeTexture,
  paintMineTexture,
  paintPickupTextures,
  paintRingTexture,
  paintScorchTexture,
  paintSparkTexture,
} from '../textures/combatTextures'
import {
  paintChevronTexture,
  paintDebrisTexture,
  paintGlowTexture,
  paintPoleTexture,
} from '../textures/lightTextures'

// All current assets are procedural placeholders generated here.
// Authored art replaces these texture keys later without touching game code.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
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
    paintAsphaltTexture(this)
    paintDirtTexture(this)
    paintSmokeTexture(this)
    paintSkidStampTexture(this)
    paintTireWallTexture(this)
    paintBulletTexture(this)
    paintMineTexture(this)
    paintRingTexture(this)
    paintSparkTexture(this)
    paintScorchTexture(this)
    paintFlameConeTexture(this)
    paintEdgeFlashTexture(this)
    paintPickupTextures(this)
    paintGlowTexture(this)
    paintPoleTexture(this)
    paintChevronTexture(this)
    paintDebrisTexture(this)
    this.scene.start('Menu')
  }
}
