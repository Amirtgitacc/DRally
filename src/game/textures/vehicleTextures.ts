import Phaser from 'phaser'
import type { CarVariant } from '../../data/cars'

// Procedural hi-fi placeholder cars (top-down, facing +x / right), drawn at
// 128x64 so they stay crisp at 1080p+. Three silhouettes so the chassis
// ladder reads at a glance: compact (boxy runabout), muscle (long hood,
// scoop), sleek (low wedge). Replaced by authored art later.

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor))
  const b = Math.min(255, Math.round((color & 0xff) * factor))
  return (r << 16) | (g << 8) | b
}

interface VariantShape {
  wheels: Array<[number, number]>
  wheelSize: [number, number]
  spoiler: [number, number, number, number] | null
  body: Array<{ x: number; y: number }>
  highlight: Array<{ x: number; y: number }>
  stripes: Array<[number, number, number, number]>
  scoop: [number, number, number, number] | null
  rearGlass: [number, number, number, number]
  roof: [number, number, number, number]
  windshield: [number, number, number, number]
  glint: [number, number, number, number]
  headlightX: number
  taillightX: number
}

const SHAPES: Record<CarVariant, VariantShape> = {
  // short and boxy — wheels pushed to the corners, flat nose
  compact: {
    wheels: [
      [18, 1],
      [18, 53],
      [92, 1],
      [92, 53],
    ],
    wheelSize: [20, 10],
    spoiler: null,
    body: [
      { x: 10, y: 12 },
      { x: 22, y: 8 },
      { x: 88, y: 7 },
      { x: 110, y: 12 },
      { x: 117, y: 22 },
      { x: 118, y: 32 },
      { x: 117, y: 42 },
      { x: 110, y: 52 },
      { x: 88, y: 57 },
      { x: 22, y: 56 },
      { x: 10, y: 52 },
    ],
    highlight: [
      { x: 22, y: 8 },
      { x: 88, y: 7 },
      { x: 108, y: 13 },
      { x: 90, y: 15 },
      { x: 26, y: 14 },
    ],
    stripes: [[16, 29, 96, 6]],
    scoop: null,
    rearGlass: [26, 15, 10, 34],
    roof: [36, 13, 34, 38],
    windshield: [70, 14, 13, 36],
    glint: [72, 17, 9, 10],
    headlightX: 110,
    taillightX: 10,
  },
  // the original muscle-car silhouette — long tapered nose, hood scoop
  muscle: {
    wheels: [
      [16, 1],
      [16, 53],
      [86, 1],
      [86, 53],
    ],
    wheelSize: [22, 10],
    spoiler: [1, 9, 9, 46],
    body: [
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
    highlight: [
      { x: 16, y: 8 },
      { x: 72, y: 6 },
      { x: 102, y: 10 },
      { x: 118, y: 20 },
      { x: 100, y: 15 },
      { x: 20, y: 14 },
    ],
    stripes: [
      [10, 27, 110, 4],
      [10, 34, 110, 4],
    ],
    scoop: [94, 25, 16, 14],
    rearGlass: [34, 15, 11, 34],
    roof: [45, 13, 30, 38],
    windshield: [75, 14, 13, 36],
    glint: [77, 17, 9, 10],
    headlightX: 117,
    taillightX: 5,
  },
  // low wedge — cab set far back, knife nose, wide rear wing
  sleek: {
    wheels: [
      [14, 2],
      [14, 52],
      [90, 2],
      [90, 52],
    ],
    wheelSize: [22, 10],
    spoiler: [0, 6, 8, 52],
    body: [
      { x: 4, y: 12 },
      { x: 20, y: 9 },
      { x: 56, y: 9 },
      { x: 100, y: 15 },
      { x: 126, y: 28 },
      { x: 127, y: 32 },
      { x: 126, y: 36 },
      { x: 100, y: 49 },
      { x: 56, y: 55 },
      { x: 20, y: 55 },
      { x: 4, y: 52 },
    ],
    highlight: [
      { x: 20, y: 9 },
      { x: 56, y: 9 },
      { x: 100, y: 15 },
      { x: 120, y: 26 },
      { x: 96, y: 20 },
      { x: 24, y: 15 },
    ],
    stripes: [
      [8, 28, 116, 3],
      [8, 33, 116, 3],
    ],
    scoop: null,
    rearGlass: [24, 17, 10, 30],
    roof: [34, 15, 26, 34],
    windshield: [60, 16, 16, 32],
    glint: [63, 19, 10, 9],
    headlightX: 116,
    taillightX: 4,
  },
}

export function paintCarTexture(
  scene: Phaser.Scene,
  key: string,
  body: number,
  accent: number,
  variant: CarVariant = 'muscle',
) {
  const g = scene.add.graphics()
  const s = SHAPES[variant]

  const bodyDark = shade(body, 0.55)
  const bodyLight = shade(body, 1.25)

  // tires
  g.fillStyle(0x0d0d12)
  for (const [wx, wy] of s.wheels) g.fillRoundedRect(wx, wy, s.wheelSize[0], s.wheelSize[1], 3)

  // rear spoiler
  if (s.spoiler) {
    g.fillStyle(shade(body, 0.35))
    g.fillRoundedRect(...s.spoiler, 3)
  }

  // body silhouette
  g.fillStyle(body)
  g.fillPoints(s.body, true)

  // side shading (bottom edge darker for fake sun from top-left) — derive
  // from the lower half of the silhouette
  const bottom = s.body.filter((p) => p.y > 32)
  g.fillStyle(bodyDark, 0.55)
  g.fillPoints(
    [...bottom.map((p) => ({ x: p.x, y: p.y - 6 })), ...[...bottom].reverse()],
    true,
  )
  // top highlight
  g.fillStyle(bodyLight, 0.4)
  g.fillPoints(s.highlight, true)

  // racing stripes
  g.fillStyle(accent, 0.85)
  for (const [sx, sy, sw, sh] of s.stripes) g.fillRect(sx, sy, sw, sh)

  // hood scoop
  if (s.scoop) {
    g.fillStyle(bodyDark, 0.9)
    g.fillRoundedRect(...s.scoop, 4)
  }

  // glass: rear window, roof, windshield
  g.fillStyle(0x0e1216, 0.95)
  g.fillRoundedRect(...s.rearGlass, 3)
  g.fillStyle(shade(body, 0.8))
  g.fillRect(...s.roof)
  g.fillStyle(0x0e1216, 0.95)
  g.fillRoundedRect(...s.windshield, 4)
  // glass glint
  g.fillStyle(0xffffff, 0.14)
  g.fillRect(...s.glint)

  // headlights
  g.fillStyle(0xffe9a8)
  g.fillRect(s.headlightX, 23, 6, 7)
  g.fillRect(s.headlightX, 34, 6, 7)
  // taillights
  g.fillStyle(0xd23c2f)
  g.fillRect(s.taillightX, 16, 4, 9)
  g.fillRect(s.taillightX, 39, 4, 9)

  g.generateTexture(key, 128, 64)
  g.destroy()
}
