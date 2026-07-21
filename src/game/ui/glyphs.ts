/**
 * Small original vector glyphs, drawn into a Graphics centred on its origin and
 * fitted to roughly an `s`×`s` box. Monochrome; the caller sets the colour via
 * the Graphics line/fill style is overridden here per glyph using `color`.
 *
 * These are deliberately simple industrial pictograms — no third-party icon set,
 * no brand marks. Used as button/row glyphs across the menu and garage screens
 * (labels always accompany them, so meaning never rests on the glyph alone).
 */

import Phaser from 'phaser'
import { C } from './theme'

export type Glyph = (g: Phaser.GameObjects.Graphics, s: number) => void

const stroke = (g: Phaser.GameObjects.Graphics, s: number, color: number, wRatio = 0.08) =>
  g.lineStyle(Math.max(2, s * wRatio), color, 1)

/** Checkered race flag. */
export const flag: Glyph = (g, s) => {
  const color = C.textPrimary
  const h = s * 0.5
  stroke(g, s, color, 0.07)
  g.lineBetween(-s * 0.32, -s * 0.42, -s * 0.32, s * 0.45)
  const cell = h / 3
  const ox = -s * 0.28
  const oy = -s * 0.38
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    if ((r + c) % 2 === 0) {
      g.fillStyle(color, 1)
      g.fillRect(ox + c * cell, oy + r * cell, cell, cell)
    }
  }
}

/** Map pin. */
export const pin: Glyph = (g, s) => {
  const color = C.textPrimary
  g.fillStyle(color, 1)
  g.fillCircle(0, -s * 0.1, s * 0.26)
  g.fillTriangle(-s * 0.16, s * 0.02, s * 0.16, s * 0.02, 0, s * 0.42)
  g.fillStyle(C.surfacePlate, 1)
  g.fillCircle(0, -s * 0.12, s * 0.1)
}

/** Ladder. */
export const ladder: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.09)
  g.lineBetween(-s * 0.22, -s * 0.42, -s * 0.22, s * 0.42)
  g.lineBetween(s * 0.22, -s * 0.42, s * 0.22, s * 0.42)
  for (let i = 0; i < 4; i++) {
    const y = -s * 0.3 + i * s * 0.2
    g.lineBetween(-s * 0.22, y, s * 0.22, y)
  }
}

/** Trophy. */
export const trophy: Glyph = (g, s) => {
  const color = C.textPrimary
  g.fillStyle(color, 1)
  g.fillRoundedRect(-s * 0.24, -s * 0.42, s * 0.48, s * 0.34, s * 0.06)
  stroke(g, s, color, 0.07)
  g.strokeCircle(-s * 0.34, -s * 0.28, s * 0.1)
  g.strokeCircle(s * 0.34, -s * 0.28, s * 0.1)
  g.fillRect(-s * 0.06, -s * 0.08, s * 0.12, s * 0.22)
  g.fillRect(-s * 0.2, s * 0.14, s * 0.4, s * 0.1)
}

/** Film reel (credits). */
export const film: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.07)
  g.strokeCircle(0, 0, s * 0.4)
  g.fillStyle(color, 1)
  g.fillCircle(0, 0, s * 0.08)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.fillCircle(Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24, s * 0.06)
  }
}

/** Circuit outline blob. */
export const circuit: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.08)
  g.beginPath()
  const pts = [
    [-0.3, -0.1], [-0.1, -0.38], [0.28, -0.28], [0.36, 0.04],
    [0.12, 0.12], [0.22, 0.36], [-0.16, 0.36], [-0.34, 0.14],
  ]
  pts.forEach(([px, py], i) => {
    const x = px * s, y = py * s
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  })
  g.closePath()
  g.strokePath()
}

/** Crossed wrench + screwdriver (repair). */
export const wrench: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.12)
  g.lineBetween(-s * 0.32, s * 0.32, s * 0.26, -s * 0.26)
  g.lineBetween(s * 0.32, s * 0.32, -s * 0.26, -s * 0.26)
  g.fillStyle(color, 1)
  g.fillCircle(-s * 0.3, -s * 0.3, s * 0.1)
  g.fillCircle(s * 0.3, -s * 0.3, s * 0.1)
}

