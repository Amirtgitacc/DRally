import Phaser from 'phaser'

// Additive-blend glow sprites carry the night-race look — cheaper and softer
// than Phaser's normal-mapped light pipeline, and they tint freely.

export function paintGlowTexture(scene: Phaser.Scene) {
  const size = 256
  const tex = scene.textures.createCanvas('glow-soft', size, size)!
  const ctx = tex.getContext()
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.5)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}

export function paintPoleTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0x0a0a0e, 1)
  g.fillCircle(8, 8, 7)
  g.fillStyle(0xc8c8d4, 1)
  g.fillCircle(8, 8, 5)
  g.fillStyle(0xfff2c0, 1)
  g.fillCircle(8, 8, 3)
  g.generateTexture('pole', 16, 16)
  g.destroy()
}

export function paintChevronTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0x16161c, 1)
  g.fillRoundedRect(0, 0, 48, 30, 4)
  g.lineStyle(3, 0x3a3a46, 1)
  g.strokeRoundedRect(0, 0, 48, 30, 4)
  g.lineStyle(5, 0xffd75e, 1)
  for (const ox of [8, 24]) {
    g.beginPath()
    g.moveTo(ox, 6)
    g.lineTo(ox + 12, 15)
    g.lineTo(ox, 24)
    g.strokePath()
  }
  g.generateTexture('chevron', 48, 30)
  g.destroy()
}

export function paintDebrisTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0x22222a, 1)
  g.fillRect(0, 0, 12, 7)
  g.fillStyle(0x3a3a46, 1)
  g.fillRect(0, 0, 12, 2)
  g.generateTexture('debris', 12, 7)
  g.destroy()
}
