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
import { text } from './widgets'
import { whenReady } from '../textures/deferredLoad'

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

/** Dims the not-yet-loaded placeholder fill to read as an inert plate rather
 *  than a stray white flash (Phaser's built-in `__WHITE` is always present). */
const PLACEHOLDER_TEXTURE = '__WHITE'

export function sceneBackground(
  scene: Phaser.Scene,
  textureKey: string,
  options: SceneBackgroundOptions = {},
): SceneBackgroundHandle {
  const { veil: veilAlpha = 0.35, depth = SCENE_BG_DEPTH } = options

  const image = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, PLACEHOLDER_TEXTURE).setDepth(depth)
  let label: Phaser.GameObjects.Text | null = null

  // Deferred background art (most non-menu screens) may not have finished
  // streaming in yet — show a themed placeholder plate + label in its place
  // and swap the real art in the moment it's ready. CORE keys (bg-menu,
  // bg-mp, bg-lobby, and every race-path texture) always already exist here,
  // so this is a no-op for them.
  function applyTexture(key: string) {
    if (scene.textures.exists(key)) {
      label?.destroy()
      label = null
      image.clearTint()
      image.setTexture(key)
      cover(image)
      return
    }
    image.setTexture(PLACEHOLDER_TEXTURE).setTint(C.surfaceSunken)
    cover(image)
    label?.destroy()
    label = text(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'LOADING ART', {
      size: 'label',
      color: C.textMuted,
      origin: [0.5, 0.5],
    }).setDepth(depth + 2)
    whenReady([key], () => {
      if (!image.active) return
      applyTexture(key)
    })
  }

  applyTexture(textureKey)

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
      applyTexture(key)
    },
    setVeil(alpha: number) {
      veil?.setAlpha(alpha)
    },
    transform() {
      return coverTransform(GAME_WIDTH, GAME_HEIGHT, image.width, image.height)
    },
  }
}
