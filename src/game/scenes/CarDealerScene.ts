import Phaser from 'phaser'
import { CAR_CATALOG, carById, type CarSpec } from '../../data/cars'
import type { UpgradeKind } from '../../data/economy'
import { buyCar, carNetPrice, tradeInValue } from '../../core/economy/garage'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import { pips, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage, type DeferredImageHandle } from '../ui/deferredImage'
import { backPlate, card, dots, notchedButton, screenTitle, SAFE, type ButtonHandle } from '../ui/mobile'

const MPH_PER_PX = 0.14

const STATS: Array<{ label: string; key: keyof CarSpec & ('topSpeed' | 'accel' | 'grip' | 'mass') }> = [
  { label: 'TOP SPEED', key: 'topSpeed' },
  { label: 'ACCEL', key: 'accel' },
  { label: 'GRIP', key: 'grip' },
  { label: 'MASS', key: 'mass' },
]

const POSTER_CX = 420
const POSTER_CY = 500
const POSTER_MAX_W = 460
const POSTER_MAX_H = 640

// comparison card
const CARD_CX = 1330
const BAR_X = 1050
const BAR_W = 560
const BAR_H = 20
const BAR_BASE_Y = 400
const BAR_STEP = 66

export class CarDealerScene extends Phaser.Scene {
  private career!: CareerState
  private idx = 0

  private carImageHandle!: DeferredImageHandle
  private nameText!: Phaser.GameObjects.Text
  private priceText!: Phaser.GameObjects.Text
  private capsText!: Phaser.GameObjects.Text
  private cashText!: Phaser.GameObjects.Text
  private barsGfx!: Phaser.GameObjects.Graphics
  private capsPips!: Phaser.GameObjects.Graphics
  private statValueTexts: Phaser.GameObjects.Text[] = []
  private buyBtn!: ButtonHandle
  private dotsHandle!: { setActive(i: number): void }

  constructor() {
    super('CarDealer')
  }

