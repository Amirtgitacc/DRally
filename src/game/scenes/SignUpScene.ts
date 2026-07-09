import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { RACE_REWARDS, type RaceTier } from '../../data/economy'
import { DUEL_TRACK, rollTrack } from '../../data/tracks'
import type { TrackDef } from '../../data/tracks/testCircuit'
import { drawTrackMap } from '../ui/trackMap'
import { starsFor } from '../../core/ai/talent'
import { talentOf } from '../../data/drivers'
import { rosterById } from '../../data/roster'
import { pickRivals, playerRank } from '../../core/progression/ladder'
import { duelAvailable } from '../../core/progression/duel'
import { BOSS } from '../../data/boss'
import { loadCareer } from '../state/saveGame'
import { setCurrentOffer } from '../state/roundState'

const TIERS: RaceTier[] = ['street', 'pro', 'death']
const TIER_LABEL: Record<RaceTier, string> = { street: 'STREET', pro: 'PRO', death: 'DEATH' }
const TIER_COLOR: Record<RaceTier, number> = { street: 0x3fd07f, pro: 0x4f8fd0, death: 0xd23c2f }

export class SignUpScene extends Phaser.Scene {
  private selected = 1 // default to the middle (pro) card
  private rivalsByTier!: Record<RaceTier, string[]>
  private trackByTier!: Record<RaceTier, TrackDef>
  private cards: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('SignUp')
  }

  create() {
    const career = loadCareer()
    this.cards = []
    this.selected = 1

    // at rank #1 the ladder has nothing left — the champion calls you out
    if (duelAvailable(playerRank(career.ladder, career.points), career.champion)) {
      this.createDuelChallenge()
      return
    }

    // each tier fields its own grid and venue this round
    this.rivalsByTier = {
      street: pickRivals(career.ladder, career.points, Math.random),
      pro: pickRivals(career.ladder, career.points, Math.random),
      death: pickRivals(career.ladder, career.points, Math.random),
    }
    this.trackByTier = {
      street: rollTrack('street', Math.random),
      pro: rollTrack('pro', Math.random),
      death: rollTrack('death', Math.random),
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

    const cardW = 520
    const cardH = 800
    // above the card plates, which are created after it inside the loop
    const mapGfx = this.add.graphics().setDepth(1)
    TIERS.forEach((tier, i) => {
      const x = cx + (i - 1) * (cardW + 40)
      const y = GAME_HEIGHT * 0.56
      const top = y - cardH / 2
      const track = this.trackByTier[tier]
      const rewards = RACE_REWARDS[tier]

      const card = this.add.rectangle(x, y, cardW, cardH, 0x0c0c14, 0.92)
      this.cards.push(card)

      this.add
        .text(x, top + 46, TIER_LABEL[tier], {
          fontFamily: 'monospace',
          fontSize: '40px',
          color: `#${TIER_COLOR[tier].toString(16).padStart(6, '0')}`,
          stroke: '#000000',
          strokeThickness: 6,
        })
        .setOrigin(0.5)

      // the layout is the decision — draw it big enough to actually read
      drawTrackMap(mapGfx, track, {
        cx: x,
        cy: top + 220,
        width: 420,
        height: 250,
        color: TIER_COLOR[tier],
        lineWidth: 5,
        showSurface: true,
      })

      this.add
        .text(x, top + 380, [track.name, `${track.laps} laps`].join('\n'), {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#e8e8f0',
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5, 0)

      this.add
        .text(
          x,
          top + 470,
          [
            `1st  $${rewards[0].cash}  +${rewards[0].points} pts`,
            `2nd  $${rewards[1].cash}  +${rewards[1].points} pts`,
            `3rd  $${rewards[2].cash}  +${rewards[2].points} pts`,
          ].join('\n'),
          { fontFamily: 'monospace', fontSize: '22px', color: '#e8e8f0', align: 'center', lineSpacing: 8 },
        )
        .setOrigin(0.5, 0)

      // grid, with each rival's permanent talent grade in stars
      const entrants = this.rivalsByTier[tier].map(
        (id, n) => `${n + 2}. ${rosterById(id).name.padEnd(14)}${starsFor(talentOf(id).grade)}`,
      )
      this.add
        .text(x, top + 606, ['GRID', '1. YOU', ...entrants].join('\n'), {
          fontFamily: 'monospace',
          fontSize: '21px',
          color: '#c8c8d4',
          align: 'left',
          lineSpacing: 8,
        })
        .setOrigin(0.5, 0)
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

  /** Replaces the three-tier offer: a single mandatory 1-v-1 for the crown. */
  private createDuelChallenge() {
    const cx = GAME_WIDTH / 2
    const track = DUEL_TRACK

    this.add
      .text(cx, 110, 'THE FINAL DUEL', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#c9a227',
        stroke: '#000000',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
    this.add
      .text(cx, 180, 'Rank #1 means one thing here: a challenge you do not get to refuse.', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)

    this.add
      .rectangle(cx, GAME_HEIGHT * 0.55, 720, 540, 0x0c0c14, 0.92)
      .setStrokeStyle(5, 0xc9a227, 1)

    const boss = this.add.image(cx, GAME_HEIGHT * 0.375, `car-${BOSS.id}`).setScale(1.7).setAngle(-90)
    this.tweens.add({ targets: boss, y: '-=8', duration: 1200, yoyo: true, repeat: -1, ease: 'sine.inout' })

    this.add
      .text(
        cx,
        GAME_HEIGHT * 0.63,
        [
          BOSS.name.toUpperCase(),
          '',
          BOSS.blurb,
          '',
          `${track.name} · ${track.laps} laps · 1-v-1`,
          `Winner takes the crown — and $${BOSS.prizeCash}.`,
          'Lose, and you limp home to try again.',
        ].join('\n'),
        {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#e8e8f0',
          align: 'center',
          lineSpacing: 8,
          wordWrap: { width: 640 },
        },
      )
      .setOrigin(0.5)

    this.add
      .text(cx, GAME_HEIGHT - 60, 'Enter accept the duel · Esc garage', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#70707e',
      })
      .setOrigin(0.5)

    const kb = this.input.keyboard!
    kb.on('keydown-ENTER', () => {
      setCurrentOffer({ track, rivalIds: [], duel: true })
      this.scene.start('Race')
    })
    kb.on('keydown-ESC', () => this.scene.start('Garage'))
    this.events.on('shutdown', () => {
      kb.off('keydown-ENTER')
      kb.off('keydown-ESC')
    })
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
    setCurrentOffer({ track: this.trackByTier[tier], rivalIds: this.rivalsByTier[tier] })
    this.scene.start('Race')
  }
}
