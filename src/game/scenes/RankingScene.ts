import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { playerRank, standings } from '../../core/progression/ladder'
import { starsFor } from '../../core/ai/talent'
import { talentOf } from '../../data/drivers'
import { loadCareer } from '../state/saveGame'
import { C, STROKE } from '../ui/theme'
import { backButton, flavor, heading, modal, prompt, subheading, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'

export class RankingScene extends Phaser.Scene {
  constructor() {
    super('Ranking')
  }

  create() {
    const career = loadCareer()
    const rows = standings(career.ladder, career.points)
    const rank = playerRank(career.ladder, career.points)
    const cx = GAME_WIDTH / 2

    sceneBackground(this, 'bg-records', { veil: 0.4 })
    modal(this, cx, GAME_HEIGHT * 0.55, 1100, 760)

    heading(this, cx, GAME_HEIGHT * 0.12, 'CHAMPIONSHIP LADDER')
    const subtitle = career.champion
      ? 'CHAMPION. The ladder climbs toward you now.'
      : rank === 1
        ? 'Rank #1. The champion is waiting — sign up when you dare.'
        : `You are rank #${rank} of 20 — reach #1.`
    subheading(this, cx, GAME_HEIGHT * 0.175, subtitle)
    flavor(this, cx, GAME_HEIGHT * 0.235, 'Stars are permanent talent. Rank only decides the machinery they drive.')

    // two columns of 10, each rival tagged with their permanent talent grade
    for (let col = 0; col < 2; col++) {
      const lines = rows.slice(col * 10, col * 10 + 10)
      lines.forEach((row, i) => {
        const rankNum = col * 10 + i + 1
        const y = GAME_HEIGHT * 0.31 + i * 48
        const x = cx - 500 + col * 560
        const name = row.isPlayer ? career.profile.driverName : row.name
        const label = `${String(rankNum).padStart(2, ' ')}. ${name.padEnd(15)}${String(row.points).padStart(4, ' ')} pts`
        const rowText = text(this, x, y, label, {
          size: 'action',
          color: row.isPlayer ? C.oxide : C.textPrimary,
          ...(row.isPlayer ? { stroke: C.shadow, strokeThickness: STROKE.text } : {}),
        })
        if (row.isPlayer) {
          this.tweens.add({ targets: rowText, alpha: 0.55, duration: 600, yoyo: true, repeat: -1 })
        } else {
          text(this, x + 430, y, starsFor(talentOf(row.id).grade), { size: 'bodySm', color: C.gold })
        }
      })
    }

    prompt(this, cx, GAME_HEIGHT - 60, 'ENTER: GARAGE')

    backButton(this, () => this.scene.start('Garage'))

    const kb = this.input.keyboard!
    const back = () => this.scene.start('Garage')
    kb.on('keydown-ENTER', back)
    this.events.once('shutdown', () => kb.off('keydown-ENTER', back))
  }
}
