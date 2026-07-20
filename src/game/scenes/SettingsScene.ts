import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ACTION_LABELS, readableCode, rebind } from '../input/bindings'
import { isTouchDevice } from '../input/device'
import { GAME_ACTIONS, type GameAction } from '../input/inputTypes'
import { audioBus } from '../systems/audio'
import { loadSettings, resetSettings, saveSettings, type SettingsState } from '../state/settings'
import type { QualitySetting } from '../race/qualityProfile'
import { resolveSettingsTap, type SettingsRowKind } from '../ui/stepper'
import { C } from '../ui/theme'
import { flavor, heading, text, tile, type TileHandle, wireTiles } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'

type SettingRow = {
  id: 'master' | 'music' | 'effects' | 'mute' | 'shake' | 'flash' | 'quality' | 'touchOpacity' | 'touchMirrored' | 'turbo' | 'fire' | 'reset' | 'back'
  label: string
  kind: SettingsRowKind
}
const SETTINGS: SettingRow[] = [
  { id: 'master', label: 'MASTER VOLUME', kind: 'adjustable' }, { id: 'music', label: 'MUSIC VOLUME', kind: 'adjustable' }, { id: 'effects', label: 'EFFECTS VOLUME', kind: 'adjustable' }, { id: 'mute', label: 'MUTED', kind: 'toggle' },
  { id: 'shake', label: 'REDUCED SHAKE', kind: 'toggle' }, { id: 'flash', label: 'REDUCED FLASH', kind: 'toggle' },
  { id: 'quality', label: 'GRAPHICS QUALITY', kind: 'adjustable' },
  { id: 'touchOpacity', label: 'TOUCH OPACITY', kind: 'adjustable' }, { id: 'touchMirrored', label: 'MIRROR TOUCH LAYOUT', kind: 'toggle' },
  { id: 'turbo', label: 'TURBO INPUT', kind: 'toggle' }, { id: 'fire', label: 'FIRE INPUT', kind: 'toggle' },
  { id: 'reset', label: 'RESET DEFAULTS', kind: 'action' }, { id: 'back', label: 'BACK', kind: 'action' },
]

const QUALITY_CYCLE: QualitySetting[] = ['auto', 'high', 'low']
const QUALITY_LABEL: Record<QualitySetting, string> = { auto: 'AUTO', high: 'HIGH', low: 'LOW' }

export class SettingsScene extends Phaser.Scene {
  private settings!: SettingsState
  private selected = 0
  private rebinding: GameAction | null = null
  private settingTiles: TileHandle[] = []
  private bindTiles: TileHandle[] = []
  private gamepadText!: Phaser.GameObjects.Text
  constructor() { super('Settings') }

