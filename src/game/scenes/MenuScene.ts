import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { playerRank } from '../../core/progression/ladder'
import { carById } from '../../data/cars'
import { audioBus } from '../systems/audio'
import { hasSavedCareer, readCareer } from '../state/saveGame'
import { loadSettings } from '../state/settings'
import { C, hex } from '../ui/theme'
import { flavor, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { BackgroundTransform, artToCanvas } from '../ui/backgroundTransform'

interface MenuItem {
  label: string
  scene: string
  data?: object
  needsCareer?: boolean
}

// The bg-menu art bakes the title, hero car and eight empty menu plates plus a
// lower-left career plate. These are ART-SPACE coordinates (measured directly
// against menu-peykan-background.webp), mapped through the background's cover
// transform at runtime so the live labels/focus rects can never drift from the
// baked plates — values stay live. The plates are hand-authored, so their pitch
// is intentionally uneven rather than a fixed stride.
const PLATE_ART_X = 1580
const PLATE_ART_W = 590
const PLATE_ART_H = 76
const PLATE_ART_Y = [224, 323, 412, 505, 595, 688, 779, 874]
/** Lower-left career plate (art-space x). */
const CAREER_ART_X = 275

interface MenuHandle {
  focus: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  setState(selected: boolean, enabled: boolean): void
}

const ITEMS: MenuItem[] = [
  { label: 'CONTINUE CAREER', scene: 'Garage', needsCareer: true },
  { label: 'NEW CAREER', scene: 'Profile', data: { replace: true } },
  { label: 'VENUES', scene: 'Venues' },
  { label: 'CHAMPIONSHIP LADDER', scene: 'Ranking', needsCareer: true },
  { label: 'HALL OF FAME', scene: 'HallOfFame', needsCareer: true },
  { label: 'SETTINGS / CONTROLS', scene: 'Settings' },
  { label: 'CREDITS', scene: 'Credits' },
  { label: 'MULTIPLAYER', scene: 'Multiplayer' },
]

export class MenuScene extends Phaser.Scene {
  private selected = 0
  private handles: MenuHandle[] = []
  private saved = false
  private bgTransform: BackgroundTransform = { scale: 1, offsetX: 0, offsetY: 0 }

  constructor() {
    super('Menu')
  }

  create() {
    audioBus.applySettings(loadSettings())
    const career = readCareer()
    this.saved = hasSavedCareer() && career !== null
    if (!this.saved || !career) {
      this.scene.start('Profile', { firstLaunch: true })
      return
    }
    this.selected = 0
    this.handles = []
    const cx = GAME_WIDTH / 2

    // The art already carries the title, hero car and empty plates — no live copies.
    // Grab its cover transform so every overlay maps from the same art-space the
    // plates were baked in (art is 1920×1080 today → identity, but this stays
    // correct if the source art is ever re-authored at a different size).
    const bg = sceneBackground(this, 'bg-menu', { veil: 0 })
    this.bgTransform = bg.transform()

    // faint drifting haze for life; kept above the art, below all UI
    this.add
      .particles(0, 0, 'smoke', {
        x: { min: 0, max: GAME_WIDTH }, y: { min: 0, max: GAME_HEIGHT },
        speedX: { min: 8, max: 30 }, speedY: { min: -4, max: 4 },
        scale: { start: 1.6, end: 2.6 }, alpha: { start: 0.04, end: 0 },
        lifespan: 9000, frequency: 400, tint: 0x2a2a3a,
      })
      .setDepth(-50)

    // live player identity, seated inside the lower-left career plate
    const rank = career.champion ? 'CHAMPION' : `Rank #${playerRank(career.ladder, career.points)}`
    const nameAt = artToCanvas(this.bgTransform, CAREER_ART_X, 742)
    const statsAt = artToCanvas(this.bgTransform, CAREER_ART_X, 800)
    text(this, nameAt.x, nameAt.y, career.profile.driverName, {
      size: 'subtitle', origin: [0.5, 0], color: career.champion ? C.gold : C.oxide,
    })
    text(this, statsAt.x, statsAt.y, [
      `${rank} · ${carById(career.carId).name}`,
      `$${career.cash} · ${career.points} pts`,
      `${career.wins} wins / ${career.racesRun} starts`,
    ].join('\n'), {
      size: 'body', align: 'center', lineSpacing: 10, origin: [0.5, 0], color: C.textBody,
    })

    // live labels + focus over the eight empty right-side plates (no opaque tiles)
    ITEMS.forEach((item, i) => this.handles.push(this.makePlate(i, item.label)))

    flavor(this, cx, GAME_HEIGHT - 42, '↑/↓ navigate · Enter select · V venues · L ladder · N new career · M multiplayer')

    const kb = this.input.keyboard!
    const up = () => this.move(-1)
    const down = () => this.move(1)
    const enter = () => this.activate()
    const venues = () => this.scene.start('Venues')
    const ladder = () => this.scene.start('Ranking')
    const fresh = () => this.scene.start('Profile', { replace: true })
    const multi = () => this.scene.start('Multiplayer')
    kb.once('keydown', () => audioBus.unlock())
    kb.on('keydown-UP', up)
    kb.on('keydown-DOWN', down)
    kb.on('keydown-ENTER', enter)
    kb.on('keydown-V', venues)
    kb.on('keydown-L', ladder)
    kb.on('keydown-N', fresh)
    kb.on('keydown-M', multi)
    this.events.once('shutdown', () => {
      kb.off('keydown-UP', up); kb.off('keydown-DOWN', down); kb.off('keydown-ENTER', enter)
      kb.off('keydown-V', venues); kb.off('keydown-L', ladder); kb.off('keydown-N', fresh); kb.off('keydown-M', multi)
    })
    this.refresh()
  }

  /** One menu row: a transparent, plate-aligned focus rect plus a live label. */
  private makePlate(i: number, label: string): MenuHandle {
    // Map the authored art-space plate onto canvas space through the background's
    // cover transform, so rect + label sit exactly over the baked plate.
    const { x, y } = artToCanvas(this.bgTransform, PLATE_ART_X, PLATE_ART_Y[i])
    const w = PLATE_ART_W * this.bgTransform.scale
    const h = PLATE_ART_H * this.bgTransform.scale
    // fillAlpha 0 keeps the authored plate visible; the rect is still hit-testable
    const focus = this.add
      .rectangle(x, y, w, h, C.oxide, 0)
      .setInteractive({ useHandCursor: true })
    focus.on('pointerover', () => { this.selected = i; this.refresh() })
    focus.on('pointerup', () => { this.selected = i; this.activate() })
    const labelText = text(this, x, y, label, { size: 'action', origin: [0.5, 0.5], align: 'center' })
    return {
      focus,
      label: labelText,
      setState(selected: boolean, enabled: boolean) {
        focus.setStrokeStyle(selected ? 3 : 0, C.oxide, 1)
        focus.setFillStyle(C.oxide, selected ? 0.14 : 0)
        labelText.setColor(hex(enabled ? (selected ? C.oxide : C.textPrimary) : C.textDisabled))
      },
    }
  }

  private move(delta: number) {
    this.selected = (this.selected + delta + ITEMS.length) % ITEMS.length
    this.refresh()
  }

  private refresh() {
    ITEMS.forEach((item, i) => this.handles[i].setState(i === this.selected, !item.needsCareer || this.saved))
  }

  private activate() {
    const item = ITEMS[this.selected]
    if (item.needsCareer && !this.saved) return
    this.scene.start(item.scene, item.data)
  }
}
