/**
 * Mobile widget layer — the touch-first vocabulary the v2 screens are built
 * from. Sits on top of `theme.ts` (tokens) and `widgets.ts` (panel/text/etc.),
 * and is the shared home for every reusable mobile component so scenes never
 * hand-roll their own button/slider/card drawing.
 *
 * Everything here is presentational: no game rules, no persistence. Widgets take
 * plain data + callbacks and hand back a handle the owning scene drives from its
 * own selection/keyboard logic (same contract as widgets.ts `tile`/`wireTiles`).
 *
 * Layout units are the 1920×1080 logical canvas. `SAFE` marks the edges kept
 * clear of rounded corners and camera cutouts.
 */

import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { C, hex, type TypeToken } from './theme'
import { text } from './widgets'

/** Horizontal safe inset (rounded corners / cutouts) and a comfortable top band. */
export const SAFE = {
  x: 64,
  top: 40,
  bottom: 40,
  left: 64,
  right: GAME_WIDTH - 64,
  width: GAME_WIDTH - 128,
} as const

/** Minimum primary touch-target height and the gap between targets. */
export const TOUCH = { minH: 88, gap: 16 } as const

/* ------------------------------------------------------------------ *
 * Plate geometry — chamfered ("clipped") industrial silhouette.
 * ------------------------------------------------------------------ */

/** Octagon: rectangle centred on (0,0) with all four corners cut by `c`. */
function chamfer(w: number, h: number, c: number): Phaser.Geom.Point[] {
  const hx = w / 2
  const hy = h / 2
  const k = Math.min(c, hx, hy)
  return [
    [-hx + k, -hy], [hx - k, -hy], [hx, -hy + k], [hx, hy - k],
    [hx - k, hy], [-hx + k, hy], [-hx, hy - k], [-hx, -hy + k],
  ].map(([x, y]) => new Phaser.Geom.Point(x, y))
}

interface PlateStyle {
  face: number
  faceAlpha?: number
  border: number
  borderWidth?: number
  chamfer?: number
  /** number of concentric accent strokes drawn outside the plate as a soft glow */
  glow?: number
  glowColor?: number
  rivets?: boolean
  bevel?: boolean
}

/** Draw a chamfered metal plate into `g`, centred on the graphics origin. */
export function drawPlate(g: Phaser.GameObjects.Graphics, w: number, h: number, style: PlateStyle): void {
  const { face, faceAlpha = 1, border, borderWidth = 2, chamfer: c = 12, glow = 0, glowColor = C.oxideGlow, rivets = false, bevel = true } = style
  g.clear()

  for (let i = glow; i > 0; i--) {
    const grow = i * 3
    g.lineStyle(borderWidth + grow, glowColor, 0.06 * (glow - i + 1))
    g.strokePoints(chamfer(w + grow, h + grow, c + grow / 2), true, true)
  }

  const pts = chamfer(w, h, c)
  g.fillStyle(face, faceAlpha)
  g.fillPoints(pts, true)

  if (bevel) {
    // bright hairline across the top, shadow hairline across the bottom
    g.lineStyle(1, C.bevelLight, 0.35)
    g.lineBetween(-w / 2 + c, -h / 2 + 1.5, w / 2 - c, -h / 2 + 1.5)
    g.lineStyle(1, C.shadow, 0.55)
    g.lineBetween(-w / 2 + c, h / 2 - 1.5, w / 2 - c, h / 2 - 1.5)
  }

  g.lineStyle(borderWidth, border, 1)
  g.strokePoints(pts, true, true)

  if (rivets) {
    const rx = w / 2 - c - 5
    const ry = h / 2 - c - 5
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      g.fillStyle(C.rivet, 1)
      g.fillCircle(sx * rx, sy * ry, 3.5)
      g.fillStyle(C.rivetHi, 0.8)
      g.fillCircle(sx * rx - 0.8, sy * ry - 0.8, 1.4)
    }
  }
}

/**
 * `menu-peykan-background.webp` bakes the OLD "PROJECT DEATHRALLY / DEVELOPMENT
 * TITLE" wordmark (top-left), eight empty menu plates (right column) and a
 * career plate (lower-left) directly into the art. Root and the Single Player
 * hub reuse that plate for its car + environment only, so cover the baked UI
 * before drawing the fresh interface on top. Sits just above the background,
 * below all live UI.
 */
