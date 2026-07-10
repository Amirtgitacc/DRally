/**
 * Shared UI primitives. Every scene built its own titles, panels and bars by
 * hand; these are the same shapes, named once and driven from `theme.ts`.
 */

import Phaser from 'phaser'
import { C, FONT_DISPLAY, FONT_MONO, RADIUS, STROKE, TYPE, hex, type TypeToken } from './theme'

interface TextOpts {
  size?: TypeToken
  color?: number
  stroke?: number
  strokeThickness?: number
  origin?: [number, number]
  align?: string
  wordWrapWidth?: number
  lineSpacing?: number
  /** 'display' for condensed signage, 'mono' for anything tabular. */
  face?: 'display' | 'mono'
  /** Oswald only. 400 | 500 | 600 | 700. */
  weight?: number
  letterSpacing?: number
}

export function text(scene: Phaser.Scene, x: number, y: number, content: string, opts: TextOpts = {}) {
  const {
    size = 'body',
    color = C.textPrimary,
    stroke,
    strokeThickness,
    origin,
    align,
    wordWrapWidth,
    lineSpacing,
    face = 'mono',
    weight,
    letterSpacing,
  } = opts

  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: face === 'display' ? FONT_DISPLAY : FONT_MONO,
    fontSize: `${TYPE[size]}px`,
    color: hex(color),
  }
  if (weight) style.fontStyle = `${weight}`
  if (stroke !== undefined) {
    style.stroke = hex(stroke)
    style.strokeThickness = strokeThickness ?? STROKE.text
  }
  if (align) style.align = align
  if (wordWrapWidth) style.wordWrap = { width: wordWrapWidth }
  if (lineSpacing) style.lineSpacing = lineSpacing

  const obj = scene.add.text(x, y, content, style)
  if (letterSpacing) obj.setLetterSpacing(letterSpacing)
  if (origin) obj.setOrigin(origin[0], origin[1])
  return obj
}

/** The amber scene title: condensed, tracked out, heavy black outline. */
export function heading(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  opts: { color?: number; size?: TypeToken; strokeThickness?: number; glow?: boolean } = {},
) {
  const { color = C.amber, size = 'title', strokeThickness = STROKE.title, glow = false } = opts
  const obj = text(scene, x, y, content, {
    size,
    face: 'display',
    weight: 600,
    letterSpacing: 6,
    color,
    stroke: C.shadow,
    strokeThickness,
    origin: [0.5, 0.5],
  })
  // postFX is WebGL-only; on the canvas fallback the title just renders flat.
  if (glow && scene.game.renderer.type === Phaser.WEBGL) {
    obj.postFX.addGlow(color, 3, 0, false, 0.1, 18)
  }
  return obj
}

/** The blinking "ENTER: …" call to action. Four scenes had their own copy. */
export function prompt(scene: Phaser.Scene, x: number, y: number, content: string) {
  const obj = text(scene, x, y, content, { size: 'action', origin: [0.5, 0.5] })
  scene.tweens.add({ targets: obj, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })
  return obj
}

/** Small tracked-out header that names a card or a block of content. */
export function sectionLabel(scene: Phaser.Scene, x: number, y: number, content: string, color = C.amber) {
  return text(scene, x, y, content, {
    size: 'caption',
    face: 'display',
    weight: 600,
    letterSpacing: 4,
    color,
  })
}

/** Dimmer secondary line, usually sat directly under a `heading`. */
export function subheading(scene: Phaser.Scene, x: number, y: number, content: string) {
  return text(scene, x, y, content, { size: 'body', color: C.textSecondary, origin: [0.5, 0.5] })
}

/** Bottom-of-screen flavour text. */
export function flavor(scene: Phaser.Scene, x: number, y: number, content: string) {
  return text(scene, x, y, content, { size: 'caption', color: C.textMuted, origin: [0.5, 0.5] })
}

/** The top-left keybinding strip every scene carries. */
export function hintBar(scene: Phaser.Scene, content: string) {
  return scene.add.text(16, 16, content, {
    fontFamily: FONT_MONO,
    fontSize: `${TYPE.caption}px`,
    color: hex(C.textPrimary),
    backgroundColor: '#000000aa',
    padding: { x: 10, y: 6 },
  })
}

