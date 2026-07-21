import Phaser from 'phaser'
import { GAME_HEIGHT } from '../../config/game'
import { formatTime } from '../../core/race/format'
import { ordinal } from '../../core/race/placement'
import { C } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { SAFE, card, drawPlate, notchedButton, screenTitle } from '../ui/mobile'
import * as glyph from '../ui/glyphs'

export interface StandingEntry {
  name: string
  isPlayer: boolean
  /** finish time, or null if still on track when the race ended */
  timeMs: number | null
  wrecked: boolean
  dnf?: boolean
}

export interface RaceResults {
  trackId: string
  trackName: string
  driverName: string
  laps: number
  totalMs: number
  bestLapMs: number | null
  lapTimes: number[]
  standings: StandingEntry[]
  playerPosition: number
  playerWrecked: boolean
  abandoned?: boolean
  cashCollected: number
  prizeCash: number
  pointsEarned: number
  careerCash: number
  /** a lost duel — a win goes straight to the Champion scene instead */
  duelLost?: boolean
  /** loanshark status line, when a loan is running or just came due */
  loanNote?: string
  newRecords?: string[]
  seed?: number
}

/** Left content column, kept inside SAFE. The right half stays atmospheric art. */
const LX = SAFE.left
const LW = 1180
const LCX = LX + LW / 2