export function coverBakedMenuArt(scene: Phaser.Scene): void {
  const depth = -500
  // top-left development-title wordmark (baked band ≈ y55–200): near-opaque
  // flat cover across the whole band, then a short feather so it blends into
  // the dark ceiling rather than ending on a hard edge.
  const title = scene.add.graphics().setDepth(depth)
  title.fillStyle(C.shadow, 0.99)
  title.fillRect(0, 0, 1040, 205)
  title.fillGradientStyle(C.shadow, C.shadow, C.shadow, C.shadow, 0.99, 0.99, 0, 0)
  title.fillRect(0, 205, 1040, 125)
  // right-side plate column + quiet UI zone (starts clear of the hero car,
  // which ends ≈ x730)
  const right = scene.add.graphics().setDepth(depth)
  right.fillStyle(C.shadow, 0.62)
  right.fillRect(840, 0, GAME_WIDTH - 840, GAME_HEIGHT)
  // lower-left career plate
  const career = scene.add.graphics().setDepth(depth)
  career.fillStyle(C.shadow, 0.72)
  career.fillRect(0, 690, 640, GAME_HEIGHT - 690)
}

/* ------------------------------------------------------------------ *
 * Notched button — the primary tappable plate. All interaction states.
 * ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

export interface ButtonState {
  selected?: boolean
  enabled?: boolean
  pressed?: boolean
}

export interface ButtonOpts {
  w: number
  h: number
  label: string
  /** small right-aligned value, e.g. a price chip ('$350') */
  value?: string
  valueColor?: number
  /** texture key for a left icon glyph */
  icon?: string
  /** procedural glyph drawn left when no icon texture is available */
  glyph?: (g: Phaser.GameObjects.Graphics, s: number) => void
  variant?: ButtonVariant
  size?: TypeToken
  align?: 'center' | 'left'
  chamfer?: number
  /** override the selected-state accent (e.g. the black market selects in red) */
  selectColor?: number
  onActivate?: () => void
  onFocus?: () => void
}

export interface ButtonHandle {
  container: Phaser.GameObjects.Container
  hit: Phaser.GameObjects.Rectangle
  setState(state: ButtonState): void
  setLabel(label: string): void
  setValue(value: string, color?: number): void
  setEnabled(enabled: boolean): void
  setPosition(x: number, y: number): void
  destroy(): void
}

function variantColors(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return { accent: C.oxide, restBorder: C.oxideDim, labelRest: C.oxide }
    case 'danger':
      return { accent: C.danger, restBorder: 0x6a2a24, labelRest: C.danger }
    default:
      return { accent: C.oxide, restBorder: C.border, labelRest: C.textPrimary }
  }
}

