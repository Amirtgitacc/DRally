import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ACTION_LABELS, readableCode } from '../input/bindings'
import { GAME_ACTIONS } from '../input/inputTypes'
import { loadSettings } from '../state/settings'
import { C } from '../ui/theme'
import { text } from '../ui/widgets'
import { card, confirmSheet, notchedButton, type ButtonHandle, type ConfirmHandle } from '../ui/mobile'
import type { RaceScene } from './RaceScene'

interface PauseData {
  trackName: string
  lap: number
  laps: number
  position: number
  weaponsFree: boolean
}

const ITEMS = ['RESUME', 'CONTROLS / HELP', 'ABANDON RACE'] as const

export class RacePauseScene extends Phaser.Scene {
  private pauseData!: PauseData
  private selected = 0
  private help = false
  private confirming = false
  private confirm?: ConfirmHandle
  private buttons: ButtonHandle[] = []
  private contextText!: Phaser.GameObjects.Text
  private contextTitle!: Phaser.GameObjects.Text

  constructor() { super('RacePause') }
  init(data: PauseData) { this.pauseData = data }

  create() {
    this.selected = 0; this.help = false; this.confirming = false; this.confirm = undefined; this.buttons = []
    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2

    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.74)
    card(this, cx, cy, 1320, 660, undefined, { accent: C.oxide })

    text(this, cx, cy - 250, 'RACE PAUSED', {
      size: 'title', face: 'display', weight: 700, letterSpacing: 3, color: C.oxide, origin: [0.5, 0.5], stroke: C.shadow, strokeThickness: 6,
    })
    const d = this.pauseData
    text(this, cx, cy - 190, `${d.trackName}  ·  LAP ${d.lap}/${d.laps}  ·  POSITION ${d.position || '—'}  ·  WEAPONS ${d.weaponsFree ? 'FREE' : 'LOCKED'}`, {
      size: 'bodySm', face: 'mono', color: C.textSecondary, origin: [0.5, 0.5],
    })

    // left column — three stacked actions
    const bx = cx - 330
    ITEMS.forEach((label, i) => {
      const btn = notchedButton(this, bx, cy - 70 + i * 120, {
        w: 540, h: 100, label, size: 'action', align: 'center',
        variant: i === 2 ? 'danger' : i === 0 ? 'primary' : 'secondary',
        onFocus: () => { if (!this.confirming) { this.selected = i; this.refresh() } },
        onActivate: () => { if (!this.confirming) { this.selected = i; this.activateSelected() } },
      })
      this.buttons.push(btn)
    })

    // right column — objective / controls context panel (kept below the status line)
    card(this, cx + 350, cy + 75, 560, 400, undefined, { accent: C.oxideDim })
    this.contextTitle = text(this, cx + 350 - 250, cy + 75 - 155, 'OBJECTIVE', {
      size: 'caption', face: 'display', weight: 600, letterSpacing: 4, color: C.oxide, origin: [0, 0.5],
    })
    this.contextText = text(this, cx + 350 - 250, cy + 75 - 115, '', {
      size: 'bodySm', face: 'mono', color: C.textBody, lineSpacing: 10, origin: [0, 0], wordWrapWidth: 500,
    })

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => { kb.off('keydown', onKey); this.confirm?.destroy() })
    this.refresh()
  }

  private handleKey(event: KeyboardEvent) {
    if (this.confirming) {
      if (event.code === 'KeyY' || event.code === 'Enter') this.confirmAbandon()
      else if (event.code === 'KeyN' || event.code === 'Escape') this.cancelAbandon()
      return
    }
    if (this.help && (event.code === 'Escape' || event.code === 'Enter')) { this.closeHelp(); this.refresh(); return }
    if (event.code === 'Escape') { this.resumeRace(); return }
    if (event.code === 'ArrowUp') this.selected = (this.selected + ITEMS.length - 1) % ITEMS.length
    if (event.code === 'ArrowDown') this.selected = (this.selected + 1) % ITEMS.length
    if (event.code === 'Enter') this.activateSelected()
    this.refresh()
  }

  private resumeRace() {
    ;(this.scene.get('Race') as RaceScene).resumeRaceAudio()
    this.scene.resume('Race')
    this.scene.stop()
  }

  /** What Enter/tap does for the currently-selected row — shared by keyboard and tap. */
  private activateSelected() {
    if (this.selected === 0) { this.resumeRace(); return }
    if (this.selected === 1) { this.help = !this.help; this.refresh(); return }
    if (this.selected === 2) this.openAbandon()
  }

  private closeHelp() { this.help = false }

  private openAbandon() {
    this.confirming = true
    this.confirm = confirmSheet(this, {
      title: 'ABANDON THIS RACE?',
      body: 'Committed DNF: no prize, points, or pickup cash. Damage persists, starts and loan time advance, and one-race gear is consumed.',
      cancelLabel: 'CANCEL',
      confirmLabel: 'CONFIRM DNF',
      danger: true,
      onCancel: () => this.cancelAbandon(),
      onConfirm: () => this.confirmAbandon(),
    })
    this.refresh()
  }

  private confirmAbandon() {
    ;(this.scene.get('Race') as RaceScene).abandonRace()
    this.scene.stop()
  }

  private cancelAbandon() {
    this.confirm?.destroy()
    this.confirm = undefined
    this.confirming = false
    this.refresh()
  }

  private refresh() {
    this.buttons.forEach((b, i) => b.setState({ selected: i === this.selected, enabled: true }))
    const settings = loadSettings()
    const lines = GAME_ACTIONS.map((action) => `${ACTION_LABELS[action].padEnd(16)} ${settings.bindings[action].map(readableCode).join(' / ')}`)
    this.contextTitle.setText(this.help ? 'CONTROLS' : 'OBJECTIVE')
    this.contextText.setText(this.help
      ? [...lines, '', 'Damage persists between races.', 'Turbo recharges when released.', 'Weapons unlock shortly after the start.'].join('\n')
      : ['FINISH EVERY LAP BEFORE THE FIELD.', '', 'Wrecked cars score no prize.', '', 'Select CONTROLS / HELP for bindings.'].join('\n'))
  }
}
