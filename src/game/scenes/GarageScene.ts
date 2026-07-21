import Phaser from 'phaser'
import { CAR_CATALOG, carById } from '../../data/cars'
import { type UpgradeKind } from '../../data/economy'
import { buyUpgrade, repairStep, repairStepCost, upgradeCost } from '../../core/economy/garage'
import { effectiveCarSpec } from '../../core/vehicle/carSpec'
import { playerRank } from '../../core/progression/ladder'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage, type DeferredImageHandle } from '../ui/deferredImage'
import {
  backPlate, card, notchedButton, screenTitle, statusStrip, SAFE,
  type ButtonHandle, type StatusStripHandle,
} from '../ui/mobile'
import * as glyph from '../ui/glyphs'

const MPH_PER_PX = 0.14

/** The bottom action dock. `group` drives row placement + emphasis. */
interface Tile {
  id: 'repair' | 'engine' | 'tires' | 'armor' | 'market' | 'buycar' | 'livery' | 'race'
  label: string
  glyph: glyph.Glyph
  row: 0 | 1
}

const TILES: Tile[] = [
  { id: 'repair', label: 'REPAIR', glyph: glyph.wrench, row: 0 },
  { id: 'engine', label: 'ENGINE', glyph: glyph.engine, row: 0 },
  { id: 'tires', label: 'TIRES', glyph: glyph.tire, row: 0 },
  { id: 'armor', label: 'ARMOR', glyph: glyph.shield, row: 0 },
  { id: 'market', label: 'MARKET', glyph: glyph.cart, row: 1 },
  { id: 'buycar', label: 'BUY CAR', glyph: glyph.cart, row: 1 },
  { id: 'livery', label: 'LIVERY', glyph: glyph.spray, row: 1 },
  { id: 'race', label: 'RACE', glyph: glyph.flag, row: 1 },
]

const BAR_STATS = ['topSpeed', 'accel', 'grip'] as const
type BarStat = (typeof BAR_STATS)[number]
const BAR_LABEL: Record<BarStat, string> = { topSpeed: 'SPEED', accel: 'ACCEL', grip: 'GRIP' }

// left stat-card geometry
const LC_X = 270
const LC_Y = 470
const LC_W = 440
const LC_H = 396

export class GarageScene extends Phaser.Scene {
  private career!: CareerState
  private selected = 0

  private carImageHandle!: DeferredImageHandle
  private buttons: ButtonHandle[] = []
  private statBarGfx!: Phaser.GameObjects.Graphics
  private status!: StatusStripHandle
  private loadoutValues: Phaser.GameObjects.Text[] = []
  private chassisText!: Phaser.GameObjects.Text
  private carNameText!: Phaser.GameObjects.Text
  private barFill: Record<BarStat, number> = { topSpeed: 0, accel: 0, grip: 0 }

  constructor() {
    super('Garage')
  }

