import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { formatTime } from '../../core/race/format'
import { ordinal } from '../../core/race/placement'
import { ALL_TRACKS } from '../../data/tracks'
import { loadCareer } from '../state/saveGame'
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { drawTrackMap } from '../ui/trackMap'
import { backPlate, card, carousel, screenTitle } from '../ui/mobile'

/** Card geometry (centred on the canvas). */
const CARD = { w: 1120, h: 560, cx: GAME_WIDTH / 2, cy: 560 } as const
/** Circuit-outline box, relative to the card centre. */
const MAP = { cx: 268, cy: 34, w: 480, h: 330 } as const

/**
 * The track-record archive: a swipeable stack of venue cards showing the
 * player's real best lap / race / finish and win count per venue. Read-only —
 * presentation over `career.records`, no rules or persistence here.
 */
export class HallOfFameScene extends Phaser.Scene {
  private cardLayer!: Phaser.GameObjects.Container

  constructor() {
    super('HallOfFame')
  }

  create() {
    const career = loadCareer()
    sceneBackground(this, 'bg-records', { veil: 0.5 })
    const cx = GAME_WIDTH / 2

    screenTitle(this, 'HALL OF FAME', { x: cx, y: 96, origin: [0.5, 0.5] })
    text(this, cx, 176, `${career.profile.driverName} · ${career.wins} WINS · ${career.racesRun} STARTS`, {
      size: 'action', face: 'display', weight: 600, letterSpacing: 3, color: C.textSecondary, origin: [0.5, 0.5],
    })

    // Holds the card for the active venue; wiped and rebuilt on every page turn.
    this.cardLayer = this.add.container(0, 0)

    const pager = carousel(this, ALL_TRACKS.length, (i) => this.renderCard(i), { startIndex: 0, chevronY: CARD.cy })

    const back = () => this.scene.start('Menu')
    backPlate(this, 'SINGLE PLAYER', back)

    const kb = this.input.keyboard!
    const onLeft = () => pager.prev()
    const onRight = () => pager.next()
    const onEsc = back
    kb.on('keydown-LEFT', onLeft)
    kb.on('keydown-RIGHT', onRight)
    kb.on('keydown-ESC', onEsc)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', onLeft)
      kb.off('keydown-RIGHT', onRight)
      kb.off('keydown-ESC', onEsc)
    })
  }

  private renderCard(i: number): void {
    this.cardLayer.removeAll(true)
    const career = loadCareer()
    const track = ALL_TRACKS[i]
    const record = career.records[track.id]
    const accent = TIER_COLOR[track.tier]

    const { container } = card(this, CARD.cx, CARD.cy, CARD.w, CARD.h, undefined, { accent })
    this.cardLayer.add(container)
    const left = -CARD.w / 2

    // Tier chip (label + colour, never colour alone).
    const chip = this.add.graphics()
    chip.fillStyle(accent, 0.16)
    chip.fillRoundedRect(left + 30, -CARD.h / 2 + 26, 118, 40, 6)
    chip.lineStyle(2, accent, 0.9)
    chip.strokeRoundedRect(left + 30, -CARD.h / 2 + 26, 118, 40, 6)
    container.add(chip)
    container.add(text(this, left + 89, -CARD.h / 2 + 46, TIER_LABEL[track.tier], {
      size: 'label', face: 'display', weight: 700, letterSpacing: 3, color: accent, origin: [0.5, 0.5],
    }))

    // Venue name.
    container.add(text(this, left + 40, -CARD.h / 2 + 92, track.name.toUpperCase(), {
      size: 'title', face: 'display', weight: 700, letterSpacing: 2, color: accent,
      wordWrapWidth: 480, lineSpacing: 4, origin: [0, 0],
    }))

    // Record ledger.
    const rows: Array<[string, string, boolean]> = [
      ['BEST LAP', record?.bestLapMs ? formatTime(record.bestLapMs) : '—', !!record?.bestLapMs],
      ['BEST RACE', record?.bestRaceMs ? formatTime(record.bestRaceMs) : '—', !!record?.bestRaceMs],
      ['BEST FINISH', record?.bestFinish ? ordinal(record.bestFinish).toUpperCase() : '—', !!record?.bestFinish],
      ['WINS', String(record?.wins ?? 0), (record?.wins ?? 0) > 0],
    ]
    const rowY0 = -CARD.h / 2 + 268
    const rowGap = 66
    rows.forEach(([label, value, has], r) => {
      const y = rowY0 + r * rowGap
      if (r > 0) {
        const div = this.add.graphics()
        div.lineStyle(1, C.line, 0.7)
        div.lineBetween(left + 42, y - rowGap / 2, left + 520, y - rowGap / 2)
        container.add(div)
      }
      container.add(text(this, left + 42, y, label, {
        size: 'action', face: 'display', weight: 600, letterSpacing: 2, color: C.textSecondary, origin: [0, 0.5],
      }))
      container.add(text(this, left + 520, y, value, {
        size: 'body', face: 'mono', weight: 700, color: has ? C.money : C.textMuted, origin: [1, 0.5],
      }))
    })

    // Circuit layout (real centerline).
    container.add(text(this, MAP.cx, MAP.cy - MAP.h / 2 - 6, 'CIRCUIT LAYOUT', {
      size: 'caption', face: 'display', weight: 600, letterSpacing: 4, color: C.textMuted, origin: [0.5, 1],
    }))
    const map = this.add.graphics()
    drawTrackMap(map, track, {
      cx: MAP.cx, cy: MAP.cy, width: MAP.w, height: MAP.h,
      color: accent, lineWidth: 5, showStart: true, showSurface: true,
    })
    container.add(map)
  }
}
