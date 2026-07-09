import Phaser from 'phaser'
import type { PickupType } from '../../core/track/pickups'

// Procedural combat & pickup textures. Same swap-later policy as the rest.

export function paintBulletTexture(scene: Phaser.Scene) {
  // elongated tracer: hot white head fading into an amber tail
  const size = { w: 26, h: 6 }
  const tex = scene.textures.createCanvas('bullet', size.w, size.h)!
  const ctx = tex.getContext()
  const grad = ctx.createLinearGradient(0, 0, size.w, 0)
  grad.addColorStop(0, 'rgba(255, 150, 60, 0)')
  grad.addColorStop(0.55, 'rgba(255, 205, 110, 0.85)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 1)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(size.w / 2, size.h / 2, size.w / 2, size.h / 2, 0, 0, Math.PI * 2)
  ctx.fill()
  tex.refresh()
}

/** Thin expanding circle for blast shockwaves. */
export function paintRingTexture(scene: Phaser.Scene) {
  const size = 96
  const tex = scene.textures.createCanvas('ring', size, size)!
  const ctx = tex.getContext()
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 220, 160, 0)')
  grad.addColorStop(0.75, 'rgba(255, 220, 160, 0.9)')
  grad.addColorStop(1, 'rgba(255, 180, 90, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
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

/**
 * The mine has to be spotted at racing speed, at night, on six different
 * ground themes. So: a big dark disc for mass, a bright bone-white rim that
 * survives a light ground, hazard wedges for "this is a weapon", and an amber
 * core the scene blinks once the thing is armed.
 */
export function paintMineTexture(scene: Phaser.Scene) {
  const size = 40
  const c = size / 2
  const g = scene.add.graphics()

  g.fillStyle(0x000000, 0.45)
  g.fillCircle(c + 2, c + 3, 15) // ground shadow

  g.fillStyle(0x101016, 1) // heavy dark body
  g.fillCircle(c, c, 15)
  g.lineStyle(3, 0xe8e8f0, 0.9) // bone rim — reads on dark AND pale ground
  g.strokeCircle(c, c, 14)

  // hazard wedges around the casing
  g.fillStyle(0xf2a33c, 0.95)
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4
    g.slice(c, c, 12, a - 0.3, a + 0.3, false)
    g.fillPath()
  }

  g.fillStyle(0x2a2a33, 1) // detonator plate
  g.fillCircle(c, c, 7)
  g.lineStyle(1, 0x5a5a66, 1)
  g.strokeCircle(c, c, 7)
  g.fillStyle(0xffb340, 1) // arm light (the scene blinks this)
  g.fillCircle(c, c, 3.5)

  g.generateTexture('mine', size, size)
  g.destroy()
}

/** Teardrop exhaust flame drawn behind a boosting car — tinted per turbo type. */
export function paintFlameConeTexture(scene: Phaser.Scene) {
  const w = 96
  const h = 40
  const tex = scene.textures.createCanvas('flame-cone', w, h)!
  const ctx = tex.getContext()
  const grad = ctx.createLinearGradient(w, h / 2, 0, h / 2)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)') // hot root, at the tailpipe
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)') // fades into the night
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(w, h / 2 - 13)
  ctx.quadraticCurveTo(w * 0.35, h / 2 - 9, 0, h / 2)
  ctx.quadraticCurveTo(w * 0.35, h / 2 + 9, w, h / 2 + 13)
  ctx.closePath()
  ctx.fill()
  tex.refresh()
}

/** Screen-edge damage flash: clear in the middle, hot at the borders. */
export function paintEdgeFlashTexture(scene: Phaser.Scene) {
  const size = 256
  const tex = scene.textures.createCanvas('edge-flash', size, size)!
  const ctx = tex.getContext()
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.52)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)')
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.45)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 1)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
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
