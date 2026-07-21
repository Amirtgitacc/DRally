import Phaser from 'phaser'
import { DEFAULT_PROFILE, type Difficulty, type DriverProfile } from '../../core/progression/career'
import { STARTING_CASH } from '../../data/economy'
import { STARTER_CAR } from '../../data/cars'
import { hasSavedCareer, resetCareer } from '../state/saveGame'
import { C, hex } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { deferredImage } from '../ui/deferredImage'
import { openNativeText } from '../ui/nativeInput'
import { isTouchDevice } from '../input/device'
import {
  backPlate, card, confirmSheet, notchedButton, screenTitle, SAFE, TOUCH,
  type ButtonHandle, type ConfirmHandle,
} from '../ui/mobile'

const LIVERIES = [0xf2a33c, 0x3fd07f, 0x4fc3f7, 0xd23c2f, 0xb86fe3, 0xe8e8f0]
const PORTRAITS = ['visor', 'mohawk', 'respirator']
const DIFFICULTIES: Difficulty[] = ['street', 'standard', 'hard']

const ROW_LABELS = ['DRIVER NAME', 'PORTRAIT ID', 'WEAPONS', 'DIFFICULTY', 'START CAREER']

// left preview-card geometry
const PC_X = 400
const PC_Y = 520

export class NewCareerScene extends Phaser.Scene {
  private firstLaunch = false
  private replacing = false
  private confirmOverwrite = false
  private confirm?: ConfirmHandle
  private selected = 0
  private name = DEFAULT_PROFILE.driverName
  private portrait = 0
  private weapons = true
  private difficulty = 1
  private rows: ButtonHandle[] = []
  private info!: Phaser.GameObjects.Text
  private nameText!: Phaser.GameObjects.Text
  private portraitGfx!: Phaser.GameObjects.Graphics
  private disposeNativeInput?: () => void

  constructor() { super('Profile') }

  init(data: { firstLaunch?: boolean; replace?: boolean }) {
    this.firstLaunch = data.firstLaunch === true
    this.replacing = data.replace === true && hasSavedCareer()
  }

