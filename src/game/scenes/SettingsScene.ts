import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { ACTION_LABELS, readableCode, rebind } from '../input/bindings'
import { GAME_ACTIONS, type GameAction } from '../input/inputTypes'
import { audioBus } from '../systems/audio'
import { loadSettings, resetSettings, saveSettings, type SettingsState } from '../state/settings'
import { C } from '../ui/theme'
import { flavor, heading, text, tile, type TileHandle } from '../ui/widgets'

type SettingRow = { id: 'master' | 'music' | 'effects' | 'mute' | 'shake' | 'flash' | 'turbo' | 'fire' | 'reset' | 'back'; label: string }
const SETTINGS: SettingRow[] = [
  { id: 'master', label: 'MASTER VOLUME' }, { id: 'music', label: 'MUSIC VOLUME' }, { id: 'effects', label: 'EFFECTS VOLUME' }, { id: 'mute', label: 'MUTED' },
  { id: 'shake', label: 'REDUCED SHAKE' }, { id: 'flash', label: 'REDUCED FLASH' },
  { id: 'turbo', label: 'TURBO INPUT' }, { id: 'fire', label: 'FIRE INPUT' },
  { id: 'reset', label: 'RESET DEFAULTS' }, { id: 'back', label: 'BACK' },
]

export class SettingsScene extends Phaser.Scene {
  private settings!: SettingsState
  private selected = 0
  private rebinding: GameAction | null = null
  private settingTiles: TileHandle[] = []
  private bindTiles: TileHandle[] = []
  private gamepadText!: Phaser.GameObjects.Text
  constructor() { super('Settings') }

  create() {
    this.settings = loadSettings(); this.selected = 0; this.rebinding = null; this.settingTiles = []; this.bindTiles = []
    heading(this, GAME_WIDTH / 2, 65, 'SETTINGS / CONTROLS')
    text(this, 450, 130, 'GAME', { size: 'subtitle', color: C.oxide })
    SETTINGS.forEach((row, i) => this.settingTiles.push(tile(this, 450, 190 + i * 78, 700, 58, row.label, { size: 'bodySm' })))
    text(this, 1360, 130, 'RACE BINDINGS', { size: 'subtitle', color: C.oxide })
    this.gamepadText = text(this, 1740, 138, '', { size: 'caption', color: C.textSecondary, origin: [1, 0.5] })
    GAME_ACTIONS.forEach((action, i) => this.bindTiles.push(tile(this, 1360, 200 + i * 79, 820, 58, ACTION_LABELS[action], { size: 'bodySm' })))
    flavor(this, GAME_WIDTH / 2, GAME_HEIGHT - 48, '↑/↓ navigate · ←/→ adjust · Enter select/rebind · Esc save and back')

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
    const total = SETTINGS.length + GAME_ACTIONS.length
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
    this.persist()
  }

  private activate() {
    if (this.selected >= SETTINGS.length) { this.rebinding = GAME_ACTIONS[this.selected - SETTINGS.length]; return }
    const id = SETTINGS[this.selected].id
    if (id === 'mute') this.settings.muted = !this.settings.muted
    if (id === 'shake') this.settings.reducedShake = !this.settings.reducedShake
    if (id === 'flash') this.settings.reducedFlash = !this.settings.reducedFlash
    if (id === 'turbo') this.settings.toggleTurbo = !this.settings.toggleTurbo
    if (id === 'fire') this.settings.toggleFire = !this.settings.toggleFire
    if (id === 'reset') this.settings = resetSettings()
    if (id === 'back') { this.persist(); this.scene.start('Menu'); return }
    this.persist()
  }

  private persist() { saveSettings(this.settings); audioBus.applySettings(this.settings) }
  private refresh() {
    const values = [`${Math.round(this.settings.masterVolume * 100)}%`, `${Math.round(this.settings.musicVolume * 100)}%`, `${Math.round(this.settings.effectsVolume * 100)}%`, this.settings.muted ? 'YES' : 'NO', this.settings.reducedShake ? 'ON' : 'OFF', this.settings.reducedFlash ? 'ON' : 'OFF', this.settings.toggleTurbo ? 'TOGGLE' : 'HOLD', this.settings.toggleFire ? 'TOGGLE' : 'HOLD', '', '']
    this.settingTiles.forEach((handle, i) => { handle.label.setText(`${SETTINGS[i].label}${values[i] ? `\n${values[i]}` : ''}`); handle.setState(this.selected === i, true) })
    this.bindTiles.forEach((handle, i) => { const action = GAME_ACTIONS[i]; handle.label.setText(`${ACTION_LABELS[action].padEnd(20)} ${this.settings.bindings[action].map(readableCode).join(' / ')}`); handle.setState(this.selected === SETTINGS.length + i, true) })
    if (this.rebinding) this.bindTiles[GAME_ACTIONS.indexOf(this.rebinding)].label.setText(`${ACTION_LABELS[this.rebinding]}   PRESS A KEY…`)
  }
}
