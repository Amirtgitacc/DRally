import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { formatTime } from '../../core/race/format'
import { ordinal } from '../../core/race/placement'
import { C } from '../ui/theme'
import { heading, metalGrain, modal, prompt, text } from '../ui/widgets'

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

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results')
  }

  create(results: RaceResults) {
    const cx = GAME_WIDTH / 2

    modal(this, cx, GAME_HEIGHT * 0.55, 860, 620)
    metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)

    const title = results.abandoned
      ? 'RACE ABANDONED — DNF'
      : results.playerWrecked
      ? 'WRECKED — OUT OF THE RACE'
      : results.duelLost
        ? 'THE CHAMPION KEEPS THE CROWN'
        : `YOU FINISHED ${ordinal(results.playerPosition).toUpperCase()}`
    heading(this, cx, GAME_HEIGHT * 0.16, title, {
      color: results.playerWrecked ? C.danger : C.oxide,
    })

    text(this, cx, GAME_HEIGHT * 0.24, `${results.trackName} — ${results.laps} laps`, {
      size: 'action',
      color: C.textSecondary,
      origin: [0.5, 0.5],
    })

    const standingLines = results.standings.map((s, i) => {
      const time = s.dnf ? 'DNF' : s.wrecked ? 'WRECKED' : s.timeMs !== null ? formatTime(s.timeMs) : '   —   '
      const name = (s.isPlayer ? results.driverName : s.name).padEnd(12)
      return `${i + 1}.  ${name} ${time}`
    })
    text(this, cx, GAME_HEIGHT * 0.42, standingLines.join('\n'), {
      size: 'subtitle',
      lineSpacing: 12,
      align: 'left',
      origin: [0.5, 0.5],
    })

    const lapLines = [
      `Prize    $${results.prizeCash}   Points  +${results.pointsEarned}`,
      `Pickups  $${results.cashCollected}   Bank    $${results.careerCash}`,
      ...(results.bestLapMs !== null ? [`Best lap ${formatTime(results.bestLapMs)}`] : []),
      ...(results.loanNote ? ['', results.loanNote] : []),
      ...(results.newRecords?.length ? ['', `NEW RECORD: ${results.newRecords.join(' · ')}`] : []),
      ...(results.seed !== undefined ? [`Race seed ${results.seed}`] : []),
    ]
    text(this, cx, GAME_HEIGHT * 0.65, lapLines.join('\n'), {
      size: 'action',
      color: C.textSecondary,
      lineSpacing: 8,
      align: 'left',
      origin: [0.5, 0.5],
    })

    prompt(this, cx, GAME_HEIGHT * 0.82, 'ENTER: STANDINGS')

    this.add
      .zone(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setInteractive()
      .on('pointerup', () => this.scene.start('Ranking'))

    const kb = this.input.keyboard!
    const next = () => this.scene.start('Ranking')
    kb.on('keydown-ENTER', next)
    this.events.once('shutdown', () => kb.off('keydown-ENTER', next))
  }
}
