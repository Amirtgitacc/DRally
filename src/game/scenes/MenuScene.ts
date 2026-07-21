import Phaser from 'phaser'
import { playerRank } from '../../core/progression/ladder'
import { carById } from '../../data/cars'
import { audioBus } from '../systems/audio'
import { hasSavedCareer, readCareer } from '../state/saveGame'
import { loadSettings } from '../state/settings'
import { C } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { ensureDeferredLoadStarted } from '../textures/deferredLoadScene'
import { backPlate, card, coverBakedMenuArt, notchedButton, screenTitle, type ButtonHandle } from '../ui/mobile'
import * as glyph from '../ui/glyphs'

interface HubItem {
  label: string
  scene: string
  data?: object
  glyph?: (g: Phaser.GameObjects.Graphics, s: number) => void
  primary?: boolean
  /** grid column: 0 left, 1 right; credits spans full width */
  full?: boolean
}

// Reading order drives keyboard nav; layout is a two-column grid + a full-width
// Credits row. Multiplayer and Settings intentionally live on Root, not here.
const ITEMS: HubItem[] = [
  { label: 'CONTINUE\nCAREER', scene: 'Garage', glyph: glyph.flag, primary: true },
  { label: 'NEW CAREER', scene: 'Profile', data: { replace: true } },
  { label: 'VENUES', scene: 'Venues', glyph: glyph.pin },
  { label: 'CHAMPIONSHIP\nLADDER', scene: 'Ranking', data: { from: 'menu' }, glyph: glyph.ladder },
  { label: 'HALL OF FAME', scene: 'HallOfFame', glyph: glyph.trophy },
  { label: 'CIRCUIT\nPREVIEW', scene: 'Preview', glyph: glyph.circuit },
  { label: 'CREDITS', scene: 'Credits', glyph: glyph.film, full: true },
]

export class MenuScene extends Phaser.Scene {
  private selected = 0
  private buttons: ButtonHandle[] = []

  constructor() {
    super('Menu')
  }

  create() {
    ensureDeferredLoadStarted(this)
    audioBus.applySettings(loadSettings())

    const career = readCareer()
    // Root routes first-launch to Profile; this is a defensive guard only.
    if (!hasSavedCareer() || !career) {
      this.scene.start('Profile', { firstLaunch: true })
      return
    }

    this.selected = 0
    this.buttons = []

    sceneBackground(this, 'bg-menu', { veil: 0.42 })
    coverBakedMenuArt(this)

    screenTitle(this, 'SINGLE PLAYER', { x: 64, y: 96 })

    const rankLabel = career.champion ? 'CHAMPION' : `RANK #${playerRank(career.ladder, career.points)}`
    this.buildIdentityCard(career.profile.driverName, rankLabel, carById(career.carId).name, career.cash, career.points, career.wins, career.racesRun)

    // two-column grid
    const colX = [1130, 1580]
    const rowY = [388, 528, 668]
    const bw = 430
    const bh = 122
    ITEMS.forEach((item, i) => {
      let x: number, y: number, w: number
      if (item.full) {
        x = (colX[0] + colX[1]) / 2
        y = 806
        w = colX[1] - colX[0] + bw
      } else {
        x = colX[i % 2]
        y = rowY[Math.floor(i / 2)]
        w = bw
      }
      const btn = notchedButton(this, x, y, {
        w, h: bh, label: item.label, size: 'subtitle', align: item.full ? 'center' : 'left',
        glyph: item.glyph, variant: item.primary ? 'primary' : 'secondary',
        onFocus: () => { this.selected = i; this.refresh() },
        onActivate: () => { this.selected = i; this.activate() },
      })
      this.buttons.push(btn)
    })

    backPlate(this, 'MAIN', () => this.scene.start('Root'))

    const kb = this.input.keyboard!
    const left = () => this.move(-1)
    const right = () => this.move(1)
    const up = () => this.move(-2)
    const down = () => this.move(2)
    const enter = () => this.activate()
    const back = () => this.scene.start('Root')
    kb.on('keydown-LEFT', left)
    kb.on('keydown-RIGHT', right)
    kb.on('keydown-UP', up)
    kb.on('keydown-DOWN', down)
    kb.on('keydown-ENTER', enter)
    kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right)
      kb.off('keydown-UP', up); kb.off('keydown-DOWN', down)
      kb.off('keydown-ENTER', enter); kb.off('keydown-ESC', back)
    })

    this.refresh()
  }

  private buildIdentityCard(
    name: string, rankLabel: string, carName: string,
    cash: number, points: number, wins: number, starts: number,
  ) {
    const cx = 1370
    const cy = 116
    const w = 960
    const h = 152
    card(this, cx, cy, w, h, undefined, { accent: C.oxideDim })

    // driver badge
    const badgeG = this.add.graphics({ x: cx - w / 2 + 64, y: cy })
    badgeG.lineStyle(2, C.oxide, 0.8); badgeG.strokeRoundedRect(-40, -50, 80, 100, 8)
    glyph.skull(badgeG, 56)

    // column A — identity
    const ax = cx - w / 2 + 128
    text(this, ax, cy - 40, name.toUpperCase(), { size: 'heading', face: 'display', weight: 700, color: C.oxide, origin: [0, 0.5] })
    text(this, ax, cy + 2, rankLabel, { size: 'body', face: 'display', weight: 600, letterSpacing: 2, color: C.textSecondary, origin: [0, 0.5] })
    text(this, ax, cy + 44, carName.toUpperCase(), { size: 'body', face: 'display', weight: 600, letterSpacing: 1, color: C.oxide, origin: [0, 0.5] })

    // column B — economy/record
    const bx = cx + 120
    const rows: Array<[string, string, number]> = [
      [`$${cash.toLocaleString('en-US')}`, '$', C.money],
      [`${points} PTS`, '★', C.textPrimary],
      [`${wins} WINS / ${starts} STARTS`, '⌂', C.textPrimary],
    ]
    rows.forEach(([value, mark, color], i) => {
      const ry = cy - 40 + i * 40
      text(this, bx, ry, mark, { size: 'body', face: 'mono', color: C.oxideDim, origin: [0.5, 0.5] })
      text(this, bx + 30, ry, value, { size: 'body', face: 'mono', weight: 700, color, origin: [0, 0.5] })
    })
  }

  private move(delta: number) {
    this.selected = Phaser.Math.Clamp(this.selected + delta, 0, ITEMS.length - 1)
    this.refresh()
  }

  private refresh() {
    this.buttons.forEach((b, i) => b.setState({ selected: i === this.selected, enabled: true }))
  }

  private activate() {
    const item = ITEMS[this.selected]
    this.scene.start(item.scene, item.data)
  }
}
