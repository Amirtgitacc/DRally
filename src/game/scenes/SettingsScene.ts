import Phaser from 'phaser'
import { GAME_WIDTH } from '../../config/game'
import { ACTION_LABELS, readableCode, rebind } from '../input/bindings'
import { isTouchDevice } from '../input/device'
import { GAME_ACTIONS, type GameAction } from '../input/inputTypes'
import { audioBus } from '../systems/audio'
import { loadSettings, resetSettings, saveSettings, type SettingsState } from '../state/settings'
import type { QualitySetting } from '../race/qualityProfile'
import { C, hex } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import {
  backPlate, notchedButton, screenTitle, segmented, slider, toggleRow,
  SAFE, TOUCH, type ButtonHandle, type SliderHandle, type ToggleHandle,
} from '../ui/mobile'

const TABS = ['AUDIO', 'ACCESSIBILITY', 'TOUCH', 'CONTROLS'] as const
type Tab = (typeof TABS)[number]

const QUALITY_CYCLE: QualitySetting[] = ['auto', 'high', 'low']

type RowKind = 'slider' | 'toggle' | 'option' | 'bind'
interface RowDef { id: string; label: string; kind: RowKind; action?: GameAction }

/** Per-row keyboard handle. */
interface RowCtl {
  def: RowDef
  setSelected(sel: boolean): void
  adjust?(delta: number): void
  toggle?(): void
}

export class SettingsScene extends Phaser.Scene {
  private settings!: SettingsState
  private fromScene = 'Root'
  private activeTab: Tab = 'AUDIO'
  private tabBar!: { setActive(i: number): void }
  private rowsContainer!: Phaser.GameObjects.Container
  private rows: RowCtl[] = []
  private selectedRow = 0
  private rebinding: GameAction | null = null
  private resetBtn!: ButtonHandle
  private rebindHint!: Phaser.GameObjects.Text

  constructor() { super('Settings') }

  init(data: { from?: string }) {
    this.fromScene = data?.from === 'Garage' ? 'Garage' : 'Root'
  }

  create() {
    this.settings = loadSettings()
    this.activeTab = 'AUDIO'
    this.selectedRow = 0
    this.rebinding = null

    sceneBackground(this, 'bg-race-ops', { veil: 0.66 })
    screenTitle(this, 'SETTINGS / CONTROLS', { x: SAFE.left, y: 92 })

    this.tabBar = segmented(this, GAME_WIDTH / 2, 210, [...TABS], (i) => this.switchTab(TABS[i]), { w: 1500, h: 66 })

    this.rowsContainer = this.add.container(0, 0)
    this.rebindHint = text(this, GAME_WIDTH / 2, 760, '', { size: 'bodySm', face: 'mono', color: C.textSecondary, align: 'center', origin: [0.5, 0.5], wordWrapWidth: 1200, lineSpacing: 10 })

    // sticky bottom actions
    this.resetBtn = notchedButton(this, GAME_WIDTH / 2, 962, {
      w: 460, h: 96, label: 'RESET DEFAULTS', size: 'action', variant: 'danger', align: 'center',
      onActivate: () => this.doReset(),
      onFocus: () => { this.selectedRow = this.rows.length; this.refreshSelection() },
    })
    const backLabel = this.fromScene === 'Garage' ? 'GARAGE' : 'MAIN'
    backPlate(this, backLabel, () => this.exit(), { x: SAFE.left + 160, y: 962, w: 320 })

    const kb = this.input.keyboard!
    const onKey = (e: KeyboardEvent) => this.handleKey(e)
    kb.on('keydown', onKey)
    this.events.once('shutdown', () => kb.off('keydown', onKey))

    this.buildTab()
  }

  private switchTab(tab: Tab) {
    if (tab === this.activeTab) return
    this.activeTab = tab
    this.selectedRow = 0
    this.buildTab()
  }

