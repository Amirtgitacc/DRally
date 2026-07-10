import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { DEFAULT_PROFILE, type Difficulty, type DriverProfile } from '../../core/progression/career'
import { STARTING_CASH } from '../../data/economy'
import { STARTER_CAR } from '../../data/cars'
import { hasSavedCareer, resetCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import { flavor, heading, panel, text, tile, type TileHandle } from '../ui/widgets'

const LIVERIES = [0xf2a33c, 0x3fd07f, 0x4fc3f7, 0xd23c2f, 0xb86fe3, 0xe8e8f0]
const PORTRAITS = ['visor', 'mohawk', 'respirator']
const DIFFICULTIES: Difficulty[] = ['street', 'standard', 'hard']

export class NewCareerScene extends Phaser.Scene {
  private firstLaunch = false
  private replacing = false
  private confirmOverwrite = false
  private selected = 0
  private name = DEFAULT_PROFILE.driverName
  private livery = 0
  private portrait = 0
  private weapons = true
  private difficulty = 1
  private rows: TileHandle[] = []
  private info!: Phaser.GameObjects.Text
  private nameText!: Phaser.GameObjects.Text
  private car!: Phaser.GameObjects.Image
  private portraitGfx!: Phaser.GameObjects.Graphics

  constructor() { super('Profile') }

  init(data: { firstLaunch?: boolean; replace?: boolean }) {
    this.firstLaunch = data.firstLaunch === true
    this.replacing = data.replace === true && hasSavedCareer()
  }

  create() {
    this.confirmOverwrite = false
    this.selected = 0
    this.rows = []
    const cx = GAME_WIDTH / 2
    heading(this, cx, 75, 'DRIVER PROFILE')
    text(this, cx, 130, 'Build an identity for this career. Settings and controls are kept separately.', {
      size: 'body', color: C.textSecondary, origin: [0.5, 0.5],
    })

    panel(this, 520, 500, 650, 690, { stroke: C.border, strokeAlpha: 1 })
    this.portraitGfx = this.add.graphics()
    this.car = this.add.image(520, 440, `car-${STARTER_CAR.id}`).setScale(2.6).setAngle(-90)
    this.nameText = text(this, 520, 590, '', { size: 'heading', origin: [0.5, 0.5] })
    this.info = text(this, 520, 670, '', { size: 'body', color: C.textBody, align: 'center', lineSpacing: 9, origin: [0.5, 0] })

    ;['DRIVER NAME', 'PORTRAIT ID', 'LIVERY', 'WEAPONS', 'DIFFICULTY', 'START CAREER'].forEach((label, i) => {
      this.rows.push(tile(this, 1320, 265 + i * 105, 760, 76, label, { accent: i === 5 ? C.amberDim : undefined }))
    })

    flavor(this, cx, GAME_HEIGHT - 52, 'Type to edit name · ←/→ change · ↑/↓ navigate · Enter confirm · Esc back')
    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => kb.off('keydown', onKey))
    this.refresh()
  }

  private handleKey(event: KeyboardEvent) {
    if (this.confirmOverwrite) {
      if (event.code === 'KeyY' || event.code === 'Enter') this.commit()
      if (event.code === 'KeyN' || event.code === 'Escape') { this.confirmOverwrite = false; this.refresh() }
      return
    }
    if (event.code === 'ArrowUp') this.selected = (this.selected + 5) % 6
    else if (event.code === 'ArrowDown') this.selected = (this.selected + 1) % 6
    else if (event.code === 'ArrowLeft') this.change(-1)
    else if (event.code === 'ArrowRight') this.change(1)
    else if (event.code === 'Backspace' && this.selected === 0) this.name = this.name.slice(0, -1)
    else if (event.code === 'Enter' && this.selected === 5) this.requestCommit()
    else if (event.code === 'Escape' && !this.firstLaunch) this.scene.start('Menu')
    else if (this.selected === 0 && event.key.length === 1 && /[a-zA-Z0-9 _-]/.test(event.key) && this.name.length < 18) this.name += event.key
    this.refresh()
  }

  private change(delta: number) {
    if (this.selected === 1) this.portrait = (this.portrait + delta + PORTRAITS.length) % PORTRAITS.length
    if (this.selected === 2) this.livery = (this.livery + delta + LIVERIES.length) % LIVERIES.length
    if (this.selected === 3) this.weapons = !this.weapons
    if (this.selected === 4) this.difficulty = (this.difficulty + delta + DIFFICULTIES.length) % DIFFICULTIES.length
  }

  private requestCommit() {
    if (!this.name.trim()) return
    if (this.replacing) { this.confirmOverwrite = true; this.refresh(); return }
    this.commit()
  }

  private commit() {
    const profile: DriverProfile = {
      driverName: this.name.trim(), liveryColor: LIVERIES[this.livery], portraitId: PORTRAITS[this.portrait],
      weaponsEnabled: this.weapons, difficulty: DIFFICULTIES[this.difficulty],
    }
    resetCareer(profile)
    this.scene.start('Garage')
  }

  private refresh() {
    this.drawPortrait()
    this.car.setTint(LIVERIES[this.livery])
    this.nameText.setText(this.name || 'TYPE A NAME').setColor(hex(this.name ? LIVERIES[this.livery] : C.textDisabled))
    const difficulty = DIFFICULTIES[this.difficulty]
    this.info.setText([
      `Portrait: ${PORTRAITS[this.portrait].toUpperCase()}`,
      `${STARTER_CAR.name} · $${STARTING_CASH} starting cash`,
      this.weapons ? 'Combat and black market enabled.' : 'Clean racing: weapons and black market disabled.',
      difficulty === 'street' ? 'Street: forgiving rival pace.' : difficulty === 'hard' ? 'Hard: faster, less forgiving rivals.' : 'Standard: intended career balance.',
      this.confirmOverwrite ? '\nOVERWRITE EXISTING CAREER? Enter/Y confirm · Esc/N cancel' : '',
    ].filter(Boolean).join('\n'))
    const values = [this.name || 'TYPE…', PORTRAITS[this.portrait].toUpperCase(), `#${LIVERIES[this.livery].toString(16).padStart(6, '0')}`, this.weapons ? 'ENABLED' : 'DISABLED', difficulty.toUpperCase(), this.confirmOverwrite ? 'CONFIRM OVERWRITE?' : 'START CAREER']
    this.rows.forEach((row, i) => { row.label.setText(`${['DRIVER NAME','PORTRAIT ID','LIVERY','WEAPONS','DIFFICULTY','START CAREER'][i]}\n${values[i]}`); row.setState(i === this.selected, i !== 5 || !!this.name.trim()) })
  }

  private drawPortrait() {
    const gfx = this.portraitGfx
    const color = LIVERIES[this.livery]
    gfx.clear()
    gfx.fillStyle(0x14141c, 1).fillRoundedRect(440, 175, 160, 130, 10)
    gfx.lineStyle(3, color, 0.8).strokeRoundedRect(440, 175, 160, 130, 10)
    gfx.fillStyle(0x272733, 1).fillCircle(520, 225, 36)
    gfx.fillStyle(0x272733, 1).fillRoundedRect(475, 260, 90, 35, 12)
    if (PORTRAITS[this.portrait] === 'visor') {
      gfx.fillStyle(color, 1).fillRoundedRect(486, 214, 68, 17, 5)
    } else if (PORTRAITS[this.portrait] === 'mohawk') {
      gfx.fillStyle(color, 1).fillTriangle(495, 197, 520, 174, 545, 197)
      gfx.fillStyle(0x09090d, 1).fillRect(493, 216, 18, 7).fillRect(529, 216, 18, 7)
    } else {
      gfx.fillStyle(0x09090d, 1).fillRoundedRect(490, 218, 60, 25, 8)
      gfx.lineStyle(4, color, 1).lineBetween(500, 244, 486, 272).lineBetween(540, 244, 554, 272)
    }
  }
}