export function notchedButton(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts): ButtonHandle {
  const {
    w, h, variant = 'secondary', size = 'action', chamfer: cham = 12,
    onActivate, onFocus,
  } = opts
  const vc = variantColors(variant)
  const selAccent = opts.selectColor ?? vc.accent
  const hasIcon = !!opts.icon || !!opts.glyph
  const align = opts.align ?? (hasIcon ? 'left' : 'center')

  const container = scene.add.container(x, y)
  const g = scene.add.graphics()
  container.add(g)

  const iconSize = Math.min(h * 0.5, 44)
  const padX = 26
  let labelX = 0
  let labelOrigin: [number, number] = [0.5, 0.5]

  let glyphG: Phaser.GameObjects.Graphics | null = null
  let iconImg: Phaser.GameObjects.Image | null = null
  if (opts.icon && scene.textures.exists(opts.icon)) {
    iconImg = scene.add.image(-w / 2 + padX + iconSize / 2, 0, opts.icon)
    const s = iconSize / Math.max(iconImg.width, iconImg.height)
    iconImg.setScale(s)
    container.add(iconImg)
  } else if (opts.glyph) {
    glyphG = scene.add.graphics({ x: -w / 2 + padX + iconSize / 2, y: 0 })
    container.add(glyphG)
  }
  if (align === 'left') {
    labelX = hasIcon ? -w / 2 + padX + iconSize + 18 : -w / 2 + padX
    labelOrigin = [0, 0.5]
  }

  const label = text(scene, labelX, 0, opts.label, {
    size, face: 'display', weight: 600, letterSpacing: 2,
    origin: labelOrigin, color: vc.labelRest,
  })
  container.add(label)

  let value: Phaser.GameObjects.Text | null = null
  if (opts.value !== undefined) {
    value = text(scene, w / 2 - padX, 0, opts.value, {
      size: 'bodySm', face: 'mono', origin: [1, 0.5], color: opts.valueColor ?? C.money,
    })
    container.add(value)
  }

  const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setInteractive({ useHandCursor: true })
  container.add(hit)

  let enabled = true
  let selected = false

  const paint = (pressed = false) => {
    const showSel = selected && enabled
    drawPlate(g, w, h, {
      face: showSel ? C.buttonFaceSel : pressed ? C.buttonFace2 : C.buttonFace,
      border: !enabled ? C.line : showSel ? selAccent : vc.restBorder,
      borderWidth: showSel ? 3 : 2,
      chamfer: cham,
      glow: showSel ? 3 : variant === 'primary' && enabled ? 1 : 0,
      glowColor: selAccent,
      rivets: true,
    })
    const labelColor = !enabled ? C.textMuted : showSel ? selAccent : vc.labelRest
    label.setColor(hex(labelColor))
    if (glyphG) {
      glyphG.clear()
      opts.glyph!(glyphG, iconSize)
      glyphG.setAlpha(enabled ? 1 : 0.4)
    }
    if (iconImg) iconImg.setAlpha(enabled ? 1 : 0.4)
    if (value) value.setAlpha(enabled ? 1 : 0.4)
  }
  paint()

  hit.on('pointerover', () => { if (enabled) onFocus?.() })
  hit.on('pointerdown', () => { if (enabled) paint(true) })
  hit.on('pointerup', () => { if (enabled) { paint(); onActivate?.() } })
  hit.on('pointerout', () => paint())

  return {
    container,
    hit,
    setState(state: ButtonState) {
      if (state.enabled !== undefined) enabled = state.enabled
      if (state.selected !== undefined) selected = state.selected
      paint(state.pressed)
    },
    setLabel(t: string) { label.setText(t) },
    setValue(t: string, color?: number) {
      if (!value) return
      value.setText(t)
      if (color !== undefined) value.setColor(hex(color))
    },
    setEnabled(e: boolean) { enabled = e; paint() },
    setPosition(nx: number, ny: number) { container.setPosition(nx, ny) },
    destroy() { container.destroy() },
  }
}

/* ------------------------------------------------------------------ *
 * Screen scaffolding — title, back control, top status strip.
 * ------------------------------------------------------------------ */

/** Big condensed screen heading. Left-anchored by default (top-left of screen). */
export function screenTitle(
  scene: Phaser.Scene,
  content: string,
  opts: { x?: number; y?: number; origin?: [number, number]; color?: number; size?: TypeToken; slug?: boolean } = {},
) {
  const { x = SAFE.left, y = 96, origin = [0, 0.5], color = C.textPrimary, size = 'hero', slug = true } = opts
  const objs: Phaser.GameObjects.GameObject[] = []
  if (slug) {
    objs.push(text(scene, x + 2, y - 62, 'DEATHRALLY: PEYKAN JAVANAN', {
      size: 'micro', face: 'display', weight: 600, letterSpacing: 4, color: C.oxideDim, origin: [origin[0], 0.5],
    }))
  }
  const title = text(scene, x, y, content, {
    size, face: 'display', weight: 700, letterSpacing: 3, color,
    stroke: C.shadow, strokeThickness: 6, origin,
  })
  objs.push(title)
  return title
}

/**
 * Bottom-left back control with a destination label ('‹ SINGLE PLAYER').
 * Scenes keep their own Esc handler; this is the visible touch route back.
 */
export function backPlate(
  scene: Phaser.Scene,
  destination: string,
  onBack: () => void,
  opts: { x?: number; y?: number; w?: number } = {},
): ButtonHandle {
  const w = opts.w ?? 300
  const h = TOUCH.minH
  const x = opts.x ?? SAFE.left + w / 2
  const y = opts.y ?? GAME_HEIGHT - SAFE.bottom - h / 2
  const btn = notchedButton(scene, x, y, {
    w, h, label: `‹  ${destination}`, size: 'action', align: 'left', onActivate: onBack,
  })
  return btn
}

export interface StatusStripHandle {
  container: Phaser.GameObjects.Container
  setCash(cash: number): void
  setIdentity(name: string, rankLabel: string): void
}

/**
 * Top-right identity + cash strip with an optional settings gear.
 * `onSettings` wires the gear; omit it on screens with no settings route.
 */
