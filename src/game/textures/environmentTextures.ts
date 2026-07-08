import Phaser from 'phaser'

// Procedural environment textures for the proving ground. Canvas-based where
// gradients/noise are needed; replaced by authored art in later milestones.

export function paintAsphaltTexture(scene: Phaser.Scene) {
  const size = 512
  const tex = scene.textures.createCanvas('asphalt', size, size)!
  const ctx = tex.getContext()

  ctx.fillStyle = '#33333c'
  ctx.fillRect(0, 0, size, size)

  // speckle noise
  for (let i = 0; i < 7000; i++) {
    const l = 55 + Math.random() * 55
    ctx.fillStyle = `rgba(${l}, ${l}, ${l + 6}, ${0.15 + Math.random() * 0.2})`
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random(), 1 + Math.random())
  }
  // faint oil stains
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 20 + Math.random() * 50
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(8, 8, 12, 0.18)')
    grad.addColorStop(1, 'rgba(8, 8, 12, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  tex.refresh()
}

export function paintDirtTexture(scene: Phaser.Scene) {
  const size = 512
  const tex = scene.textures.createCanvas('dirt', size, size)!
  const ctx = tex.getContext()

  ctx.fillStyle = '#2d2a24'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 6000; i++) {
    const r = 42 + Math.random() * 40
    ctx.fillStyle = `rgba(${r + 12}, ${r}, ${r - 14}, ${0.15 + Math.random() * 0.2})`
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  // scattered rubble patches
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 6 + Math.random() * 18
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(20, 18, 14, 0.22)')
    grad.addColorStop(1, 'rgba(20, 18, 14, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  tex.refresh()
}

export function paintSmokeTexture(scene: Phaser.Scene) {
  const size = 64
  const tex = scene.textures.createCanvas('smoke', size, size)!
  const ctx = tex.getContext()
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}

export function paintSkidStampTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0x0a0a0e)
  g.fillRoundedRect(0, 0, 10, 6, 2)
  g.generateTexture('skid-stamp', 10, 6)
  g.destroy()
}

export function paintTireWallTexture(scene: Phaser.Scene) {
  const size = 56
  const tex = scene.textures.createCanvas('tire-wall', size, size)!
  const ctx = tex.getContext()
  const c = size / 2

  // drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.arc(c + 3, c + 4, 24, 0, Math.PI * 2)
  ctx.fill()
  // tire
  ctx.fillStyle = '#17171d'
  ctx.beginPath()
  ctx.arc(c, c, 24, 0, Math.PI * 2)
  ctx.fill()
  // top-light rim highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(c - 1, c - 2, 20, Math.PI * 0.9, Math.PI * 1.9)
  ctx.stroke()
  // inner hole
  ctx.fillStyle = '#0a0a0f'
  ctx.beginPath()
  ctx.arc(c, c, 11, 0, Math.PI * 2)
  ctx.fill()
  tex.refresh()
}