  create() {
    this.career = loadCareer()
    this.idx = CAR_CATALOG.findIndex((c) => c.id === this.career.carId)
    this.statValueTexts = []

    sceneBackground(this, 'bg-car-dealer', { veil: 0.34 })

    screenTitle(this, 'CAR DEALER', { x: SAFE.left, y: 96 })
    card(this, SAFE.right - 140, 96, 240, 60, undefined, { accent: C.oxideDim })
    this.cashText = text(this, SAFE.right - 140, 96, '', { size: 'body', face: 'mono', weight: 700, color: C.money, origin: [0.5, 0.5] })

    // poster + browse chevrons + dots
    this.carImageHandle = deferredImage(this, POSTER_CX, POSTER_CY, `car-poster-${CAR_CATALOG[this.idx].id}`, POSTER_MAX_W, POSTER_MAX_H)
    notchedButton(this, POSTER_CX - 300, POSTER_CY, { w: 74, h: 120, label: '‹', size: 'title', onActivate: () => this.browse(-1) })
    notchedButton(this, POSTER_CX + 300, POSTER_CY, { w: 74, h: 120, label: '›', size: 'title', onActivate: () => this.browse(1) })
    this.dotsHandle = dots(this, POSTER_CX, POSTER_CY + 360, CAR_CATALOG.length, { active: this.idx })

    // comparison card
    card(this, CARD_CX, 470, 1040, 600, undefined, { accent: C.oxideDim })
    this.nameText = text(this, CARD_CX, 232, '', { size: 'heading', face: 'display', weight: 700, origin: [0.5, 0.5] })
    this.priceText = text(this, CARD_CX, 300, '', { size: 'body', face: 'mono', color: C.money, align: 'center', origin: [0.5, 0.5] })

    this.barsGfx = this.add.graphics()
    STATS.forEach((stat, row) => {
      const y = this.barY(row)
      text(this, BAR_X - 220, y + BAR_H / 2, stat.label, { size: 'bodySm', face: 'display', weight: 600, letterSpacing: 1, color: C.textSecondary, origin: [0, 0.5] })
      this.statValueTexts.push(text(this, BAR_X + BAR_W + 24, y + BAR_H / 2, '', { size: 'bodySm', face: 'mono', origin: [0, 0.5] }))
    })

    text(this, BAR_X - 220, this.barY(3) + 78, 'UPGRADE CAPS', { size: 'label', face: 'display', weight: 600, letterSpacing: 2, color: C.textSecondary, origin: [0, 0.5] })
    this.capsText = text(this, BAR_X - 220, this.barY(3) + 118, '', { size: 'bodySm', face: 'mono', color: C.textBody, lineSpacing: 6, origin: [0, 0.5] })
    this.capsPips = this.add.graphics()

    // purchase + back
    this.buyBtn = notchedButton(this, CARD_CX, 910, {
      w: 720, h: 104, label: 'BUY THIS CAR', size: 'title', variant: 'primary', value: '',
      onActivate: () => this.buy(),
    })
    backPlate(this, 'GARAGE', () => this.scene.start('Garage'), { x: SAFE.left + 150, y: 910 })

    const kb = this.input.keyboard!
    const left = () => this.browse(-1)
    const right = () => this.browse(1)
    const enter = () => this.buy()
    const esc = () => this.scene.start('Garage')
    kb.on('keydown-LEFT', left); kb.on('keydown-RIGHT', right)
    kb.on('keydown-ENTER', enter); kb.on('keydown-ESC', esc)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right)
      kb.off('keydown-ENTER', enter); kb.off('keydown-ESC', esc)
    })

    this.refresh()
  }

  private barY(row: number): number {
    return BAR_BASE_Y + row * BAR_STEP
  }

  private browse(dir: number) {
    this.idx = (this.idx + dir + CAR_CATALOG.length) % CAR_CATALOG.length
    this.dotsHandle.setActive(this.idx)
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

  private ratio(key: (typeof STATS)[number]['key'], value: number): number {
    const values = CAR_CATALOG.map((c) => c[key] as number)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return 0.08 + 0.92 * ((value - min) / (max - min))
  }

  private statValue(key: (typeof STATS)[number]['key'], car: CarSpec): string {
    switch (key) {
      case 'topSpeed': return `${Math.round(car.topSpeed * MPH_PER_PX)} mph`
      case 'accel': return `${car.accel}`
      case 'grip': return car.grip.toFixed(1)
      case 'mass': return car.mass.toFixed(2)
    }
  }

  private refresh() {
    const showing = CAR_CATALOG[this.idx]
    const owned = carById(this.career.carId)
    const isOwned = showing.id === owned.id
    const net = carNetPrice(this.career, showing.id)
    const affordable = this.career.cash >= net

    this.carImageHandle.setKey(`car-poster-${showing.id}`, POSTER_MAX_W, POSTER_MAX_H)
    this.cashText.setText(`$${this.career.cash.toLocaleString('en-US')}`)
    this.nameText.setText(`${showing.name}${isOwned ? '  ·  YOURS' : ''}`).setColor(hex(isOwned ? C.oxide : C.textPrimary))

    if (isOwned) {
      this.priceText.setText(`TRADE-IN $${tradeInValue(this.career)}`).setColor(hex(C.oxide))
    } else {
      this.priceText.setText(`$${showing.price}   TRADE-IN $${tradeInValue(this.career)}   NET $${net}`).setColor(hex(affordable ? C.money : C.danger))
    }

    // bars: browsed car filled, marker where the owned car sits, delta value
    this.barsGfx.clear()
    STATS.forEach((stat, row) => {
      const y = this.barY(row)
      const value = showing[stat.key] as number
      this.barsGfx.fillStyle(C.surfaceTrack, 1)
      this.barsGfx.fillRect(BAR_X, y, BAR_W, BAR_H)
      this.barsGfx.fillStyle(isOwned ? C.oxide : C.tierPro, 1)
      this.barsGfx.fillRect(BAR_X, y, BAR_W * Phaser.Math.Clamp(this.ratio(stat.key, value), 0, 1), BAR_H)
      if (!isOwned) {
        const mx = BAR_X + BAR_W * Phaser.Math.Clamp(this.ratio(stat.key, owned[stat.key] as number), 0, 1)
        this.barsGfx.fillStyle(C.oxide, 1)
        this.barsGfx.fillRect(mx - 2, y - 6, 4, BAR_H + 12)
      }
      const delta = isOwned ? '' : this.deltaLabel(value, owned[stat.key] as number)
      this.statValueTexts[row].setText(`${this.statValue(stat.key, showing)}${delta}`)
        .setColor(hex(delta.startsWith(' ▲') ? C.ok : delta.startsWith(' ▼') ? C.danger : C.textPrimary))
    })

    // caps: text + pips
    this.capsText.setText((['engine', 'tires', 'armor'] as UpgradeKind[]).map((k) => `${k.toUpperCase().padEnd(7)}${showing.upgradeCaps[k]}`).join('    '))
    this.capsPips.clear()
    ;(['engine', 'tires', 'armor'] as UpgradeKind[]).forEach((k, col) => {
      pips(this.capsPips, BAR_X - 220 + 400 + col * 130, this.barY(3) + 110, showing.upgradeCaps[k], 4, { size: 12, gap: 4 })
    })

    // purchase button
    this.buyBtn.setState({ selected: !isOwned && affordable, enabled: !isOwned && affordable })
    this.buyBtn.setLabel(isOwned ? 'IN YOUR DRIVEWAY' : affordable ? 'BUY THIS CAR' : `SHORT $${net - this.career.cash}`)
    this.buyBtn.setValue(isOwned ? '' : `$${net}`, affordable ? C.money : C.danger)

    this.dotsHandle.setActive(this.idx)
  }

  /** Percentage difference against the owned car, e.g. ' ▲ +12%'. */
  private deltaLabel(value: number, ownedValue: number): string {
    if (value === ownedValue) return ''
    const pct = Math.round((value / ownedValue - 1) * 100)
    if (pct === 0) return ''
    return `${pct > 0 ? ' ▲ +' : ' ▼ '}${pct}%`
  }
}
