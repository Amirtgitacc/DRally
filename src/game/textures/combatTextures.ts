import Phaser from 'phaser'
import type { PickupType } from '../../core/track/pickups'

// Procedural combat & pickup textures. Same swap-later policy as the rest.

export function paintBulletTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0xfff2b0, 1)
  g.fillRoundedRect(0, 0, 12, 4, 2)
  g.fillStyle(0xffffff, 1)
  g.fillRoundedRect(6, 1, 6, 2, 1)
  g.generateTexture('bullet', 12, 4)
  g.destroy()
}

export function paintSparkTexture(scene: Phaser.Scene) {
  const size = 32
  const tex = scene.textures.createCanvas('spark', size, size)!
  const ctx = tex.getContext()
  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.35, 'rgba(255, 190, 90, 0.9)')
  grad.addColorStop(1, 'rgba(255, 120, 40, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}

export function paintScorchTexture(scene: Phaser.Scene) {
  const size = 110
  const tex = scene.textures.createCanvas('scorch', size, size)!
  const ctx = tex.getContext()
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(10, 8, 8, 0.75)')
  grad.addColorStop(0.6, 'rgba(14, 12, 10, 0.4)')
  grad.addColorStop(1, 'rgba(14, 12, 10, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}

export function paintMineTexture(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0x000000, 0.4)
  g.fillCircle(11, 12, 9) // shadow
  g.fillStyle(0x1c1c24, 1)
  g.fillCircle(10, 10, 9)
  g.lineStyle(2, 0x3a3a46, 1)
  g.strokeCircle(10, 10, 8)
  g.fillStyle(0x5a5a66, 1)
  for (const a of [0, 1.57, 3.14, 4.71]) {
    g.fillCircle(10 + Math.cos(a) * 6, 10 + Math.sin(a) * 6, 1.5)
  }
  g.fillStyle(0xd23c2f, 1)
  g.fillCircle(10, 10, 2.5)
  g.generateTexture('mine', 22, 22)
  g.destroy()
}

export function paintPickupTextures(scene: Phaser.Scene) {
  const paint = (type: PickupType, draw: (ctx: CanvasRenderingContext2D) => void, discColor: string) => {
    const size = 44
    const tex = scene.textures.createCanvas(`pk-${type}`, size, size)!
    const ctx = tex.getContext()
    // drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.beginPath()
    ctx.arc(size / 2 + 2, size / 2 + 3, 18, 0, Math.PI * 2)
    ctx.fill()
    // disc
    ctx.fillStyle = discColor
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 17, 0, Math.PI * 2)
    ctx.stroke()
    draw(ctx)
    tex.refresh()
  }

  paint(
    'ammo',
    (ctx) => {
      ctx.fillStyle = '#ffd75e'
      for (let i = 0; i < 3; i++) ctx.fillRect(15 + i * 6, 14, 4, 12)
      ctx.fillStyle = '#b8862e'
      for (let i = 0; i < 3; i++) ctx.fillRect(15 + i * 6, 24, 4, 4)
    },
    '#4a3b28',
  )

  paint(
    'turbo',
    (ctx) => {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(25, 10)
      ctx.lineTo(16, 24)
      ctx.lineTo(21, 24)
      ctx.lineTo(18, 34)
      ctx.lineTo(28, 20)
      ctx.lineTo(23, 20)
      ctx.closePath()
      ctx.fill()
    },
    '#1d6f86',
  )

  paint(
    'repair',
    (ctx) => {
      ctx.strokeStyle = '#e8e8f0'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(15, 29)
      ctx.lineTo(29, 15)
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(29, 15, 6, Math.PI * 0.6, Math.PI * 1.7, true)
      ctx.stroke()
    },
    '#2e6b3e',
  )

  paint(
    'cash',
    (ctx) => {
      ctx.fillStyle = '#eaf5ea'
      ctx.font = 'bold 22px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('$', 22, 23)
    },
    '#3f7d4a',
  )

  // the booby trap is dressed up as the shiniest pickup on the track
  paint(
    'trap',
    (ctx) => {
      const grad = ctx.createRadialGradient(22, 22, 2, 22, 22, 14)
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
      grad.addColorStop(0.5, 'rgba(214, 140, 255, 0.85)')
      grad.addColorStop(1, 'rgba(140, 60, 200, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(4, 4, 36, 36)
    },
    '#5a2a80',
  )
}