  create() {
    this.career = loadCareer()
    this.selected = TILES.findIndex((t) => t.id === 'race')
    this.buttons = []
    this.loadoutValues = []

    sceneBackground(this, 'bg-garage', { veil: 0.34 })

    screenTitle(this, 'THE GARAGE', { x: SAFE.left, y: 96 })
    const rankLabel = this.career.champion ? 'CHAMPION' : `RANK #${playerRank(this.career.ladder, this.career.points)}`
    this.status = statusStrip(this, this.career.profile.driverName.toUpperCase(), rankLabel, this.career.cash, {
      onSettings: () => this.scene.start('Settings', { from: 'Garage' }),
    })

    // hero car, floating centre
    this.carImageHandle = deferredImage(this, 940, 430, `car-hero-${this.career.carId}`, 640, 400)

    // left stat card: name + segmented SPEED/ACCEL/GRIP bars
    card(this, LC_X, LC_Y, LC_W, LC_H, undefined, { accent: C.oxideDim })
    this.carNameText = text(this, LC_X - LC_W / 2 + 26, LC_Y - LC_H / 2 + 34, '', {
      size: 'heading', face: 'display', weight: 700, letterSpacing: 1, color: C.textPrimary, origin: [0, 0.5],
    })
    this.statBarGfx = this.add.graphics()
    // stat-row labels, created once (drawStatBars only repaints the segments)
    const baseY = LC_Y - LC_H / 2 + 130
    BAR_STATS.forEach((stat, row) => {
      text(this, LC_X - LC_W / 2 + 26, baseY + row * 62, BAR_LABEL[stat], {
        size: 'label', face: 'display', weight: 600, letterSpacing: 1, color: C.textSecondary, origin: [0, 0.5],
      })
    })

    // right column — chassis + loadout cards
    card(this, 1636, 300, 420, 260, 'CHASSIS', { accent: C.oxideDim })
    this.chassisText = text(this, 1636 - 210 + 26, 300 + 8, '', {
      size: 'bodySm', face: 'mono', color: C.textBody, lineSpacing: 10, origin: [0, 0.5], wordWrapWidth: 360,
    })

    card(this, 1636, 604, 420, 300, 'LOADOUT', { accent: C.oxideDim })
    const loadoutRows = ['MINES', 'RAM PLATING', 'OVERCHARGE', 'SABOTAGE', 'LOANSHARK']
    loadoutRows.forEach((label, i) => {
      const ly = 604 - 150 + 74 + i * 44
      text(this, 1636 - 210 + 26, ly, label, { size: 'label', face: 'display', weight: 600, letterSpacing: 1, color: C.textSecondary, origin: [0, 0.5] })
      this.loadoutValues.push(text(this, 1636 + 210 - 26, ly, '', { size: 'bodySm', face: 'mono', origin: [1, 0.5] }))
    })

    // ---- bottom action dock (two rows) ----
    this.buildDock()

    backPlate(this, 'SINGLE PLAYER', () => this.scene.start('Menu'), { x: SAFE.left + 150, y: 920 })

    const kb = this.input.keyboard!
    const left = () => this.moveSelection(-1)
    const right = () => this.moveSelection(1)
    const up = () => this.moveRow(-1)
    const down = () => this.moveRow(1)
    const enter = () => this.activate()
    const esc = () => this.scene.start('Menu')
    kb.on('keydown-LEFT', left); kb.on('keydown-RIGHT', right)
    kb.on('keydown-UP', up); kb.on('keydown-DOWN', down)
    kb.on('keydown-ENTER', enter); kb.on('keydown-ESC', esc)
    this.events.once('shutdown', () => {
      kb.off('keydown-LEFT', left); kb.off('keydown-RIGHT', right)
      kb.off('keydown-UP', up); kb.off('keydown-DOWN', down)
      kb.off('keydown-ENTER', enter); kb.off('keydown-ESC', esc)
    })

    this.barFill = this.targetBarFills()
    this.refresh()
  }

  private buildDock() {
    // row 0: four upgrade actions, equal width, full safe span
    const r0w = (SAFE.width - 3 * 24) / 4
    for (let i = 0; i < 4; i++) {
      const t = TILES[i]
      const x = SAFE.left + r0w / 2 + i * (r0w + 24)
      this.buttons.push(notchedButton(this, x, 800, {
        w: r0w, h: 96, label: t.label, glyph: t.glyph, size: 'action', align: 'left', value: '',
        onFocus: () => { this.selected = i; this.refresh() },
        onActivate: () => { this.selected = i; this.activate() },
      }))
    }
    // row 1: back(handled separately) + MARKET, BUY CAR, LIVERY, RACE(dominant)
    // back plate occupies the far-left slot; the four actions fill the rest.
    const backW = 300
    const raceW = 470
    const midW = 300
    const gap = 24
    let cursor = SAFE.left + backW + gap
    const widths = [midW, midW, midW, raceW]
    for (let j = 0; j < 4; j++) {
      const idx = 4 + j
      const t = TILES[idx]
      const w = widths[j]
      const x = cursor + w / 2
      cursor += w + gap
      this.buttons.push(notchedButton(this, x, 920, {
        w, h: 96, label: t.label, glyph: t.glyph, size: t.id === 'race' ? 'title' : 'action',
        align: t.id === 'race' ? 'center' : 'left', variant: t.id === 'race' ? 'primary' : 'secondary',
        value: t.id === 'livery' ? '' : undefined,
        onFocus: () => { this.selected = idx; this.refresh() },
        onActivate: () => { this.selected = idx; this.activate() },
      }))
    }
  }

