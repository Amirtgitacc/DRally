import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { CAR_CATALOG, carById } from '../../data/cars'
import { REPAIR_STEP_PERCENT, type UpgradeKind } from '../../data/economy'
import { buyUpgrade, repairStep, repairStepCost, upgradeCost } from '../../core/economy/garage'
import { fittedDeltas, upgradeLabel } from '../../core/economy/upgradeEffects'
import { effectiveCarSpec } from '../../core/vehicle/carSpec'
import type { CareerState } from '../../core/progression/career'
import { loadCareer, saveCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import {
  fitImage,
  flavor,
  hazardBar,
  heading,
  hintBar,
  metalGrain,
  panel,
  pips,
  rule,
  sectionLabel,
  statBar,
  text,
  tile,
  type TileHandle,
} from '../ui/widgets'

const MPH_PER_PX = 0.14

/**
 * Layout spine. The scene used to scatter magic offsets around `cx`; these are
 * the two axes everything actually hangs off.
 */
const LX = 620 // left column: car, name, bars, info all centre here
const PANEL_X = 1670
const PANEL_Y = 400
const PANEL_W = 400
const PANEL_H = 480
const PANEL_LEFT = PANEL_X - PANEL_W / 2 + 50

const BAR_W = 340
const BAR_X = LX - BAR_W / 2 // bar track centres on the car above it

/** Middle column: what you drive, and what you're carrying into the next race. */
const MID_X = 1150
const CARD_W = 520
const CARD_LEFT = MID_X - CARD_W / 2 + 30
const CARD_RIGHT = MID_X + CARD_W / 2 - 30
const LOADOUT_TOP = 570
const LOADOUT_STEP = 34
const BAR_TOP = 520
const BAR_STEP = 35

const PIP_TOP = 500
const PIP_STEP = 40

const TILE_Y = 880
const TILE_H = 96
const TILE_W = 180
const RACE_W = 240
const TILE_GAP = 12
const GROUP_GAP = 40

/** `group` drives the gaps in the tile row: buying, then navigating, then racing. */
interface Tile {
  id: 'repair' | 'engine' | 'tires' | 'armor' | 'market' | 'buycar' | 'race'
  label: string
  group: 'buy' | 'nav' | 'go'
}

const TILES: Tile[] = [
  { id: 'repair', label: 'REPAIR', group: 'buy' },
  { id: 'engine', label: 'ENGINE', group: 'buy' },
  { id: 'tires', label: 'TIRES', group: 'buy' },
  { id: 'armor', label: 'ARMOR', group: 'buy' },
  { id: 'market', label: 'MARKET', group: 'nav' },
  { id: 'buycar', label: 'BUY CAR', group: 'nav' },
  { id: 'race', label: 'RACE', group: 'go' },
]

/** Lay the row out once: widths differ, and groups are separated by a wider gap. */
function tileLayout(): Array<{ x: number; w: number }> {
  const widths: number[] = TILES.map((t) => (t.id === 'race' ? RACE_W : TILE_W))
  const gaps: number[] = TILES.map((t, i) =>
    i === TILES.length - 1 ? 0 : TILES[i + 1].group !== t.group ? GROUP_GAP : TILE_GAP,
  )
  const total = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0)

  let cursor = (GAME_WIDTH - total) / 2
  return widths.map((w, i) => {
    const x = cursor + w / 2
    cursor += w + gaps[i]
    return { x, w }
  })
}