export function statusStrip(
  scene: Phaser.Scene,
  driverName: string,
  rankLabel: string,
  cash: number,
  opts: { onSettings?: () => void; y?: number } = {},
): StatusStripHandle {
  const y = opts.y ?? SAFE.top + 22
  const container = scene.add.container(0, 0)

  const gearW = opts.onSettings ? 60 : 0
  const rightEdge = SAFE.right - (gearW ? gearW + 12 : 0)

  const cashStr = `$${cash.toLocaleString('en-US')}`
  const cashW = 180
  const idW = 320
  const idX = rightEdge - cashW - 12 - idW / 2
  const cashX = rightEdge - cashW / 2

  const idG = scene.add.graphics({ x: idX, y })
  drawPlate(idG, idW, 56, { face: C.buttonFace, border: C.oxideDim, chamfer: 10, rivets: true })
  container.add(idG)
  // driver badge chip
  const badge = scene.add.graphics({ x: idX - idW / 2 + 30, y })
  badge.fillStyle(C.oxide, 0.16); badge.fillCircle(0, 0, 20)
  badge.lineStyle(2, C.oxide, 0.8); badge.strokeCircle(0, 0, 20)
  container.add(badge)
  const idText = text(scene, idX - idW / 2 + 62, y, `${driverName} · ${rankLabel}`, {
    size: 'bodySm', face: 'display', weight: 600, letterSpacing: 1, origin: [0, 0.5], color: C.textPrimary,
  })
  container.add(idText)

  const cashG = scene.add.graphics({ x: cashX, y })
  drawPlate(cashG, cashW, 56, { face: C.buttonFace, border: C.oxideDim, chamfer: 10, rivets: true })
  container.add(cashG)
  const cashText = text(scene, cashX, y, cashStr, {
    size: 'body', face: 'mono', weight: 700, origin: [0.5, 0.5], color: C.money,
  })
  container.add(cashText)

  if (opts.onSettings) {
    const gx = SAFE.right - gearW / 2
    const gG = scene.add.graphics({ x: gx, y })
    drawPlate(gG, gearW, 56, { face: C.buttonFace, border: C.border, chamfer: 8, rivets: false })
    container.add(gG)
    const gear = text(scene, gx, y, '⚙', { size: 'heading', origin: [0.5, 0.5], color: C.textSecondary })
    container.add(gear)
    const gHit = scene.add.rectangle(gx, y, gearW, 56, 0, 0).setInteractive({ useHandCursor: true })
    gHit.on('pointerup', opts.onSettings!)
    container.add(gHit)
  }

  return {
    container,
    setCash(next: number) { cashText.setText(`$${next.toLocaleString('en-US')}`) },
    setIdentity(name: string, rank: string) { idText.setText(`${name} · ${rank}`) },
  }
}

/* ------------------------------------------------------------------ *
 * Data display — titled card, segmented stat bar, pips, stars, delta.
 * ------------------------------------------------------------------ */

/** A titled notched panel. Returns the interior bounds for content placement. */
export function card(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  title?: string,
  opts: { accent?: number } = {},
): { container: Phaser.GameObjects.Container; inner: Phaser.Geom.Rectangle } {
  const container = scene.add.container(x, y)
  const g = scene.add.graphics()
  drawPlate(g, w, h, { face: C.surfacePlate, faceAlpha: 0.94, border: opts.accent ?? C.line, chamfer: 14, rivets: true, glow: 0 })
  container.add(g)
  if (title) {
    const t = text(scene, -w / 2 + 24, -h / 2 + 26, title, {
      size: 'caption', face: 'display', weight: 600, letterSpacing: 4, color: opts.accent ?? C.oxide, origin: [0, 0.5],
    })
    container.add(t)
  }
  return {
    container,
    inner: new Phaser.Geom.Rectangle(-w / 2 + 24, -h / 2 + (title ? 52 : 24), w - 48, h - (title ? 76 : 48)),
  }
}