  private moveSelection(dir: number) {
    this.selected = (this.selected + dir + TILES.length) % TILES.length
    this.refresh()
  }

  /** Up/down jumps between the two dock rows, keeping horizontal position. */
  private moveRow(dir: number) {
    const cur = TILES[this.selected]
    const targetRow = Phaser.Math.Clamp(cur.row + dir, 0, 1) as 0 | 1
    if (targetRow === cur.row) return
    const rowStart = targetRow === 0 ? 0 : 4
    const colInRow = targetRow === 0 ? Math.min(this.selected, 3) : Math.min(this.selected - 0, 3)
    this.selected = rowStart + Phaser.Math.Clamp(colInRow, 0, 3)
    this.refresh()
  }

  private activate() {
    const def = TILES[this.selected]
    let next: CareerState | null = null
    switch (def.id) {
      case 'repair':
        next = repairStep(this.career)
        break
      case 'engine':
      case 'tires':
      case 'armor':
        next = buyUpgrade(this.career, def.id)
        break
      case 'market':
        if (!this.career.profile.weaponsEnabled) return
        this.scene.start('BlackMarket')
        return
      case 'buycar':
        this.scene.start('CarDealer')
        return
      case 'livery': {
        const car = carById(this.career.carId)
        if (car.variants.length <= 1) return
        const currentKey = this.career.liveries[this.career.carId] ?? 'base'
        const curIdx = Math.max(0, car.variants.findIndex((v) => v.key === currentKey))
        const nextKey = car.variants[(curIdx + 1) % car.variants.length].key
        next = { ...this.career, liveries: { ...this.career.liveries, [this.career.carId]: nextKey } }
        break
      }
      case 'race':
        this.scene.start('SignUp')
        return
    }
    if (next) {
      this.career = next
      saveCareer(this.career)
      this.status.setCash(this.career.cash)
      this.animateBars()
      this.refresh()
    }
  }

  private targetBarFills(): Record<BarStat, number> {
    const spec = effectiveCarSpec(carById(this.career.carId), this.career.upgrades)
    return {
      topSpeed: this.ratio('topSpeed', spec.topSpeed),
      accel: this.ratio('accel', spec.accel),
      grip: this.ratio('grip', spec.grip),
    }
  }

  private animateBars() {
    const target = this.targetBarFills()
    for (const stat of BAR_STATS) {
      this.tweens.addCounter({
        from: this.barFill[stat], to: target[stat], duration: 450, ease: 'cubic.out',
        onUpdate: (tween) => { this.barFill[stat] = tween.getValue() ?? target[stat]; this.drawStatBars() },
      })
    }
  }

  private ratio(stat: BarStat, value: number): number {
    const values = CAR_CATALOG.map((car) => car[stat])
    const min = Math.min(...values)
    const max = Math.max(...values)
    return Phaser.Math.Clamp(0.08 + 0.92 * ((value - min) / (max - min)), 0, 1)
  }

