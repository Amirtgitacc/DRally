import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { RACE_REWARDS, type RaceTier } from '../../data/economy'
import { TRACKS_BY_TIER } from '../../data/tracks'
import { rosterById } from '../../data/roster'
import { pickRivals, playerRank } from '../../core/progression/ladder'
import { loadCareer } from '../state/saveGame'
import { setCurrentOffer } from '../state/roundState'

const TIERS: RaceTier[] = ['street', 'pro', 'death']
const TIER_LABEL: Record<RaceTier, string> = { street: 'STREET', pro: 'PRO', death: 'DEATH' }
const TIER_COLOR: Record<RaceTier, number> = { street: 0x3fd07f, pro: 0x4f8fd0, death: 0xd23c2f }

export class SignUpScene extends Phaser.Scene {
  private selected = 1 // default to the middle (pro) card
  private rivalsByTier!: Record<RaceTier, string[]>
  private cards: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('SignUp')
  }

  create() {
    const career = loadCareer()
    this.cards = []
    this.selected = 1

    // each tier fields its own grid this round
    this.rivalsByTier = {
      street: pickRivals(career.ladder, career.points, Math.random),
      pro: pickRivals(career.ladder, career.points, Math.random),
      death: pickRivals(career.ladder, career.points, Math.random),
    }

    const cx = GAME_WIDTH / 2
    this.add
      .text(cx, 80, 'RACE SIGN-UP', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
    this.add
      .text(cx, 140, `Rank #${playerRank(career.ladder, career.points)} · $${career.cash} · pick your fight`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)

    const cardW = 480
    const cardH = 560
    TIERS.forEach((tier, i) => {
      const x = cx + (i - 1) * (cardW + 40)
      const y = GAME_HEIGHT * 0.55
      const track = TRACKS_BY_TIER[tier]
      const rewards = RACE_REWARDS[tier]

      const card = this.add.rectangle(x, y, cardW, cardH, 0x0c0c14, 0.92)
      this.cards.push(card)

      this.add
        .text(x, y - cardH / 2 + 50, TIER_LABEL[tier], {
          fontFamily: 'monospace',
          fontSize: '40px',
          color: `#${TIER_COLOR[tier].toString(16).padStart(6, '0')}`,
          stroke: '#000000',
          strokeThickness: 6,
        })
        .setOrigin(0.5)

      const entrants = this.rivalsByTier[tier].map((id, n) => `  ${n + 2}. ${rosterById(id).name}`)
      this.add
        .text(
          x,
          y + 30,
          [
            track.name,
            `${track.laps} laps`,
            '',
            `1st  $${rewards[0].cash}  +${rewards[0].points} pts`,
            `2nd  $${rewards[1].cash}  +${rewards[1].points} pts`,
            `3rd  $${rewards[2].cash}  +${rewards[2].points} pts`,
            '',
            'GRID:',
            '  1. YOU',
            ...entrants,
          ].join('\n'),
          {
            fontFamily: 'monospace',
            fontSize: '22px',
            color: '#e8e8f0',
            align: 'center',
            lineSpacing: 8,
          },
        )
        .setOrigin(0.5)
    })

    this.add
      .text(cx, GAME_HEIGHT - 60, '←/→ choose · Enter sign up · Esc garage', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#70707e',
      })
      .setOrigin(0.5)

    const kb = this.input.keyboard!
    kb.on('keydown-LEFT', () => this.move(-1))
    kb.on('keydown-RIGHT', () => this.move(1))
    kb.on('keydown-ENTER', () => this.confirm())
    kb.on('keydown-ESC', () => this.scene.start('Garage'))
    this.events.on('shutdown', () => {
      kb.off('keydown-LEFT')
      kb.off('keydown-RIGHT')
      kb.off('keydown-ENTER')
      kb.off('keydown-ESC')
    })

    this.refresh()
  }

  private move(dir: number) {
    this.selected = (this.selected + dir + TIERS.length) % TIERS.length
    this.refresh()
  }

  private refresh() {
    this.cards.forEach((card, i) => {
      const tier = TIERS[i]
      card.setStrokeStyle(i === this.selected ? 5 : 2, i === this.selected ? TIER_COLOR[tier] : 0x3a3a46, 1)
    })
  }

  private confirm() {
    const tier = TIERS[this.selected]
    setCurrentOffer({ track: TRACKS_BY_TIER[tier], rivalIds: this.rivalsByTier[tier] })
    this.scene.start('Race')
  }
}
