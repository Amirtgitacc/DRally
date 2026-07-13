import Phaser from 'phaser'
import { spacedPosesAlong, type Pose, type Vec2 } from '../../core/track/geometry'

/**
 * Place `key` sprites evenly along a closed polyline, each rotated to the local
 * tangent so the art follows the track curve. Returns the created images so the
 * caller can further tint/scale them.
 */
export function placeSpritesAlong(
  scene: Phaser.Scene,
  path: Vec2[],
  key: string,
  spacing: number,
  depth: number,
  scale = 1,
): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = []
  for (const pose of spacedPosesAlong(path, spacing)) {
    const img = scene.add
      .image(pose.x, pose.y, key)
      .setRotation(pose.angle)
      .setScale(scale)
      .setDepth(depth)
    images.push(img)
  }
  return images
}

/**
 * Place a randomized sprite at each pose. For every pose the same seeded `rng`
 * picks a key from `keys`, a scale in [minScale, maxScale], and (if `jitter`)
 * a small rotation offset around the pose's tangent angle. Returns the images.
 */
export function scatterImages(
  scene: Phaser.Scene,
  poses: Pose[],
  keys: string[],
  rng: () => number,
  opts: { depth: number; minScale: number; maxScale: number; jitter?: number; alpha?: number },
): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = []
  for (const pose of poses) {
    // clamp guards the rng()===1 edge so the index can never fall off the end
    const key = keys[Math.min(keys.length - 1, Math.floor(rng() * keys.length))]
    const scale = opts.minScale + rng() * (opts.maxScale - opts.minScale)
    const rot = pose.angle + (opts.jitter ? (rng() * 2 - 1) * opts.jitter : 0)
    images.push(
      scene.add
        .image(pose.x, pose.y, key)
        .setRotation(rot)
        .setScale(scale)
        .setDepth(opts.depth)
        .setAlpha(opts.alpha ?? 1),
    )
  }
  return images
}