interface Outcome {
  title: string
  /** headline + card accent colour (never the only signal — text always says it) */
  color: number
}

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results')
  }

  /** Same flags the scene already received — presentation only, no recompute. */
  private outcomeFor(r: RaceResults): Outcome {
    if (r.abandoned) return { title: 'RACE ABANDONED — DNF', color: C.danger }
    if (r.playerWrecked) return { title: 'WRECKED — OUT OF THE RACE', color: C.danger }
    if (r.duelLost) return { title: 'THE CHAMPION KEEPS THE CROWN', color: C.danger }
    if (r.playerPosition === 1) return { title: 'YOU WIN — 1ST', color: C.gold }
    return { title: `YOU FINISHED ${ordinal(r.playerPosition).toUpperCase()}`, color: C.oxide }
  }

  create(results: RaceResults) {
    sceneBackground(this, 'bg-race-ops', { veil: 0.44 })

    const outcome = this.outcomeFor(results)

    // ---- outcome headline + track/lap subtitle ----
    screenTitle(this, outcome.title, {
      x: LX,
      y: 104,
      color: outcome.color,
      size: outcome.title.length > 18 ? 'title' : 'hero',
    })
    text(this, LX, 176, `${results.trackName.toUpperCase()} · ${results.laps} LAPS`, {
      size: 'body', face: 'display', weight: 600, letterSpacing: 3, color: C.textSecondary, origin: [0, 0.5],
    })

    this.buildStandings(results, outcome)
    this.buildPayouts(results)
    this.buildChips(results)

    // ---- optional career / debug lines (preserve existing info) ----
    if (results.loanNote) {
      text(this, LX, 838, results.loanNote, {
        size: 'bodySm', face: 'mono', color: C.warn, origin: [0, 0.5], wordWrapWidth: LW,
      })
    }
    if (results.seed !== undefined) {
      text(this, SAFE.right, GAME_HEIGHT - SAFE.bottom, `SEED ${results.seed}`, {
        size: 'micro', face: 'mono', color: C.textMuted, origin: [1, 1],
      })
    }

    // ---- single onward CTA (routes to Ranking exactly as before) ----
    const next = () => this.scene.start('Ranking')
    notchedButton(this, LCX, 964, {
      w: LW, h: 100, label: 'STANDINGS', size: 'title', variant: 'primary', align: 'center', onActivate: next,
    }).setState({ selected: true, enabled: true })

    const kb = this.input.keyboard!
    kb.on('keydown-ENTER', next)
    kb.on('keydown-ESC', next)
    this.events.once('shutdown', () => {
      kb.off('keydown-ENTER', next)
      kb.off('keydown-ESC', next)
    })
  }

  /** Four-row standings card; the player row gets an oxide outline + a "YOU" tag. */
  private buildStandings(results: RaceResults, outcome: Outcome): void {
    const regionTop = 214
    const regionH = 348
    const regionMid = regionTop + regionH / 2

    card(this, LCX, regionMid, LW, regionH, undefined, { accent: outcome.color })

    const rows = results.standings
    const count = Math.max(1, rows.length)
    const rowH = Math.min(80, (regionH - 40) / count)
    const first = regionMid - (count * rowH) / 2 + rowH / 2

    rows.forEach((s, i) => {
      const rowY = first + i * rowH

      if (s.isPlayer) {
        const hi = this.add.graphics({ x: LCX, y: rowY })
        drawPlate(hi, LW - 40, rowH - 8, {
          face: C.buttonFaceSel, border: C.oxide, borderWidth: 3, chamfer: 10, rivets: false, glow: 2, glowColor: C.oxide,
        })
      }

      // placement number
      text(this, LX + 40, rowY, `${i + 1}`, {
        size: 'bodyLg', face: 'mono', weight: 700, color: C.textSecondary, origin: [0, 0.5],
      })

      // small emblem (trophy for the leader, skull for the player, circuit otherwise)
      const emblem = this.add.graphics({ x: LX + 108, y: rowY })
      const draw = i === 0 ? glyph.trophy : s.isPlayer ? glyph.skull : glyph.circuit
      draw(emblem, 40)

      // driver name
      const name = text(this, LX + 154, rowY, (s.isPlayer ? results.driverName : s.name).toUpperCase(), {
        size: 'bodyLg', face: 'display', weight: 700, letterSpacing: 1,
        color: s.isPlayer ? C.oxide : C.textPrimary, origin: [0, 0.5],
      })

      // "YOU" tag — text label, so identity never rests on colour alone
      if (s.isPlayer) {
        const tagX = LX + 154 + name.width + 24
        const tag = this.add.graphics({ x: tagX + 34, y: rowY })
        drawPlate(tag, 68, 34, { face: C.surfacePlate, border: C.oxide, borderWidth: 2, chamfer: 6, rivets: false })
        text(this, tagX + 34, rowY, 'YOU', {
          size: 'micro', face: 'display', weight: 700, letterSpacing: 2, color: C.oxide, origin: [0.5, 0.5],
        })
      }

      // finish time / status
      const status = s.dnf ? 'DNF' : s.wrecked ? 'WRECKED' : s.timeMs !== null ? formatTime(s.timeMs) : '—'
      const statusColor = s.dnf || s.wrecked ? C.danger : s.isPlayer ? C.oxide : C.textPrimary
      text(this, LX + LW - 40, rowY, status, {
        size: 'body', face: 'mono', weight: 700, color: statusColor, origin: [1, 0.5],
      })
    })
  }

  /** PRIZE / POINTS / PICKUPS / BANK summary cards with real result values. */
  private buildPayouts(results: RaceResults): void {
    const cardW = (LW - 3 * 16) / 4
    const cardH = 128
    const cy = 636

    const cards: { label: string; value: string; color: number }[] = [
      { label: 'PRIZE', value: `$${results.prizeCash.toLocaleString('en-US')}`, color: C.oxide },
      { label: 'POINTS', value: `+${results.pointsEarned}`, color: C.oxide },
      { label: 'PICKUPS', value: `$${results.cashCollected.toLocaleString('en-US')}`, color: C.oxide },
      { label: 'BANK', value: `$${results.careerCash.toLocaleString('en-US')}`, color: C.money },
    ]

    cards.forEach((c, i) => {
      const cx = LX + cardW / 2 + i * (cardW + 16)
      card(this, cx, cy, cardW, cardH, c.label)
      text(this, cx, cy + 16, c.value, {
        size: 'heading', face: 'mono', weight: 700, color: c.color, origin: [0.5, 0.5],
      })
    })
  }

  /** BEST LAP chip, plus a NEW RECORD chip when the result carries records. */
  private buildChips(results: RaceResults): void {
    const cy = 772
    const h = 68

    if (results.bestLapMs !== null) {
      const w = 440
      const cx = LX + w / 2
      const g = this.add.graphics({ x: cx, y: cy })
      drawPlate(g, w, h, { face: C.surfacePlate, faceAlpha: 0.94, border: C.line, chamfer: 10, rivets: true })
      text(this, cx - w / 2 + 30, cy, 'BEST LAP', {
        size: 'caption', face: 'display', weight: 600, letterSpacing: 3, color: C.textSecondary, origin: [0, 0.5],
      })
      text(this, cx + w / 2 - 26, cy, formatTime(results.bestLapMs), {
        size: 'body', face: 'mono', weight: 700, color: C.money, origin: [1, 0.5],
      })
    }

    if (results.newRecords?.length) {
      const w = 360
      const cx = LX + 440 + 16 + w / 2
      const g = this.add.graphics({ x: cx, y: cy })
      drawPlate(g, w, h, { face: C.surfacePlate, faceAlpha: 0.94, border: C.ok, chamfer: 10, rivets: true, glow: 1, glowColor: C.ok })
      // '★' pairs the colour with a symbol + word, so success never reads by colour alone
      text(this, cx, cy, '★  NEW RECORD', {
        size: 'body', face: 'display', weight: 700, letterSpacing: 2, color: C.ok, origin: [0.5, 0.5],
      })
    }
  }
}