/** Segmented (chunked) stat bar with a left label. Filled up to `ratio`. */
export function segBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  label: string,
  ratio: number,
  opts: { color?: number; segments?: number; labelW?: number } = {},
): Phaser.GameObjects.Container {
  const { color = C.oxide, segments = 8, labelW = 90 } = opts
  const container = scene.add.container(x, y)
  container.add(text(scene, 0, 0, label, {
    size: 'label', face: 'display', weight: 600, letterSpacing: 2, color: C.textSecondary, origin: [0, 0.5],
  }))
  const barX = labelW
  const barW = w - labelW
  const gap = 5
  const n = segments
  const segW = (barW - gap * (n - 1)) / n
  const filled = Math.round(ratio * n)
  const g = scene.add.graphics()
  for (let i = 0; i < n; i++) {
    g.fillStyle(i < filled ? color : C.surfaceTrack, i < filled ? 1 : 0.7)
    g.fillRect(barX + i * (segW + gap), -8, segW, 16)
  }
  container.add(g)
  return container
}

/** ★ talent rating as text (filled + empty, so it never reads by colour alone). */
export function stars(
  scene: Phaser.Scene,
  x: number,
  y: number,
  filled: number,
  total = 3,
  opts: { color?: number; size?: TypeToken; origin?: [number, number] } = {},
): Phaser.GameObjects.Text {
  const { color = C.oxide, size = 'body', origin = [0, 0.5] } = opts
  const str = '★'.repeat(Math.max(0, filled)) + '☆'.repeat(Math.max(0, total - filled))
  return text(scene, x, y, str, { size, color, origin })
}

/** A signed delta with an arrow glyph, so up/down never reads by colour alone. */
export function deltaText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: number,
  opts: { suffix?: string; origin?: [number, number]; neutralZero?: boolean } = {},
): Phaser.GameObjects.Text {
  const { suffix = '', origin = [0, 0.5], neutralZero = true } = opts
  const up = value > 0
  const zero = value === 0
  const arrow = zero ? '·' : up ? '▲' : '▼'
  const color = zero && neutralZero ? C.textMuted : up ? C.ok : C.danger
  const body = `${arrow} ${up ? '+' : ''}${value}${suffix}`
  return text(scene, x, y, body, { size: 'bodySm', face: 'mono', color, origin })
}

/** Pagination dots. Returns a setter so a carousel can move the active dot. */
export function dots(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  opts: { active?: number; gap?: number; color?: number } = {},
): { container: Phaser.GameObjects.Container; setActive(i: number): void } {
  const { gap = 26, color = C.oxide } = opts
  let active = opts.active ?? 0
  const container = scene.add.container(x, y)
  const g = scene.add.graphics()
  container.add(g)
  const draw = () => {
    g.clear()
    const totalW = (count - 1) * gap
    for (let i = 0; i < count; i++) {
      const dx = -totalW / 2 + i * gap
      if (i === active) {
        g.fillStyle(color, 1); g.fillCircle(dx, 0, 7)
      } else {
        g.fillStyle(C.textMuted, 0.6); g.fillCircle(dx, 0, 5)
      }
    }
  }
  draw()
  return { container, setActive(i: number) { active = i; draw() } }
}

/* ------------------------------------------------------------------ *
 * Segmented control / tab bar.
 * ------------------------------------------------------------------ */

export interface SegmentedHandle {
  container: Phaser.GameObjects.Container
  setActive(index: number): void
  buttons: ButtonHandle[]
}

/** A horizontal row of mutually-exclusive tabs. Selected tab uses the oxide fill. */
export function segmented(
  scene: Phaser.Scene,
  x: number,
  y: number,
  labels: string[],
  onChange: (index: number) => void,
  opts: { w?: number; h?: number; gap?: number; size?: TypeToken } = {},
): SegmentedHandle {
  const { w = 1000, h = 64, gap = 10, size = 'bodySm' } = opts
  const container = scene.add.container(x, y)
  const n = labels.length
  const segW = (w - gap * (n - 1)) / n
  const buttons: ButtonHandle[] = []
  let active = 0
  labels.forEach((lab, i) => {
    const bx = -w / 2 + segW / 2 + i * (segW + gap)
    const btn = notchedButton(scene, bx, 0, {
      w: segW, h, label: lab, size, chamfer: 8, align: 'center',
      onActivate: () => { active = i; refresh(); onChange(i) },
    })
    container.add(btn.container)
    buttons.push(btn)
  })
  const refresh = () => buttons.forEach((b, i) => b.setState({ selected: i === active, enabled: true }))
  refresh()
  return {
    container, buttons,
    setActive(i: number) { active = i; refresh() },
  }
}

/* ------------------------------------------------------------------ *
 * Slider + toggle (Settings).
 * ------------------------------------------------------------------ */