  private tabDefs(): RowDef[] {
    switch (this.activeTab) {
      case 'AUDIO':
        return [
          { id: 'master', label: 'MASTER VOLUME', kind: 'slider' },
          { id: 'music', label: 'MUSIC VOLUME', kind: 'slider' },
          { id: 'effects', label: 'EFFECTS VOLUME', kind: 'slider' },
          { id: 'mute', label: 'MUTED', kind: 'toggle' },
        ]
      case 'ACCESSIBILITY':
        return [
          { id: 'shake', label: 'REDUCED SHAKE', kind: 'toggle' },
          { id: 'flash', label: 'REDUCED FLASH', kind: 'toggle' },
          { id: 'quality', label: 'GRAPHICS QUALITY', kind: 'option' },
        ]
      case 'TOUCH':
        return [
          { id: 'touchOpacity', label: 'TOUCH OPACITY', kind: 'slider' },
          { id: 'touchMirrored', label: 'MIRROR TOUCH LAYOUT', kind: 'toggle' },
          { id: 'turbo', label: 'TURBO INPUT', kind: 'toggle' },
          { id: 'fire', label: 'FIRE INPUT', kind: 'toggle' },
        ]
      case 'CONTROLS':
        return isTouchDevice() ? [] : GAME_ACTIONS.map((a) => ({ id: a, label: ACTION_LABELS[a], kind: 'bind' as RowKind, action: a }))
    }
  }

  private buildTab() {
    this.rowsContainer.removeAll(true)
    this.rows = []
    this.tabBar.setActive(TABS.indexOf(this.activeTab))
    this.rebindHint.setText('')

    const defs = this.tabDefs()
    const cx = GAME_WIDTH / 2
    const w = 1400

    if (this.activeTab === 'CONTROLS' && isTouchDevice()) {
      this.rebindHint.setText('Key and gamepad rebinding needs a physical keyboard or gamepad — not available on a touch screen. Connect one to customise bindings for that play session.')
    }
    if (this.activeTab === 'CONTROLS' && !isTouchDevice()) {
      this.rebindHint.setPosition(cx, 900).setText('Select a binding and press a key. Esc cancels a rebind.')
    } else {
      this.rebindHint.setPosition(cx, 760)
    }

    // controls tab: many rows → tighter pitch + smaller height
    const isBinds = this.activeTab === 'CONTROLS' && !isTouchDevice()
    const rowH = isBinds ? 72 : TOUCH.minH + 12
    const pitch = isBinds ? 82 : 118
    const top = 320

    defs.forEach((def, i) => {
      const y = top + i * pitch
      this.rows.push(this.buildRow(def, cx, y, w, rowH))
    })
    this.refreshSelection()
  }

