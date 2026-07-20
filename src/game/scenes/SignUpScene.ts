import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { RACE_REWARDS, type RaceTier } from '../../data/economy'
import { DUEL_TRACK, rollTrack, type TrackDef } from '../../data/tracks'
import { drawTrackMap } from '../ui/trackMap'
import { starsFor } from '../../core/ai/talent'
import { talentOf } from '../../data/drivers'
import { rosterById } from '../../data/roster'
import { pickRivals, playerRank } from '../../core/progression/ladder'
import { duelAvailable } from '../../core/progression/duel'
import { BOSS } from '../../data/boss'
import { loadCareer } from '../state/saveGame'
import { setCurrentOffer } from '../state/roundState'
import { C, STROKE, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { backButton, fitImage, flavor, heading, panel, subheading, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { randomSeed } from '../../core/race/random'

const TIERS: RaceTier[] = ['street', 'pro', 'death']

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

    sceneBackground(this, 'bg-race-ops', { veil: 0.4 })

    // at rank #1 the ladder has nothing left — the champion calls you out
    if (duelAvailable(playerRank(career.ladder, career.points), career.champion)) {
      this.createDuelChallenge()
      return
    }

    // each tier fields its own grid and venue this round
    this.rivalsByTier = {
      street: pickRivals('street', Math.random),
      pro: pickRivals('pro', Math.random),
      death: pickRivals('death', Math.random),
    }
    this.trackByTier = {
      street: rollTrack('street', Math.random),
      pro: rollTrack('pro', Math.random),
      death: rollTrack('death', Math.random),
    }

    const cx = GAME_WIDTH / 2
    heading(this, cx, 80, 'RACE SIGN-UP')
    subheading(this, cx, 140, `Rank #${playerRank(career.ladder, career.points)} · $${career.cash} · pick your fight`)

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

      const card = this.add.rectangle(x, y, cardW, cardH, C.surfaceSunken, 0.92)
      this.cards.push(card)

      heading(this, x, top + 46, TIER_LABEL[tier], {
        size: 'heading',
        color: TIER_COLOR[tier],
        strokeThickness: STROKE.heading,
      })

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

      text(this, x, top + 380, [track.name, `${track.laps} laps`].join('\n'), {
        size: 'action',
        align: 'center',
        lineSpacing: 6,
        origin: [0.5, 0],
      })

      const payouts = [
        `1st  $${rewards[0].cash}  +${rewards[0].points} pts`,
        `2nd  $${rewards[1].cash}  +${rewards[1].points} pts`,
        `3rd  $${rewards[2].cash}  +${rewards[2].points} pts`,
      ].join('\n')
      text(this, x, top + 470, payouts, { size: 'body', align: 'center', lineSpacing: 8, origin: [0.5, 0] })

      // grid, with each rival's permanent talent grade in stars
      const entrantLines = [
        'GRID',
        `1. ${career.profile.driverName}`,
        ...this.rivalsByTier[tier].map((id, n) => `${n + 2}. ${rosterById(id).name.padEnd(14)}${starsFor(talentOf(id).grade)}`),
      ]
      entrantLines.forEach((line, row) => {
        const entrant = text(this, x - 205, top + 606 + row * 36, line, { size: 'body', color: C.textBody })
        if (row > 1) {
          entrant.setAlpha(0)
          this.time.delayedCall(250 + (row - 2) * 280 + i * 90, () => {
            if (entrant.active) this.tweens.add({ targets: entrant, alpha: 1, x: entrant.x + 8, duration: 180 })
          })
        }
      })
    })

    // cards are plain rectangles, not TileHandle — wire pointer events directly,
    // mirroring wireTiles()'s pointerover=focus / pointerup=activate contract
    this.cards.forEach((card, i) => {
      card.setInteractive({ useHandCursor: true })
      card.on('pointerover', () => { this.selected = i; this.refresh() })
      card.on('pointerup', () => { this.selected = i; this.confirm() })
    })
    backButton(this, () => this.scene.start('Garage'))

    flavor(this, cx, GAME_HEIGHT - 60, '←/→ choose · Enter sign up · Esc garage')

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

    heading(this, cx, 110, 'THE FINAL DUEL', {
      size: 'readout',
      color: C.gold,
      strokeThickness: STROKE.hero,
    })
    subheading(this, cx, 180, 'Rank #1 means one thing here: a challenge you do not get to refuse.')

    panel(this, cx, GAME_HEIGHT * 0.55, 720, 540, {
      fillAlpha: 0.92,
      stroke: C.gold,
      strokeAlpha: 1,
      strokeWidth: 5,
    })

    const boss = this.add.image(cx, GAME_HEIGHT * 0.375, 'car-hero-sovereign')
    fitImage(boss, 340, 240)
    this.tweens.add({ targets: boss, y: '-=8', duration: 1200, yoyo: true, repeat: -1, ease: 'sine.inout' })

    const pitch = [
      BOSS.name.toUpperCase(),
      '',
      BOSS.blurb,
      '',
      `${track.name} · ${track.laps} laps · 1-v-1`,
      `Winner takes the crown — and $${BOSS.prizeCash}.`,
      'Lose, and you limp home to try again.',
    ].join('\n')
    text(this, cx, GAME_HEIGHT * 0.63, pitch, {
      size: 'body',
      align: 'center',
      lineSpacing: 8,
      wordWrapWidth: 640,
      origin: [0.5, 0.5],
    })

    flavor(this, cx, GAME_HEIGHT - 60, 'Enter accept the duel · Esc garage')

    const accept = () => {
      setCurrentOffer({ track, rivalIds: [], duel: true, seed: randomSeed() })
      this.scene.start('PrepareRace')
    }
    const back = () => this.scene.start('Garage')

    // full-screen tap accepts the duel; backButton is added after so it renders
    // on top and takes priority in its own area (mirrors PrepareRaceScene)
    this.add.zone(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT).setInteractive().on('pointerup', accept)
    backButton(this, back)

    const kb = this.input.keyboard!
    kb.on('keydown-ENTER', accept)
    kb.on('keydown-ESC', back)
    this.events.on('shutdown', () => {
      kb.off('keydown-ENTER', accept)
      kb.off('keydown-ESC', back)
    })
  }

  private move(dir: number) {
    this.selected = (this.selected + dir + TIERS.length) % TIERS.length
    this.refresh()
  }

  private refresh() {
    this.cards.forEach((card, i) => {
      const tier = TIERS[i]
      card.setStrokeStyle(i === this.selected ? 5 : 2, i === this.selected ? TIER_COLOR[tier] : C.border, 1)
    })
  }

  private confirm() {
    const tier = TIERS[this.selected]
    setCurrentOffer({ track: this.trackByTier[tier], rivalIds: this.rivalsByTier[tier], seed: randomSeed() })
    this.scene.start('PrepareRace')
  }
}
