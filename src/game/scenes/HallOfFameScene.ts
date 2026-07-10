import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { formatTime } from '../../core/race/format'
import { ordinal } from '../../core/race/placement'
import { ALL_TRACKS } from '../../data/tracks'
import { loadCareer } from '../state/saveGame'
import { C, TIER_COLOR } from '../ui/theme'
import { flavor, heading, panel, text } from '../ui/widgets'

export class HallOfFameScene extends Phaser.Scene {
  constructor() { super('HallOfFame') }
  create() {
    const career = loadCareer()
    heading(this, GAME_WIDTH / 2, 70, 'HALL OF FAME')
    text(this, GAME_WIDTH / 2, 130, `${career.profile.driverName} · ${career.wins} career wins · ${career.racesRun} starts`, { size: 'body', color: C.textSecondary, origin: [0.5, 0.5] })
    ALL_TRACKS.forEach((track, i) => {
      const col = i % 2; const row = Math.floor(i / 2); const x = 520 + col * 880; const y = 300 + row * 240
      panel(this, x, y, 780, 190, { stroke: TIER_COLOR[track.tier], strokeAlpha: 0.8 })
      const record = career.records[track.id]
      text(this, x - 340, y - 70, track.name.toUpperCase(), { size: 'subtitle', color: TIER_COLOR[track.tier] })
      text(this, x - 340, y - 20, record ? [`Best lap    ${record.bestLapMs ? formatTime(record.bestLapMs) : '—'}`, `Best race   ${record.bestRaceMs ? formatTime(record.bestRaceMs) : '—'}`, `Best finish ${record.bestFinish ? ordinal(record.bestFinish) : '—'}     Wins ${record.wins}`].join('\n') : 'No recorded finish.', { size: 'body', color: C.textBody, lineSpacing: 8 })
    })
    flavor(this, GAME_WIDTH / 2, GAME_HEIGHT - 48, 'Esc / Enter: menu')
    const kb = this.input.keyboard!
    const back = () => this.scene.start('Menu')
    kb.on('keydown-ESC', back); kb.on('keydown-ENTER', back)
    this.events.once('shutdown', () => { kb.off('keydown-ESC', back); kb.off('keydown-ENTER', back) })
  }
}