  private buildRow(def: RowDef, x: number, y: number, w: number, h: number): RowCtl {
    const s = this.settings
    if (def.kind === 'slider') {
      let ratio = 0, valueLabel = ''
      if (def.id === 'touchOpacity') { ratio = (s.touchOpacity - 0.2) / 0.8; valueLabel = `${Math.round(s.touchOpacity * 100)}%` }
      else { const v = def.id === 'master' ? s.masterVolume : def.id === 'music' ? s.musicVolume : s.effectsVolume; ratio = v; valueLabel = `${Math.round(v * 100)}%` }
      const setFromRatio = (r: number) => {
        if (def.id === 'touchOpacity') s.touchOpacity = Phaser.Math.Clamp(Math.round((0.2 + r * 0.8) * 10) / 10, 0.2, 1)
        else {
          const v = Phaser.Math.Clamp(Math.round(r * 10) / 10, 0, 1)
          if (def.id === 'master') s.masterVolume = v; else if (def.id === 'music') s.musicVolume = v; else s.effectsVolume = v
        }
        this.persist(); repaint()
      }
      const h2: SliderHandle = slider(this, x, y, w, def.label, ratio, valueLabel, { onScrub: setFromRatio })
      this.rowsContainer.add(h2.container)
      const repaint = () => {
        if (def.id === 'touchOpacity') h2.setValue((s.touchOpacity - 0.2) / 0.8, `${Math.round(s.touchOpacity * 100)}%`)
        else { const v = def.id === 'master' ? s.masterVolume : def.id === 'music' ? s.musicVolume : s.effectsVolume; h2.setValue(v, `${Math.round(v * 100)}%`) }
      }
      return {
        def, setSelected: (sel) => h2.setSelected(sel),
        adjust: (d) => setFromRatio(ratio2(def, s) + d * 0.1),
      }
    }
    if (def.kind === 'toggle') {
      const get = () => this.toggleValue(def.id)
      const h2: ToggleHandle = toggleRow(this, x, y, w, def.label, get().on, get().label, { onToggle: () => { this.doToggle(def.id); const g = get(); h2.setValue(g.on, g.label) } })
      this.rowsContainer.add(h2.container)
      return { def, setSelected: (sel) => h2.setSelected(sel), toggle: () => { this.doToggle(def.id); const g = get(); h2.setValue(g.on, g.label) } }
    }
    if (def.kind === 'option') {
      // GRAPHICS QUALITY: label + a 3-way segmented control
      const container = this.add.container(x, y)
      const g = this.add.graphics()
      this.drawRowPlate(g, w, h, false)
      container.add(g)
      container.add(text(this, -w / 2 + 28, 0, def.label, { size: 'action', face: 'display', weight: 600, letterSpacing: 2, origin: [0, 0.5], color: C.textPrimary }))
      const seg = segmented(this, w / 2 - 260, 0, ['AUTO', 'HIGH', 'LOW'], (i) => { this.settings.quality = QUALITY_CYCLE[i]; this.persist() }, { w: 460, h: 60, size: 'caption' })
      seg.setActive(QUALITY_CYCLE.indexOf(s.quality))
      container.add(seg.container)
      this.rowsContainer.add(container)
      let selected = false
      const repaintPlate = () => { g.clear(); this.drawRowPlate(g, w, h, selected) }
      return {
        def,
        setSelected: (sel) => { selected = sel; repaintPlate() },
        adjust: (d) => { const idx = (QUALITY_CYCLE.indexOf(this.settings.quality) + d + QUALITY_CYCLE.length) % QUALITY_CYCLE.length; this.settings.quality = QUALITY_CYCLE[idx]; seg.setActive(idx); this.persist() },
      }
    }
    // bind row
    const container = this.add.container(x, y)
    const g = this.add.graphics()
    this.drawRowPlate(g, w, h, false)
    container.add(g)
    container.add(text(this, -w / 2 + 28, 0, def.label, { size: 'bodySm', face: 'display', weight: 600, letterSpacing: 1, origin: [0, 0.5], color: C.textPrimary }))
    const valText = text(this, w / 2 - 28, 0, '', { size: 'bodySm', face: 'mono', origin: [1, 0.5], color: C.oxide })
    container.add(valText)
    const hit = this.add.rectangle(0, 0, w, h, 0, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerup', () => { this.rebinding = def.action!; this.refreshBind(valText, def.action!) })
    container.add(hit)
    this.rowsContainer.add(container)
    let selected = false
    const repaintPlate = () => { g.clear(); this.drawRowPlate(g, w, h, selected) }
    const ctl: RowCtl = {
      def,
      setSelected: (sel) => { selected = sel; repaintPlate(); this.refreshBind(valText, def.action!) },
      toggle: () => { this.rebinding = def.action!; this.refreshBind(valText, def.action!) },
    }
    ;(ctl as RowCtl & { _val?: Phaser.GameObjects.Text })._val = valText
    this.refreshBind(valText, def.action!)
    return ctl
  }

  private refreshBind(valText: Phaser.GameObjects.Text, action: GameAction) {
    if (this.rebinding === action) { valText.setText('PRESS A KEY…').setColor(hex(C.warn)); return }
    valText.setText(this.settings.bindings[action].map(readableCode).join(' / ')).setColor(hex(C.oxide))
  }

  private drawRowPlate(g: Phaser.GameObjects.Graphics, w: number, h: number, selected: boolean) {
    g.fillStyle(C.surfacePlate, 0.9)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 10)
    g.lineStyle(selected ? 3 : 2, selected ? C.oxide : C.line, 1)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
  }

