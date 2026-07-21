import Phaser from 'phaser'
import { audioBus } from '../systems/audio'
import { hasSavedCareer, readCareer } from '../state/saveGame'
import { loadSettings, saveSettings } from '../state/settings'
import { C, hex } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { coverBakedMenuArt, notchedButton, SAFE, type ButtonHandle } from '../ui/mobile'

interface RootItem {
  label: string
  activate: (scene: RootScene) => void
}

const ITEMS: RootItem[] = [
  {
    label: 'SINGLE PLAYER',
    activate: (s) => {
      if (hasSavedCareer() && readCareer()) s.scene.start('Menu')
      else s.scene.start('Profile', { firstLaunch: true })
    },
  },
  { label: 'MULTIPLAYER', activate: (s) => s.scene.start('Multiplayer') },
  { label: 'SETTINGS', activate: (s) => s.scene.start('Settings', { from: 'Root' }) },
]

/**
 * Root Main — the three-option entry the whole game hangs off. Deliberately
 * carries only SINGLE PLAYER / MULTIPLAYER / SETTINGS; career specifics live
 * one level down in the Single Player hub.
 */
export class RootScene extends Phaser.Scene {
  private selected = 0
  private buttons: ButtonHandle[] = []
  private muteIcon!: Phaser.GameObjects.Text

  constructor() {
    super('Root')
  }

  create() {
    audioBus.applySettings(loadSettings())
    this.selected = 0
    this.buttons = []

    // menu-peykan-background.webp bakes the OLD "PROJECT DEATHRALLY /
    // DEVELOPMENT TITLE" wordmark top-left and eight empty plates on the right.
    // Cover both so only the car + environment read through, then draw the
    // fresh working-title treatment and three plates on top.
    sceneBackground(this, 'bg-menu', { veil: 0.42 })
    coverBakedMenuArt(this)

    this.buildTitle()

    // three stacked plates in the lower-middle/right quiet zone
    const bx = 1240
    const bw = 720
    const bh = 118
    const startY = 486
    const gap = bh + 32
    ITEMS.forEach((item, i) => {
      const btn = notchedButton(this, bx, startY + i * gap, {
        w: bw, h: bh, label: item.label, size: 'title', variant: i === 0 ? 'primary' : 'secondary',
        onFocus: () => { this.selected = i; this.refresh() },
        onActivate: () => { this.selected = i; this.activate() },
      })
      this.buttons.push(btn)
    })

    this.buildMute()

    const kb = this.input.keyboard!
    const up = () => this.move(-1)
    const down = () => this.move(1)
    const enter = () => this.activate()
    const mute = () => this.toggleMute()
    kb.once('keydown', () => audioBus.unlock())
    this.input.once('pointerdown', () => audioBus.unlock())
    kb.on('keydown-UP', up)
    kb.on('keydown-DOWN', down)
    kb.on('keydown-ENTER', enter)
    kb.on('keydown-M', mute)
    this.events.once('shutdown', () => {
      kb.off('keydown-UP', up); kb.off('keydown-DOWN', down)
      kb.off('keydown-ENTER', enter); kb.off('keydown-M', mute)
    })

    this.refresh()
  }

  private buildTitle() {
    const cx = 1240
    const y = 300
    const white = text(this, 0, y, 'DeathRally:', {
      size: 'hero', face: 'display', weight: 700, letterSpacing: 1,
      color: C.textPrimary, stroke: C.shadow, strokeThickness: 8, origin: [1, 0.5],
    })
    const orange = text(this, 0, y, ' Peykan Javanan', {
      size: 'hero', face: 'display', weight: 700, letterSpacing: 1,
      color: C.oxide, stroke: C.shadow, strokeThickness: 8, origin: [0, 0.5],
    })
    const total = white.width + orange.width
    const splitX = cx - total / 2 + white.width
    white.setX(splitX)
    orange.setX(splitX)

    // "— ORIGINAL COMBAT RACER —" descriptor
    text(this, cx, y + 66, '·  ORIGINAL COMBAT RACER  ·', {
      size: 'body', face: 'display', weight: 600, letterSpacing: 8, color: C.oxideDim, origin: [0.5, 0.5],
    })
  }

  private buildMute() {
    const x = SAFE.right - 34
    const y = SAFE.top + 26
    const g = this.add.graphics({ x, y })
    g.fillStyle(C.surfaceHud, 0.6); g.fillCircle(0, 0, 32)
    g.lineStyle(2, C.border, 1); g.strokeCircle(0, 0, 32)
    this.muteIcon = text(this, x, y, '', { size: 'heading', origin: [0.5, 0.5], color: C.textSecondary })
    this.refreshMute()
    const hit = this.add.circle(x, y, 34, 0, 0).setInteractive(
      new Phaser.Geom.Circle(0, 0, 34), Phaser.Geom.Circle.Contains,
    )
    hit.on('pointerup', () => this.toggleMute())
  }

  private refreshMute() {
    const muted = loadSettings().muted
    this.muteIcon.setText(muted ? '🔇' : '🔊').setColor(hex(muted ? C.danger : C.textSecondary))
  }

  private toggleMute() {
    const settings = loadSettings()
    settings.muted = !settings.muted
    saveSettings(settings)
    audioBus.applySettings(settings)
    this.refreshMute()
  }

  private move(delta: number) {
    this.selected = (this.selected + delta + ITEMS.length) % ITEMS.length
    this.refresh()
  }

  private refresh() {
    this.buttons.forEach((b, i) => b.setState({ selected: i === this.selected, enabled: true }))
  }

  private activate() {
    ITEMS[this.selected].activate(this)
  }
}