/** A bordered content panel. Centre-anchored, matching `this.add.rectangle`. */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; fillAlpha?: number; stroke?: number; strokeAlpha?: number; strokeWidth?: number } = {},
) {
  const { fill = C.surfaceSunken, fillAlpha = 0.85, stroke = C.amber, strokeAlpha = 0.6, strokeWidth = 2 } = opts
  return scene.add.rectangle(x, y, w, h, fill, fillAlpha).setStrokeStyle(strokeWidth, stroke, strokeAlpha)
}

/** The big centred plate that Results and Ranking build their content on. */
export function modal(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  return panel(scene, x, y, w, h, { fillAlpha: 0.92, strokeAlpha: 0.8, strokeWidth: 3 })
}

/** Translucent rounded plate used behind HUD clusters. Draws into an existing Graphics. */
export function plate(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
  gfx.fillStyle(C.surfaceHud, 0.65)
  gfx.fillRoundedRect(x, y, w, h, RADIUS.md)
  gfx.lineStyle(2, C.amber, 0.35)
  gfx.strokeRoundedRect(x, y, w, h, RADIUS.md)
}

/**
 * One horizontal fill bar. `ratio` is 0..1 and is NOT clamped here — callers
 * already clamp, and a >1 ratio overflowing is a bug worth seeing.
 */
export function statBar(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: number,
  opts: { backdrop?: boolean } = {},
) {
  if (opts.backdrop) {
    gfx.fillStyle(C.shadow, 0.55)
    gfx.fillRect(x - 4, y - 4, w + 8, h + 8)
  }
  gfx.fillStyle(C.surfaceTrack, 1)
  gfx.fillRect(x, y, w, h)
  gfx.fillStyle(color, 1)
  gfx.fillRect(x, y, w * ratio, h)
}

/** Damage/health colour ramp: green under 40%, amber to 75%, red beyond. */
export function damageColor(damagePercent: number): number {
  if (damagePercent > 75) return C.danger
  if (damagePercent > 40) return C.warn
  return C.ok
}

/** Row of filled/empty squares, as used for upgrade tiers and mine stock. */
export function pips(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  filled: number,
  total: number,
  opts: { size?: number; gap?: number; color?: number } = {},
) {
  const { size = 20, gap = 6, color = C.amber } = opts
  for (let i = 0; i < total; i++) {
    gfx.fillStyle(i < filled ? color : 0x33333e, 1)
    gfx.fillRect(x + i * (size + gap), y, size, size)
  }
}

/** A hairline separator between content bands. */
export function rule(scene: Phaser.Scene, x1: number, x2: number, y: number, color = C.border) {
  const gfx = scene.add.graphics()
  gfx.lineStyle(1, color, 0.5)
  gfx.lineBetween(x1, y, x2, y)
  return gfx
}

export interface TileHandle {
  rect: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  /** Repaint for the current selected/enabled state. */
  setState(selected: boolean, enabled: boolean): void
}

/**
 * A selectable menu tile.
 *
 * `accent` marks a tile that matters more than its neighbours — it keeps a
 * coloured border even at rest, so the row reads as a hierarchy rather than
 * seven identical boxes.
 */
export function tile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  content: string,
  opts: {
    size?: TypeToken
    accent?: number
    face?: 'display' | 'mono'
    weight?: number
    letterSpacing?: number
    /** selection colour — the black market picks in red, not amber */
    select?: number
  } = {},
): TileHandle {
  const restStroke = opts.accent ?? C.border
  const selectColor = opts.select ?? C.amber
  const rect = scene.add.rectangle(x, y, w, h, C.surfaceTile, 0.95).setStrokeStyle(3, restStroke, 1)
  const label = text(scene, x, y, content, {
    size: opts.size ?? 'action',
    face: opts.face ?? 'mono',
    weight: opts.weight,
    letterSpacing: opts.letterSpacing,
    origin: [0.5, 0.5],
    align: 'center',
  })

  return {
    rect,
    label,
    setState(selected: boolean, enabled: boolean) {
      rect.setStrokeStyle(3, selected ? selectColor : restStroke, 1)
      rect.setFillStyle(selected ? C.surfaceTileActive : C.surfaceTile, 0.95)
      label.setColor(hex(enabled ? (selected ? selectColor : C.textPrimary) : C.textDisabled))
    },
  }
}
