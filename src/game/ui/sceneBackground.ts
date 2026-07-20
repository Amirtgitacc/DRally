/**
 * The one way scenes wear their authored 1920×1080 background art.
 *
 * `sceneBackground()` covers the internal canvas with an image at a fixed
 * negative depth, drops an optional near-black readability veil just above it,
 * and hands back handles so a scene can swap the texture (venues browse tracks)
 * or nudge the veil. It is deliberately presentational — no navigation, no game
 * state. Works under both the WebGL and Canvas renderers (plain Image + Rect).
 */

import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { BackgroundTransform, coverTransform } from './backgroundTransform'
import { C } from './theme'

/** Backgrounds sit well below the -100 that procedural grain used to occupy. */
export const SCENE_BG_DEPTH = -1000

export interface SceneBackgroundOptions {
  /** 0..1 near-black veil opacity above the art, below UI. Default 0.35; 0 skips it. */
  veil?: number
  /** Base depth for the image; the veil sits one above it. Default SCENE_BG_DEPTH. */
  depth?: number
}

export interface SceneBackgroundHandle {
  image: Phaser.GameObjects.Image
  veil: Phaser.GameObjects.Rectangle | null
  /** Swap the art without recreating objects — venues/preview browse in place. */
  setTexture(key: string): void
  setVeil(alpha: number): void
  /**
   * The art-space → canvas-space transform currently applied to the image.
   * Overlays anchored to features baked into the art must map through this so
   * they can never drift from it (see menu plate hover rects).
   */
  transform(): BackgroundTransform
}

/** Scale the image to cover the whole canvas without stretching (uniform scale). */
function cover(image: Phaser.GameObjects.Image) {
  const { scale } = coverTransform(GAME_WIDTH, GAME_HEIGHT, image.width, image.height)
  image.setScale(scale).setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
}

export function sceneBackground(
  scene: Phaser.Scene,
  textureKey: string,
  options: SceneBackgroundOptions = {},
): SceneBackgroundHandle {
  const { veil: veilAlpha = 0.35, depth = SCENE_BG_DEPTH } = options

  const image = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, textureKey).setDepth(depth)
  cover(image)

  let veil: Phaser.GameObjects.Rectangle | null = null
  if (veilAlpha > 0) {
    veil = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, C.shadow, veilAlpha)
      .setDepth(depth + 1)
  }

  return {
    image,
    veil,
    setTexture(key: string) {
      image.setTexture(key)
      cover(image)
    },
    setVeil(alpha: number) {
      veil?.setAlpha(alpha)
    },
    transform() {
      return coverTransform(GAME_WIDTH, GAME_HEIGHT, image.width, image.height)
    },
  }
}