  /** Per-tile cost + affordability, straight off the data table. */
  private tileState(def: Tile): { value: string; valueColor: number; enabled: boolean } {
    const c = this.career
    switch (def.id) {
      case 'repair': {
        if (c.damage <= 0) return { value: 'OK', valueColor: C.textMuted, enabled: false }
        const cost = repairStepCost(c.damage)
        return { value: `$${cost}`, valueColor: c.cash >= cost ? C.money : C.danger, enabled: c.cash >= cost }
      }
      case 'engine':
      case 'tires':
      case 'armor': {
        const kind = def.id as UpgradeKind
        const cost = upgradeCost(c, kind)
        if (cost === null) return { value: 'MAX', valueColor: C.textMuted, enabled: false }
        return { value: `$${cost}`, valueColor: c.cash >= cost ? C.money : C.danger, enabled: c.cash >= cost }
      }
      case 'market':
        return { value: '', valueColor: C.money, enabled: c.profile.weaponsEnabled }
      case 'buycar':
        return { value: '', valueColor: C.money, enabled: true }
      case 'livery': {
        const car = carById(c.carId)
        return { value: '', valueColor: C.money, enabled: car.variants.length > 1 }
      }
      case 'race':
        return { value: '', valueColor: C.money, enabled: true }
    }
  }

  private refresh() {
    const c = this.career
    const showing = carById(c.carId)
    this.carImageHandle.setKey(`car-hero-${showing.id}`, 640, 400)
    this.carNameText.setText(showing.name.toUpperCase())

    this.buttons.forEach((btn, i) => {
      const def = TILES[i]
      const st = this.tileState(def)
      if (def.id === 'livery') {
        const currentKey = c.liveries[c.carId] ?? 'base'
        const label = showing.variants.find((v) => v.key === currentKey)?.label ?? 'Factory'
        btn.setValue(label.length > 12 ? label.slice(0, 12) : label, C.textSecondary)
      } else {
        btn.setValue(st.value, st.valueColor)
      }
      btn.setState({ selected: i === this.selected, enabled: st.enabled })
    })

    this.drawStatBars()

    // chassis dossier
    const caps = showing.upgradeCaps
    const spec = effectiveCarSpec(showing, c.upgrades)
    this.chassisText.setText([
      `MASS    ${showing.mass.toFixed(2)}×`,
      `TOP     ${Math.round(spec.topSpeed * MPH_PER_PX)} MPH`,
      `DAMAGE  ${c.damage}%`,
      `ENGINE  ${c.upgrades.engine}/${caps.engine}`,
      `TIRES   ${c.upgrades.tires}/${caps.tires}`,
      `ARMOR   ${c.upgrades.armor}/${caps.armor}`,
    ].join('\n'))

    // loadout
    const rows: Array<[string, number]> = [
      c.mines > 0 ? [`${c.mines}`, C.ammo] : ['NONE', C.textMuted],
      c.ramPlating ? ['FITTED', C.money] : ['NONE', C.textMuted],
      c.overTurbo ? ['FITTED', C.warn] : ['NONE', C.textMuted],
      c.sabotage ? ['ARMED', C.danger] : ['NONE', C.textMuted],
      c.loan ? [`$${c.loan.owed}·${c.loan.racesLeft}R`, C.danger] : ['CLEAN', C.textMuted],
    ]
    rows.forEach(([label, color], i) => this.loadoutValues[i].setText(label).setColor(hex(color)))
  }

  private drawStatBars() {
    const g = this.statBarGfx
    g.clear()
    const barX = LC_X - LC_W / 2 + 130
    const barW = LC_W - 130 - 40
    const baseY = LC_Y - LC_H / 2 + 130
    const n = 8
    const gap = 5
    const segW = (barW - gap * (n - 1)) / n
    BAR_STATS.forEach((stat, row) => {
      const y = baseY + row * 62
      const filled = Math.round(this.barFill[stat] * n)
      for (let i = 0; i < n; i++) {
        g.fillStyle(i < filled ? C.oxide : C.surfaceTrack, i < filled ? 1 : 0.7)
        g.fillRect(barX + i * (segW + gap), y - 9, segW, 18)
      }
    })
  }
}