  create() {
    const touch = isTouchDevice()
    this.settings = loadSettings(); this.selected = 0; this.rebinding = null; this.settingTiles = []; this.bindTiles = []
    sceneBackground(this, 'bg-race-ops', { veil: 0.62 })
    heading(this, GAME_WIDTH / 2, 65, 'SETTINGS / CONTROLS')
    text(this, 450, 130, 'GAME', { size: 'subtitle', color: C.oxide })
    const ROW_W = 700
    // tightened from 68 -> 64 so the new QUALITY row still leaves clearance above the
    // bottom flavor-text hint (13 rows now vs. the previous 12)
    const ROW_H = 64
    SETTINGS.forEach((row, i) => {
      const y = 190 + i * ROW_H
      const handle = tile(this, 450, y, ROW_W, 58, row.label, { size: 'bodySm' })
      this.settingTiles.push(handle)
      if (row.kind === 'adjustable') {
        text(this, 450 - ROW_W / 2 + 26, y, '‹', { size: 'action', color: C.oxide, origin: [0, 0.5] })
        text(this, 450 + ROW_W / 2 - 26, y, '›', { size: 'action', color: C.oxide, origin: [1, 0.5] })
        handle.rect.on('pointerup', (_pointer: Phaser.Input.Pointer, localX: number) => {
          this.selected = i
          const action = resolveSettingsTap(row.kind, ROW_W, localX)
          if (action === 'decrement') this.adjust(-1)
          else if (action === 'increment') this.adjust(1)
          this.refresh()
        })
      }
    })

    this.gamepadText = text(this, 1904, 138, '', { size: 'caption', color: C.textSecondary, origin: [1, 0.5] })
    if (touch) {
      text(this, 1360, 130, 'RACE BINDINGS', { size: 'subtitle', color: C.oxide })
      text(
        this,
        1360,
        190,
        'Key and button rebinding needs a physical keyboard or gamepad — not available on a touch screen. Connect one to customize bindings for that play session.',
        { size: 'bodySm', color: C.textSecondary, wordWrapWidth: 520, lineSpacing: 10 },
      )
    } else {
      text(this, 1360, 130, 'RACE BINDINGS', { size: 'subtitle', color: C.oxide })
      GAME_ACTIONS.forEach((action, i) => this.bindTiles.push(tile(this, 1360, 200 + i * 68, 820, 58, ACTION_LABELS[action], { size: 'bodySm' })))
    }

    const N = SETTINGS.length
    wireTiles(
      this.settingTiles,
      (i) => { this.selected = i; this.refresh() },
      (i) => { this.selected = i; this.activate() },
    )
    wireTiles(
      this.bindTiles,
      (i) => { this.selected = N + i; this.refresh() },
      (i) => { this.selected = N + i; this.activate() },
    )
    flavor(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 48,
      touch
        ? 'Tap ‹ › to adjust · tap a row to toggle/select · BACK to save and exit'
        : '↑/↓ navigate · ←/→ adjust · Enter select/rebind · Esc save and back',
    )

    const kb = this.input.keyboard!
    const onKey = (event: KeyboardEvent) => this.handleKey(event)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => kb.off('keydown', onKey))
    this.refresh()
  }

  update() {
    const pad = navigator.getGamepads?.()[0]
    this.gamepadText?.setText(pad ? `GAMEPAD: ${pad.id.slice(0, 26)}` : 'GAMEPAD: NOT DETECTED')
  }

  private handleKey(event: KeyboardEvent) {
    if (this.rebinding) {
      if (event.code === 'Escape') this.rebinding = null
      else { this.settings.bindings = rebind(this.settings.bindings, this.rebinding, event.code); this.rebinding = null; this.persist() }
      this.refresh(); return
    }
    const total = SETTINGS.length + this.bindTiles.length
    if (event.code === 'ArrowUp') this.selected = (this.selected + total - 1) % total
    else if (event.code === 'ArrowDown') this.selected = (this.selected + 1) % total
    else if (event.code === 'ArrowLeft') this.adjust(-1)
    else if (event.code === 'ArrowRight') this.adjust(1)
    else if (event.code === 'Escape') { this.persist(); this.scene.start('Menu'); return }
    else if (event.code === 'Enter') this.activate()
    this.refresh()
  }

  private adjust(delta: number) {
    if (this.selected >= SETTINGS.length) return
    const id = SETTINGS[this.selected].id
    if (id === 'master') this.settings.masterVolume = Phaser.Math.Clamp(Math.round((this.settings.masterVolume + delta * 0.1) * 10) / 10, 0, 1)
    if (id === 'music') this.settings.musicVolume = Phaser.Math.Clamp(Math.round((this.settings.musicVolume + delta * 0.1) * 10) / 10, 0, 1)
    if (id === 'effects') this.settings.effectsVolume = Phaser.Math.Clamp(Math.round((this.settings.effectsVolume + delta * 0.1) * 10) / 10, 0, 1)
    if (id === 'touchOpacity') this.settings.touchOpacity = Phaser.Math.Clamp(Math.round((this.settings.touchOpacity + delta * 0.1) * 10) / 10, 0.2, 1)
    if (id === 'quality') {
      const idx = QUALITY_CYCLE.indexOf(this.settings.quality)
      this.settings.quality = QUALITY_CYCLE[(idx + delta + QUALITY_CYCLE.length) % QUALITY_CYCLE.length]
    }
    this.persist()
  }

  private activate() {
    if (this.selected >= SETTINGS.length) { this.rebinding = GAME_ACTIONS[this.selected - SETTINGS.length]; return }
    const id = SETTINGS[this.selected].id
    if (id === 'mute') this.settings.muted = !this.settings.muted
    if (id === 'shake') this.settings.reducedShake = !this.settings.reducedShake
    if (id === 'flash') this.settings.reducedFlash = !this.settings.reducedFlash
    if (id === 'touchMirrored') this.settings.touchMirrored = !this.settings.touchMirrored
    if (id === 'turbo') this.settings.toggleTurbo = !this.settings.toggleTurbo
    if (id === 'fire') this.settings.toggleFire = !this.settings.toggleFire
    if (id === 'reset') this.settings = resetSettings()
    if (id === 'back') { this.persist(); this.scene.start('Menu'); return }
    this.persist()
  }

  private persist() { saveSettings(this.settings); audioBus.applySettings(this.settings) }
  private refresh() {
    const values = [`${Math.round(this.settings.masterVolume * 100)}%`, `${Math.round(this.settings.musicVolume * 100)}%`, `${Math.round(this.settings.effectsVolume * 100)}%`, this.settings.muted ? 'YES' : 'NO', this.settings.reducedShake ? 'ON' : 'OFF', this.settings.reducedFlash ? 'ON' : 'OFF', QUALITY_LABEL[this.settings.quality], `${Math.round(this.settings.touchOpacity * 100)}%`, this.settings.touchMirrored ? 'ON' : 'OFF', this.settings.toggleTurbo ? 'TOGGLE' : 'HOLD', this.settings.toggleFire ? 'TOGGLE' : 'HOLD', '', '']
    this.settingTiles.forEach((handle, i) => { handle.label.setText(`${SETTINGS[i].label}${values[i] ? `\n${values[i]}` : ''}`); handle.setState(this.selected === i, true) })
    this.bindTiles.forEach((handle, i) => { const action = GAME_ACTIONS[i]; handle.label.setText(`${ACTION_LABELS[action].padEnd(20)} ${this.settings.bindings[action].map(readableCode).join(' / ')}`); handle.setState(this.selected === SETTINGS.length + i, true) })
    if (this.rebinding) this.bindTiles[GAME_ACTIONS.indexOf(this.rebinding)].label.setText(`${ACTION_LABELS[this.rebinding]}   PRESS A KEY…`)
  }
}