  create() {
    this.confirmOverwrite = false
    this.confirm = undefined
    this.selected = 0
    this.rows = []
    sceneBackground(this, 'bg-profile', { veil: 0.4 })

    screenTitle(this, 'DRIVER PROFILE', { x: SAFE.left, y: 96 })

    // ---- left preview card: car + portrait badge + starter note ----
    card(this, PC_X, PC_Y, 560, 620, undefined, { accent: C.oxideDim })
    deferredImage(this, PC_X, PC_Y - 150, `car-hero-${STARTER_CAR.id}`, 420, 260)
    this.portraitGfx = this.add.graphics()
    this.nameText = text(this, PC_X, PC_Y + 130, '', { size: 'heading', face: 'display', weight: 700, origin: [0.5, 0.5] })
    this.info = text(this, PC_X, PC_Y + 180, '', {
      size: 'bodySm', color: C.textBody, align: 'center', lineSpacing: 8, origin: [0.5, 0], wordWrapWidth: 500,
    })

    // ---- right form rows (0..3) + full-width START CAREER (4) ----
    const rowX = 1300
    const rowW = 1040
    for (let i = 0; i < 4; i++) {
      this.rows.push(notchedButton(this, rowX, 280 + i * 120, {
        w: rowW, h: TOUCH.minH + 12, label: ROW_LABELS[i], value: '', valueColor: C.oxide, size: 'action', align: 'left',
        onFocus: () => { if (!this.confirmOverwrite) { this.selected = i; this.refresh() } },
        onActivate: () => { if (!this.confirmOverwrite) { this.selected = i; this.activateSelected() } },
      }))
    }
    this.rows.push(notchedButton(this, rowX, 812, {
      w: rowW, h: 108, label: 'START CAREER', size: 'title', align: 'center', variant: 'primary',
      onActivate: () => { if (!this.confirmOverwrite) { this.selected = 4; this.requestCommit() } },
      onFocus: () => { if (!this.confirmOverwrite) { this.selected = 4; this.refresh() } },
    }))

    text(this, rowX, 900, `Starter car · $${STARTING_CASH.toLocaleString('en-US')} starting cash`, {
      size: 'bodySm', face: 'mono', color: C.textSecondary, origin: [0.5, 0.5],
    })

    // back only when replacing an existing career (first launch must complete)
    if (!this.firstLaunch) backPlate(this, 'SINGLE PLAYER', () => this.escapeAction(), { x: SAFE.left + 150 })

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => {
      kb.off('keydown', onKey)
      this.disposeNativeInput?.()
      this.disposeNativeInput = undefined
      this.confirm?.destroy()
    })
    this.refresh()
  }

  private handleKey(event: KeyboardEvent) {
    if (this.disposeNativeInput) return
    if (this.confirmOverwrite) {
      if (event.code === 'KeyY' || event.code === 'Enter') this.commit()
      if (event.code === 'KeyN' || event.code === 'Escape') this.escapeAction()
      return
    }
    if (event.code === 'ArrowUp') this.selected = (this.selected + 4) % 5
    else if (event.code === 'ArrowDown') this.selected = (this.selected + 1) % 5
    else if (event.code === 'ArrowLeft') this.change(-1)
    else if (event.code === 'ArrowRight') this.change(1)
    else if (event.code === 'Backspace' && this.selected === 0) this.name = this.name.slice(0, -1)
    else if (event.code === 'Enter' && this.selected === 4) this.requestCommit()
    else if (event.code === 'Escape') this.escapeAction()
    else if (this.selected === 0 && event.key.length === 1 && /[a-zA-Z0-9 _-]/.test(event.key) && this.name.length < 18) this.name += event.key
    this.refresh()
  }

  private escapeAction() {
    if (this.confirmOverwrite) { this.dismissConfirm(); return }
    if (!this.firstLaunch) this.scene.start('Menu')
  }

  private activateSelected() {
    if (isTouchDevice() && this.selected === 0) {
      this.disposeNativeInput?.()
      this.disposeNativeInput = openNativeText({
        value: this.name,
        maxLength: 18,
        onChange: (v) => { this.name = v; this.refresh() },
        onDone: () => { this.disposeNativeInput?.(); this.disposeNativeInput = undefined },
      })
      return
    }
    if (this.selected === 4) { this.requestCommit(); return }
    this.change(1)
    this.refresh()
  }

  private change(delta: number) {
    if (this.selected === 1) this.portrait = (this.portrait + delta + PORTRAITS.length) % PORTRAITS.length
    if (this.selected === 2) this.weapons = !this.weapons
    if (this.selected === 3) this.difficulty = (this.difficulty + delta + DIFFICULTIES.length) % DIFFICULTIES.length
  }

  private requestCommit() {
    if (!this.name.trim()) return
    if (this.replacing) { this.openConfirm(); return }
    this.commit()
  }

  private openConfirm() {
    this.confirmOverwrite = true
    this.refresh()
    this.confirm = confirmSheet(this, {
      title: 'OVERWRITE EXISTING CAREER?',
      body: 'This permanently replaces your current career progress, economy, damage and records. Settings are kept.',
      cancelLabel: 'CANCEL',
      confirmLabel: 'OVERWRITE',
      danger: true,
      onCancel: () => this.dismissConfirm(),
      onConfirm: () => this.commit(),
    })
  }

  private dismissConfirm() {
    this.confirm?.destroy()
    this.confirm = undefined
    this.confirmOverwrite = false
    this.refresh()
  }

  private commit() {
    const profile: DriverProfile = {
      driverName: this.name.trim(), liveryColor: LIVERIES[0], portraitId: PORTRAITS[this.portrait],
      weaponsEnabled: this.weapons, difficulty: DIFFICULTIES[this.difficulty],
    }
    resetCareer(profile)
    this.scene.start('Garage')
  }

  private refresh() {
    this.drawPortrait()
    this.nameText.setText(this.name || 'TYPE A NAME').setColor(hex(this.name ? C.oxide : C.textDisabled))
    const difficulty = DIFFICULTIES[this.difficulty]
    this.info.setText([
      `${STARTER_CAR.name}`,
      this.weapons ? 'Combat + black market enabled.' : 'Clean racing: weapons off.',
      difficulty === 'street' ? 'Street: forgiving rival pace.' : difficulty === 'hard' ? 'Hard: faster, less forgiving rivals.' : 'Standard: intended balance.',
    ].join('\n'))

    const values = [
      this.name || 'TYPE…',
      PORTRAITS[this.portrait].toUpperCase(),
      this.weapons ? 'ENABLED' : 'DISABLED',
      difficulty.toUpperCase(),
    ]
    for (let i = 0; i < 4; i++) {
      this.rows[i].setValue(`${values[i]}   ${i === 0 ? '' : '‹ ›'}`, i === 2 ? (this.weapons ? C.money : C.textMuted) : C.oxide)
      this.rows[i].setState({ selected: i === this.selected, enabled: true })
    }
    this.rows[4].setState({ selected: this.selected === 4, enabled: !!this.name.trim() })
  }

  private drawPortrait() {
    const gfx = this.portraitGfx
    const color = C.oxide
    const cx = PC_X
    const top = PC_Y - 10
    gfx.clear()
    gfx.fillStyle(0x14141c, 1).fillRoundedRect(cx - 80, top, 160, 130, 10)
    gfx.lineStyle(3, color, 0.8).strokeRoundedRect(cx - 80, top, 160, 130, 10)
    gfx.fillStyle(0x272733, 1).fillCircle(cx, top + 50, 36)
    gfx.fillStyle(0x272733, 1).fillRoundedRect(cx - 45, top + 85, 90, 35, 12)
    if (PORTRAITS[this.portrait] === 'visor') {
      gfx.fillStyle(color, 1).fillRoundedRect(cx - 34, top + 39, 68, 17, 5)
    } else if (PORTRAITS[this.portrait] === 'mohawk') {
      gfx.fillStyle(color, 1).fillTriangle(cx - 25, top + 22, cx, top - 1, cx + 25, top + 22)
      gfx.fillStyle(0x09090d, 1).fillRect(cx - 27, top + 41, 18, 7).fillRect(cx + 9, top + 41, 18, 7)
    } else {
      gfx.fillStyle(0x09090d, 1).fillRoundedRect(cx - 30, top + 43, 60, 25, 8)
      gfx.lineStyle(4, color, 1).lineBetween(cx - 20, top + 69, cx - 34, top + 97).lineBetween(cx + 20, top + 69, cx + 34, top + 97)
    }
  }
}
