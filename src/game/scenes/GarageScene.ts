import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG, carById } from '../../data/cars'
import { REPAIR_STEP_PERCENT, type UpgradeKind } from '../../data/economy'
import {
  buyCar,
  buyMines,
  buyUpgrade,
  carNetPrice,
  repairStep,
  repairStepCost,
  upgradeCost,
} from '../../core/economy/garage'
import { MINES } from '../../data/weapons'
import { effectiveCarSpec } from '../../core/vehicle/carSpec'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'

const MPH_PER_PX = 0.14

interface Tile {
  id: 'repair' | 'engine' | 'tires' | 'armor' | 'mines' | 'buycar' | 'race'
  label: string
}

const TILES: Tile[] = [
  { id: 'repair', label: 'REPAIR' },
  { id: 'engine', label: 'ENGINE' },
  { id: 'tires', label: 'TIRES' },
  { id: 'armor', label: 'ARMOR' },
  { id: 'mines', label: 'MINES' },
  { id: 'buycar', label: 'BUY CAR' },
  { id: 'race', label: 'RACE' },
]

const FLAVOR = [
  'The mechanic wipes his hands on your invoice.',
  'Everything here is street legal somewhere.',
  'Warranty void the moment you leave the garage. And also before that.',
  'Fresh paint hides old sins.',
]

export class GarageScene extends Phaser.Scene {
  private career!: CareerState
  private selected = 0
  private previewCarIdx = 0

  private carImage!: Phaser.GameObjects.Image
  private carNameText!: Phaser.GameObjects.Text
  private infoText!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private pipsGfx!: Phaser.GameObjects.Graphics
  private tileTexts: Phaser.GameObjects.Text[] = []
  private tileRects: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('Garage')
  }

  create() {
    this.career = loadCareer()
    this.selected = 0
    this.tileTexts = []
    this.tileRects = []
    this.previewCarIdx = CAR_CATALOG.findIndex((c) => c.id === this.career.carId)

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

    // center info box
    this.infoText = this.add
      .text(cx - 200, 580, '', {
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

    this.add.text(16, 16, '←/→ select · ↑/↓ browse cars · Enter confirm · Esc menu', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8e8f0',
      backgroundColor: '#000000aa',
      padding: { x: 10, y: 6 },
    })

    const kb = this.input.keyboard!
    kb.on('keydown-LEFT', () => this.moveSelection(-1))
    kb.on('keydown-RIGHT', () => this.moveSelection(1))
    kb.on('keydown-UP', () => this.browseCar(1))
    kb.on('keydown-DOWN', () => this.browseCar(-1))
    kb.on('keydown-ENTER', () => this.activate())
    kb.on('keydown-ESC', () => this.scene.start('Menu'))
    this.events.on('shutdown', () => {
      kb.off('keydown-LEFT')
      kb.off('keydown-RIGHT')
      kb.off('keydown-UP')
      kb.off('keydown-DOWN')
      kb.off('keydown-ENTER')
      kb.off('keydown-ESC')
    })

    this.refresh()
  }

  private moveSelection(dir: number) {
    this.selected = (this.selected + dir + TILES.length) % TILES.length
    if (TILES[this.selected].id !== 'buycar') {
      this.previewCarIdx = CAR_CATALOG.findIndex((c) => c.id === this.career.carId)
    }
    this.refresh()
  }

  private browseCar(dir: number) {
    if (TILES[this.selected].id !== 'buycar') return
    this.previewCarIdx = (this.previewCarIdx + dir + CAR_CATALOG.length) % CAR_CATALOG.length
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
      case 'mines':
        next = buyMines(this.career)
        break
      case 'buycar': {
        const target = CAR_CATALOG[this.previewCarIdx]
        next = buyCar(this.career, target.id)
        break
      }
      case 'race':
        this.scene.start('Race')
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
        if (cost === null) return { cost: 'MAX', info: 'This chassis is maxed out on that part.', enabled: false }
        const blurbs: Record<UpgradeKind, string> = {
          engine: 'More top speed and acceleration.',
          tires: 'More grip — corners stop being suggestions.',
          armor: 'Take less damage from bullets, rams, and walls.',
        }
        return {
          cost: `$${cost}`,
          info: `Tier ${c.upgrades[kind] + 1}/${carById(c.carId).upgradeCaps[kind]}: ${blurbs[kind]}`,
          enabled: c.cash >= cost,
        }
      }
      case 'mines': {
        if (c.mines > 0) {
          return {
            cost: 'STOCKED',
            info: `${c.mines} mines strapped on for the next race. Drop them behind you with C.`,
            enabled: false,
          }
        }
        return {
          cost: `$${MINES.price}`,
          info: `${MINES.count} proximity mines, dropped behind your car (C key). One race only — used or not.`,
          enabled: c.cash >= MINES.price,
        }
      }
      case 'buycar': {
        const target = CAR_CATALOG[this.previewCarIdx]
        if (target.id === c.carId) return { cost: '', info: 'You already drive this one. Browse with ↑/↓.', enabled: false }
        const net = carNetPrice(c, target.id)
        return {
          cost: `$${net}`,
          info: `${target.name}: ${target.blurb} $${target.price} minus trade-in = $${net}. Upgrades do not transfer.`,
          enabled: c.cash >= net,
        }
      }
      case 'race':
        return { cost: '', info: 'Sign up for the next race. Prize money for the top three.', enabled: true }
    }
  }

  private refresh() {
    const c = this.career
    const showing = TILES[this.selected].id === 'buycar' ? CAR_CATALOG[this.previewCarIdx] : carById(c.carId)
    this.carImage.setTexture(`car-${showing.id}`)
    this.carNameText.setText(
      showing.id === c.carId ? `${showing.name}  (yours)` : `${showing.name}  —  $${showing.price}`,
    )

    TILES.forEach((tile, i) => {
      const { cost, enabled } = this.tileCaption(tile)
      const selected = i === this.selected
      this.tileRects[i].setStrokeStyle(3, selected ? 0xf2a33c : 0x3a3a46, 1)
      this.tileRects[i].setFillStyle(selected ? 0x1c1c26 : 0x14141c, 0.95)
      this.tileTexts[i].setText(cost ? `${tile.label}\n${cost}` : tile.label)
      this.tileTexts[i].setColor(enabled ? (selected ? '#f2a33c' : '#e8e8f0') : '#55555f')
    })

    this.infoText.setText(this.tileCaption(TILES[this.selected]).info)

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
    const kinds: UpgradeKind[] = ['engine', 'tires', 'armor']
    kinds.forEach((kind, row) => {
      const cap = carById(c.carId).upgradeCaps[kind]
      const owned = c.upgrades[kind]
      const y = 470 + row * 34
      for (let t = 0; t < cap; t++) {
        this.pipsGfx.fillStyle(t < owned ? 0xf2a33c : 0x33333e, 1)
        this.pipsGfx.fillRect(GAME_WIDTH - 260 + t * 26, y, 20, 20)
      }
    })
    // pip labels drawn as part of statsText would misalign; add tiny labels once
    if (!this.data.get('pipLabels')) {
      this.data.set('pipLabels', true)
      kinds.forEach((kind, row) => {
        this.add.text(GAME_WIDTH - 420, 470 + row * 34, kind.toUpperCase().padEnd(6), {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#9aa0ac',
        })
      })
    }
  }
}
