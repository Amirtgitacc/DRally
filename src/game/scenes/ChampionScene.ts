import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { BOSS } from '../../data/boss'
import { carById } from '../../data/cars'
import { loadCareer } from '../state/saveGame'
import { loadSettings } from '../state/settings'
import { C } from '../ui/theme'
import { flavor, heading, rule, text } from '../ui/widgets'
import { SAFE, drawPlate, notchedButton } from '../ui/mobile'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage } from '../ui/deferredImage'

/** The career's ending — shown once, after beating the champion 1-v-1. */
export class ChampionScene extends Phaser.Scene {
  constructor() {
    super('Champion')
  }

  create() {
    const career = loadCareer()
    const { reducedFlash } = loadSettings()
    const cx = GAME_WIDTH / 2

    sceneBackground(this, 'bg-champion', { veil: 0.32 })

    // Slow golden ember drift behind everything — a restrained victory ambience,
    // not confetti. Suppressed entirely when the player asked for reduced flash.
    if (!reducedFlash) {
      this.add.particles(0, 0, 'spark', {
        x: { min: 0, max: GAME_WIDTH },
        y: GAME_HEIGHT + 20,
        speedY: { min: -60, max: -20 },
        speedX: { min: -15, max: 15 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 6000,
        frequency: 110,
        tint: [0xc9a227, 0xf2a33c, 0xffe08a],
        blendMode: Phaser.BlendModes.ADD,
      })
    }

    // ── Title ──────────────────────────────────────────────────────────
    heading(this, cx, 130, 'CHAMPION', {
      size: 'display',
      color: C.gold,
      strokeThickness: 12,
      glow: true,
    })

    // ── Personalised victory statement, on its own plate ───────────────
    const stmtW = 780
    const stmtH = 60
    const stmtY = 224
    const stmtG = this.add.graphics({ x: cx, y: stmtY })
    drawPlate(stmtG, stmtW, stmtH, { face: C.buttonFace, border: C.oxideDim, chamfer: 10, rivets: true })
    text(this, cx, stmtY, `${career.profile.driverName} — THE LADDER IS YOURS.`, {
      size: 'body',
      face: 'display',
      weight: 600,
      letterSpacing: 3,
      color: C.textPrimary,
      origin: [0.5, 0.5],
    })

    // ── The winning car, front and centre ──────────────────────────────
    const car = deferredImage(this, cx, 452, `car-hero-${career.carId}`, 620, 320).image
    this.tweens.add({ targets: car, y: '-=12', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inout' })

    // ── Career-stat plates ─────────────────────────────────────────────
    const rowY = 700
    const gap = 16
    const widths = [300, 320, 520, 604]
    const money = (n: number) => `$${n.toLocaleString('en-US')}`
    let px = SAFE.x
    const plates: Array<[string, string, number]> = [
      ['PURSE', money(BOSS.prizeCash), C.money],
      ['BANK', money(career.cash), C.money],
      ['RECORD', `${career.wins} WINS / ${career.racesRun} STARTS`, C.textPrimary],
      ['MACHINE', carById(career.carId).name.toUpperCase(), C.textPrimary],
    ]
    plates.forEach(([label, value, valueColor], i) => {
      const w = widths[i]
      this.statPlate(px + w / 2, rowY, w, label, value, valueColor)
      px += w + gap
    })

    // ── Reflective flavour line, flanked by hairlines ──────────────────
    const flavorY = 826
    flavor(this, cx, flavorY, 'THEY WILL COME FOR YOUR CROWN.')
    rule(this, SAFE.x + 40, cx - 320, flavorY)
    rule(this, cx + 320, SAFE.right - 40, flavorY)

    // ── Single large return action ─────────────────────────────────────
    const goMenu = () => this.scene.start('Menu')
    const btnH = 100
    const btnW = 780
    const btnY = GAME_HEIGHT - SAFE.bottom - btnH / 2
    const btn = notchedButton(this, cx, btnY, {
      w: btnW,
      h: btnH,
      label: 'SINGLE PLAYER',
      variant: 'primary',
      size: 'heading',
      onActivate: goMenu,
    })
    btn.setState({ selected: true, enabled: true })

    // Keyboard: Enter or Esc both return to the Single Player hub.
    const kb = this.input.keyboard!
    kb.on('keydown-ENTER', goMenu)
    kb.on('keydown-ESC', goMenu)
    this.events.once('shutdown', () => {
      kb.off('keydown-ENTER', goMenu)
      kb.off('keydown-ESC', goMenu)
    })
  }

  /** A titled career-stat plate: oxide label over a mono value readout. */
  private statPlate(x: number, y: number, w: number, label: string, value: string, valueColor: number): void {
    const h = 108
    const g = this.add.graphics({ x, y })
    drawPlate(g, w, h, { face: C.buttonFace, border: C.line, chamfer: 12, rivets: true })
    text(this, x, y - 24, label, {
      size: 'caption',
      face: 'display',
      weight: 600,
      letterSpacing: 4,
      color: C.oxide,
      origin: [0.5, 0.5],
    })
    text(this, x, y + 18, value, {
      size: 'action',
      face: 'mono',
      weight: 700,
      color: valueColor,
      origin: [0.5, 0.5],
    })
  }
}