export interface SliderHandle {
  container: Phaser.GameObjects.Container
  hit: Phaser.GameObjects.Rectangle
  setValue(ratio: number, valueLabel: string): void
  setSelected(selected: boolean): void
}

/** A labelled slider row with a large thumb and a numeric readout. */
export function slider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  label: string,
  ratio: number,
  valueLabel: string,
  opts: { onScrub?: (ratio: number) => void } = {},
): SliderHandle {
  const h = TOUCH.minH
  const container = scene.add.container(x, y)
  const g = scene.add.graphics()
  container.add(g)
  const labelText = text(scene, -w / 2 + 28, -h / 4, label, {
    size: 'action', face: 'display', weight: 600, letterSpacing: 2, origin: [0, 0.5], color: C.textPrimary,
  })
  container.add(labelText)
  const valueText = text(scene, w / 2 - 28, -h / 4, valueLabel, {
    size: 'body', face: 'mono', origin: [1, 0.5], color: C.oxide,
  })
  container.add(valueText)

  const trackLeft = -w / 2 + 28
  const trackRight = w / 2 - 28
  const trackW = trackRight - trackLeft
  const trackY = h / 4
  let selected = false

  const draw = (r: number) => {
    g.clear()
    drawPlate(g, w, h, { face: C.surfacePlate, faceAlpha: 0.9, border: selected ? C.oxide : C.line, chamfer: 12, rivets: true })
    g.fillStyle(C.surfaceTrack, 1)
    g.fillRoundedRect(trackLeft, trackY - 5, trackW, 10, 5)
    g.fillStyle(C.oxide, 1)
    g.fillRoundedRect(trackLeft, trackY - 5, trackW * r, 10, 5)
    const thumbX = trackLeft + trackW * r
    g.fillStyle(C.textPrimary, 1); g.fillCircle(thumbX, trackY, 16)
    g.fillStyle(C.oxide, 1); g.fillCircle(thumbX, trackY, 9)
  }
  draw(ratio)

  const hit = scene.add.rectangle(0, 0, w, h, 0, 0).setInteractive({ useHandCursor: true })
  container.add(hit)
  // pointer.worldX is canvas-space; the track lives in container-local space.
  const scrubFrom = (worldX: number) => {
    const localX = worldX - container.x
    const r = Phaser.Math.Clamp((localX - trackLeft) / trackW, 0, 1)
    opts.onScrub?.(r)
  }
  hit.on('pointerdown', (p: Phaser.Input.Pointer) => scrubFrom(p.worldX))
  hit.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) scrubFrom(p.worldX) })

  return {
    container, hit,
    setValue(r: number, v: string) { draw(r); valueText.setText(v) },
    setSelected(s: boolean) { selected = s; draw(ratio) },
  }
}

export interface ToggleHandle {
  container: Phaser.GameObjects.Container
  hit: Phaser.GameObjects.Rectangle
  setValue(on: boolean, stateLabel: string): void
  setSelected(selected: boolean): void
}

/**
 * A labelled toggle row. State is shown by an ON/OFF word + a filled/empty
 * pill, never by colour alone. `stateLabel` lets a caller show e.g. 'AUTO'.
 */
export function toggleRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  label: string,
  on: boolean,
  stateLabel: string,
  opts: { onToggle?: () => void } = {},
): ToggleHandle {
  const h = TOUCH.minH
  const container = scene.add.container(x, y)
  const g = scene.add.graphics()
  container.add(g)
  const labelText = text(scene, -w / 2 + 28, 0, label, {
    size: 'action', face: 'display', weight: 600, letterSpacing: 2, origin: [0, 0.5], color: C.textPrimary,
  })
  container.add(labelText)
  const stateText = text(scene, w / 2 - 118, 0, stateLabel, {
    size: 'body', face: 'mono', origin: [1, 0.5], color: C.textSecondary,
  })
  container.add(stateText)
  let selected = false

  const pillX = w / 2 - 84
  const draw = (isOn: boolean) => {
    g.clear()
    drawPlate(g, w, h, { face: C.surfacePlate, faceAlpha: 0.9, border: selected ? C.oxide : C.line, chamfer: 12, rivets: true })
    // pill
    g.fillStyle(isOn ? C.oxide : C.surfaceTrack, isOn ? 0.9 : 1)
    g.fillRoundedRect(pillX, -16, 68, 32, 16)
    g.lineStyle(2, isOn ? C.oxide : C.border, 1)
    g.strokeRoundedRect(pillX, -16, 68, 32, 16)
    g.fillStyle(C.textPrimary, 1)
    g.fillCircle(pillX + (isOn ? 52 : 16), 0, 12)
  }
  draw(on)

  const hit = scene.add.rectangle(0, 0, w, h, 0, 0).setInteractive({ useHandCursor: true })
  container.add(hit)
  hit.on('pointerup', () => opts.onToggle?.())

  return {
    container, hit,
    setValue(isOn: boolean, sl: string) { draw(isOn); stateText.setText(sl) },
    setSelected(s: boolean) { selected = s; draw(on) },
  }
}

