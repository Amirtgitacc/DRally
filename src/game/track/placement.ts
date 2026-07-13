import Phaser from 'phaser'
import { spacedPosesAlong, type Vec2 } from '../../core/track/geometry'

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
