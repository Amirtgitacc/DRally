import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG, carById } from '../../data/cars'
import { REPAIR_STEP_PERCENT, type UpgradeKind } from '../../data/economy'
import { buyUpgrade, repairStep, repairStepCost, upgradeCost } from '../../core/economy/garage'
import { fittedDeltas, upgradeLabel } from '../../core/economy/upgradeEffects'
import { effectiveCarSpec } from '../../core/vehicle/carSpec'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'

const MPH_PER_PX = 0.14

interface Tile {
  id: 'repair' | 'engine' | 'tires' | 'armor' | 'market' | 'buycar' | 'race'
  label: string
}

const TILES: Tile[] = [
  { id: 'repair', label: 'REPAIR' },
  { id: 'engine', label: 'ENGINE' },
  { id: 'tires', label: 'TIRES' },
  { id: 'armor', label: 'ARMOR' },
  { id: 'market', label: 'MARKET' },
  { id: 'buycar', label: 'BUY CAR' },
  { id: 'race', label: 'RACE' },
]

const FLAVOR = [
  'The mechanic wipes his hands on your invoice.',
  'Everything here is street legal somewhere.',
  'Warranty void the moment you leave the garage. And also before that.',
  'Fresh paint hides old sins.',
]

/** The three stat bars, and where each reads from the effective car spec. */
const BAR_STATS = ['topSpeed', 'accel', 'grip'] as const
type BarStat = (typeof BAR_STATS)[number]

export class GarageScene extends Phaser.Scene {
  private career!: CareerState
  private selected = 0

  private carImage!: Phaser.GameObjects.Image
  private carNameText!: Phaser.GameObjects.Text
  private infoText!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private pipsGfx!: Phaser.GameObjects.Graphics
  private compareGfx!: Phaser.GameObjects.Graphics
  private tileTexts: Phaser.GameObjects.Text[] = []
  private tileRects: Phaser.GameObjects.Rectangle[] = []
  private fittedTexts: Phaser.GameObjects.Text[] = []
  /** animated bar fills, tweened toward the real ratios after a purchase */
  private barFill: Record<BarStat, number> = { topSpeed: 0, accel: 0, grip: 0 }

  constructor() {
    super('Garage')
  }

  create() {
    this.career = loadCareer()
    this.selected = 0
    this.tileTexts = []
    this.tileRects = []
    this.fittedTexts = []

    const cx = GAME_WIDTH / 2

    this.add
      .text(cx, 70, 'THE GARAGE', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)

    // car display
    this.carImage = this.add.image(cx - 200, 340, `car-${this.career.carId}`).setScale(2.6)
    this.carNameText = this.add
      .text(cx - 200, 470, '', { fontFamily: 'monospace', fontSize: '30px', color: '#e8e8f0' })
      .setOrigin(0.5)

    // your car's stat bars, with the exact gain each fitted upgrade bought you
    this.compareGfx = this.add.graphics()
    const statLabels = ['SPEED', 'ACCEL', 'GRIP']
    statLabels.forEach((label, row) => {
      this.add.text(cx - 470, 496 + row * 30, label.padEnd(6), {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#9aa0ac',
      })
      this.fittedTexts.push(
        this.add.text(cx + 10, 496 + row * 30, '', {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#7fe0a8',
        }),
      )
    })

    // center info box
    this.infoText = this.add
      .text(cx - 200, 600, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#c8c8d4',
        align: 'center',
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5, 0)

    // right "character sheet" panel
    this.add.rectangle(GAME_WIDTH - 250, 430, 400, 560, 0x0c0c14, 0.85).setStrokeStyle(2, 0xf2a33c, 0.6)
    this.statsText = this.add.text(GAME_WIDTH - 420, 180, '', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#e8e8f0',
      lineSpacing: 10,
    })
    this.pipsGfx = this.add.graphics()

