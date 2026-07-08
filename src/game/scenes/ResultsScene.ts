import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { formatTime } from '../../core/race/format'
import { ordinal } from '../../core/race/placement'

export interface StandingEntry {
  name: string
  isPlayer: boolean
  /** finish time, or null if still on track when the race ended */
  timeMs: number | null
  wrecked: boolean
}

export interface RaceResults {
  trackName: string
  laps: number
  totalMs: number
  bestLapMs: number | null
  lapTimes: number[]
  standings: StandingEntry[]
  playerPosition: number
  playerWrecked: boolean
  cashCollected: number
  prizeCash: number
  pointsEarned: number
  careerCash: number
}

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results')
  }

  create(results: RaceResults) {
    const cx = GAME_WIDTH / 2

    this.add.rectangle(cx, GAME_HEIGHT * 0.55, 860, 620, 0x0c0c14, 0.92).setStrokeStyle(3, 0xf2a33c, 0.8)

    const title = results.playerWrecked
      ? 'WRECKED — OUT OF THE RACE'
      : `YOU FINISHED ${ordinal(results.playerPosition).toUpperCase()}`
    this.add
      .text(cx, GAME_HEIGHT * 0.16, title, {
        fontFamily: 'monospace',
        fontSize: '54px',
        color: results.playerWrecked ? '#d23c2f' : '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)

    this.add
      .text(cx, GAME_HEIGHT * 0.24, `${results.trackName} — ${results.laps} laps`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)

    const standingLines = results.standings.map((s, i) => {
      const time = s.wrecked ? 'WRECKED' : s.timeMs !== null ? formatTime(s.timeMs) : '   —   '
      const name = (s.isPlayer ? 'YOU' : s.name).padEnd(12)
      return `${i + 1}.  ${name} ${time}`
    })
    this.add
      .text(cx, GAME_HEIGHT * 0.42, standingLines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#e8e8f0',
        lineSpacing: 12,
        align: 'left',
      })
      .setOrigin(0.5)

    const lapLines = [
      `Prize    $${results.prizeCash}   Points  +${results.pointsEarned}`,
      `Pickups  $${results.cashCollected}   Bank    $${results.careerCash}`,
      ...(results.bestLapMs !== null ? [`Best lap ${formatTime(results.bestLapMs)}`] : []),
    ]
    this.add
      .text(cx, GAME_HEIGHT * 0.65, lapLines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#9aa0ac',
        lineSpacing: 8,
        align: 'left',
      })
      .setOrigin(0.5)

    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.82, 'ENTER: STANDINGS', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#e8e8f0',
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Ranking'))
  }
}
