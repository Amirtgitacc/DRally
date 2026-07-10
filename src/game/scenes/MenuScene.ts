import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { playerRank } from '../../core/progression/ladder'
import { carById } from '../../data/cars'
import { audioBus } from '../systems/audio'
import { hasSavedCareer, readCareer } from '../state/saveGame'
import { loadSettings } from '../state/settings'
import { C, STROKE } from '../ui/theme'
import { flavor, heading, text, tile, type TileHandle } from '../ui/widgets'

interface MenuItem {
  label: string
  scene: string
  data?: object
  needsCareer?: boolean
}

const ITEMS: MenuItem[] = [
  { label: 'CONTINUE CAREER', scene: 'Garage', needsCareer: true },
  { label: 'NEW CAREER', scene: 'Profile', data: { replace: true } },
  { label: 'VENUES', scene: 'Venues' },
  { label: 'CHAMPIONSHIP LADDER', scene: 'Ranking', needsCareer: true },
  { label: 'HALL OF FAME', scene: 'HallOfFame', needsCareer: true },
  { label: 'SETTINGS / CONTROLS', scene: 'Settings' },
  { label: 'CREDITS', scene: 'Credits' },
  { label: 'PREVIEW / DEMO', scene: 'Preview' },
]

export class MenuScene extends Phaser.Scene {
  private selected = 0
  private handles: TileHandle[] = []
  private saved = false

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

    this.add.particles(0, 0, 'smoke', {
      x: { min: 0, max: GAME_WIDTH }, y: { min: 0, max: GAME_HEIGHT },
      speedX: { min: 8, max: 30 }, speedY: { min: -4, max: 4 },
      scale: { start: 1.6, end: 2.6 }, alpha: { start: 0.05, end: 0 },
      lifespan: 9000, frequency: 400, tint: 0x2a2a3a,
    })

    heading(this, cx, 105, 'DEATHRALLY', { size: 'hero', strokeThickness: STROKE.hero, glow: true })
    flavor(this, cx, 170, 'working title · original combat racing')

    const car = this.add.image(490, 405, `car-${career.carId}`).setScale(2.5).setAngle(-90).setTint(career.profile.liveryColor)
    this.tweens.add({ targets: car, y: '-=10', duration: 1400, yoyo: true, repeat: -1, ease: 'sine.inout' })
    const rank = career.champion ? 'CHAMPION' : `Rank #${playerRank(career.ladder, career.points)}`
    text(this, 490, 570, [career.profile.driverName, `${rank} · ${carById(career.carId).name}`, `$${career.cash} · ${career.points} pts`, `${career.wins} wins / ${career.racesRun} starts`].join('\n'), {
      size: 'bodyLg', align: 'center', lineSpacing: 10, origin: [0.5, 0], color: career.champion ? C.gold : C.textBody,
    })

    ITEMS.forEach((item, i) => {
      const y = 250 + i * 88
      this.handles.push(tile(this, 1230, y, 720, 68, item.label, { size: 'action', accent: i === 0 ? C.amberDim : undefined }))
    })
    flavor(this, cx, GAME_HEIGHT - 42, '↑/↓ navigate · Enter select · V venues · L ladder · N new career')

    const kb = this.input.keyboard!
    const up = () => this.move(-1)
    const down = () => this.move(1)
    const enter = () => this.activate()
    const venues = () => this.scene.start('Venues')
    const ladder = () => this.scene.start('Ranking')
    const fresh = () => this.scene.start('Profile', { replace: true })
    kb.once('keydown', () => audioBus.unlock())
    kb.on('keydown-UP', up)
    kb.on('keydown-DOWN', down)
    kb.on('keydown-ENTER', enter)
    kb.on('keydown-V', venues)
    kb.on('keydown-L', ladder)
    kb.on('keydown-N', fresh)
    this.events.once('shutdown', () => {
      kb.off('keydown-UP', up); kb.off('keydown-DOWN', down); kb.off('keydown-ENTER', enter)
      kb.off('keydown-V', venues); kb.off('keydown-L', ladder); kb.off('keydown-N', fresh)
    })
    this.refresh()
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
