import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { playerRank, standings } from '../../core/progression/ladder'
import { starsFor } from '../../core/ai/talent'
import { talentOf } from '../../data/drivers'
import { loadCareer } from '../state/saveGame'

export class RankingScene extends Phaser.Scene {
  constructor() {
    super('Ranking')
  }

  create() {
    const career = loadCareer()
    const rows = standings(career.ladder, career.points)
    const rank = playerRank(career.ladder, career.points)
    const cx = GAME_WIDTH / 2

    this.add.rectangle(cx, GAME_HEIGHT * 0.55, 1100, 760, 0x0c0c14, 0.92).setStrokeStyle(3, 0xf2a33c, 0.8)

    this.add
      .text(cx, GAME_HEIGHT * 0.12, 'CHAMPIONSHIP LADDER', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
    const subtitle = career.champion
      ? 'CHAMPION. The ladder climbs toward you now.'
      : rank === 1
        ? 'Rank #1. The champion is waiting — sign up when you dare.'
        : `You are rank #${rank} of 20 — reach #1.`
    this.add
      .text(cx, GAME_HEIGHT * 0.175, subtitle, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)
    this.add
      .text(cx, GAME_HEIGHT * 0.235, 'Stars are permanent talent. Rank only decides the machinery they drive.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#70707e',
      })
      .setOrigin(0.5)

    // two columns of 10, each rival tagged with their permanent talent grade
    for (let col = 0; col < 2; col++) {
      const lines = rows.slice(col * 10, col * 10 + 10)
      lines.forEach((row, i) => {
        const rankNum = col * 10 + i + 1
        const y = GAME_HEIGHT * 0.31 + i * 48
        const x = cx - 500 + col * 560
        const text = this.add.text(
          x,
          y,
          `${String(rankNum).padStart(2, ' ')}. ${row.name.padEnd(15)}${String(row.points).padStart(4, ' ')} pts`,
          {
            fontFamily: 'monospace',
            fontSize: '25px',
            color: row.isPlayer ? '#f2a33c' : '#e8e8f0',
            stroke: row.isPlayer ? '#000000' : undefined,
            strokeThickness: row.isPlayer ? 4 : 0,
          },
        )
        if (row.isPlayer) {
          this.tweens.add({ targets: text, alpha: 0.55, duration: 600, yoyo: true, repeat: -1 })
        } else {
          this.add.text(x + 430, y, starsFor(talentOf(row.id).grade), {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: '#c9a227',
          })
        }
      })
    }

    const prompt = this.add
      .text(cx, GAME_HEIGHT - 60, 'ENTER: GARAGE', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#e8e8f0',
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Garage'))
  }
}
