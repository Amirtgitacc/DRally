import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG, carById, type CarSpec } from '../../data/cars'
import type { UpgradeKind } from '../../data/economy'
import { buyCar, carNetPrice, tradeInValue } from '../../core/economy/garage'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import { backButton, fitImage, heading, hintBar, metalGrain, subheading, text } from '../ui/widgets'

const MPH_PER_PX = 0.14

/** The four numbers a buyer actually compares, and where they live on CarSpec. */
const STATS: Array<{ label: string; key: keyof CarSpec & ('topSpeed' | 'accel' | 'grip' | 'mass') }> = [
  { label: 'TOP SPEED', key: 'topSpeed' },
  { label: 'ACCEL', key: 'accel' },
  { label: 'GRIP', key: 'grip' },
  { label: 'MASS', key: 'mass' },
]

const BAR_X = 220
const BAR_W = 520
const BAR_H = 20

/**
 * The dealer: browse all six chassis, see exactly how each compares to the car
 * in your driveway, and what the trade-in leaves you owing. Cars you cannot
 * afford stay browsable — window shopping is half the motivation.
 */
export class CarDealerScene extends Phaser.Scene {
  private career!: CareerState
  private idx = 0

  private carImage!: Phaser.GameObjects.Image
  private nameText!: Phaser.GameObjects.Text
  private blurbText!: Phaser.GameObjects.Text
  private priceText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private capsText!: Phaser.GameObjects.Text
  private barsGfx!: Phaser.GameObjects.Graphics
  private statValueTexts: Phaser.GameObjects.Text[] = []
  private arrows: Phaser.GameObjects.Text[] = []

  constructor() {
    super('CarDealer')
  }

  create() {
    this.career = loadCareer()
    this.idx = CAR_CATALOG.findIndex((c) => c.id === this.career.carId)
    this.statValueTexts = []
    this.arrows = []

    const cx = GAME_WIDTH / 2

    metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)

    heading(this, cx, 70, 'CAR DEALER')
    subheading(this, cx, 132, 'Every chassis on the ladder. The marker on each bar is the car you own.')