/** Engine block. */
export const engine: Glyph = (g, s) => {
  const color = C.textPrimary
  g.fillStyle(color, 1)
  g.fillRect(-s * 0.3, -s * 0.1, s * 0.5, s * 0.36)
  g.fillRect(-s * 0.12, -s * 0.32, s * 0.22, s * 0.22)
  g.fillRect(s * 0.2, 0, s * 0.16, s * 0.16)
  g.fillRect(-s * 0.42, 0.02 * s, s * 0.14, s * 0.16)
}

/** Tire. */
export const tire: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.14)
  g.strokeCircle(0, 0, s * 0.36)
  g.fillStyle(color, 1)
  g.fillCircle(0, 0, s * 0.12)
}

/** Armor plate / shield. */
export const shield: Glyph = (g, s) => {
  const color = C.textPrimary
  g.fillStyle(color, 1)
  g.beginPath()
  g.moveTo(0, -s * 0.4)
  g.lineTo(s * 0.32, -s * 0.24)
  g.lineTo(s * 0.28, s * 0.18)
  g.lineTo(0, s * 0.42)
  g.lineTo(-s * 0.28, s * 0.18)
  g.lineTo(-s * 0.32, -s * 0.24)
  g.closePath()
  g.fillPath()
  g.fillStyle(C.surfacePlate, 1)
  g.fillRect(-s * 0.04, -s * 0.22, s * 0.08, s * 0.44)
}

/** Shopping cart (market). */
export const cart: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.09)
  g.lineBetween(-s * 0.4, -s * 0.3, -s * 0.24, -s * 0.3)
  g.lineBetween(-s * 0.24, -s * 0.3, -s * 0.08, s * 0.16)
  g.lineBetween(-s * 0.08, s * 0.16, s * 0.3, s * 0.16)
  g.lineBetween(-s * 0.18, -s * 0.08, s * 0.36, -s * 0.08)
  g.lineBetween(s * 0.36, -s * 0.08, s * 0.3, s * 0.16)
  g.fillStyle(color, 1)
  g.fillCircle(-s * 0.04, s * 0.32, s * 0.07)
  g.fillCircle(s * 0.24, s * 0.32, s * 0.07)
}

/** Spray gun (livery). */
export const spray: Glyph = (g, s) => {
  const color = C.textPrimary
  g.fillStyle(color, 1)
  g.fillRoundedRect(-s * 0.1, -s * 0.1, s * 0.24, s * 0.4, s * 0.04)
  g.fillRect(-s * 0.24, -s * 0.24, s * 0.16, s * 0.2)
  for (let i = 0; i < 5; i++) g.fillCircle(s * 0.2 + (i % 3) * s * 0.08, -s * 0.24 + Math.floor(i / 3) * s * 0.14, s * 0.02)
}

/** Naval mine (loadout). */
export const mine: Glyph = (g, s) => {
  const color = C.textPrimary
  stroke(g, s, color, 0.06)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.lineBetween(Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24, Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4)
  }
  g.fillStyle(color, 1)
  g.fillCircle(0, 0, s * 0.24)
}

/** Skull emblem (driver badge). */
export const skull: Glyph = (g, s) => {
  const color = C.oxide
  g.fillStyle(color, 1)
  g.fillCircle(0, -s * 0.08, s * 0.28)
  g.fillRect(-s * 0.16, s * 0.08, s * 0.32, s * 0.2)
  g.fillStyle(C.surfacePlate, 1)
  g.fillCircle(-s * 0.1, -s * 0.08, s * 0.07)
  g.fillCircle(s * 0.1, -s * 0.08, s * 0.07)
  g.fillRect(-s * 0.04, s * 0.06, s * 0.08, s * 0.14)
}

/** Coin / cash. */
export const coin: Glyph = (g, s) => {
  g.fillStyle(C.money, 1)
  g.fillCircle(0, 0, s * 0.36)
  g.fillStyle(C.surfacePlate, 1)
  g.fillCircle(0, 0, s * 0.26)
}
