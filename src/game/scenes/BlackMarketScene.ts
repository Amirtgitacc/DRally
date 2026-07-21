import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { LOAN, OVERCHARGED_TURBO, RAM_PLATING, SABOTAGE } from '../../data/blackMarket'
import { MINES } from '../../data/weapons'
import {
  buyOverchargedTurbo,
  buyRamPlating,
  buySabotage,
  repayLoan,
  takeLoan,
} from '../../core/economy/blackMarket'
import { buyMines } from '../../core/economy/garage'
import { itemLabel } from '../../core/economy/upgradeEffects'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { backPlate, card, notchedButton, screenTitle, SAFE, type ButtonHandle } from '../ui/mobile'
import * as glyph from '../ui/glyphs'

interface Product {
  id: 'mines' | 'plating' | 'overturbo' | 'sabotage' | 'loan'
  label: string
  glyph: glyph.Glyph
}

const PRODUCTS: Product[] = [
  { id: 'mines', label: 'MINES', glyph: glyph.mine },
  { id: 'plating', label: 'RAM PLATING', glyph: glyph.shield },
  { id: 'overturbo', label: 'OVERCHARGE', glyph: glyph.coin },
  { id: 'sabotage', label: 'SABOTAGE', glyph: glyph.skull },
  { id: 'loan', label: 'LOANSHARK', glyph: glyph.coin },
]

export class BlackMarketScene extends Phaser.Scene {
  private career!: CareerState
  private selected = 0
  private infoText!: Phaser.GameObjects.Text
  private nextRaceText!: Phaser.GameObjects.Text
  private cashText!: Phaser.GameObjects.Text
  private buttons: ButtonHandle[] = []

  constructor() {
    super('BlackMarket')
  }