    // hero sprite, flanked by the browse arrows
    this.carImage = this.add.image(cx, 300, `car-hero-${CAR_CATALOG[this.idx].id}`)
    fitImage(this.carImage, 620, 320)
    this.tweens.add({ targets: this.carImage, y: '-=8', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inout' })

    this.arrows = [-1, 1].map((dir) => {
      // arrows stay mono: Oswald has no ◄ / ► glyph
      const arrow = text(this, cx + dir * 420, 300, dir < 0 ? '◄' : '►', {
        size: 'title',
        color: C.oxide,
        origin: [0.5, 0.5],
      }).setInteractive({ useHandCursor: true })
      arrow.on('pointerdown', () => this.browse(dir))
      this.tweens.add({ targets: arrow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 })
      return arrow
    })

    this.nameText = text(this, cx, 462, '', { size: 'heading', origin: [0.5, 0.5] })
    this.priceText = text(this, cx, 524, '', {
      size: 'action',
      color: C.money,
      align: 'center',
      lineSpacing: 6,
      origin: [0.5, 0.5],
    })

    // stat bars
    this.barsGfx = this.add.graphics()
    STATS.forEach((stat, row) => {
      const y = this.barY(row)
      text(this, BAR_X - 190, y - 4, stat.label, { size: 'bodySm', color: C.textSecondary })
      this.statValueTexts.push(text(this, BAR_X + BAR_W + 24, y - 4, '', { size: 'bodySm' }))
    })

    this.capsText = text(this, GAME_WIDTH - 640, this.barY(0) - 4, '', {
      size: 'bodySm',
      color: C.textSecondary,
      lineSpacing: 8,
    })

    this.blurbText = text(this, cx, GAME_HEIGHT - 210, '', {
      size: 'body',
      color: C.textBody,
      align: 'center',
      wordWrapWidth: 1100,
      lineSpacing: 6,
      origin: [0.5, 0],
    })

    this.hintText = text(this, cx, GAME_HEIGHT - 70, '', { size: 'body', origin: [0.5, 0.5] })
    // the browse arrows already take pointerdown; the buy prompt itself is the tap target for Enter's action
    this.hintText.setInteractive({ useHandCursor: true }).on('pointerup', () => this.buy())

    hintBar(this, '←/→ browse · Enter buy · Esc garage')
    backButton(this, () => this.scene.start('Garage'))

    const kb = this.input.keyboard!
    kb.on('keydown-LEFT', () => this.browse(-1))
    kb.on('keydown-RIGHT', () => this.browse(1))
    kb.on('keydown-ENTER', () => this.buy())
    kb.on('keydown-ESC', () => this.scene.start('Garage'))
    this.events.on('shutdown', () => {
      kb.off('keydown-LEFT')
      kb.off('keydown-RIGHT')
      kb.off('keydown-ENTER')
      kb.off('keydown-ESC')
    })

    this.refresh()
  }

  private barY(row: number): number {
    return 616 + row * 48
  }

  private browse(dir: number) {
    this.idx = (this.idx + dir + CAR_CATALOG.length) % CAR_CATALOG.length
    this.refresh()
  }

  private buy() {
    const target = CAR_CATALOG[this.idx]
    const next = buyCar(this.career, target.id)
    if (!next) return
    this.career = next
    saveCareer(this.career)
    this.cameras.main.flash(220, 40, 60, 40)
    this.refresh()
  }

  /**
   * Catalog stats sit in a narrow band, so stretch min..max across the bar
   * (with a floor, so the cheapest car is not an empty bar). Heavier is
   * "more" on the mass bar — it shoves other cars around.
   */
  private ratio(key: (typeof STATS)[number]['key'], value: number): number {
    const values = CAR_CATALOG.map((c) => c[key] as number)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return 0.08 + 0.92 * ((value - min) / (max - min))
  }

  private statValue(key: (typeof STATS)[number]['key'], car: CarSpec): string {
    switch (key) {
      case 'topSpeed':
        return `${Math.round(car.topSpeed * MPH_PER_PX)} mph`
      case 'accel':
        return `${car.accel}`
      case 'grip':
        return car.grip.toFixed(1)
      case 'mass':
        return car.mass.toFixed(2)
    }
  }

  private refresh() {
    const showing = CAR_CATALOG[this.idx]
    const owned = carById(this.career.carId)
    const isOwned = showing.id === owned.id
    const net = carNetPrice(this.career, showing.id)
    const affordable = this.career.cash >= net

    this.carImage.setTexture(`car-hero-${showing.id}`)
    fitImage(this.carImage, 620, 320)
    this.nameText.setText(`${showing.name}${isOwned ? '  (yours)' : ''}`)
    this.blurbText.setText(showing.blurb)

    if (isOwned) {
      this.priceText.setText(`Trade-in value $${tradeInValue(this.career)}  ·  Cash $${this.career.cash}`).setColor(hex(C.oxide))
    } else {
      this.priceText
        .setText(
          `$${showing.price}  −  trade-in $${tradeInValue(this.career)}  =  $${net}\nCash $${this.career.cash}  ·  upgrades do not transfer`,
        )
        .setColor(hex(affordable ? C.money : C.danger))
    }

    this.hintText.setText(
      isOwned
        ? 'This is the car in your driveway.'
        : affordable
          ? 'ENTER: BUY THIS CAR'
          : `You are $${net - this.career.cash} short.`,
    )
    this.hintText.setColor(hex(isOwned ? C.textMuted : affordable ? C.money : C.danger))

    // bars: browsed car filled, a marker where the owned car sits
    this.barsGfx.clear()
    STATS.forEach((stat, row) => {
      const y = this.barY(row)
      const value = showing[stat.key] as number
      this.barsGfx.fillStyle(C.surfaceTile, 1)
      this.barsGfx.fillRect(BAR_X - 3, y - 3, BAR_W + 6, BAR_H + 6)
      this.barsGfx.fillStyle(C.surfaceTrack, 1)
      this.barsGfx.fillRect(BAR_X, y, BAR_W, BAR_H)
      this.barsGfx.fillStyle(isOwned ? C.oxide : C.tierPro, 1)
      this.barsGfx.fillRect(BAR_X, y, BAR_W * this.ratio(stat.key, value), BAR_H)

      if (!isOwned) {
        // where your current car sits on this axis
        const mx = BAR_X + BAR_W * this.ratio(stat.key, owned[stat.key] as number)
        this.barsGfx.fillStyle(C.oxide, 1)
        this.barsGfx.fillRect(mx - 2, y - 6, 4, BAR_H + 12)
      }

      const delta = isOwned ? '' : this.deltaLabel(value, owned[stat.key] as number)
      this.statValueTexts[row].setText(`${this.statValue(stat.key, showing)}${delta}`)
      this.statValueTexts[row].setColor(
        hex(delta.startsWith(' ▲') ? C.money : delta.startsWith(' ▼') ? C.danger : C.textPrimary),
      )
    })

    const caps = (['engine', 'tires', 'armor'] as UpgradeKind[])
      .map((kind) => `${kind.toUpperCase().padEnd(7)}${'■'.repeat(showing.upgradeCaps[kind]).padEnd(3, '·')}`)
      .join('\n')
    this.capsText.setText(`UPGRADE CAPS\n${caps}`)

    this.arrows.forEach((a) => a.setVisible(CAR_CATALOG.length > 1))
  }

  /** Percentage difference against the owned car, e.g. ' ▲ +12%'. */
  private deltaLabel(value: number, ownedValue: number): string {
    if (value === ownedValue) return ''
    const pct = Math.round((value / ownedValue - 1) * 100)
    if (pct === 0) return ''
    return `${pct > 0 ? ' ▲ +' : ' ▼ '}${pct}%`
  }
}
