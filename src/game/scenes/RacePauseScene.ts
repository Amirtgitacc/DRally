import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ACTION_LABELS, readableCode } from '../input/bindings'
import { GAME_ACTIONS } from '../input/inputTypes'
import { loadSettings } from '../state/settings'
import { C } from '../ui/theme'
import { heading, modal, text, tile, type TileHandle, wireTiles } from '../ui/widgets'
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
  private handles: TileHandle[] = []
  private helpText!: Phaser.GameObjects.Text
  private warning!: Phaser.GameObjects.Text

  constructor() { super('RacePause') }
  init(data: PauseData) { this.pauseData = data }

  create() {
    this.selected = 0; this.help = false; this.confirming = false; this.handles = []
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
    modal(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1050, 800)
    heading(this, GAME_WIDTH / 2, 190, 'RACE PAUSED')
    text(this, GAME_WIDTH / 2, 250, `${this.pauseData.trackName} · lap ${this.pauseData.lap}/${this.pauseData.laps} · position ${this.pauseData.position || '—'} · weapons ${this.pauseData.weaponsFree ? 'free' : 'locked'}`, {
      size: 'body', color: C.textSecondary, origin: [0.5, 0.5],
    })
    ITEMS.forEach((label, i) => this.handles.push(tile(this, 620, 390 + i * 105, 500, 74, label, { select: i === 2 ? C.danger : C.oxide })))
    this.helpText = text(this, 1050, 350, '', { size: 'bodySm', color: C.textBody, lineSpacing: 8 })
    this.warning = text(this, GAME_WIDTH / 2, 790, '', { size: 'body', color: C.danger, align: 'center', origin: [0.5, 0.5] })

    // tap entry points call the exact same functions the keyboard path calls below.
    // while the abandon confirm is up, retapping ABANDON/RESUME mirrors keyboard Y/N.
    wireTiles(
      this.handles,
      (i) => { if (!this.confirming) { this.selected = i; this.refresh() } },
      (i) => {
        if (this.confirming) {
          if (i === 2) this.confirmAbandon()
          else if (i === 0) this.cancelAbandon()
          this.refresh()
          return
        }
        if (this.help) { this.closeHelp(); this.refresh(); return }
        this.selected = i
        this.activateSelected()
        this.refresh()
      },
    )

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => kb.off('keydown', onKey))
    this.refresh()
  }

  private handleKey(event: KeyboardEvent) {
    if (this.confirming) {
      if (event.code === 'KeyY' || event.code === 'Enter') this.confirmAbandon()
      else if (event.code === 'KeyN' || event.code === 'Escape') this.cancelAbandon()
      this.refresh(); return
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

  /** What Enter does for the currently-selected row — shared by keyboard and tap. */
  private activateSelected() {
    if (this.selected === 0) { this.resumeRace(); return }
    if (this.selected === 1) this.help = true
    if (this.selected === 2) this.confirming = true
  }

  private closeHelp() { this.help = false }

  private confirmAbandon() {
    ;(this.scene.get('Race') as RaceScene).abandonRace()
    this.scene.stop()
  }

  private cancelAbandon() { this.confirming = false }

  private refresh() {
    this.handles.forEach((handle, i) => handle.setState(i === this.selected, true))
    const settings = loadSettings()
    const lines = GAME_ACTIONS.map((action) => `${ACTION_LABELS[action].padEnd(18)} ${settings.bindings[action].map(readableCode).join(' / ')}`)
    this.helpText.setText(this.help ? ['CONTROLS', '', ...lines, '', 'Damage persists between races.', 'Turbo recharges when released.', 'Weapons unlock shortly after the start.', 'Pickups can repair, reload, or trap you.'].join('\n') : ['OBJECTIVE', '', 'Finish every lap before the field.', 'Wrecked cars score no prize.', '', 'Select CONTROLS / HELP for bindings.'].join('\n'))
    this.warning.setText(this.confirming ? 'ABANDON THIS RACE?\nDNF: no prize or points; damage and loan time persist; one-race gear is consumed.\nEnter/Y confirm · Esc/N cancel' : '')
  }
}
