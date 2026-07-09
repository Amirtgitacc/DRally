import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
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

interface Tile {
  id: 'mines' | 'plating' | 'overturbo' | 'sabotage' | 'loan' | 'back'
  label: string
}

const TILES: Tile[] = [
  { id: 'mines', label: 'MINES' },
  { id: 'plating', label: 'RAM PLATING' },
  { id: 'overturbo', label: 'OVERCHARGE' },
  { id: 'sabotage', label: 'SABOTAGE' },
  { id: 'loan', label: 'LOANSHARK' },
  { id: 'back', label: 'GARAGE' },
]

const FLAVOR = [
  'No receipts. No refunds. No names.',
  'Everything fell off a truck. The truck also fell off a truck.',
  'The proprietor counts your money before you hand it over.',
  'Ask about the warranty and the price doubles.',
]

export class BlackMarketScene extends Phaser.Scene {
  private career!: CareerState
  private selected = 0
  private infoText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private cashText!: Phaser.GameObjects.Text
  private tileTexts: Phaser.GameObjects.Text[] = []
  private tileRects: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('BlackMarket')
  }

  create() {
    this.career = loadCareer()
    this.selected = 0
    this.tileTexts = []
    this.tileRects = []

    const cx = GAME_WIDTH / 2

    this.add
      .text(cx, 80, 'BLACK MARKET', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#d23c2f',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)

    this.cashText = this.add
      .text(cx, 150, '', { fontFamily: 'monospace', fontSize: '24px', color: '#7fe0a8' })
      .setOrigin(0.5)

    // what's already strapped to the car for the next race
    this.statusText = this.add
      .text(cx, 230, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#f2a33c',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)

    this.infoText = this.add
      .text(cx, 480, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#c8c8d4',
        align: 'center',
        wordWrap: { width: 1000 },
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)

    const tileW = 250
    const totalW = TILES.length * tileW + (TILES.length - 1) * 16
    TILES.forEach((tile, i) => {
      const x = cx - totalW / 2 + i * (tileW + 16) + tileW / 2
      const rect = this.add
        .rectangle(x, GAME_HEIGHT - 180, tileW, 100, 0x14141c, 0.95)
        .setStrokeStyle(3, 0x3a3a46, 1)
      const text = this.add
        .text(x, GAME_HEIGHT - 180, tile.label, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#e8e8f0',
          align: 'center',
        })
        .setOrigin(0.5)
      this.tileRects.push(rect)
      this.tileTexts.push(text)
    })

    this.add
      .text(cx, GAME_HEIGHT - 60, Phaser.Math.RND.pick(FLAVOR), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#70707e',
      })
      .setOrigin(0.5)

    this.add.text(16, 16, '←/→ select · Enter buy · Esc garage', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8e8f0',
      backgroundColor: '#000000aa',
      padding: { x: 10, y: 6 },
    })

    const kb = this.input.keyboard!
    kb.on('keydown-LEFT', () => this.move(-1))
    kb.on('keydown-RIGHT', () => this.move(1))
    kb.on('keydown-ENTER', () => this.activate())
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
    this.selected = (this.selected + dir + TILES.length) % TILES.length
    this.refresh()
  }

  private activate() {
    let next: CareerState | null = null
    switch (TILES[this.selected].id) {
      case 'mines':
        next = buyMines(this.career)
        break
      case 'plating':
        next = buyRamPlating(this.career)
        break
      case 'overturbo':
        next = buyOverchargedTurbo(this.career)
        break
      case 'sabotage':
        next = buySabotage(this.career)
        break
      case 'loan':
        next = this.career.loan ? repayLoan(this.career) : takeLoan(this.career)
        break
      case 'back':
        this.scene.start('Garage')
        return
    }
    if (next) {
      this.career = next
      saveCareer(this.career)
      this.refresh()
    }
  }

  private tileCaption(tile: Tile): { cost: string; info: string; enabled: boolean } {
    const c = this.career
    switch (tile.id) {
      // every info line leads with the exact, data-derived effect
      case 'mines': {
        if (c.mines > 0)
          return { cost: 'STOCKED', info: `${c.mines} mines strapped on. Drop them behind you with C.`, enabled: false }
        return {
          cost: `$${MINES.price}`,
          info: `${itemLabel('mines')}\nDropped behind your car (C key). One race only — used or not.\nA direct hit launches the victim off the tarmac: no steering, no grip, until they land.`,
          enabled: c.cash >= MINES.price,
        }
      }
      case 'plating': {
        if (c.ramPlating)
          return { cost: 'FITTED', info: 'Spiked plating bolted on. Trade paint generously.', enabled: false }
        return {
          cost: `$${RAM_PLATING.price}`,
          info: `${itemLabel('ramPlating')}\nSpiked plating, one race. Trade paint generously.`,
          enabled: c.cash >= RAM_PLATING.price,
        }
      }
      case 'overturbo': {
        if (c.overTurbo)
          return { cost: 'LOADED', info: 'The fuel mix sloshes ominously in the tank.', enabled: false }
        return {
          cost: `$${OVERCHARGED_TURBO.price}`,
          info: `${itemLabel('overTurbo')}\nVolatile fuel mix, one race. Boosting cooks your own engine. It CAN wreck you.`,
          enabled: c.cash >= OVERCHARGED_TURBO.price,
        }
      }
      case 'sabotage': {
        if (c.sabotage)
          return { cost: 'ARRANGED', info: 'Somewhere, a mechanic is being paid to look away.', enabled: false }
        return {
          cost: `$${SABOTAGE.price}`,
          info: `${itemLabel('sabotage')}\nA quiet visit tonight, to the best car on your next grid.`,
          enabled: c.cash >= SABOTAGE.price,
        }
      }
      case 'loan': {
        if (c.loan) {
          return {
            cost: `PAY $${c.loan.owed}`,
            info: `You owe $${c.loan.owed}, due in ${c.loan.racesLeft} race${c.loan.racesLeft === 1 ? '' : 's'}. Pay now, or the crew collects after it comes due — with interest of the other kind.`,
            enabled: c.cash >= c.loan.owed,
          }
        }
        return {
          cost: `+$${LOAN.amount}`,
          info: `${itemLabel('loan')}\nMiss the deadline and they take everything you have — and leave dents.`,
          enabled: true,
        }
      }
      case 'back':
        return { cost: '', info: 'Back to the garage, where the receipts are at least fictional.', enabled: true }
    }
  }

  private refresh() {
    const c = this.career
    this.cashText.setText(`$${c.cash}`)

    const gear: string[] = []
    if (c.mines > 0) gear.push(`${c.mines} mines`)
    if (c.ramPlating) gear.push('ram plating')
    if (c.overTurbo) gear.push('overcharged turbo')
    if (c.sabotage) gear.push('sabotage arranged')
    this.statusText.setText(
      [
        gear.length > 0 ? `Next race: ${gear.join(' · ')}` : 'Nothing strapped on for the next race.',
        c.loan ? `LOAN: $${c.loan.owed} due in ${c.loan.racesLeft} race${c.loan.racesLeft === 1 ? '' : 's'}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )

    TILES.forEach((tile, i) => {
      const { cost, enabled } = this.tileCaption(tile)
      const selected = i === this.selected
      this.tileRects[i].setStrokeStyle(3, selected ? 0xd23c2f : 0x3a3a46, 1)
      this.tileRects[i].setFillStyle(selected ? 0x1c1c26 : 0x14141c, 0.95)
      this.tileTexts[i].setText(cost ? `${tile.label}\n${cost}` : tile.label)
      this.tileTexts[i].setColor(enabled ? (selected ? '#d23c2f' : '#e8e8f0') : '#55555f')
    })

    this.infoText.setText(this.tileCaption(TILES[this.selected]).info)
  }
}