/* ------------------------------------------------------------------ *
 * Paginated selector (carousel) — index + chevrons + dots + swipe.
 * ------------------------------------------------------------------ */

export interface CarouselHandle {
  container: Phaser.GameObjects.Container
  index(): number
  setIndex(i: number): void
  next(): void
  prev(): void
  destroy(): void
}

/**
 * A lightweight paginated selector. It owns the chevrons, dots and swipe/keys;
 * the scene renders the current card in `onChange(index)`. Kept content-agnostic
 * so venues, dealer, market, sign-up, hall-of-fame and preview can all reuse it.
 */
export function carousel(
  scene: Phaser.Scene,
  count: number,
  onChange: (index: number) => void,
  opts: { x?: number; y?: number; chevronY?: number; dotsY?: number; startIndex?: number; loop?: boolean } = {},
): CarouselHandle {
  const { x = GAME_WIDTH / 2, chevronY = GAME_HEIGHT / 2, dotsY = GAME_HEIGHT - 150, loop = true } = opts
  let idx = opts.startIndex ?? 0
  const container = scene.add.container(0, 0)

  const clamp = (i: number) => loop ? (i + count) % count : Phaser.Math.Clamp(i, 0, count - 1)
  const emit = () => { onChange(idx); dotHandle.setActive(idx) }

  const mkChevron = (dir: -1 | 1) => {
    const cx = dir < 0 ? SAFE.left + 46 : SAFE.right - 46
    const btn = notchedButton(scene, cx, chevronY, {
      w: 76, h: 120, label: dir < 0 ? '‹' : '›', size: 'title', chamfer: 10,
      onActivate: () => { idx = clamp(idx + dir); emit() },
    })
    container.add(btn.container)
    return btn
  }
  mkChevron(-1)
  mkChevron(1)

  const dotHandle = dots(scene, x, dotsY, count, { active: idx })
  container.add(dotHandle.container)

  // swipe: horizontal drag over the whole screen advances/retreats
  let startX = 0
  const onDown = (p: Phaser.Input.Pointer) => { startX = p.x }
  const onUp = (p: Phaser.Input.Pointer) => {
    const dx = p.x - startX
    if (Math.abs(dx) > 80) { idx = clamp(idx + (dx < 0 ? 1 : -1)); emit() }
  }
  scene.input.on('pointerdown', onDown)
  scene.input.on('pointerup', onUp)
  scene.events.once('shutdown', () => {
    scene.input.off('pointerdown', onDown)
    scene.input.off('pointerup', onUp)
  })

  onChange(idx)
  return {
    container,
    index: () => idx,
    setIndex(i: number) { idx = clamp(i); emit() },
    next() { idx = clamp(idx + 1); emit() },
    prev() { idx = clamp(idx - 1); emit() },
    destroy() { container.destroy() },
  }
}

/* ------------------------------------------------------------------ *
 * Confirmation sheet — danger + neutral modal over a veil.
 * ------------------------------------------------------------------ */

export interface ConfirmHandle {
  container: Phaser.GameObjects.Container
  destroy(): void
}

/**
 * A centred confirmation modal over a near-opaque veil. Two large actions.
 * The caller owns keyboard: typically Esc -> onCancel, Enter -> the safe action.
 */
