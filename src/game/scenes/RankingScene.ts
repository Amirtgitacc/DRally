import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { playerRank, standings, type StandingRow } from '../../core/progression/ladder'
import { talentOf } from '../../data/drivers'
import { loadCareer } from '../state/saveGame'
import { C } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { backPlate, card, screenTitle, segmented, stars } from '../ui/mobile'
import * as glyph from '../ui/glyphs'

/**
 * Where the player arrived from decides the return route. Reached after a race
 * (from Results, which passes no data) the back control reads GARAGE → Garage.
 * Opened directly from the Single Player hub (Menu passes `from: 'menu'`) it
 * reads SINGLE PLAYER → Menu. Presentation only — no ladder maths change here.
 */
interface RankingData {
  from?: 'menu' | 'race'
}

const CARD_W = 1600
const CARD_H = 620
const VISIBLE = 5
const ROW_H = 92

export class RankingScene extends Phaser.Scene {
  private fromMenu = false

  constructor() {
    super('Ranking')
  }

  init(data: RankingData) {
    this.fromMenu = data?.from === 'menu'
  }

  create() {
    const career = loadCareer()
    const rows = standings(career.ladder, career.points)
    const total = rows.length
    const rank = playerRank(career.ladder, career.points)
    const playerIdx = rows.findIndex((r) => r.isPlayer)
    const maxStart = Math.max(0, total - VISIBLE)
    const cx = GAME_WIDTH / 2

    sceneBackground(this, 'bg-records', { veil: 0.5 })

    screenTitle(this, 'CHAMPIONSHIP LADDER', { x: cx, y: 82, origin: [0.5, 0.5], slug: false })
    this.buildRankSummary(cx, 152, rank, total)

    // Card housing the windowed standings list.
    const cardY = 582
    card(this, cx, cardY, CARD_W, CARD_H)
    const rowLayer = this.add.container(cx, cardY)

    // TOP / AROUND ME / BOTTOM window anchors.
    const segStart = (seg: number): number => {
      if (seg === 0) return 0
      if (seg === 2) return maxStart
      return Phaser.Math.Clamp(playerIdx - Math.floor(VISIBLE / 2), 0, maxStart)
    }

    let activeSeg = 1 // AROUND ME by default, so the player sees themselves first.
    let windowStart = segStart(activeSeg)

    const renderRows = () => {
      rowLayer.removeAll(true)
      const g = this.add.graphics()
      rowLayer.add(g)

      // rank rail divider
      g.lineStyle(1, C.line, 0.8)
      g.lineBetween(-CARD_W / 2 + 180, -CARD_H / 2 + 40, -CARD_W / 2 + 180, CARD_H / 2 - 40)

      const slice = rows.slice(windowStart, windowStart + VISIBLE)
      slice.forEach((row, i) => {
        const y = -240 + i * ROW_H
        if (i > 0) {
          g.lineStyle(1, C.line, 0.6)
          g.lineBetween(-CARD_W / 2 + 40, y - ROW_H / 2, CARD_W / 2 - 40, y - ROW_H / 2)
        }
        this.drawRow(rowLayer, g, row, windowStart + i + 1, y, career.profile.driverName)
      })

      // Sticky player row: if the current window doesn't include the player,
      // pin their standing to the bottom of the card so it's never lost.
      const playerVisible = playerIdx >= windowStart && playerIdx < windowStart + VISIBLE
      if (!playerVisible) {
        const py = -240 + VISIBLE * ROW_H
        g.lineStyle(2, C.oxideDim, 0.9)
        g.lineBetween(-CARD_W / 2 + 40, py - ROW_H / 2, CARD_W / 2 - 40, py - ROW_H / 2)
        this.drawRow(rowLayer, g, rows[playerIdx], playerIdx + 1, py, career.profile.driverName)
      }
    }

    const seg = segmented(
      this,
      cx,
      228,
      ['TOP', 'AROUND ME', 'BOTTOM'],
      (i) => {
        activeSeg = i
        windowStart = segStart(i)
        renderRows()
      },
      { w: 1200, h: 68 },
    )
    seg.setActive(activeSeg)
    renderRows()

    // Scroll / jump hint.
    text(this, cx + CARD_W / 2 - 40, cardY + CARD_H / 2 + 24, '▲▼ SCROLL   ‹ › JUMP', {
      size: 'micro', face: 'display', weight: 600, letterSpacing: 2, color: C.textMuted, origin: [1, 0.5],
    })

    // Contextual return.
    const backLabel = this.fromMenu ? 'SINGLE PLAYER' : 'GARAGE'
    const back = () => this.scene.start(this.fromMenu ? 'Menu' : 'Garage')
    backPlate(this, backLabel, back, { x: cx, w: 560 })

    // Keyboard: ← → jump segment, ↑ ↓ scroll window, Enter/Esc return.
    const kb = this.input.keyboard!
    const jump = (dir: -1 | 1) => {
      activeSeg = Phaser.Math.Clamp(activeSeg + dir, 0, 2)
      seg.setActive(activeSeg)
      windowStart = segStart(activeSeg)
      renderRows()
    }
    const scroll = (dir: -1 | 1) => {
      const next = Phaser.Math.Clamp(windowStart + dir, 0, maxStart)
      if (next === windowStart) return
      windowStart = next
      renderRows()
    }
    const onLeft = () => jump(-1)
    const onRight = () => jump(1)
    const onUp = () => scroll(-1)
    const onDown = () => scroll(1)
    kb.on('keydown-LEFT', onLeft)
    kb.on('keydown-RIGHT', onRight)
    kb.on('keydown-UP', onUp)
    kb.on('keydown-DOWN', onDown)
    kb.on('keydown-ENTER', back)
    kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', onLeft)
      kb.off('keydown-RIGHT', onRight)
      kb.off('keydown-UP', onUp)
      kb.off('keydown-DOWN', onDown)
      kb.off('keydown-ENTER', back)
      kb.off('keydown-ESC', back)
    })
  }

  /** "YOU ARE RANK #N OF T" with the rank number emphasised in oxide. */
  private buildRankSummary(cx: number, y: number, rank: number, total: number) {
    const container = this.add.container(0, y)
    const pieces: Array<[string, number]> = [
      ['YOU ARE RANK ', C.textSecondary],
      [`#${rank}`, C.oxide],
      [` OF ${total}`, C.textSecondary],
    ]
    let x = 0
    for (const [str, color] of pieces) {
      const t = text(this, x, 0, str, {
        size: 'subtitle', face: 'display', weight: 600, letterSpacing: 3, color, origin: [0, 0.5],
      })
      container.add(t)
      x += t.width
    }
    container.setX(cx - x / 2)
  }

  /** One ladder row: rail number, badge, name, YOU tag, points, star talent. */
  private drawRow(
    layer: Phaser.GameObjects.Container,
    g: Phaser.GameObjects.Graphics,
    row: StandingRow,
    rankNum: number,
    y: number,
    playerName: string,
  ) {
    const isPlayer = row.isPlayer
    const nameColor = isPlayer ? C.oxide : C.textPrimary

    if (isPlayer) {
      // oxide outline + faint fill — emphasis that never rests on colour alone
      // (paired with the YOU tag below).
      g.fillStyle(C.oxide, 0.07)
      g.fillRoundedRect(-CARD_W / 2 + 34, y - ROW_H / 2 + 4, CARD_W - 68, ROW_H - 8, 10)
      g.lineStyle(3, C.oxide, 1)
      g.strokeRoundedRect(-CARD_W / 2 + 34, y - ROW_H / 2 + 4, CARD_W - 68, ROW_H - 8, 10)
    }

    // rank number, right-aligned in the rail
    layer.add(text(this, -CARD_W / 2 + 150, y, `${rankNum}`, {
      size: 'heading', face: 'mono', weight: 700, color: isPlayer ? C.oxide : C.textSecondary, origin: [1, 0.5],
    }))

    // driver badge
    const badge = this.add.graphics({ x: -CARD_W / 2 + 236, y })
    glyph.skull(badge, 46)
    if (!isPlayer) badge.setAlpha(0.7)
    layer.add(badge)

    // name
    const name = isPlayer ? playerName : row.name
    layer.add(text(this, -CARD_W / 2 + 296, y, name.toUpperCase(), {
      size: 'heading', face: 'display', weight: 600, letterSpacing: 1, color: nameColor, origin: [0, 0.5],
    }))

    // YOU tag pill
    if (isPlayer) {
      const tagX = 96
      const tag = this.add.graphics({ x: tagX, y })
      tag.lineStyle(2, C.oxide, 1)
      tag.strokeRoundedRect(-40, -18, 80, 36, 6)
      layer.add(tag)
      layer.add(text(this, tagX, y, 'YOU', {
        size: 'caption', face: 'display', weight: 700, letterSpacing: 3, color: C.oxide, origin: [0.5, 0.5],
      }))
    }

    // points
    layer.add(text(this, CARD_W / 2 - 350, y, `${row.points}`, {
      size: 'subtitle', face: 'mono', weight: 700, color: isPlayer ? C.oxide : C.textPrimary, origin: [1, 0.5],
    }))
    layer.add(text(this, CARD_W / 2 - 338, y, 'PTS', {
      size: 'caption', face: 'mono', color: C.textMuted, origin: [0, 0.5],
    }))

    // star talent — rivals only (the player carries no talent grade).
    if (!isPlayer) {
      const grade = talentOf(row.id).grade
      layer.add(stars(this, CARD_W / 2 - 220, y, grade, 4, { color: C.brass, size: 'subtitle' }))
    } else {
      layer.add(text(this, CARD_W / 2 - 220, y, '—', {
        size: 'subtitle', face: 'mono', color: C.textMuted, origin: [0, 0.5],
      }))
    }
  }
}
