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
import {
  LOADED_TEXTURES,
  LOADED_FX_TEXTURES,
  LOADED_HERO_TEXTURES,
  LOADED_TOP_TEXTURES,
  LOADED_SCREEN_TEXTURES,
  LOADED_TOP_VARIANT_TEXTURES,
  LOADED_MP_ONLY_TEXTURES,
  LOADED_POSTER_TEXTURES,
  LOADED_POSTER_VARIANT_TEXTURES,
  LOADED_TRACK_POSTER_TEXTURES,
  LOADED_ENVIRONMENT_TEXTURES,
} from '../textures/loadedAssets'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { C } from '../ui/theme'
import { panel, text } from '../ui/widgets'
import { formatLoadPercent, progressBarWidth } from '../ui/loadingProgress'

const BAR_WIDTH = 700
const BAR_HEIGHT = 32
const BAR_NOTCH = 10
/** Inset of the fill rectangle from the plate's edges, clear of the notched corners. */
const BAR_INSET = 9

// Authored WebP art (BootScene.preload) covers cars, surfaces, and FX;
// remaining procedural textures (skid stamps, combat FX, light FX) are
// painted below.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    this.buildLoadingUi()

    for (const t of [
      ...LOADED_TEXTURES,
      ...LOADED_FX_TEXTURES,
      ...LOADED_HERO_TEXTURES,
      ...LOADED_TOP_TEXTURES,
      ...LOADED_SCREEN_TEXTURES,
      ...LOADED_TOP_VARIANT_TEXTURES,
      ...LOADED_MP_ONLY_TEXTURES,
      ...LOADED_POSTER_TEXTURES,
      ...LOADED_POSTER_VARIANT_TEXTURES,
      ...LOADED_TRACK_POSTER_TEXTURES,
      ...LOADED_ENVIRONMENT_TEXTURES,
    ])
      this.load.image(t.key, t.url)
  }

  /**
   * Themed loading screen: title treatment + a real progress bar driven by the
   * loader's own 'progress' events. Deliberately reads only this scene's load
   * queue (via Phaser's loader progress, not the asset list itself) so a later
   * task can move some assets to a background load without this UI caring.
   */
  private buildLoadingUi() {
    const centerX = GAME_WIDTH / 2
    const barY = GAME_HEIGHT / 2 + 60

    text(this, centerX, GAME_HEIGHT / 2 - 90, 'DEATHRALLY', {
      size: 'hero',
      face: 'display',
      weight: 600,
      letterSpacing: 6,
      color: C.oxide,
      stroke: C.shadow,
      strokeThickness: 8,
      origin: [0.5, 0.5],
    })
    const subtitle = text(this, centerX, GAME_HEIGHT / 2 - 20, 'WORKING TITLE', {
      size: 'caption',
      face: 'display',
      weight: 500,
      letterSpacing: 6,
      color: C.textMuted,
      origin: [0.5, 0.5],
    })
    // Slow, low-contrast blink — reads as "still alive", not a flash/strobe.
    this.tweens.add({ targets: subtitle, alpha: 0.5, duration: 900, yoyo: true, repeat: -1 })

    panel(this, centerX, barY, BAR_WIDTH, BAR_HEIGHT, {
      fill: C.surfaceHud,
      fillAlpha: 1,
      stroke: C.oxideDim,
      strokeAlpha: 0.6,
      notch: BAR_NOTCH,
    })

    const fillMaxWidth = BAR_WIDTH - BAR_INSET * 2
    const fillHeight = BAR_HEIGHT - BAR_INSET * 2
    const fillLeft = centerX - fillMaxWidth / 2
    const fill = this.add
      .rectangle(fillLeft, barY, 0, fillHeight, C.oxide)
      .setOrigin(0, 0.5)

    const percent = text(this, centerX, barY + 42, '0%', {
      size: 'body',
      face: 'mono',
      color: C.textSecondary,
      origin: [0.5, 0.5],
    })

    this.load.on('progress', (value: number) => {
      fill.setSize(progressBarWidth(value, fillMaxWidth), fillHeight)
      percent.setText(formatLoadPercent(value))
    })

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[Boot] failed to load asset "${file.key}" (${file.src}) — continuing without it.`)
    })
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
