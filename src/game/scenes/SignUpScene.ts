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
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage } from '../ui/deferredImage'
import { randomSeed } from '../../core/race/random'
import { backPlate, card, drawPlate, notchedButton, screenTitle, stars, SAFE } from '../ui/mobile'

const TIERS: RaceTier[] = ['street', 'pro', 'death']
const CARD_W = 520
const CARD_H = 700

export class SignUpScene extends Phaser.Scene {
  private selected = 1 // default to the middle (pro) card
  private rivalsByTier!: Record<RaceTier, string[]>
  private trackByTier!: Record<RaceTier, TrackDef>
  private cardPlates: Array<{ gfx: Phaser.GameObjects.Graphics; x: number; y: number }> = []

  constructor() {
    super('SignUp')
  }

  create() {
    const career = loadCareer()
    this.cardPlates = []
    this.selected = 1

    sceneBackground(this, 'bg-race-ops', { veil: 0.42 })

    // at rank #1 the ladder has nothing left — the champion calls you out
    if (duelAvailable(playerRank(career.ladder, career.points), career.champion)) {
      this.createDuelChallenge()
      return
    }

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
    screenTitle(this, 'RACE SIGN-UP', { x: SAFE.left, y: 92 })
    card(this, SAFE.right - 220, 92, 400, 60, undefined, { accent: C.oxideDim })
    text(this, SAFE.right - 220, 92, `RANK #${playerRank(career.ladder, career.points)}  ·  $${career.cash.toLocaleString('en-US')}`, {
      size: 'body', face: 'mono', weight: 700, color: C.money, origin: [0.5, 0.5],
    })

    const mapGfx = this.add.graphics().setDepth(1)
    TIERS.forEach((tier, i) => {
      const x = cx + (i - 1) * (CARD_W + 34)
      const y = 190 + CARD_H / 2
      this.buildTierCard(i, tier, x, y, career.profile.driverName, mapGfx)
    })

    const signUp = notchedButton(this, cx + 100, 962, {
      w: 1080, h: 100, label: 'SIGN UP', size: 'title', variant: 'primary', align: 'center', onActivate: () => this.confirm(),
    })
    signUp.setState({ selected: true, enabled: true })
    backPlate(this, 'GARAGE', () => this.scene.start('Garage'), { x: SAFE.left + 160, y: 962, w: 320 })

    const kb = this.input.keyboard!
    const left = () => this.move(-1)
    const right = () => this.move(1)
    const enter = () => this.confirm()
    const esc = () => this.scene.start('Garage')
    kb.on('keydown-LEFT', left); kb.on('keydown-RIGHT', right)
    kb.on('keydown-ENTER', enter); kb.on('keydown-ESC', esc)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right)
      kb.off('keydown-ENTER', enter); kb.off('keydown-ESC', esc)
    })

    this.refresh()
  }

  private buildTierCard(i: number, tier: RaceTier, x: number, y: number, driverName: string, mapGfx: Phaser.GameObjects.Graphics) {
    const tierColor = TIER_COLOR[tier]
    const top = y - CARD_H / 2
    const track = this.trackByTier[tier]
    const rewards = RACE_REWARDS[tier]

    const gfx = this.add.graphics()
    this.cardPlates.push({ gfx, x, y })

    // tier header
    text(this, x - CARD_W / 2 + 28, top + 40, `${TIER_LABEL[tier]} TIER`, {
      size: 'subtitle', face: 'display', weight: 700, letterSpacing: 3, color: tierColor, origin: [0, 0.5],
    })

    // track map
    drawTrackMap(mapGfx, track, { cx: x, cy: top + 200, width: 420, height: 230, color: tierColor, lineWidth: 5, showSurface: true })

    text(this, x, top + 350, `${track.name.toUpperCase()}  ·  ${track.laps} LAPS`, {
      size: 'body', face: 'display', weight: 600, letterSpacing: 1, color: C.textPrimary, origin: [0.5, 0.5],
    })

    // prizes
    text(this, x - CARD_W / 2 + 28, top + 396, 'PRIZES', { size: 'caption', face: 'display', weight: 600, letterSpacing: 3, color: tierColor, origin: [0, 0.5] })
    const ord = ['1ST', '2ND', '3RD']
    rewards.slice(0, 3).forEach((r, n) => {
      const ry = top + 434 + n * 34
      text(this, x - CARD_W / 2 + 28, ry, ord[n], { size: 'bodySm', face: 'mono', color: C.textSecondary, origin: [0, 0.5] })
      text(this, x - CARD_W / 2 + 110, ry, `$${r.cash}`, { size: 'bodySm', face: 'mono', weight: 700, color: C.money, origin: [0, 0.5] })
      text(this, x + CARD_W / 2 - 28, ry, `+${r.points} PTS`, { size: 'bodySm', face: 'mono', color: tierColor, origin: [1, 0.5] })
    })

    // entrants (player + rivals with talent stars)
    text(this, x - CARD_W / 2 + 28, top + 556, 'ENTRANTS', { size: 'caption', face: 'display', weight: 600, letterSpacing: 3, color: tierColor, origin: [0, 0.5] })
    const entrants: Array<{ n: number; name: string; starsStr: string | null }> = [
      { n: 1, name: driverName, starsStr: null },
      ...this.rivalsByTier[tier].map((id, k) => ({ n: k + 2, name: rosterById(id).name, starsStr: starsFor(talentOf(id).grade) })),
    ]
    entrants.slice(0, 4).forEach((e, row) => {
      const ry = top + 594 + row * 32
      text(this, x - CARD_W / 2 + 28, ry, `${e.n}. ${e.name}`, { size: 'bodySm', face: 'mono', color: e.starsStr === null ? C.oxide : C.textBody, origin: [0, 0.5] })
      if (e.starsStr !== null) {
        const filled = (e.starsStr.match(/★/g) || []).length
        stars(this, x + CARD_W / 2 - 28, ry, filled, 4, { color: tierColor, size: 'bodySm', origin: [1, 0.5] })
      }
    })

    // interactive hit region → focus/select this tier
    const hit = this.add.rectangle(x, y, CARD_W, CARD_H, 0, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => { this.selected = i; this.refresh() })
    hit.on('pointerup', () => { this.selected = i; this.confirm() })
  }

  private createDuelChallenge() {
    const cx = GAME_WIDTH / 2
    const track = DUEL_TRACK

    screenTitle(this, 'THE FINAL DUEL', { x: cx, y: 120, origin: [0.5, 0.5], color: C.gold, slug: false })
    text(this, cx, 190, 'RANK #1 MEANS ONE THING HERE: A CHALLENGE YOU DO NOT GET TO REFUSE.', {
      size: 'body', face: 'display', weight: 500, letterSpacing: 2, color: C.textSecondary, origin: [0.5, 0.5],
    })

    card(this, cx, GAME_HEIGHT * 0.55, 820, 560, undefined, { accent: C.gold })
    const boss = deferredImage(this, cx, GAME_HEIGHT * 0.4, 'car-hero-sovereign', 380, 260).image
    this.tweens.add({ targets: boss, y: '-=8', duration: 1200, yoyo: true, repeat: -1, ease: 'sine.inout' })

    text(this, cx, GAME_HEIGHT * 0.6, [
      BOSS.name.toUpperCase(),
      '',
      `${track.name} · ${track.laps} LAPS · 1-V-1`,
      `Winner takes the crown — and $${BOSS.prizeCash.toLocaleString('en-US')}.`,
      'Lose, and you limp home to try again.',
    ].join('\n'), { size: 'body', face: 'mono', align: 'center', lineSpacing: 10, wordWrapWidth: 720, color: C.textBody, origin: [0.5, 0.5] })

    const accept = () => {
      setCurrentOffer({ track, rivalIds: [], duel: true, seed: randomSeed() })
      this.scene.start('PrepareRace')
    }
    const back = () => this.scene.start('Garage')

    const acceptBtn = notchedButton(this, cx + 100, 962, {
      w: 1080, h: 100, label: 'ACCEPT DUEL', size: 'title', variant: 'primary', align: 'center', onActivate: accept,
    })
    acceptBtn.setState({ selected: true, enabled: true })
    backPlate(this, 'GARAGE', back, { x: SAFE.left + 160, y: 962, w: 320 })

    const kb = this.input.keyboard!
    kb.on('keydown-ENTER', accept); kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => { kb.off('keydown-ENTER', accept); kb.off('keydown-ESC', back) })
  }

  private move(dir: number) {
    this.selected = (this.selected + dir + TIERS.length) % TIERS.length
    this.refresh()
  }

  private refresh() {
    this.cardPlates.forEach((c, i) => {
      const selected = i === this.selected
      const tierColor = TIER_COLOR[TIERS[i]]
      drawPlate(c.gfx, CARD_W, CARD_H, {
        face: selected ? C.surfacePlate : C.surfaceSunken,
        faceAlpha: selected ? 0.96 : 0.82,
        border: selected ? tierColor : C.line,
        borderWidth: selected ? 4 : 2,
        chamfer: 16,
        rivets: true,
        glow: selected ? 2 : 0,
        glowColor: tierColor,
      })
      c.gfx.setPosition(c.x, c.y)
    })
  }

  private confirm() {
    const tier = TIERS[this.selected]
    setCurrentOffer({ track: this.trackByTier[tier], rivalIds: this.rivalsByTier[tier], seed: randomSeed() })
    this.scene.start('PrepareRace')
  }
}