    // pip row labels. These live in create(), not refresh(): scene `data`
    // survives a scene restart, so a "create once" guard there would skip
    // them on every visit after the first.
    ;(['engine', 'tires', 'armor'] as UpgradeKind[]).forEach((kind, row) => {
      this.add.text(GAME_WIDTH - 420, 470 + row * 34, kind.toUpperCase().padEnd(6), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9aa0ac',
      })
    })

    // tiles
    const tileW = 200
    const totalW = TILES.length * tileW + (TILES.length - 1) * 16
    TILES.forEach((tile, i) => {
      const x = cx - totalW / 2 + i * (tileW + 16) + tileW / 2
      const rect = this.add
        .rectangle(x, GAME_HEIGHT - 150, tileW, 90, 0x14141c, 0.95)
        .setStrokeStyle(3, 0x3a3a46, 1)
      const text = this.add
        .text(x, GAME_HEIGHT - 150, tile.label, {
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

    this.add.text(16, 16, '←/→ select · Enter confirm · Esc menu', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8e8f0',
      backgroundColor: '#000000aa',
      padding: { x: 10, y: 6 },
    })

    const kb = this.input.keyboard!
    kb.on('keydown-LEFT', () => this.moveSelection(-1))
    kb.on('keydown-RIGHT', () => this.moveSelection(1))
    kb.on('keydown-ENTER', () => this.activate())
    kb.on('keydown-ESC', () => this.scene.start('Menu'))
    this.events.on('shutdown', () => {
      kb.off('keydown-LEFT')
      kb.off('keydown-RIGHT')
      kb.off('keydown-ENTER')
      kb.off('keydown-ESC')
    })

    // bars start full so the first paint is not an animation from zero
    this.barFill = this.targetBarFills()
    this.refresh()
  }

  private moveSelection(dir: number) {
    this.selected = (this.selected + dir + TILES.length) % TILES.length
    this.refresh()
  }

  private activate() {
    const tile = TILES[this.selected]
    let next: CareerState | null = null
    switch (tile.id) {
      case 'repair':
        next = repairStep(this.career)
        break
      case 'engine':
      case 'tires':
      case 'armor':
        next = buyUpgrade(this.career, tile.id)
        break
      case 'market':
        this.scene.start('BlackMarket')
        return
      case 'buycar':
        this.scene.start('CarDealer')
        return
      case 'race':
        this.scene.start('SignUp')
        return
    }
    if (next) {
      this.career = next
      saveCareer(this.career)
      this.animateBars()
      this.refresh()
    }
  }

  /** Where each bar should sit for the car as it stands right now. */
  private targetBarFills(): Record<BarStat, number> {
    const spec = effectiveCarSpec(carById(this.career.carId), this.career.upgrades)
    return {
      topSpeed: this.ratio('topSpeed', spec.topSpeed),
      accel: this.ratio('accel', spec.accel),
      grip: this.ratio('grip', spec.grip),
    }
  }

  /** Slide the bars to their new value so an upgrade is something you SEE. */
  private animateBars() {
    const target = this.targetBarFills()
    for (const stat of BAR_STATS) {
      this.tweens.addCounter({
        from: this.barFill[stat],
        to: target[stat],
        duration: 450,
        ease: 'cubic.out',
        onUpdate: (tween) => {
          this.barFill[stat] = tween.getValue() ?? target[stat]
          this.drawBars()
        },
      })
    }
  }

  /**
   * Catalog stats live in a narrow band, so spread min..max across the bar
   * (with a floor so the cheapest car isn't an empty bar). Fully upgraded
   * cars can exceed the catalog max, so the ratio is clamped at 1.
   */
  private ratio(stat: BarStat, value: number): number {
    const values = CAR_CATALOG.map((car) => car[stat])
    const min = Math.min(...values)
    const max = Math.max(...values)
    return Phaser.Math.Clamp(0.08 + 0.92 * ((value - min) / (max - min)), 0, 1)
  }

  private tileCaption(tile: Tile): { cost: string; info: string; enabled: boolean } {
    const c = this.career
    switch (tile.id) {
      case 'repair': {
        if (c.damage <= 0) return { cost: '', info: 'No damage. The bodywork gleams, suspiciously.', enabled: false }
        const cost = repairStepCost(c.damage)
        return {
          cost: `$${cost}`,
          info: `Fix ${Math.min(REPAIR_STEP_PERCENT, c.damage)}% of damage for $${cost}. Damage carries into the next race.`,
          enabled: c.cash >= cost,
        }
      }
      case 'engine':
      case 'tires':
      case 'armor': {
        const kind = tile.id as UpgradeKind
        const cost = upgradeCost(c, kind)
        const cap = carById(c.carId).upgradeCaps[kind]
        if (cost === null) {
          const fitted = fittedDeltas(kind, c.upgrades[kind])
            .map((d) => `${d.stat} ${d.text}`)
            .join(' · ')
          return { cost: 'MAX', info: `Maxed out at tier ${cap}. Fitted: ${fitted}`, enabled: false }
        }
        // the exact effect, computed from the data table — never a stale string
        return {
          cost: `$${cost}`,
          info: `${upgradeLabel(kind, c.upgrades[kind])}\n(tier ${c.upgrades[kind] + 1} of ${cap}) · $${cost}`,
          enabled: c.cash >= cost,
        }
      }
      case 'market': {
        const gear: string[] = []
        if (c.mines > 0) gear.push(`${c.mines} mines`)
        if (c.ramPlating) gear.push('plating')
        if (c.overTurbo) gear.push('overcharge')
        if (c.sabotage) gear.push('sabotage')
        const carrying = gear.length > 0 ? ` Carrying: ${gear.join(', ')}.` : ''
        const loan = c.loan ? ` LOAN DUE: $${c.loan.owed} in ${c.loan.racesLeft}.` : ''
        return {
          cost: '',
          info: `The black market: mines, plating, overcharged fuel, sabotage — and a loanshark.${carrying}${loan}`,
          enabled: true,
        }
      }
      case 'buycar':
        return {
          cost: '',
          info: 'The dealer: browse all six chassis side by side against the one you drive.',
          enabled: true,
        }
      case 'race':
        return { cost: '', info: 'Head to race sign-up: three races on offer, pick your risk tier.', enabled: true }
    }
  }

  private refresh() {
    const c = this.career
    const showing = carById(c.carId)
    this.carImage.setTexture(`car-${showing.id}`)
    this.carNameText.setText(`${showing.name}  (yours)`)

    TILES.forEach((tile, i) => {
      const { cost, enabled } = this.tileCaption(tile)
      const selected = i === this.selected
      this.tileRects[i].setStrokeStyle(3, selected ? 0xf2a33c : 0x3a3a46, 1)
      this.tileRects[i].setFillStyle(selected ? 0x1c1c26 : 0x14141c, 0.95)
      this.tileTexts[i].setText(cost ? `${tile.label}\n${cost}` : tile.label)
      this.tileTexts[i].setColor(enabled ? (selected ? '#f2a33c' : '#e8e8f0') : '#55555f')
    })

    this.infoText.setText(this.tileCaption(TILES[this.selected]).info)

    this.drawBars()

    // what each fitted upgrade actually bought, straight off the data table
    const fittedFor: Record<BarStat, UpgradeKind> = { topSpeed: 'engine', accel: 'engine', grip: 'tires' }
    const statOf: Record<BarStat, string> = { topSpeed: 'TOP SPEED', accel: 'ACCEL', grip: 'GRIP' }
    BAR_STATS.forEach((stat, row) => {
      const delta = fittedDeltas(fittedFor[stat], c.upgrades[fittedFor[stat]]).find((d) => d.stat === statOf[stat])
      this.fittedTexts[row].setText(delta ? delta.text : '')
    })

    const spec = effectiveCarSpec(carById(c.carId), c.upgrades)
    this.statsText.setText(
      [
        `CASH      $${c.cash}`,
        `CAR       ${carById(c.carId).name}`,
        `TOP SPEED ${Math.round(spec.topSpeed * MPH_PER_PX)} mph`,
        `DAMAGE    ${c.damage}%`,
        ``,
        `POINTS    ${c.points}`,
        `RACES     ${c.racesRun}`,
        `WINS      ${c.wins}`,
      ].join('\n'),
    )

    // upgrade pips: owned vs cap for the owned car
    this.pipsGfx.clear()
    ;(['engine', 'tires', 'armor'] as UpgradeKind[]).forEach((kind, row) => {
      const cap = carById(c.carId).upgradeCaps[kind]
      const owned = c.upgrades[kind]
      const y = 470 + row * 34
      for (let t = 0; t < cap; t++) {
        this.pipsGfx.fillStyle(t < owned ? 0xf2a33c : 0x33333e, 1)
        this.pipsGfx.fillRect(GAME_WIDTH - 260 + t * 26, y, 20, 20)
      }
    })
  }

  /** Bars for the car as it stands, drawn from the animated fill values. */
  private drawBars() {
    const barX = GAME_WIDTH / 2 - 380
    const barW = 360
    this.compareGfx.clear()
    BAR_STATS.forEach((stat, row) => {
      const y = 500 + row * 30
      this.compareGfx.fillStyle(0x2a2a33, 1)
      this.compareGfx.fillRect(barX, y, barW, 12)
      this.compareGfx.fillStyle(0xf2a33c, 1)
      this.compareGfx.fillRect(barX, y, barW * this.barFill[stat], 12)
    })
  }
}