/** Race-affecting gear, always on screen — it used to hide inside the MARKET tile caption. */
const LOADOUT_ROWS = ['MINES', 'RAM PLATING', 'OVERCHARGE', 'SABOTAGE', 'LOANSHARK'] as const

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
  private tiles: TileHandle[] = []
  private fittedTexts: Phaser.GameObjects.Text[] = []
  private blurbText!: Phaser.GameObjects.Text
  private massText!: Phaser.GameObjects.Text
  private capsText!: Phaser.GameObjects.Text
  private loadoutValues: Phaser.GameObjects.Text[] = []
  /** animated bar fills, tweened toward the real ratios after a purchase */
  private barFill: Record<BarStat, number> = { topSpeed: 0, accel: 0, grip: 0 }

  constructor() {
    super('Garage')
  }

  create() {
    this.career = loadCareer()
    metalGrain(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0.05).setDepth(-100)
    this.selected = 0
    this.tiles = []
    this.fittedTexts = []
    this.loadoutValues = []

    const cx = GAME_WIDTH / 2

    heading(this, cx, 70, 'THE GARAGE')
    hazardBar(this, cx - 240, 108, 480)

    // car display — the left column's anchor
    this.carImage = this.add.image(LX, 320, `car-hero-${this.career.carId}`)
    fitImage(this.carImage, 520, 300)
    this.carNameText = text(this, LX, 470, '', { size: 'subtitle', origin: [0.5, 0.5] })

    // your car's stat bars, with the exact gain each fitted upgrade bought you
    this.compareGfx = this.add.graphics()
    const statLabels = ['SPEED', 'ACCEL', 'GRIP']
    statLabels.forEach((label, row) => {
      const y = BAR_TOP + row * BAR_STEP
      text(this, BAR_X - 90, y - 4, label, { size: 'label', color: C.textSecondary })
      this.fittedTexts.push(text(this, BAR_X + BAR_W + 20, y - 4, '', { size: 'label', color: C.money }))
    })

    // info box, directly under the bars it describes. The wrap width is bounded
    // by the CHASSIS card's left edge — 660 ran text underneath it.
    this.infoText = text(this, LX, 650, '', {
      size: 'body',
      color: C.textBody,
      align: 'center',
      wordWrapWidth: 520,
      origin: [0.5, 0],
    })

    // ---- middle column: chassis dossier ----
    panel(this, MID_X, 330, CARD_W, 300, { stroke: C.border, strokeAlpha: 1 })
    sectionLabel(this, CARD_LEFT, 205, 'CHASSIS')
    this.blurbText = text(this, CARD_LEFT, 248, '', {
      size: 'caption',
      color: C.textBody,
      wordWrapWidth: CARD_W - 60,
      lineSpacing: 6,
    })
    rule(this, CARD_LEFT, CARD_RIGHT, 358)
    text(this, CARD_LEFT, 375, 'MASS', { size: 'label', color: C.textSecondary })
    this.massText = text(this, CARD_LEFT + 180, 375, '', { size: 'label' })
    text(this, CARD_LEFT, 407, 'UPGRADE CAPS', { size: 'label', color: C.textSecondary })
    this.capsText = text(this, CARD_LEFT + 180, 407, '', { size: 'label' })

    // ---- middle column: what you carry into the next race ----
    panel(this, MID_X, 630, CARD_W, 260, { stroke: C.border, strokeAlpha: 1 })
    sectionLabel(this, CARD_LEFT, 525, 'LOADOUT')
    LOADOUT_ROWS.forEach((label, row) => {
      const y = LOADOUT_TOP + row * LOADOUT_STEP
      text(this, CARD_LEFT, y, label, { size: 'label', color: C.textSecondary })
      this.loadoutValues.push(text(this, CARD_LEFT + 180, y, '', { size: 'label' }))
    })

    // right "character sheet" panel — pips now live inside it
    panel(this, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
    this.statsText = text(this, PANEL_LEFT, 200, '', { size: 'body', lineSpacing: 10 })
    this.pipsGfx = this.add.graphics()

    rule(this, PANEL_LEFT, PANEL_X + PANEL_W / 2 - 50, PIP_TOP - 26)

    // pip row labels. These live in create(), not refresh(): scene `data`
    // survives a scene restart, so a "create once" guard there would skip
    // them on every visit after the first.
    ;(['engine', 'tires', 'armor'] as UpgradeKind[]).forEach((kind, row) => {
      text(this, PANEL_LEFT, PIP_TOP + row * PIP_STEP - 2, kind.toUpperCase(), {
        size: 'bodySm',
        color: C.textSecondary,
      })
    })

    // separates "what you own" from "what you do about it"
    rule(this, 260, GAME_WIDTH - 260, 790)

    const slots = tileLayout()
    TILES.forEach((def, i) => {
      const { x, w } = slots[i]
      const primary = def.group === 'go'
      this.tiles.push(
        tile(this, x, TILE_Y, w, TILE_H, def.label, {
          accent: primary ? C.oxideDim : undefined,
          face: primary ? 'display' : 'mono',
          weight: primary ? 600 : undefined,
          letterSpacing: primary ? 4 : undefined,
          size: primary ? 'subtitle' : 'action',
        }),
      )
    })

    flavor(this, cx, GAME_HEIGHT - 60, Phaser.Math.RND.pick(FLAVOR))

    hintBar(this, '←/→ select · Enter confirm · Esc menu')

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

  private tileCaption(def: Tile): { cost: string; info: string; enabled: boolean } {
    const c = this.career
    switch (def.id) {
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
        const kind = def.id as UpgradeKind
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
      // what you're carrying now lives permanently in the LOADOUT card, so the
      // caption only has to sell the shop.
      case 'market':
        return {
          cost: '',
          info: c.profile.weaponsEnabled ? 'The black market: mines, plating, overcharged fuel, sabotage — and a loanshark.' : 'Unavailable in a weapons-off career.',
          enabled: c.profile.weaponsEnabled,
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
    this.carImage.setTexture(`car-hero-${showing.id}`)
    fitImage(this.carImage, 520, 300)
    this.carNameText.setText(`${showing.name}  (yours)`)

    TILES.forEach((def, i) => {
      const { cost, enabled } = this.tileCaption(def)
      this.tiles[i].label.setText(cost ? `${def.label}\n${cost}` : def.label)
      this.tiles[i].setState(i === this.selected, enabled)
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

    // chassis dossier
    this.blurbText.setText(showing.blurb)
    this.massText.setText(`${showing.mass.toFixed(2)}×`)
    const caps = showing.upgradeCaps
    this.capsText.setText(`ENG ${caps.engine} · TIR ${caps.tires} · ARM ${caps.armor}`)

    // loadout: gear you are carrying, and the debt you are carrying with it
    const rows: Array<[string, number]> = [
      c.mines > 0 ? [`${c.mines}`, C.ammo] : ['—', C.textDisabled],
      c.ramPlating ? ['FITTED', C.money] : ['—', C.textDisabled],
      c.overTurbo ? ['FITTED', C.warn] : ['—', C.textDisabled],
      c.sabotage ? ['ARMED', C.danger] : ['—', C.textDisabled],
      c.loan ? [`$${c.loan.owed} · ${c.loan.racesLeft} races`, C.danger] : ['CLEAN', C.textDisabled],
    ]
    rows.forEach(([label, color], i) => {
      this.loadoutValues[i].setText(label).setColor(hex(color))
    })

    const spec = effectiveCarSpec(carById(c.carId), c.upgrades)
    this.statsText.setText(
      [
        `DRIVER    ${c.profile.driverName}`,
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
      pips(this.pipsGfx, PANEL_LEFT + 160, PIP_TOP + row * PIP_STEP, c.upgrades[kind], cap)
    })
  }

  /** Bars for the car as it stands, drawn from the animated fill values. */
  private drawBars() {
    this.compareGfx.clear()
    BAR_STATS.forEach((stat, row) => {
      statBar(this.compareGfx, BAR_X, BAR_TOP + row * BAR_STEP, BAR_W, 12, this.barFill[stat], C.oxide)
    })
  }
}
