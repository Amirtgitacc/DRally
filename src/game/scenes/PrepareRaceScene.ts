import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { starsFor } from '../../core/ai/talent'
import { carById } from '../../data/cars'
import { talentOf } from '../../data/drivers'
import { rosterById } from '../../data/roster'
import { drawTrackMap } from '../ui/trackMap'
import { getCurrentOffer } from '../state/roundState'
import { loadCareer } from '../state/saveGame'
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { backButton, flavor, heading, panel, text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { isTouchDevice } from '../input/device'

/** Briefing text must describe the input the player actually has to hand. */
function controlLines(): string[] {
  if (isTouchDevice()) {
    return [
      'Pad steers · the car accelerates itself',
      'BRK slows · HB handbrake · FIRE / MINE / TURBO',
      'Pause and mute sit along the top edge',
    ]
  }
  return ['Arrows/WASD drive · X fire · C mine', 'Shift turbo · Space handbrake · Esc pause']
}

export class PrepareRaceScene extends Phaser.Scene {
  constructor() { super('PrepareRace') }
  create() {
    const offer = getCurrentOffer()
    if (!offer) { this.scene.start('SignUp'); return }
    const career = loadCareer(); const track = offer.track; const color = TIER_COLOR[track.tier]
    sceneBackground(this, 'bg-race-ops', { veil: 0.4 })
    heading(this, GAME_WIDTH / 2, 68, 'RACE BRIEFING')
    panel(this, 570, 500, 900, 760, { stroke: color, strokeAlpha: 0.9 })
    const map = this.add.graphics(); drawTrackMap(map, track, { cx: 570, cy: 465, width: 760, height: 520, color, lineWidth: 7, showStart: true, showSurface: true })
    text(this, 570, 790, `${track.name} · ${TIER_LABEL[track.tier]} · ${track.laps} laps`, { size: 'subtitle', color, origin: [0.5, 0.5] })
    panel(this, 1430, 500, 680, 760, { stroke: C.border, strokeAlpha: 1 })
    const rivals = offer.duel ? ['THE CHAMPION · ★★★★'] : offer.rivalIds.map((id) => `${rosterById(id).name.padEnd(18)} ${starsFor(talentOf(id).grade)}`)
    const gear = [career.mines ? `${career.mines} mines` : '', career.ramPlating ? 'ram plating' : '', career.overTurbo ? 'overcharge' : '', career.sabotage ? 'sabotage' : ''].filter(Boolean)
    text(this, 1140, 180, ['DRIVER', `${career.profile.driverName} · ${carById(career.carId).name}`, `Condition ${career.damage}% damage`, '', 'LOADOUT', gear.length ? gear.join(' · ') : 'Stock configuration', `Weapons ${career.profile.weaponsEnabled ? 'enabled' : 'disabled'}`, '', 'RIVALS', ...rivals, '', 'CONTROLS', ...controlLines()].join('\n'), { size: 'body', color: C.textBody, lineSpacing: 9 })
    flavor(this, GAME_WIDTH / 2, GAME_HEIGHT - 55, 'Enter: begin countdown · Esc: return to sign-up')
    const kb = this.input.keyboard!
    const start = () => this.scene.start('Race')
    const back = () => this.scene.start('SignUp')
    // single "press Enter to start" screen — a full-screen tap does the same thing;
    // backButton is added after so it renders on top and takes priority in its own area
    this.add.zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT).setInteractive().on('pointerup', start)
    backButton(this, back)
    kb.on('keydown-ENTER', start); kb.on('keydown-ESC', back)
    this.events.once('shutdown', () => { kb.off('keydown-ENTER', start); kb.off('keydown-ESC', back) })
  }
}
