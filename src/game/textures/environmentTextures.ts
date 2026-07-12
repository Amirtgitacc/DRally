import Phaser from 'phaser'

// Procedural environment textures for the proving ground. Canvas-based where
// gradients/noise are needed; replaced by authored art in later milestones.
// (asphalt, dirt, smoke, tire-wall are now authored WebP art loaded in BootScene.)

export function paintSkidStampTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0x0a0a0e)
  g.fillRoundedRect(0, 0, 10, 6, 2)
  g.generateTexture('skid-stamp', 10, 6)
  g.destroy()
}
