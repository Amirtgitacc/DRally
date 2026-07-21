import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { C } from '../ui/theme'
import { text } from '../ui/widgets'
import { backPlate, card, screenTitle } from '../ui/mobile'
import { sceneBackground } from '../ui/sceneBackground'

/** Verbatim credit lines, top to bottom inside the plate. */
const LINES = [
  'ORIGINAL BROWSER COMBAT-RACING GAME',
  'DESIGN & DEVELOPMENT',
  'PROCEDURAL ART & SYNTHESIZED AUDIO',
  'BUILT WITH PHASER · TYPESCRIPT · VITE',
  'TYPEFACES · OSWALD · JETBRAINS MONO',
  'ORIGINAL WORK · NO LEGACY GAME ASSETS USED',
] as const

export class CreditsScene extends Phaser.Scene {
  constructor() { super('Credits') }

  create() {
    // Quiet dark records-hall wall, heavily veiled so the credit text dominates.
    sceneBackground(this, 'bg-records', { veil: 0.68 })

    screenTitle(this, 'CREDITS', { x: GAME_WIDTH / 2, y: 110, origin: [0.5, 0.5], slug: false })

    // Centred credits plate.
    const cx = GAME_WIDTH / 2
    const cy = 520
    const w = 1200
    const h = 660
    card(this, cx, cy, w, h, undefined, { accent: C.oxideDim })
    const top = cy - h / 2
    const bottom = cy + h / 2

    // Full working title, two-tone: "DeathRally:" off-white + "Peykan Javanan" oxide.
    const titleY = top + 82
    const part1 = text(this, 0, titleY, 'DeathRally:', {
      size: 'heading', face: 'display', weight: 700, letterSpacing: 1,
      color: C.textPrimary, origin: [0, 0.5],
    })
    const part2 = text(this, 0, titleY, 'Peykan Javanan', {
      size: 'heading', face: 'display', weight: 700, letterSpacing: 1,
      color: C.oxide, origin: [0, 0.5],
    })
    const gap = 16
    const totalW = part1.width + gap + part2.width
    const startX = cx - totalW / 2
    part1.setX(startX)
    part2.setX(startX + part1.width + gap)

    // Credit rows with a thin oxide-diamond divider above each.
    const rowTop = titleY + 110
    const rowBottom = bottom - 66
    const n = LINES.length
    const step = (rowBottom - rowTop) / (n - 1)
    const dividerHalf = w / 2 - 70
    LINES.forEach((line, i) => {
      const y = rowTop + i * step
      drawDivider(this, cx, y - step / 2, dividerHalf)
      text(this, cx, y, line, {
        size: 'bodyLg', face: 'display', weight: 500, letterSpacing: 3,
        color: C.textBody, origin: [0.5, 0.5], align: 'center',
      })
    })

    // Persistent back route: visible plate + Esc/Enter.
    const back = backPlate(this, 'SINGLE PLAYER', () => this.scene.start('Menu'), {
      x: cx, y: 960, w: 760,
    })
    back.setState({ selected: true, enabled: true })

    const kb = this.input.keyboard!
    const toMenu = () => this.scene.start('Menu')
    kb.on('keydown-ESC', toMenu)
    kb.on('keydown-ENTER', toMenu)
    this.events.once('shutdown', () => {
      kb.off('keydown-ESC', toMenu)
      kb.off('keydown-ENTER', toMenu)
    })
  }
}

/** A thin hairline with a small oxide diamond at its centre. */
function drawDivider(scene: Phaser.Scene, cx: number, y: number, half: number) {
  const g = scene.add.graphics()
  g.lineStyle(1, C.line, 1)
  g.lineBetween(cx - half, y, cx - 14, y)
  g.lineBetween(cx + 14, y, cx + half, y)
  const d = 5
  g.fillStyle(C.oxideDim, 1)
  g.fillPoints([
    new Phaser.Geom.Point(cx, y - d),
    new Phaser.Geom.Point(cx + d, y),
    new Phaser.Geom.Point(cx, y + d),
    new Phaser.Geom.Point(cx - d, y),
  ], true)
}
