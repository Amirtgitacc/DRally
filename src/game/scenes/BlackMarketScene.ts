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
import { C } from '../ui/theme'
import { flavor, heading, hintBar, text, tile, type TileHandle, wireTiles } from '../ui/widgets'

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
  private tiles: TileHandle[] = []

  constructor() {
    super('BlackMarket')
  }

  create() {
    this.career = loadCareer()
    if (!this.career.profile.weaponsEnabled) {
      this.scene.start('Garage')
      return
    }
    this.selected = 0
    this.tiles = []

    const cx = GAME_WIDTH / 2

    heading(this, cx, 80, 'BLACK MARKET', { color: C.danger })

    this.cashText = text(this, cx, 150, '', { size: 'action', color: C.money, origin: [0.5, 0.5] })

    // what's already strapped to the car for the next race
    this.statusText = text(this, cx, 230, '', {
      size: 'body',
      color: C.oxide,
      align: 'center',
      lineSpacing: 8,
      origin: [0.5, 0],
    })

    this.infoText = text(this, cx, 480, '', {
      size: 'action',
      color: C.textBody,
      align: 'center',
      wordWrapWidth: 1000,
      lineSpacing: 8,
      origin: [0.5, 0],
    })

    const tileW = 250
    const totalW = TILES.length * tileW + (TILES.length - 1) * 16
    TILES.forEach((def, i) => {
      const x = cx - totalW / 2 + i * (tileW + 16) + tileW / 2
      this.tiles.push(tile(this, x, GAME_HEIGHT - 180, tileW, 100, def.label, { select: C.danger }))
    })

    wireTiles(
      this.tiles,
      (i) => { this.selected = i; this.refresh() },
      (i) => { this.selected = i; this.activate() },
    )
    flavor(this, cx, GAME_HEIGHT - 60, Phaser.Math.RND.pick(FLAVOR))

    hintBar(this, '←/→ select · Enter buy · Esc garage')

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
        if (!this.inStock('plating')) return { cost: 'OUT', info: 'The plating truck missed tonight. Stock rotates after each race.', enabled: false }
        return {
          cost: `$${RAM_PLATING.price}`,
          info: `${itemLabel('ramPlating')}\nSpiked plating, one race. Trade paint generously.`,
          enabled: c.cash >= RAM_PLATING.price,
        }
      }
      case 'overturbo': {
        if (c.overTurbo)
          return { cost: 'LOADED', info: 'The fuel mix sloshes ominously in the tank.', enabled: false }
        if (!this.inStock('overturbo')) return { cost: 'OUT', info: 'No volatile mix tonight. Stock rotates after each race.', enabled: false }
        return {
          cost: `$${OVERCHARGED_TURBO.price}`,
          info: `${itemLabel('overTurbo')}\nVolatile fuel mix, one race. Boosting cooks your own engine. It CAN wreck you.`,
          enabled: c.cash >= OVERCHARGED_TURBO.price,
        }
      }
      case 'sabotage': {
        if (c.sabotage)
          return { cost: 'ARRANGED', info: 'Somewhere, a mechanic is being paid to look away.', enabled: false }
        if (!this.inStock('sabotage')) return { cost: 'OUT', info: 'The fixer is lying low. Stock rotates after each race.', enabled: false }
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

  /** Two specialist deals are available per round; staples and loans remain. */
  private inStock(id: 'plating' | 'overturbo' | 'sabotage'): boolean {
    const rotating = ['plating', 'overturbo', 'sabotage'] as const
    return id !== rotating[this.career.racesRun % rotating.length]
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

    TILES.forEach((def, i) => {
      const { cost, enabled } = this.tileCaption(def)
      this.tiles[i].label.setText(cost ? `${def.label}\n${cost}` : def.label)
      this.tiles[i].setState(i === this.selected, enabled)
    })

    this.infoText.setText(this.tileCaption(TILES[this.selected]).info)
  }
}
