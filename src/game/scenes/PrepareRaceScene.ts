import Phaser from 'phaser'
import { starsFor } from '../../core/ai/talent'
import { carById } from '../../data/cars'
import { talentOf } from '../../data/drivers'
import { rosterById } from '../../data/roster'
import { drawTrackMap } from '../ui/trackMap'
import { getCurrentOffer } from '../state/roundState'
import { loadCareer } from '../state/saveGame'
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { isTouchDevice } from '../input/device'
import { backPlate, card, notchedButton, screenTitle, SAFE } from '../ui/mobile'

/** Briefing text must describe the input the player actually has to hand. */
function controlLines(weaponsEnabled: boolean): string[] {
  if (isTouchDevice()) {
    return [
      'PAD STEERS · AUTO ACCELERATE',
      weaponsEnabled ? 'BRK · HB · TURBO · FIRE · MINE' : 'BRK · HB · TURBO (no weapons)',
    ]
  }
  return [
    weaponsEnabled ? 'Arrows/WASD drive · X fire · C mine' : 'Arrows/WASD drive · no weapons',
    'Shift turbo · Space handbrake · Esc pause',
  ]
}

export class PrepareRaceScene extends Phaser.Scene {
  constructor() { super('PrepareRace') }

  create() {
    const offer = getCurrentOffer()
    if (!offer) { this.scene.start('SignUp'); return }
    const career = loadCareer()
    const track = offer.track
    const color = TIER_COLOR[track.tier]

    sceneBackground(this, 'bg-race-ops', { veil: 0.44 })

    screenTitle(this, 'RACE BRIEFING', { x: SAFE.left, y: 92 })
    text(this, SAFE.left, 150, `${track.name.toUpperCase()} · ${TIER_LABEL[track.tier]} · ${track.laps} LAPS`, {
      size: 'body', face: 'display', weight: 600, letterSpacing: 2, color, origin: [0, 0.5],
    })

    // ---- left: circuit map ----
    card(this, 560, 520, 880, 660, undefined, { accent: color })
    const map = this.add.graphics()
    drawTrackMap(map, track, { cx: 560, cy: 520, width: 760, height: 520, color, lineWidth: 7, showStart: true, showSurface: true })

    // ---- right: dossier card with sections ----
    const rx = 1440
    card(this, rx, 520, 860, 660, undefined, { accent: C.oxideDim })
    const lx = rx - 400
    let y = 250
    const section = (title: string, lines: string[], titleColor = C.oxide) => {
      text(this, lx, y, title, { size: 'caption', face: 'display', weight: 600, letterSpacing: 3, color: titleColor, origin: [0, 0.5] })
      y += 40
      text(this, lx, y, lines.join('\n'), { size: 'bodySm', face: 'mono', color: C.textBody, lineSpacing: 8, origin: [0, 0], wordWrapWidth: 780 })
      y += 22 + lines.length * 30 + 24
    }

    const gear = [career.mines ? `${career.mines} MINES` : '', career.ramPlating ? 'RAM PLATING' : '', career.overTurbo ? 'OVERCHARGE' : '', career.sabotage ? 'SABOTAGE' : ''].filter(Boolean)
    const rivals = offer.duel
      ? ['THE CHAMPION · ★★★★']
      : offer.rivalIds.map((id) => `${rosterById(id).name.padEnd(16)} ${starsFor(talentOf(id).grade)}`)

    section('DRIVER', [`${career.profile.driverName} · ${carById(career.carId).name}`, `CONDITION ${career.damage}% DAMAGE`])
    section('LOADOUT', [gear.length ? gear.join(' · ') : 'STOCK CONFIGURATION', `WEAPONS ${career.profile.weaponsEnabled ? 'ENABLED' : 'DISABLED'}`])
    section('RIVALS', rivals)
    section('TOUCH CONTROLS', controlLines(career.profile.weaponsEnabled))

    // ---- bottom: begin + back ----
    const start = () => this.scene.start('Race')
    const back = () => this.scene.start('SignUp')
    notchedButton(this, 960 + 100, 962, { w: 1080, h: 100, label: 'BEGIN COUNTDOWN', size: 'title', variant: 'primary', align: 'center', onActivate: start })
      .setState({ selected: true, enabled: true })
    backPlate(this, 'RACE SIGN-UP', back, { x: SAFE.left + 160, y: 962, w: 320 })

    const kb = this.input.keyboard!
    kb.on('keydown-ENTER', start); kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => { kb.off('keydown-ENTER', start); kb.off('keydown-ESC', back) })
  }
}