  create() {
    this.career = loadCareer()
    // weapons-off careers are denied before this screen ever paints
    if (!this.career.profile.weaponsEnabled) {
      this.scene.start('Garage')
      return
    }
    this.selected = 0
    this.buttons = []

    sceneBackground(this, 'bg-black-market', { veil: 0.44 })

    screenTitle(this, 'BLACK MARKET', { x: SAFE.left, y: 96, color: C.danger })

    // cash chip, top-right
    card(this, SAFE.right - 140, 96, 240, 60, undefined, { accent: 0x6a2a24 })
    this.cashText = text(this, SAFE.right - 140, 96, '', { size: 'body', face: 'mono', weight: 700, color: C.money, origin: [0.5, 0.5] })

    // NEXT RACE loadout strip
    card(this, GAME_WIDTH / 2, 214, 1200, 96, 'NEXT RACE', { accent: 0x6a2a24 })
    this.nextRaceText = text(this, GAME_WIDTH / 2, 228, '', { size: 'bodySm', face: 'mono', color: C.oxide, align: 'center', origin: [0.5, 0.5] })

    // five product cards
    const n = PRODUCTS.length
    const gap = 18
    const w = (SAFE.width - gap * (n - 1)) / n
    PRODUCTS.forEach((p, i) => {
      const x = SAFE.left + w / 2 + i * (w + gap)
      this.buttons.push(notchedButton(this, x, 440, {
        w, h: 150, label: p.label, glyph: p.glyph, size: 'bodySm', align: 'left', value: '',
        selectColor: C.danger,
        onFocus: () => { this.selected = i; this.refresh() },
        onActivate: () => { this.selected = i; this.activate() },
      }))
    })

    // selected-item exact-effect panel
    card(this, GAME_WIDTH / 2, 660, 1400, 220, undefined, { accent: 0x6a2a24 })
    this.infoText = text(this, GAME_WIDTH / 2, 660, '', {
      size: 'body', face: 'mono', color: C.textBody, align: 'center', wordWrapWidth: 1320, lineSpacing: 10, origin: [0.5, 0.5],
    })

    backPlate(this, 'GARAGE', () => this.scene.start('Garage'), { x: SAFE.left + 200, w: 400 })

    const kb = this.input.keyboard!
    const left = () => this.move(-1)
    const right = () => this.move(1)
    const enter = () => this.activate()
    const esc = () => this.scene.start('Garage')
    kb.on('keydown-LEFT', left); kb.on('keydown-RIGHT', right)
    kb.on('keydown-ENTER', enter); kb.on('keydown-ESC', esc)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right)
      kb.off('keydown-ENTER', enter); kb.off('keydown-ESC', esc)
    })

    this.refresh()
  }

  private move(dir: number) {
    this.selected = (this.selected + dir + PRODUCTS.length) % PRODUCTS.length
    this.refresh()
  }

  private activate() {
    let next: CareerState | null = null
    switch (PRODUCTS[this.selected].id) {
      case 'mines': next = buyMines(this.career); break
      case 'plating': next = buyRamPlating(this.career); break
      case 'overturbo': next = buyOverchargedTurbo(this.career); break
      case 'sabotage': next = buySabotage(this.career); break
      case 'loan': next = this.career.loan ? repayLoan(this.career) : takeLoan(this.career); break
    }
    if (next) {
      this.career = next
      saveCareer(this.career)
      this.refresh()
    }
  }

  private tileCaption(p: Product): { cost: string; costColor: number; info: string; enabled: boolean } {
    const c = this.career
    switch (p.id) {
      case 'mines': {
        if (c.mines > 0) return { cost: 'STOCKED', costColor: C.textMuted, info: `${c.mines} MINES · DROPPED BEHIND CAR · ONE RACE`, enabled: false }
        return { cost: `$${MINES.price}`, costColor: c.cash >= MINES.price ? C.money : C.danger,
          info: `${itemLabel('mines')}\nDropped behind your car. One race only. A direct hit launches the victim off the tarmac.`,
          enabled: c.cash >= MINES.price }
      }
      case 'plating': {
        if (c.ramPlating) return { cost: 'FITTED', costColor: C.textMuted, info: 'RAM PLATING FITTED · ONE RACE · Trade paint generously.', enabled: false }
        if (!this.inStock('plating')) return { cost: 'OUT', costColor: C.textMuted, info: 'The plating truck missed tonight. Stock rotates after each race.', enabled: false }
        return { cost: `$${RAM_PLATING.price}`, costColor: c.cash >= RAM_PLATING.price ? C.money : C.danger,
          info: `${itemLabel('ramPlating')}\nSpiked plating, one race. Trade paint generously.`, enabled: c.cash >= RAM_PLATING.price }
      }
      case 'overturbo': {
        if (c.overTurbo) return { cost: 'LOADED', costColor: C.textMuted, info: 'OVERCHARGE LOADED · ONE RACE · The fuel mix sloshes ominously.', enabled: false }
        if (!this.inStock('overturbo')) return { cost: 'OUT', costColor: C.textMuted, info: 'No volatile mix tonight. Stock rotates after each race.', enabled: false }
        return { cost: `$${OVERCHARGED_TURBO.price}`, costColor: c.cash >= OVERCHARGED_TURBO.price ? C.money : C.danger,
          info: `${itemLabel('overTurbo')}\nVolatile fuel mix, one race. Boosting cooks your engine — it CAN wreck you.`, enabled: c.cash >= OVERCHARGED_TURBO.price }
      }
      case 'sabotage': {
        if (c.sabotage) return { cost: 'ARRANGED', costColor: C.textMuted, info: 'SABOTAGE ARRANGED · ONE RACE · A mechanic is paid to look away.', enabled: false }
        if (!this.inStock('sabotage')) return { cost: 'OUT', costColor: C.textMuted, info: 'The fixer is lying low. Stock rotates after each race.', enabled: false }
        return { cost: `$${SABOTAGE.price}`, costColor: c.cash >= SABOTAGE.price ? C.money : C.danger,
          info: `${itemLabel('sabotage')}\nA quiet visit to the best car on your next grid.`, enabled: c.cash >= SABOTAGE.price }
      }
      case 'loan': {
        if (c.loan) return { cost: `PAY $${c.loan.owed}`, costColor: c.cash >= c.loan.owed ? C.money : C.danger,
          info: `You owe $${c.loan.owed}, due in ${c.loan.racesLeft} race${c.loan.racesLeft === 1 ? '' : 's'}. Pay now or the crew collects — with interest of the other kind.`,
          enabled: c.cash >= c.loan.owed }
        return { cost: `+$${LOAN.amount}`, costColor: C.money,
          info: `${itemLabel('loan')}\nMiss the deadline and they take everything you have — and leave dents.`, enabled: true }
      }
    }
  }

  /** Two specialist deals are available per round; staples and loans remain. */
  private inStock(id: 'plating' | 'overturbo' | 'sabotage'): boolean {
    const rotating = ['plating', 'overturbo', 'sabotage'] as const
    return id !== rotating[this.career.racesRun % rotating.length]
  }

  private refresh() {
    const c = this.career
    this.cashText.setText(`$${c.cash.toLocaleString('en-US')}`)

    const gear: string[] = []
    if (c.mines > 0) gear.push(`${c.mines} MINES`)
    if (c.ramPlating) gear.push('RAM PLATING')
    if (c.overTurbo) gear.push('OVERCHARGE')
    if (c.sabotage) gear.push('SABOTAGE')
    const loan = c.loan ? `  ·  LOAN $${c.loan.owed} (${c.loan.racesLeft}R)` : ''
    this.nextRaceText.setText((gear.length ? gear.join('  ·  ') : 'NOTHING STRAPPED ON') + loan)
      .setColor(hex(gear.length || c.loan ? C.oxide : C.textMuted))

    PRODUCTS.forEach((p, i) => {
      const cap = this.tileCaption(p)
      this.buttons[i].setValue(cap.cost, cap.costColor)
      this.buttons[i].setState({ selected: i === this.selected, enabled: cap.enabled })
    })

    this.infoText.setText(this.tileCaption(PRODUCTS[this.selected]).info)
  }
}
