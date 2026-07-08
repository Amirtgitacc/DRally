import Phaser from 'phaser'

// Procedural hi-fi placeholder car (top-down muscle car, facing +x / right).
// Replaced by authored art later; drawn at 128x64 so it stays crisp at 1080p+.

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor))
  const b = Math.min(255, Math.round((color & 0xff) * factor))
  return (r << 16) | (g << 8) | b
}

export function paintCarTexture(scene: Phaser.Scene, key: string, body: number, accent: number) {
  const g = scene.add.graphics()

  const bodyDark = shade(body, 0.55)
  const bodyLight = shade(body, 1.25)

  // tires
  g.fillStyle(0x0d0d12)
  g.fillRoundedRect(16, 1, 22, 10, 3)
  g.fillRoundedRect(16, 53, 22, 10, 3)
  g.fillRoundedRect(86, 1, 22, 10, 3)
  g.fillRoundedRect(86, 53, 22, 10, 3)

  // rear spoiler
  g.fillStyle(shade(body, 0.35))
  g.fillRoundedRect(1, 9, 9, 46, 3)

  // body silhouette — tapered nose on the right
  g.fillStyle(body)
  g.fillPoints(
    [
      { x: 5, y: 13 },
      { x: 16, y: 8 },
      { x: 72, y: 6 },
      { x: 102, y: 10 },
      { x: 123, y: 22 },
      { x: 126, y: 32 },
      { x: 123, y: 42 },
      { x: 102, y: 54 },
      { x: 72, y: 58 },
      { x: 16, y: 56 },
      { x: 5, y: 51 },
    ],
    true,
  )

  // side shading (bottom edge darker for fake sun from top-left)
  g.fillStyle(bodyDark, 0.55)
  g.fillPoints(
    [
      { x: 8, y: 46 },
      { x: 100, y: 48 },
      { x: 120, y: 40 },
      { x: 123, y: 42 },
      { x: 102, y: 54 },
      { x: 16, y: 56 },
      { x: 5, y: 51 },
    ],
    true,
  )
  // top highlight
  g.fillStyle(bodyLight, 0.4)
  g.fillPoints(
    [
      { x: 16, y: 8 },
      { x: 72, y: 6 },
      { x: 102, y: 10 },
      { x: 118, y: 20 },
      { x: 100, y: 15 },
      { x: 20, y: 14 },
    ],
    true,
  )

  // racing stripes
  g.fillStyle(accent, 0.85)
  g.fillRect(10, 27, 110, 4)
  g.fillRect(10, 34, 110, 4)

  // hood scoop
  g.fillStyle(bodyDark, 0.9)
  g.fillRoundedRect(94, 25, 16, 14, 4)

  // glass: rear window, roof, windshield
  g.fillStyle(0x0e1216, 0.95)
  g.fillRoundedRect(34, 15, 11, 34, 3)
  g.fillStyle(shade(body, 0.8))
  g.fillRect(45, 13, 30, 38)
  g.fillStyle(0x0e1216, 0.95)
  g.fillRoundedRect(75, 14, 13, 36, 4)
  // glass glint
  g.fillStyle(0xffffff, 0.14)
  g.fillRect(77, 17, 9, 10)

  // headlights
  g.fillStyle(0xffe9a8)
  g.fillRect(117, 23, 6, 7)
  g.fillRect(117, 34, 6, 7)
  // taillights
  g.fillStyle(0xd23c2f)
  g.fillRect(5, 16, 4, 9)
  g.fillRect(5, 39, 4, 9)

  g.generateTexture(key, 128, 64)
  g.destroy()
}