export function confirmSheet(
  scene: Phaser.Scene,
  opts: {
    title: string
    body?: string
    cancelLabel?: string
    confirmLabel: string
    danger?: boolean
    onCancel: () => void
    onConfirm: () => void
    depth?: number
  },
): ConfirmHandle {
  const { title, body, cancelLabel = 'CANCEL', confirmLabel, danger = false, onCancel, onConfirm, depth = 5000 } = opts
  const container = scene.add.container(0, 0).setDepth(depth)

  const veil = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, C.shadow, 0.78)
    .setInteractive()
  container.add(veil)

  const w = 900
  const h = body ? 520 : 420
  const cx = GAME_WIDTH / 2
  const cy = GAME_HEIGHT / 2
  const g = scene.add.graphics({ x: cx, y: cy })
  drawPlate(g, w, h, { face: C.surfacePlate, faceAlpha: 0.98, border: danger ? C.danger : C.oxide, borderWidth: 3, chamfer: 18, rivets: true, glow: 2, glowColor: danger ? C.danger : C.oxide })
  container.add(g)

  container.add(text(scene, cx, cy - h / 2 + 70, title, {
    size: 'title', face: 'display', weight: 700, letterSpacing: 2, color: danger ? C.danger : C.oxide, origin: [0.5, 0.5],
    stroke: C.shadow, strokeThickness: 6,
  }))
  if (body) {
    container.add(text(scene, cx, cy - 20, body, {
      size: 'body', face: 'mono', color: C.textBody, origin: [0.5, 0.5], align: 'center',
      wordWrapWidth: w - 120, lineSpacing: 10,
    }))
  }

  const btnY = cy + h / 2 - 90
  const btnW = (w - 120) / 2
  const cancel = notchedButton(scene, cx - btnW / 2 - 12, btnY, {
    w: btnW, h: TOUCH.minH, label: cancelLabel, size: 'action', onActivate: onCancel,
  })
  cancel.setState({ selected: !danger, enabled: true })
  container.add(cancel.container)
  const confirm = notchedButton(scene, cx + btnW / 2 + 12, btnY, {
    w: btnW, h: TOUCH.minH, label: confirmLabel, size: 'action', variant: danger ? 'danger' : 'primary', onActivate: onConfirm,
  })
  confirm.setState({ selected: danger, enabled: true })
  container.add(confirm.container)

  return { container, destroy() { container.destroy() } }
}

/* ------------------------------------------------------------------ *
 * Round touch button (Race HUD).
 * ------------------------------------------------------------------ */

export interface RoundButtonHandle {
  container: Phaser.GameObjects.Container
  setPressed(pressed: boolean): void
  setEnabled(enabled: boolean): void
  setOpacity(alpha: number): void
  destroy(): void
}

/**
 * A translucent circular HUD button. Reports raw press/release so the Race
 * scene can feed it into a named InputManager action — the widget owns no
 * gameplay meaning, only the visual + pointer surface.
 */
export function roundButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  label: string,
  opts: {
    color?: number
    glyph?: (g: Phaser.GameObjects.Graphics, r: number) => void
    onDown?: () => void
    onUp?: () => void
  } = {},
): RoundButtonHandle {
  const { color = C.oxide, onDown, onUp } = opts
  const container = scene.add.container(x, y)
  const g = scene.add.graphics()
  container.add(g)
  let pressed = false
  let enabled = true

  const draw = () => {
    g.clear()
    const a = enabled ? 1 : 0.4
    g.fillStyle(C.surfaceHud, (pressed ? 0.9 : 0.6) * a)
    g.fillCircle(0, 0, radius)
    g.lineStyle(3, color, (pressed ? 1 : 0.75) * a)
    g.strokeCircle(0, 0, radius)
    if (pressed) { g.fillStyle(color, 0.18 * a); g.fillCircle(0, 0, radius - 3) }
    if (opts.glyph) opts.glyph(g, radius)
  }
  draw()

  const glyphColor = color
  const labelText = text(scene, 0, opts.glyph ? radius * 0.42 : 0, label, {
    size: 'bodySm', face: 'display', weight: 700, letterSpacing: 1, origin: [0.5, 0.5], color: glyphColor,
  })
  container.add(labelText)

  const hit = scene.add.circle(0, 0, radius, 0, 0).setInteractive(
    new Phaser.Geom.Circle(0, 0, radius), Phaser.Geom.Circle.Contains,
  )
  container.add(hit)
  hit.on('pointerdown', () => { if (!enabled) return; pressed = true; draw(); onDown?.() })
  const release = () => { if (!pressed) return; pressed = false; draw(); onUp?.() }
  hit.on('pointerup', release)
  hit.on('pointerout', release)

  return {
    container,
    setPressed(p: boolean) { pressed = p; draw() },
    setEnabled(e: boolean) { enabled = e; draw() },
    setOpacity(alpha: number) { container.setAlpha(alpha) },
    destroy() { container.destroy() },
  }
}
