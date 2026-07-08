import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { playerRank, standings } from '../../core/progression/ladder'
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
    this.add
      .text(cx, GAME_HEIGHT * 0.19, rank === 1 ? 'TOP OF THE PILE.' : `You are rank #${rank} of 20 — reach #1.`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)

    // two columns of 10
    for (let col = 0; col < 2; col++) {
      const lines = rows.slice(col * 10, col * 10 + 10)
      lines.forEach((row, i) => {
        const rankNum = col * 10 + i + 1
        const text = this.add.text(
          cx - 480 + col * 560,
          GAME_HEIGHT * 0.28 + i * 52,
          `${String(rankNum).padStart(2, ' ')}. ${row.name.padEnd(16)} ${String(row.points).padStart(4, ' ')} pts`,
          {
            fontFamily: 'monospace',
            fontSize: '26px',
            color: row.isPlayer ? '#f2a33c' : '#e8e8f0',
            stroke: row.isPlayer ? '#000000' : undefined,
            strokeThickness: row.isPlayer ? 4 : 0,
          },
        )
        if (row.isPlayer) {
          this.tweens.add({ targets: text, alpha: 0.55, duration: 600, yoyo: true, repeat: -1 })
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
