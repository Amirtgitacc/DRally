import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG, carById, type CarSpec } from '../../data/cars'
import type { UpgradeKind } from '../../data/economy'
import { buyCar, carNetPrice, tradeInValue } from '../../core/economy/garage'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'

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

    this.add
      .text(cx, 70, 'CAR DEALER', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)

    this.add
      .text(cx, 132, 'Every chassis on the ladder. The marker on each bar is the car you own.', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9aa0ac',
      })
      .setOrigin(0.5)

    // hero sprite, flanked by the browse arrows
    this.carImage = this.add.image(cx, 300, `car-${CAR_CATALOG[this.idx].id}`).setScale(2.0).setAngle(-90)
    this.tweens.add({ targets: this.carImage, y: '-=8', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inout' })

    this.arrows = [-1, 1].map((dir) => {
      const arrow = this.add
        .text(cx + dir * 420, 300, dir < 0 ? '◄' : '►', {
          fontFamily: 'monospace',
          fontSize: '54px',
          color: '#f2a33c',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
      arrow.on('pointerdown', () => this.browse(dir))
      this.tweens.add({ targets: arrow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 })
      return arrow
    })

    this.nameText = this.add
      .text(cx, 462, '', { fontFamily: 'monospace', fontSize: '40px', color: '#e8e8f0' })
      .setOrigin(0.5)
    this.priceText = this.add
      .text(cx, 524, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#7fe0a8',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)

    // stat bars
    this.barsGfx = this.add.graphics()
    STATS.forEach((stat, row) => {
      const y = this.barY(row)
      this.add.text(BAR_X - 190, y - 4, stat.label, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9aa0ac',
      })
      this.statValueTexts.push(
        this.add.text(BAR_X + BAR_W + 24, y - 4, '', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#e8e8f0',
        }),
      )
    })

    this.capsText = this.add.text(GAME_WIDTH - 640, this.barY(0) - 4, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#9aa0ac',
      lineSpacing: 8,
    })

    this.blurbText = this.add
      .text(cx, GAME_HEIGHT - 210, '', {
        fontFamily: 'monospace',
        fontSize: '21px',
        color: '#c8c8d4',
        align: 'center',
        wordWrap: { width: 1100 },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)

    this.hintText = this.add
      .text(cx, GAME_HEIGHT - 70, '', { fontFamily: 'monospace', fontSize: '22px', color: '#e8e8f0' })
      .setOrigin(0.5)

    this.add.text(16, 16, '←/→ browse · Enter buy · Esc garage', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8e8f0',
      backgroundColor: '#000000aa',
      padding: { x: 10, y: 6 },
    })

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

    this.carImage.setTexture(`car-${showing.id}`)
    this.nameText.setText(`${showing.name}${isOwned ? '  (yours)' : ''}`)
    this.blurbText.setText(showing.blurb)

    if (isOwned) {
      this.priceText.setText(`Trade-in value $${tradeInValue(this.career)}  ·  Cash $${this.career.cash}`).setColor('#f2a33c')
    } else {
      this.priceText
        .setText(
          `$${showing.price}  −  trade-in $${tradeInValue(this.career)}  =  $${net}\nCash $${this.career.cash}  ·  upgrades do not transfer`,
        )
        .setColor(affordable ? '#7fe0a8' : '#d23c2f')
    }

    this.hintText.setText(
      isOwned
        ? 'This is the car in your driveway.'
        : affordable
          ? 'ENTER: BUY THIS CAR'
          : `You are $${net - this.career.cash} short.`,
    )
    this.hintText.setColor(isOwned ? '#70707e' : affordable ? '#7fe0a8' : '#d23c2f')

    // bars: browsed car filled, a marker where the owned car sits
    this.barsGfx.clear()
    STATS.forEach((stat, row) => {
      const y = this.barY(row)
      const value = showing[stat.key] as number
      this.barsGfx.fillStyle(0x14141c, 1)
      this.barsGfx.fillRect(BAR_X - 3, y - 3, BAR_W + 6, BAR_H + 6)
      this.barsGfx.fillStyle(0x2a2a33, 1)
      this.barsGfx.fillRect(BAR_X, y, BAR_W, BAR_H)
      this.barsGfx.fillStyle(isOwned ? 0xf2a33c : 0x4f8fd0, 1)
      this.barsGfx.fillRect(BAR_X, y, BAR_W * this.ratio(stat.key, value), BAR_H)

      if (!isOwned) {
        // where your current car sits on this axis
        const mx = BAR_X + BAR_W * this.ratio(stat.key, owned[stat.key] as number)
        this.barsGfx.fillStyle(0xf2a33c, 1)
        this.barsGfx.fillRect(mx - 2, y - 6, 4, BAR_H + 12)
      }

      const delta = isOwned ? '' : this.deltaLabel(value, owned[stat.key] as number)
      this.statValueTexts[row].setText(`${this.statValue(stat.key, showing)}${delta}`)
      this.statValueTexts[row].setColor(delta.startsWith(' ▲') ? '#7fe0a8' : delta.startsWith(' ▼') ? '#d23c2f' : '#e8e8f0')
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
