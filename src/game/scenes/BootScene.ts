import Phaser from 'phaser'
import { CAR_CATALOG } from '../../data/cars'
import { ROSTER } from '../../data/roster'
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
  paintMineTexture,
  paintPickupTextures,
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
      paintCarTexture(this, `car-${car.id}`, car.bodyColor, car.accentColor)
    }
    for (const d of ROSTER) {
      paintCarTexture(this, `car-${d.id}`, d.bodyColor, d.accentColor)
    }
    paintAsphaltTexture(this)
    paintDirtTexture(this)
    paintSmokeTexture(this)
    paintSkidStampTexture(this)
    paintTireWallTexture(this)
    paintBulletTexture(this)
    paintMineTexture(this)
    paintSparkTexture(this)
    paintScorchTexture(this)
    paintPickupTextures(this)
    paintGlowTexture(this)
    paintPoleTexture(this)
    paintChevronTexture(this)
    paintDebrisTexture(this)
    this.scene.start('Menu')
  }
}
