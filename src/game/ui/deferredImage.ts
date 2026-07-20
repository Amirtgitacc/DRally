/**
 * A `fitImage`-scaled image whose texture may still be streaming in (hero
 * renders, garage/dealer/venue poster art — see `textures/deferredLoad.ts`).
 * Shows a themed placeholder plate + "LOADING ART" label sized to the same
 * box until the real texture is ready, then swaps it in place. If the
 * scene swaps to a different key before the first one finishes (cycling
 * cars/tracks), only the still-current key is applied when it lands.
 */

import Phaser from 'phaser'
import { fitImage, text } from './widgets'
import { C } from './theme'
import { whenReady } from '../textures/deferredLoad'

const PLACEHOLDER_TEXTURE = '__WHITE'

export interface DeferredImageHandle {
  image: Phaser.GameObjects.Image
  /** Point the box at a different texture key, same max-fit box. */
  setKey(key: string, maxW: number, maxH: number): void
  destroy(): void
}

export function deferredImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  maxW: number,
  maxH: number,
): DeferredImageHandle {
  const image = scene.add.image(x, y, PLACEHOLDER_TEXTURE)
  let label: Phaser.GameObjects.Text | null = null
  let currentKey = ''

  function apply(k: string, w: number, h: number) {
    currentKey = k
    if (scene.textures.exists(k)) {
      label?.destroy()
      label = null
      image.clearTint()
      image.setTexture(k)
      fitImage(image, w, h)
      return
    }
    image.setTexture(PLACEHOLDER_TEXTURE).setTint(C.surfaceSunken).setDisplaySize(w, h)
    label?.destroy()
    label = text(scene, x, y, 'LOADING ART', { size: 'label', color: C.textMuted, origin: [0.5, 0.5] })
    whenReady([k], () => {
      if (!image.active || currentKey !== k) return
      apply(k, w, h)
    })
  }

  apply(key, maxW, maxH)

  return {
    image,
    setKey: apply,
    destroy() {
      label?.destroy()
      image.destroy()
    },
  }
}