  private toggleValue(id: string): { on: boolean; label: string } {
    const s = this.settings
    switch (id) {
      case 'mute': return { on: s.muted, label: s.muted ? 'ON' : 'OFF' }
      case 'shake': return { on: s.reducedShake, label: s.reducedShake ? 'ON' : 'OFF' }
      case 'flash': return { on: s.reducedFlash, label: s.reducedFlash ? 'ON' : 'OFF' }
      case 'touchMirrored': return { on: s.touchMirrored, label: s.touchMirrored ? 'ON' : 'OFF' }
      case 'turbo': return { on: s.toggleTurbo, label: s.toggleTurbo ? 'TOGGLE' : 'HOLD' }
      case 'fire': return { on: s.toggleFire, label: s.toggleFire ? 'TOGGLE' : 'HOLD' }
      default: return { on: false, label: 'OFF' }
    }
  }

  private doToggle(id: string) {
    const s = this.settings
    if (id === 'mute') s.muted = !s.muted
    if (id === 'shake') s.reducedShake = !s.reducedShake
    if (id === 'flash') s.reducedFlash = !s.reducedFlash
    if (id === 'touchMirrored') s.touchMirrored = !s.touchMirrored
    if (id === 'turbo') s.toggleTurbo = !s.toggleTurbo
    if (id === 'fire') s.toggleFire = !s.toggleFire
    this.persist()
  }

  private handleKey(e: KeyboardEvent) {
    if (this.rebinding) {
      if (e.code === 'Escape') this.rebinding = null
      else { this.settings.bindings = rebind(this.settings.bindings, this.rebinding, e.code); this.rebinding = null; this.persist() }
      this.buildTab()
      return
    }
    if (e.code === 'Tab') { e.preventDefault(); this.switchTab(TABS[(TABS.indexOf(this.activeTab) + 1) % TABS.length]); return }
    if (e.code === 'Escape') { this.exit(); return }
    const total = this.rows.length + 1 // + RESET
    if (e.code === 'ArrowUp') { this.selectedRow = (this.selectedRow + total - 1) % total; this.refreshSelection() }
    else if (e.code === 'ArrowDown') { this.selectedRow = (this.selectedRow + 1) % total; this.refreshSelection() }
    else if (e.code === 'ArrowLeft') this.rows[this.selectedRow]?.adjust?.(-1)
    else if (e.code === 'ArrowRight') this.rows[this.selectedRow]?.adjust?.(1)
    else if (e.code === 'Enter') {
      if (this.selectedRow >= this.rows.length) { this.doReset(); return }
      const row = this.rows[this.selectedRow]
      if (row?.toggle) row.toggle()
      else row?.adjust?.(1) // options/sliders: Enter nudges forward
    }
  }

  private refreshSelection() {
    this.rows.forEach((r, i) => r.setSelected(i === this.selectedRow))
    this.resetBtn.setState({ selected: this.selectedRow >= this.rows.length, enabled: true })
  }

  private doReset() {
    this.settings = resetSettings()
    audioBus.applySettings(this.settings)
    this.buildTab()
  }

  private persist() { saveSettings(this.settings); audioBus.applySettings(this.settings) }

  private exit() {
    this.persist()
    this.scene.start(this.fromScene)
  }
}

/** Current 0..1 ratio for a slider row's underlying setting. */
function ratio2(def: RowDef, s: SettingsState): number {
  if (def.id === 'touchOpacity') return (s.touchOpacity - 0.2) / 0.8
  return def.id === 'master' ? s.masterVolume : def.id === 'music' ? s.musicVolume : s.effectsVolume
}
