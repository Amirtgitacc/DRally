import Phaser from 'phaser'
import { DEBUG, SHOW_GATES } from '../../config/game'
import {
  isAirborne,
  lateralSpeed,
  launchCar,
  speed,
  type CarInput,
  type CarState,
} from '../../core/vehicle/carPhysics'
import {
  distanceToClosedPolyline,
  lineTangentAt,
  offsetClosedPolyline,
  scatterPointsAlong,
  signedLoopArea,
  spacedPointsAlong,
  spacedPosesAlong,
  turnAmount,
  type Gate,
  type Pose,
  type Vec2,
} from '../../core/track/geometry'
import { buildRaceEnv, computeBarriers } from '../../core/race/raceEnvBuilder'
import { resolveDecorations } from '../../core/track/setPieces'
import { placeSpritesAlong, scatterImages } from '../track/placement'
import { currentLap } from '../../core/race/progress'
import { ordinal } from '../../core/race/placement'
import { type PickupType } from '../../core/track/pickups'
import {
  talentAimSpread,
  talentMineCooldown,
  talentMineCount,
  talentPace,
  talentRubberBand,
  talentTuning,
} from '../../core/ai/talent'
import { mineIsArmed } from '../../core/combat/mines'
import { formatTime } from '../../core/race/format'
import { effectiveCarSpec, NO_UPGRADES } from '../../core/vehicle/carSpec'
import { applyAbandonOutcome, applyRaceOutcome, updateTrackRecord, type CareerState } from '../../core/progression/career'
import { applyDuelOutcome } from '../../core/progression/duel'
import { rewardFor } from '../../core/economy/rewards'
import { settleLoanAfterRace } from '../../core/economy/blackMarket'
import { loadCareer, saveCareer } from '../state/saveGame'
import { getCurrentOffer, setCurrentOffer } from '../state/roundState'
import { audioBus } from '../systems/audio'
import {
  applyRaceLadderResults,
  pickRivals,
  rankOf,
  rivalChassisId,
  rivalStrength,
  rivalUpgrades,
  simulateRound,
} from '../../core/progression/ladder'
import { rosterById } from '../../data/roster'
import { BOSS } from '../../data/boss'
import { SABOTAGE } from '../../data/blackMarket'
import { ALL_TRACKS, TRACKS_BY_TIER, trackById } from '../../data/tracks'
import { STARTER_CAR, carById, carTopTexture, pickSeededVariant } from '../../data/cars'
import { DRIVING_STYLES, RUBBER_BAND, TALENT_PROFILES, styleForGrade, talentOf } from '../../data/drivers'
import {
  AI_MINES,
  GUN,
  IMPACT_FX,
  MINES,
  MINE_BLAST,
  PICKUPS,
  TURBO_FX,
  WEAPONS_FREE_DELAY_MS,
} from '../../data/weapons'
import type { TrackDef, TrackEnvironmentKind } from '../../data/tracks/types'
import type { RaceResults } from './ResultsScene'
import { C, STROKE, TYPE, hex } from '../ui/theme'
import { damageColor, heading, hintBar, modal, plate, statBar, text, tile, wireTiles, type TileHandle } from '../ui/widgets'
import {
  anchorBottom,
  anchorRight,
  gearTagFontScale,
  gearTagY,
  hudScale,
  speedTextBottomMargin,
  STATUS_PLATE_X,
  statusBarX,
  statusBarWidth,
  statusPlateWidth,
  statusValueX,
} from '../race/hudScale'
import { InputManager } from '../input/inputManager'
import { TouchControls } from '../input/touchControls'
import { isTouchDevice } from '../input/device'
import { loadSettings, saveSettings, type SettingsState } from '../state/settings'
import { QUALITY_PROFILE, resolveQuality, type ResolvedQuality } from '../race/qualityProfile'
import { createSeededRandom, randomSeed } from '../../core/race/random'
import { FixedStepClock } from '../race/raceSimulation'
import {
  createRaceState,
  type BulletSim,
  type CarSetup,
  type CarSim,
  type RaceEnv,
  type RaceState,
} from '../../core/race/raceState'
import { stepRace, type PlayerCommand } from '../../core/race/stepRace'
import { computeAiInput } from '../../core/race/aiControl'
import type { SimEvent } from '../../core/race/simEvents'
import { damageCarSim } from '../../core/race/combatStep'
import { tryDropMine as tryDropMineSim } from '../../core/race/minesStep'
import { NetworkSource } from '../race/raceSource'
import type { NetClient } from '../net/netClient'
import type { RaceStartPayload, RaceStanding, ServerMsg } from '../../core/net/protocol'

const CAR_SCALE = 0.44
const MPH_PER_PX = 0.14

/** The visual half of the old CarUnit: the Phaser objects a car renders through. */
interface CarView {
  /** resting sprite/shadow scale for this chassis (CAR_SCALE × its sizeScale) */
  baseScale: number
  sprite: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
  exhaust: Phaser.GameObjects.Particles.ParticleEmitter
  damageSmoke: Phaser.GameObjects.Particles.ParticleEmitter
  turboFlame: Phaser.GameObjects.Particles.ParticleEmitter
  /** exhaust flame drawn behind the car while boosting */
  flameCone: Phaser.GameObjects.Image
  turboGlow: Phaser.GameObjects.Image
  /** soft additive pool in the car's livery colour, so each chassis reads distinctly */
  liveryGlow: Phaser.GameObjects.Image
  headlights: Phaser.GameObjects.Image[]
  taillights: Phaser.GameObjects.Image[]
  fireGlow: Phaser.GameObjects.Image | null
}

interface DriveOverride extends CarInput {
  fire?: boolean
  turbo?: boolean
  dropMine?: boolean
}

export class RaceScene extends Phaser.Scene {
  private track!: TrackDef
  private rivalIds: string[] = []
  private centerline: Vec2[] = []
  private gates: Gate[] = []
  private barriers: Vec2[] = []
  /** authored set-piece sprites, kept for the debug bounds overlay */
  private obstacleSprites: Phaser.GameObjects.Image[] = []

  private career!: CareerState
  private playerSpec = { ...STARTER_CAR }
  private isDuel = false
  private hasPlating = false
  private hasOverTurbo = false

  /** career: local single-player sim. network: render a server race via NetworkSource. */
  private mode: 'career' | 'network' = 'career'
  private net?: NetClient
  private netSource?: NetworkSource
  private raceStart?: RaceStartPayload
  /** final server standings, captured on raceEnd */
  private netStandings: RaceStanding[] = []
  /** guards showNetworkResults() against building the overlay twice */
  private resultsShown = false
  /** guards activateResultsTile() against a second REMATCH/LEAVE firing before
   *  the first completes (double-click, or Enter pressed twice) — see
   *  activateResultsTile() for why this must be a hard gate, not just UI state */
  private resultsActioned = false
  private resultsOverlay?: Phaser.GameObjects.Container
  private resultsHandles: TileHandle[] = []
  private resultsSelected = 0
  private onResultsKey?: (event: KeyboardEvent) => void
  /** shared, scene-scoped: every client showing the results overlay registers this once
   *  (in showNetworkResults) so any player's REMATCH returns ALL of them to the lobby via
   *  the server's broadcast `lobby` message; it removes itself once fired */
  private pendingRematchHandler?: (msg: ServerMsg) => void
  /** guards pendingRematchHandler against firing the Lobby transition twice */
  private lobbyTransitionStarted = false

  // the sim owns all race state; the scene only renders it
  private sim!: RaceState
  private env!: RaceEnv
  /** which sim car this client controls/watches; 'player' in single-player (cars[0]) */
  private localCarId = 'player'
  private clock = new FixedStepClock()
  private carInfo = new Map<string, { name: string; color: number; textureKey: string; chassisId?: string }>()
  private carViews = new Map<string, CarView>()
  private bulletViews = new Map<number, Phaser.GameObjects.Image>()
  private mineViews = new Map<number, { sprite: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image }>()
  private pickupViews: { sprite: Phaser.GameObjects.Image; pulse: Phaser.Tweens.Tween }[] = []
  private mineQueued = false
  private rivalsDoneToast?: Phaser.GameObjects.Text

  // reused per-frame scratch containers (avoid allocating a Set/Map every frame)
  private liveBulletIds = new Set<number>()
  private liveMineIds = new Set<number>()
  private carsById = new Map<string, CarSim>()

  /** presentation-only render quality, resolved once in create(); never touches sim state */
  private quality: ResolvedQuality = 'high'
  private particleScale = 1
  /** Persistent RenderTexture tire streaks — off on 'low' (mobile GPU fill). */
  private skidMarks = true

  private lookAheadX = 0
  private lookAheadY = 0
  /** cosmetics-only seeded RNG (debris scatter, flame flicker, streaks, scorch rotation) */
  private random: () => number = Math.random
  private raceSeed = 0
  private settings!: SettingsState
  private inputManager!: InputManager
  private touchControls?: TouchControls
  private fireToggled = false
  private turboToggled = false
  private resultCommitted = false

  private skidRT!: Phaser.GameObjects.RenderTexture
  private skidStamp!: Phaser.GameObjects.Image
  private scorchStamp!: Phaser.GameObjects.Image
  // Skid stamps collected during the per-car pass, then flushed in a SINGLE
  // beginDraw/endDraw batch each frame. Drawing each stamp with skidRT.draw()
  // forces its own WebGL framebuffer bind + pipeline flush — cheap on desktop
  // but a hard FPS hit on mobile once several cars are cornering at once.
  private pendingSkids: Array<{ x: number; y: number; rot: number }> = []
  private tireSmoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private explosionSmoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private hitSparks!: Phaser.GameObjects.Particles.ParticleEmitter
  private bulletTrail!: Phaser.GameObjects.Particles.ParticleEmitter

  private hudContainer!: Phaser.GameObjects.Container
  /** race HUD font/plate scale — 1 on desktop, TOUCH_HUD_SCALE on touch devices; see hudScale.ts */
  private hudScaleFactor = 1
  /** touch HUD variant: controls in the corners, stats bottom-centre + on buttons */
  private isTouchHud = false
  /** bottom-centre hull readout, touch layout only */
  private touchHullText?: Phaser.GameObjects.Text
  private hudBars!: Phaser.GameObjects.Graphics
  /** red border flash when the player takes a hit */
  private edgeFlash!: Phaser.GameObjects.Image
  /** speed streaks at the screen edges while boosting */
  private speedStreaks!: Phaser.GameObjects.Graphics
  private speedText!: Phaser.GameObjects.Text
  private cashText!: Phaser.GameObjects.Text
  private positionText!: Phaser.GameObjects.Text
  private lapText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private bestText!: Phaser.GameObjects.Text
  private hudStatusLabels: Phaser.GameObjects.Text[] = []
  private hudStatusValues: Phaser.GameObjects.Text[] = []
  private standingsTexts: Phaser.GameObjects.Text[] = []
  private countdownText!: Phaser.GameObjects.Text
  private lightsGfx!: Phaser.GameObjects.Graphics
  private debugText?: Phaser.GameObjects.Text

  /** wall clock for __step(), the debug-only manual game loop */
  private stepClock = 0

  private autoInput: DriveOverride | null = null

  constructor() {
    super('Race')
  }

  init(data?: { mode?: 'network'; net?: NetClient; raceStart?: RaceStartPayload }) {
    this.mode = data?.mode === 'network' ? 'network' : 'career'
    this.net = data?.net
    this.raceStart = data?.raceStart
  }

  create() {
    this.carInfo = new Map()
    this.carViews = new Map()
    this.bulletViews = new Map()
    this.mineViews = new Map()
    this.liveBulletIds.clear()
    this.liveMineIds.clear()
    this.carsById.clear()
    this.pickupViews = []
    this.barriers = []
    this.obstacleSprites = []
    this.standingsTexts = []
    this.hudStatusLabels = []
    this.hudStatusValues = []
    this.mineQueued = false
    this.rivalsDoneToast = undefined
    this.autoInput = null
    this.resultCommitted = false
    this.fireToggled = false
    this.turboToggled = false
    this.netStandings = []
    this.resultsShown = false
    this.resultsActioned = false
    this.resultsOverlay = undefined
    this.resultsHandles = []
    this.resultsSelected = 0
    this.onResultsKey = undefined
    this.pendingRematchHandler = undefined
    this.lobbyTransitionStarted = false
    this.clock = new FixedStepClock()

    // settings are career-independent (volume, bindings, reduced fx) — load in both modes
    this.settings = loadSettings()
    // presentation-only quality resolution: never read again mid-race, so a
    // settings change during a race takes effect on the next race, not live
    this.quality = resolveQuality(this.settings.quality, isTouchDevice())
    this.particleScale = QUALITY_PROFILE[this.quality].particleScale
    this.skidMarks = QUALITY_PROFILE[this.quality].skidMarks

    if (this.mode === 'network') {
      this.setupNetworkRace()
    } else {
      this.career = loadCareer()
      this.playerSpec = effectiveCarSpec(carById(this.career.carId), this.career.upgrades)

      // the accepted sign-up offer decides track and grid; fall back to a
      // default pro-tier round if the scene starts without one
      let offer = getCurrentOffer()
      if (!offer) {
        offer = {
          track: TRACKS_BY_TIER.pro[0],
          rivalIds: pickRivals('pro', this.random),
          seed: randomSeed(),
        }
        setCurrentOffer(offer)
      }
      this.track = offer.track
      this.rivalIds = offer.rivalIds
      this.isDuel = offer.duel === true
      this.raceSeed = offer.seed ?? randomSeed()
      this.random = createSeededRandom(this.raceSeed)
      this.hasPlating = this.career.ramPlating
      this.hasOverTurbo = this.career.overTurbo

      this.env = buildRaceEnv(this.track, {
        playerSpec: this.playerSpec,
        weaponsEnabled: this.career.profile.weaponsEnabled,
        hasPlating: this.hasPlating,
        hasOverTurbo: this.hasOverTurbo,
        raceEndMode: 'single-player',
      })
      this.centerline = this.env.centerline
      this.gates = this.env.gates

      this.buildWorld()
      this.env.barriers = this.barriers // keep the scene's authored barrier list identity

      const setups = this.buildCarSetups()
      this.sim = createRaceState(this.env, setups, this.raceSeed)
    }

    this.buildCarViews()
    this.buildPickupViews()
    this.buildSharedEffects()
    this.buildHud()
    this.setupCameras()
    this.setupInput()
    this.startCountdown()

    if (DEBUG) this.setupDebug()
  }

  /** Network mode: the sim/env come from the server via NetworkSource; the scene
   *  only renders interpolated snapshots. No career, offer, or local stepping. */
  private setupNetworkRace() {
    const raceStart = this.raceStart!
    this.track = trackById(raceStart.trackId)
    this.raceSeed = raceStart.seed
    this.random = createSeededRandom(this.raceSeed) // cosmetics only; server owns gameplay
    this.localCarId = raceStart.youId
    // stock chassis with no upgrades — network camera/HUD read spec, never the career
    this.playerSpec = effectiveCarSpec(carById(STARTER_CAR.id), NO_UPGRADES)
    this.hasPlating = false
    this.hasOverTurbo = false
    this.isDuel = false

    this.netSource = new NetworkSource(this.net!, raceStart, this.playerSpec)
    this.netSource.onRaceEnd((standings) => this.onNetworkRaceOver(standings))
    this.env = this.netSource.env
    this.sim = this.netSource.state
    this.centerline = this.env.centerline
    this.gates = this.env.gates

    for (const r of raceStart.roster) {
      this.carInfo.set(r.id, {
        name: r.name,
        color: r.color,
        textureKey: carTopTexture(r.chassisId, r.variantId),
        chassisId: r.chassisId,
      })
    }

    this.buildWorld()
    this.env.barriers = this.barriers
  }

  update(_time: number, delta: number) {
    if (this.mode === 'network') {
      // still poll local input and forward it; the server simulates it
      this.touchControls?.update(this.sim.phase === 'finished')
      this.inputManager.update()
      if (this.settings.toggleFire && this.inputManager.justDown('fire')) this.fireToggled = !this.fireToggled
      if (this.settings.toggleTurbo && this.inputManager.justDown('turbo')) this.turboToggled = !this.turboToggled
      if (this.inputManager.justDown('mine')) this.mineQueued = true
      // Debug-only network autopilot (smoke/perf runs): __autoPilot sets
      // sim.autoPilot + the local car's ai on the client skeleton, but the
      // server owns the real sim and never sees it. Translate that into an
      // input command here so the forwarded PlayerCommand drives the car. Gated
      // on sim.autoPilot, which only the debug hook ever sets — no effect on
      // real play.
      const localCar = this.myCar()
      if (this.sim.autoPilot && localCar.ai) {
        this.autoInput = {
          ...computeAiInput(this.sim, this.env, localCar),
          fire: this.sim.autoPilot.fire,
          turbo: this.sim.autoPilot.turbo,
        }
      }
      this.netSource!.sendLocalInput(this.buildPlayerCommand())
      this.mineQueued = false // consumed the moment it is sent
      this.netSource!.ingest(this.time.now, delta)
      this.sim = this.netSource!.state
      this.handleSimEvents(this.netSource!.drainEvents())
    } else {
      this.careerUpdate(delta)
    }

    // render sync (both modes; every frame, even 0-step frames)
    for (const car of this.sim.cars) {
      const view = this.carViews.get(car.id)!
      this.syncCarVisuals(car, view)
      this.updateCarEffects(car, view)
    }
    this.flushSkids()
    this.syncBulletViews()
    this.syncMineViews()
    this.syncPickupViews()
    this.updateCamera()
    this.updateHud(this.sim.simTimeMs)
  }

  private careerUpdate(delta: number) {
    this.touchControls?.update(this.sim.phase === 'finished')
    this.inputManager.update()
    if (this.settings.toggleFire && this.inputManager.justDown('fire')) this.fireToggled = !this.fireToggled
    if (this.settings.toggleTurbo && this.inputManager.justDown('turbo')) this.turboToggled = !this.turboToggled
    if (this.inputManager.justDown('mine')) this.mineQueued = true // latch across 0-step frames

    const command = this.buildPlayerCommand()
    this.clock.advance(delta, () => {
      const events = stepRace(this.sim, this.env, { player: command }, this.clock.stepMs)
      this.handleSimEvents(events)
      command.dropMine = false // consumed by the first step this frame
      this.mineQueued = false
    })
  }

  private myCar(): CarSim {
    return this.sim.cars.find((c) => c.id === this.localCarId)!
  }

  private myView() {
    return this.carViews.get(this.localCarId)!
  }

  private buildPlayerCommand(): PlayerCommand {
    const drive: DriveOverride = this.autoInput ?? this.readPlayerInput()
    return {
      input: { throttle: drive.throttle, brake: drive.brake, steer: drive.steer, handbrake: drive.handbrake },
      fire: drive.fire ?? (this.settings.toggleFire ? this.fireToggled : this.inputManager.down('fire')),
      turbo: drive.turbo ?? (this.settings.toggleTurbo ? this.turboToggled : this.inputManager.down('turbo')),
      dropMine: drive.dropMine ?? this.mineQueued,
    }
  }

  // ---------------------------------------------------------------- sim events

  private handleSimEvents(events: SimEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'countdown':
          this.drawCountdown(e.count)
          break
        case 'race-started':
          this.onRaceStarted()
          break
        case 'gun-fired':
          this.onGunFired(e)
          break
        case 'bullet-hit':
          this.onBulletHitFx(e)
          break
        case 'bullet-wall':
          this.hitSparks.explode(this.scaleCount(3), e.x, e.y)
          break
        case 'car-wrecked':
          this.onCarWreckedFx(e)
          break
        case 'car-landed':
          this.onLandingFx(e)
          break
        case 'cars-collided':
          this.onCarsCollidedFx(e)
          break
        case 'wall-hit':
          if (e.carId === this.localCarId && e.impact > 160) this.shake(90, Math.min(0.006, e.impact / 60000))
          break
        case 'crash-lurch':
          this.crashLurch(e.x, e.y)
          break
        case 'mine-dropped':
          this.onMineDropped(e)
          break
        case 'mine-detonated':
          this.onMineDetonatedFx(e)
          break
        case 'pickup-collected':
          this.onPickupCollected(e)
          break
        case 'pickup-respawned':
          this.onPickupRespawned(e.index)
          break
        case 'car-rescued':
          if (e.carId === this.localCarId) this.cameraFlash(160, 40, 40, 50)
          break
        case 'lap-completed':
        case 'car-finished':
          break // HUD reads state; no FX today
        case 'race-over':
          this.onRaceOver(e.reason)
          break
      }
    }
  }

  private onRaceOver(reason: 'player-finished' | 'player-wrecked' | 'rivals-done' | 'all-humans-done') {
    // network races end via the server's raceEnd message (onNetworkRaceOver);
    // the career results/save path must never run for a network race.
    if (this.mode !== 'career') return
    if (reason === 'player-finished') this.time.delayedCall(1400, () => this.transitionToResults(this.sim.simTimeMs, false))
    else if (reason === 'player-wrecked') this.time.delayedCall(2200, () => this.transitionToResults(this.sim.simTimeMs, true))
    else this.transitionToResults(this.sim.simTimeMs, false)
  }

  /** Server declared the race over: capture standings and raise the results
   *  overlay. No career/save/offer machinery — this is a standalone quick race. */
  private onNetworkRaceOver(standings: RaceStanding[]) {
    this.netStandings = standings
    this.showNetworkResults(standings)
  }

  /** Final server standings once a network race ends. The results overlay reads
   *  standings from the onNetworkRaceOver() parameter directly; this getter exists
   *  for external/debug access to the last-known standings. */
  get finalStandings(): RaceStanding[] {
    return this.netStandings
  }

  /** Leave a network race cleanly: detach the source, tell the server, drop the
   *  socket, and return to the menu. Network mode never opens RacePause. */
  private leaveNetworkRace() {
    this.netSource?.dispose()
    this.net?.send({ t: 'leave' })
    this.net?.close()
    this.scene.start('Menu')
  }

  /** Depth-topped, keyboard-navigable results overlay built inside `hudContainer`
   *  (screen space, rendered only by the fixed hudCam — see setupCameras) so it
   *  sits over the frozen race without inheriting the world camera's follow/zoom.
   *  Not a new Phaser scene: single-player's RacePause pattern doesn't apply here
   *  since network mode never pauses (see setupInput). */
  private showNetworkResults(standings: RaceStanding[]) {
    if (this.resultsShown) return
    this.resultsShown = true
    audioBus.engineStop()

    // Shown to every client at race end, so register the shared lobby-return
    // handler here (not in requestRematch): the server broadcasts `lobby` to the
    // whole room on any one player's rematch, and every client still on this
    // overlay must follow it back to the Lobby together.
    const onLobby = (msg: ServerMsg) => {
      if (msg.t !== 'lobby') return
      if (this.lobbyTransitionStarted) return
      this.lobbyTransitionStarted = true
      this.net!.offMessage(onLobby)
      this.pendingRematchHandler = undefined
      this.netSource?.dispose()
      this.scene.start('Lobby', { net: this.net, youId: this.localCarId, lobby: msg.lobby })
    }
    this.pendingRematchHandler = onLobby
    this.net!.onMessage(onLobby)

    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const panelW = 820
    const panelH = 300 + standings.length * 56
    const topY = cy - panelH / 2

    const objects: Phaser.GameObjects.GameObject[] = []
    objects.push(this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.72))
    objects.push(modal(this, cx, cy, panelW, panelH))
    objects.push(heading(this, cx, topY + 62, 'RACE COMPLETE'))

    standings.forEach((s, i) => {
      const best = s.lapTimes.length ? formatTime(Math.min(...s.lapTimes)) : '—'
      const isYou = s.id === this.localCarId
      objects.push(
        text(this, cx, topY + 130 + i * 52, `${s.place}. ${s.name}${isYou ? ' (you)' : ''}   ${best}`, {
          size: 'bodyLg',
          color: isYou ? C.oxide : C.textPrimary,
          origin: [0.5, 0.5],
        }),
      )
    })

    const tilesY = topY + panelH - 90
    const rematch = tile(this, cx - 220, tilesY, 400, 74, 'REMATCH')
    const leave = tile(this, cx + 220, tilesY, 400, 74, 'LEAVE', { select: C.danger })
    objects.push(rematch.rect, rematch.label, leave.rect, leave.label)

    this.resultsHandles = [rematch, leave]
    this.resultsSelected = 0
    this.refreshResultsSelection()
    wireTiles(
      this.resultsHandles,
      (i) => { this.resultsSelected = i; this.refreshResultsSelection() },
      (i) => this.activateResultsTile(i),
    )

    // screen space, above every existing hudContainer child (touch controls sit at depth 1000)
    this.resultsOverlay = this.add.container(0, 0, objects).setDepth(5000)
    this.hudContainer.add(this.resultsOverlay)

    this.cameraFlash(220, 255, 246, 220) // respects reducedFlash internally; skipped when set

    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        this.resultsSelected = this.resultsSelected === 0 ? 1 : 0
        this.refreshResultsSelection()
      } else if (event.code === 'Enter') {
        this.activateResultsTile(this.resultsSelected)
      }
    }
    this.onResultsKey = onKey
    this.input.keyboard?.on('keydown', onKey)
  }

  private refreshResultsSelection() {
    this.resultsHandles.forEach((h, i) => h.setState(i === this.resultsSelected, true))
  }

  /** Guarded against firing twice for the same overlay: without this, a
   *  double-click or a double Enter-press before the server responds could
   *  register two `onLobby` handlers (NetClient.offMessage doesn't affect an
   *  in-flight forEach in onMessage), so both would fire on the single `lobby`
   *  broadcast and run the rematch/leave handoff twice. */
  private activateResultsTile(i: number) {
    if (this.resultsActioned) return
    this.resultsActioned = true
    this.resultsHandles.forEach((h, hi) => h.setState(hi === i, false))
    if (i === 0) this.requestRematch()
    else this.leaveNetworkRace()
  }

  /** Ask the server for a rematch. The server resets the room, re-seats every
   *  still-connected player, and broadcasts `lobby` to the whole room — the shared
   *  handler registered in showNetworkResults() (for every client on the overlay,
   *  including this one) handles the handoff to LobbyScene. */
  private requestRematch() {
    this.net!.send({ t: 'rematch' })
  }

  // ---------------------------------------------------------------- FX handlers

  private onGunFired(e: Extract<SimEvent, { type: 'gun-fired' }>) {
    // adopt the freshly spawned bullet for this shot: the oldest of this
    // shooter's bullets without a view yet (events arrive in bullet-id order)
    let target: BulletSim | undefined
    for (const b of this.sim.bullets) {
      if (b.ownerId === e.carId && !this.bulletViews.has(b.id)) {
        target = b
        break
      }
    }
    if (target) {
      const sprite = this.add.image(target.x, target.y, 'bullet').setRotation(e.dir).setScale(0.7).setDepth(6).setBlendMode(Phaser.BlendModes.ADD)
      this.cameras.cameras[1]?.ignore(sprite)
      this.bulletViews.set(target.id, sprite)
    }

    const distToPlayer = e.carId === this.localCarId
      ? 0
      : Math.hypot(e.x - this.myCar().state.x, e.y - this.myCar().state.y)
    if (distToPlayer < 900) audioBus.shot(1 - distToPlayer / 1000)

    // muzzle flash (audio hook: gunshot)
    const flash = this.add
      .image(e.x, e.y, 'muzzle')
      .setScale(0.8)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(flash)
    this.tweens.add({ targets: flash, alpha: 0, scale: 0.3, duration: 70, onComplete: () => flash.destroy() })
  }

  private onBulletHitFx(e: Extract<SimEvent, { type: 'bullet-hit' }>) {
    this.hitSparks.explode(this.scaleCount(5), e.x, e.y)
    this.flashCar(e.carId)
    if (e.carId === this.localCarId) {
      this.shake(60, IMPACT_FX.playerHitShake)
      this.flashScreenEdge(C.danger, IMPACT_FX.playerHitFlashAlpha)
    }
  }

  private onCarsCollidedFx(e: Extract<SimEvent, { type: 'cars-collided' }>) {
    if (e.rammed) {
      // metal on metal: sparks scale with how hard they met
      this.hitSparks.explode(this.scaleCount(Math.round(6 + Math.min(18, e.impact / 40))), e.x, e.y)
      this.flashCar(e.aId)
      this.flashCar(e.bId)
    }
    if ((e.aId === this.localCarId || e.bId === this.localCarId) && e.impact > 180) {
      this.shake(70 + Math.min(140, e.impact / 6), Math.min(IMPACT_FX.crashMaxShake, e.impact / 45000))
    }
  }

  private onCarWreckedFx(e: Extract<SimEvent, { type: 'car-wrecked' }>) {
    const view = this.carViews.get(e.carId)!
    audioBus.explosion()
    this.explosionSmoke.explode(this.scaleCount(30), e.x, e.y)
    this.blastEffects(e.x, e.y, 1.6, 'explosion')

    // flying debris chunks
    for (let i = 0; i < 8; i++) {
      const angle = this.random() * Math.PI * 2
      const dist = 60 + this.random() * 130
      const piece = this.add
        .image(e.x, e.y, 'debris')
        .setRotation(this.random() * Math.PI * 2)
        .setDepth(6.9)
      this.cameras.cameras[1]?.ignore(piece)
      this.tweens.add({
        targets: piece,
        x: e.x + Math.cos(angle) * dist,
        y: e.y + Math.sin(angle) * dist,
        rotation: piece.rotation + (this.random() - 0.5) * 10,
        alpha: 0.25,
        duration: 500 + this.random() * 300,
        ease: 'cubic.out',
      })
    }

    // lingering fire
    view.fireGlow = this.add
      .image(e.x, e.y, 'glow-soft')
      .setTint(0xff8833)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(6.8)
    this.cameras.cameras[1]?.ignore(view.fireGlow)
    const flash = this.add
      .image(e.x, e.y, 'spark')
      .setScale(4)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(flash)
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.2, duration: 320, onComplete: () => flash.destroy() })
    this.scorchStamp.setPosition(e.x, e.y).setRotation(this.random() * Math.PI)
    this.skidRT.draw(this.scorchStamp)
    view.sprite.setTint(0x2c2c30)
    view.shadow.setAlpha(0.2)
    view.damageSmoke.frequency = this.scaleFrequency(30)
    this.shake(260, 0.008)
  }

  private onLandingFx(e: Extract<SimEvent, { type: 'car-landed' }>) {
    const { x, y } = e
    const view = this.carViews.get(e.carId)!
    const dust = this.add
      .image(x, y, 'ring')
      .setScale(0.15)
      .setTint(0xb9a88c)
      .setAlpha(0.55)
      .setDepth(3.6)
    this.cameras.cameras[1]?.ignore(dust)
    this.tweens.add({
      targets: dust,
      scale: 1.5,
      alpha: 0,
      duration: 420,
      ease: 'cubic.out',
      onComplete: () => dust.destroy(),
    })
    this.tireSmoke.explode(this.scaleCount(IMPACT_FX.landingDustCount), x, y)

    // suspension bounce: the sprite squashes and settles
    view.sprite.setScale(view.baseScale)
    this.tweens.add({
      targets: view.sprite,
      scaleX: view.baseScale * 1.12,
      scaleY: view.baseScale * 0.86,
      duration: 90,
      yoyo: true,
      ease: 'quad.out',
    })

    const player = this.myCar()
    const nearPlayer = e.carId === this.localCarId || Math.hypot(player.state.x - x, player.state.y - y) < 420
    if (nearPlayer) {
      this.shake(160, IMPACT_FX.landingShake)
      audioBus.thud()
    }
  }

  private onMineDropped(e: Extract<SimEvent, { type: 'mine-dropped' }>) {
    if (this.mineViews.has(e.mineId)) return
    this.mineViews.set(e.mineId, this.createMineView(e.x, e.y))
    audioBus.pickup(true) // placement click; real sample hook later
  }

  private createMineView(x: number, y: number) {
    const sprite = this.add.image(x, y, 'mine').setDepth(2.4)
    // the arm light and danger ring are what make it readable at speed
    const light = this.add
      .image(x, y, 'glow-soft')
      .setScale(0.34)
      .setTint(0xffb340)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2.45)
    const ring = this.add
      .image(x, y, 'ring')
      .setScale((MINES.triggerRadius * 2.6) / 96)
      .setTint(0xff7a3c)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2.35)
    for (const obj of [sprite, light, ring]) this.cameras.cameras[1]?.ignore(obj)
    return { sprite, light, ring }
  }

  private onMineDetonatedFx(e: Extract<SimEvent, { type: 'mine-detonated' }>) {
    audioBus.explosion()
    this.explosionSmoke.explode(this.scaleCount(16), e.x, e.y)
    this.hitSparks.explode(this.scaleCount(8), e.x, e.y)
    this.blastEffects(e.x, e.y, 1, 'mine-blast')
    this.scorchStamp.setPosition(e.x, e.y).setRotation(this.random() * Math.PI)
    this.skidRT.draw(this.scorchStamp)

    const player = this.myCar()
    if (Math.hypot(player.state.x - e.x, player.state.y - e.y) < 500) {
      this.shake(200, 0.008)
    }

    const view = this.mineViews.get(e.mineId)
    if (view) {
      view.sprite.destroy()
      view.light.destroy()
      view.ring.destroy()
      this.mineViews.delete(e.mineId)
    }
  }

  private onPickupCollected(e: Extract<SimEvent, { type: 'pickup-collected' }>) {
    if (e.carId === this.localCarId) {
      audioBus.pickup(e.pickup !== 'trap')
      const toasts: Record<PickupType, [string, number]> = {
        ammo: [`+${PICKUPS.ammoAmount} AMMO`, C.ammo],
        turbo: [`+${Math.round(PICKUPS.turboAmount * 100)}% TURBO`, C.turbo],
        repair: [`-${PICKUPS.repairAmount}% DMG`, C.money],
        cash: [`+$${PICKUPS.cashAmount}`, C.money],
        trap: ['TRAPPED!', 0xd68cff],
      }
      this.spawnToast(e.x, e.y, ...toasts[e.pickup])
    }
    this.hitSparks.explode(this.scaleCount(4), e.x, e.y)
    this.pickupViews[e.index]?.sprite.setVisible(false)
  }

  private onPickupRespawned(index: number) {
    const p = this.sim.pickups[index]
    const view = this.pickupViews[index]
    if (!p || !view) return
    view.sprite.setPosition(p.x, p.y).setTexture(`pk-${p.type}`)
    // texture may have changed type; restart the pulse at the new type's base scale
    view.pulse.stop()
    view.pulse = this.startPickupPulse(view.sprite, p.type)
    view.sprite.setVisible(true).setAlpha(0)
    this.tweens.add({ targets: view.sprite, alpha: 1, duration: 400 })
  }

  // ---------------------------------------------------------------- view sync

  private syncBulletViews() {
    const live = this.liveBulletIds
    live.clear()
    for (const b of this.sim.bullets) {
      live.add(b.id)
      let sprite = this.bulletViews.get(b.id)
      if (!sprite) {
        // defensive: a bullet without a view (e.g. spawned+moved before its event)
        sprite = this.add
          .image(b.x, b.y, 'bullet')
          .setRotation(Math.atan2(b.vy, b.vx))
          .setScale(0.7)
          .setDepth(6)
          .setBlendMode(Phaser.BlendModes.ADD)
        this.cameras.cameras[1]?.ignore(sprite)
        this.bulletViews.set(b.id, sprite)
      }
      sprite.setPosition(b.x, b.y)
      // every frame, not coin-flipped: at the higher bullet speed a 50% gate
      // reads as a dotted line instead of a streak. On low quality we still
      // avoid per-frame flicker by gating on the bullet's own id (stable for
      // its whole flight) instead of the frame — half the bullets get a full
      // trail, half get none, rather than every bullet getting a dotted one.
      if (this.particleScale >= 1 || b.id % 2 === 0) {
        this.bulletTrail.emitParticleAt(b.x, b.y)
      }
    }
    for (const [id, sprite] of this.bulletViews) {
      if (!live.has(id)) {
        sprite.destroy()
        this.bulletViews.delete(id)
      }
    }
  }

  private syncMineViews() {
    const now = this.sim.simTimeMs
    const blink = 0.55 + 0.45 * Math.sin(now * 0.014)
    const live = this.liveMineIds
    live.clear()
    for (const mine of this.sim.mines) {
      live.add(mine.id)
      let view = this.mineViews.get(mine.id)
      if (!view) {
        view = this.createMineView(mine.x, mine.y)
        this.mineViews.set(mine.id, view)
      }
      const armed = mineIsArmed(mine, now, MINES)
      // unarmed: dim and inert. armed: the light blinks and the ring breathes.
      view.sprite.setAlpha(armed ? 1 : 0.6)
      view.light.setAlpha(armed ? 0.35 + 0.55 * blink : 0.12).setScale(armed ? 0.3 + 0.1 * blink : 0.22)
      view.ring.setAlpha(armed ? 0.1 + 0.16 * blink : 0)
    }
    for (const [id, view] of this.mineViews) {
      if (!live.has(id)) {
        view.sprite.destroy()
        view.light.destroy()
        view.ring.destroy()
        this.mineViews.delete(id)
      }
    }
  }

  private syncPickupViews() {
    for (let i = 0; i < this.sim.pickups.length; i++) {
      const p = this.sim.pickups[i]
      const view = this.pickupViews[i]
      if (!view) continue
      view.sprite.setPosition(p.x, p.y).setVisible(p.respawnAt === null)
    }
  }

  // ---------------------------------------------------------------- shared FX

  /** Shockwave ring + fireball flash shared by mine blasts and wrecks. */
  private blastEffects(x: number, y: number, scale: number, blastKey: string) {
    const ring = this.add
      .image(x, y, 'ring')
      .setScale(0.3 * scale)
      .setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7.2)
    this.cameras.cameras[1]?.ignore(ring)
    this.tweens.add({
      targets: ring,
      scale: 3.2 * scale,
      alpha: 0,
      duration: 380,
      ease: 'cubic.out',
      onComplete: () => ring.destroy(),
    })
    const fireball = this.add
      .image(x, y, 'glow-soft')
      .setScale(0.9 * scale)
      .setTint(0xffa040)
      .setAlpha(0.95)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7.1)
    this.cameras.cameras[1]?.ignore(fireball)
    this.tweens.add({
      targets: fireball,
      scale: 0.25 * scale,
      alpha: 0,
      duration: 300,
      onComplete: () => fireball.destroy(),
    })
    // authored fireball art layered over the procedural bloom (NORMAL blend:
    // the baked art carries its own dark smoke; ADD is the tuning fallback)
    const boom = this.add
      .image(x, y, blastKey)
      .setScale(0.5 * scale)
      .setDepth(7.15)
      .setBlendMode(Phaser.BlendModes.NORMAL)
    this.cameras.cameras[1]?.ignore(boom)
    this.tweens.add({
      targets: boom,
      scale: 1.2 * scale,
      alpha: 0,
      duration: 280,
      ease: 'quad.out',
      onComplete: () => boom.destroy(),
    })
  }

  /** Victim blinks white for a frame or two — the universal "that hurt" tell. */
  private flashCar(carId: string) {
    const view = this.carViews.get(carId)
    const car = this.sim.cars.find((c) => c.id === carId)
    if (!view || !car || car.wrecked) return
    view.sprite.setTintFill(0xffffff)
    this.time.delayedCall(IMPACT_FX.hitFlashMs, () => {
      if (!view.sprite.active) return
      // clearTint() leaves tintFill set, which would paint the car solid white
      view.sprite.tintFill = false
      const now = this.sim.cars.find((c) => c.id === carId)
      if (now?.wrecked) view.sprite.setTint(0x2c2c30)
      else view.sprite.clearTint()
    })
  }

  /** Colour bleeds in from the screen borders, then drains away. */
  private flashScreenEdge(color: number, alpha: number) {
    if (this.settings.reducedFlash) alpha *= 0.25
    this.tweens.killTweensOf(this.edgeFlash)
    this.edgeFlash.setTint(color).setAlpha(alpha)
    this.tweens.add({ targets: this.edgeFlash, alpha: 0, duration: 260, ease: 'quad.out' })
  }

  private shake(duration: number, intensity: number) {
    if (!this.settings.reducedShake) this.cameras.main.shake(duration, intensity)
  }

  private cameraFlash(duration: number, red: number, green: number, blue: number) {
    if (!this.settings.reducedFlash) this.cameras.main.flash(duration, red, green, blue)
  }

  /** White kiss of light on a heavy impact. The slow-mo itself lives in the sim. */
  private crashLurch(x: number, y: number) {
    const flash = this.add
      .image(x, y, 'spark')
      .setScale(3)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(flash)
    this.tweens.add({ targets: flash, alpha: 0, scale: 1, duration: 180, onComplete: () => flash.destroy() })
    this.flashScreenEdge(0xffffff, 0.28)
  }

  // ---------------------------------------------------------------- pickups

  /** The bullet and trap art are drawn bigger than their on-track footprint — shrink to fit. */
  private pickupBaseScale(type: PickupType): number {
    if (type === 'trap') return 0.4
    if (type === 'ammo') return 0.5
    return 1
  }

  /** Set the sprite to its type's base scale and (re)start its idle pulse tween. */
  private startPickupPulse(sprite: Phaser.GameObjects.Image, type: PickupType): Phaser.Tweens.Tween {
    const base = this.pickupBaseScale(type)
    sprite.setScale(base)
    return this.tweens.add({
      targets: sprite,
      scale: base * 1.12,
      duration: 600 + this.random() * 300,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    })
  }

  private buildPickupViews() {
    for (const p of this.sim.pickups) {
      const sprite = this.add.image(p.x, p.y, `pk-${p.type}`).setDepth(2.5)
      const pulse = this.startPickupPulse(sprite, p.type)
      this.pickupViews.push({ sprite, pulse })
    }
  }

  // ---------------------------------------------------------------- cars

  private buildCarSetups(): CarSetup[] {
    const setups: CarSetup[] = []
    const weapons = this.career.profile.weaponsEnabled

    const playerCar = carById(this.career.carId)
    const playerLivery = this.career.liveries[playerCar.id] ?? 'base'
    this.carInfo.set('player', {
      name: this.career.profile.driverName,
      color: this.career.profile.liveryColor,
      textureKey: carTopTexture(playerCar.id, playerLivery),
      chassisId: playerCar.id,
    })
    setups.push({
      id: 'player',
      isPlayer: true,
      mass: playerCar.mass,
      sizeScale: playerCar.sizeScale,
      damage: this.career.damage, // persistent damage carries into the race
      ammo: weapons ? GUN.ammoMax : 0,
      mines: weapons ? this.career.mines : 0,
      // the player's armor lives on the career; it must be baked into armorTier
      // or damageCarSim (which reads only armorTier) applies zero resistance
      armorTier: this.career.upgrades.armor,
      ai: null,
    })

    if (this.isDuel) {
      // 1-v-1 against the champion: one-off machine, charger style, ace hands
      const talent = talentOf(BOSS.id)
      const style = DRIVING_STYLES[0]
      this.carInfo.set(BOSS.id, {
        name: BOSS.name,
        color: BOSS.bodyColor,
        textureKey: `car-top-${BOSS.id}`,
        chassisId: BOSS.id,
      })
      setups.push({
        id: BOSS.id,
        isPlayer: false,
        mass: BOSS.mass,
        sizeScale: BOSS.sizeScale,
        damage: 0,
        ammo: weapons ? GUN.ammoMax : 0,
        mines: weapons ? talentMineCount(AI_MINES.count[this.track.tier], talent) : 0,
        armorTier: 0,
        ai: {
          lineIdx: 0,
          lookAheadSamples: style.lookAheadSamples,
          speedScale: BOSS.paceScale * this.difficultyPaceScale(),
          tuning: talentTuning(style.tuning, talent),
          spec: BOSS.spec,
          grade: talent.grade,
          aimSpread: talentAimSpread(GUN.aiSpread, talent),
          mineCooldownMs: talentMineCooldown(AI_MINES.cooldownMs, talent),
          rubberBandGain: talentRubberBand(RUBBER_BAND.gainPerGate, talent),
        },
      })
    } else {
      this.rivalIds.forEach((id) => {
        const driver = rosterById(id)
        const rank = rankOf(this.career.ladder, this.career.points, id)
        // chassis and raw pace come from ladder rank; talent is permanent and
        // decides how much of that machinery the driver can actually use
        const talent = talentOf(id)
        const style = styleForGrade(talent.grade)
        const chassis = carById(rivalChassisId(rank))
        // rivals build their cars too — a stock chassis has stock tires, and the
        // player's tier-3 rubber out-corners any amount of pace tuning
        const upgrades = rivalUpgrades(rank)
        // seed-derived, not Math.random — deterministic per race offer seed
        const rivalVariant = pickSeededVariant(chassis.variants, this.random).key
        this.carInfo.set(id, {
          name: driver.name,
          color: driver.bodyColor,
          textureKey: carTopTexture(chassis.id, rivalVariant),
          chassisId: chassis.id,
        })
        setups.push({
          id,
          isPlayer: false,
          mass: chassis.mass,
          sizeScale: chassis.sizeScale,
          damage: 0,
          ammo: weapons ? GUN.ammoMax : 0,
          mines: weapons ? talentMineCount(AI_MINES.count[this.track.tier], talent) : 0,
          armorTier: upgrades.armor,
          ai: {
            lineIdx: 0,
            lookAheadSamples: style.lookAheadSamples,
            speedScale: talentPace(rivalStrength(rank), talent) * this.difficultyPaceScale(),
            tuning: talentTuning(style.tuning, talent),
            spec: effectiveCarSpec(chassis, upgrades),
            grade: talent.grade,
            aimSpread: talentAimSpread(GUN.aiSpread, talent),
            mineCooldownMs: talentMineCooldown(AI_MINES.cooldownMs, talent),
            rubberBandGain: talentRubberBand(RUBBER_BAND.gainPerGate, talent),
          },
        })
      })
    }

    // sabotage bought at the black market: the strongest rival on this grid
    // (best speed scale — for the duel that's the champion) starts pre-damaged
    if (this.career.sabotage) {
      const strongest = setups
        .filter((s) => s.ai)
        .reduce((best, s) => (s.ai!.speedScale > best.ai!.speedScale ? s : best))
      strongest.damage = SABOTAGE.rivalStartDamage
    }

    return setups
  }

  private buildCarViews() {
    for (const car of this.sim.cars) {
      const info = this.carInfo.get(car.id)!
      const view = this.makeCarView(info.textureKey, info.color, car.isPlayer, CAR_SCALE * car.sizeScale)
      this.carViews.set(car.id, view)
      this.syncCarVisuals(car, view)
    }
  }

  /** Scales an emitter's ms-between-particles interval by particleScale (larger interval
   *  = fewer particles). -1 (off) passes through; the huge "paused" sentinel (999999) is
   *  scaled too, which is harmless — it stays effectively "never emits". */
  private scaleFrequency(ms: number): number {
    return ms > 0 ? ms / this.particleScale : ms
  }

  /** Scales an explode() particle count by particleScale, never dropping below 1. */
  private scaleCount(n: number): number {
    return Math.max(1, Math.round(n * this.particleScale))
  }

  private makeCarView(textureKey: string, color: number, isPlayer: boolean, baseScale: number): CarView {
    const shadow = this.add
      .image(0, 0, textureKey)
      .setScale(baseScale)
      .setTintFill(0x000000)
      .setAlpha(0.3)
      .setDepth(4)
    const sprite = this.add.image(0, 0, textureKey).setScale(baseScale).setDepth(5)
    const exhaust = this.add.particles(0, 0, 'smoke', {
      speed: { min: 15, max: 50 },
      scale: { start: 0.22, end: 0.55 },
      alpha: { start: 0.25, end: 0 },
      lifespan: 550,
      angle: { min: 0, max: 360 },
      tint: 0x8a8f98,
      frequency: this.scaleFrequency(100),
    })
    exhaust.setDepth(4.5)
    const damageSmoke = this.add.particles(0, 0, 'smoke', {
      speed: { min: 8, max: 30 },
      scale: { start: 0.4, end: 0.9 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 900,
      angle: { min: 0, max: 360 },
      tint: 0x23232a,
      frequency: -1, // off until damaged
    })
    damageSmoke.setDepth(6.5)

    const turboFlame = this.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 120 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 220,
      angle: { min: 0, max: 360 },
      tint: 0x66ccff,
      blendMode: Phaser.BlendModes.ADD,
      frequency: this.scaleFrequency(18),
      emitting: false,
    })
    turboFlame.setDepth(4.6)

    // the flame itself: a cone off the tailpipe with a heat glow around it
    const flameCone = this.add
      .image(0, 0, 'flame-cone')
      .setOrigin(1, 0.5)
      .setTint(TURBO_FX.flameTint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4.55)
      .setVisible(false)
    const turboGlow = this.add
      .image(0, 0, 'glow-soft')
      .setScale(0.9)
      .setTint(TURBO_FX.glowTint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4.5)
      .setVisible(false)

    // livery pool: halos out from under the body so each chassis — and each
    // same-chassis rival, keyed off its own `color` — reads as its own colour.
    const liveryGlow = this.add
      .image(0, 0, 'glow-soft')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4.3)

    const headlights = [0, 1].map(() =>
      this.add
        .image(0, 0, 'glow-soft')
        .setScale(1.5, 0.85)
        .setTint(0xfff2c0)
        .setAlpha(0.13)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(3.4),
    )
    const taillights = [0, 1].map(() =>
      this.add
        .image(0, 0, 'glow-soft')
        .setScale(0.22)
        .setTint(0xff3322)
        .setAlpha(0.25)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(5.5),
    )

    if (isPlayer && this.hasOverTurbo) {
      // the volatile mix burns red and angry
      turboFlame.setParticleTint(TURBO_FX.overchargeFlameTint)
      flameCone.setTint(TURBO_FX.overchargeFlameTint)
      turboGlow.setTint(TURBO_FX.overchargeGlowTint)
    }

    return {
      baseScale,
      sprite,
      shadow,
      exhaust,
      damageSmoke,
      turboFlame,
      flameCone,
      turboGlow,
      liveryGlow,
      headlights,
      taillights,
      fireGlow: null,
    }
  }

  private difficultyPaceScale(): number {
    if (this.career.profile.difficulty === 'street') return 0.94
    if (this.career.profile.difficulty === 'hard') return 1.06
    return 1
  }

  // ---------------------------------------------------------------- race flow

  /** Called only by the pause overlay after the player confirms the destructive action. */
  public abandonRace() {
    if (this.resultCommitted) return
    this.sim.phase = 'finished'
    this.transitionToResults(this.sim.simTimeMs, false, true)
  }

  public resumeRaceAudio() {
    if (this.sim.phase === 'racing') audioBus.engineStart()
  }

  private transitionToResults(now: number, playerWrecked: boolean, abandoned = false) {
    if (this.resultCommitted) return
    this.resultCommitted = true
    const standings = this.sim.placementOrder.map((id) => {
      const car = this.sim.cars.find((c) => c.id === id)!
      return {
        name: this.carInfo.get(car.id)!.name,
        isPlayer: car.isPlayer,
        timeMs: car.finishedAt !== null ? car.finishedAt - this.sim.raceStartAt : null,
        wrecked: car.wrecked,
        dnf: car.isPlayer && abandoned,
      }
    })
    const player = this.myCar()
    const playerPosition = this.sim.placementOrder.indexOf(this.localCarId) + 1
    const won = playerPosition === 1 && !playerWrecked && !abandoned
    const reward = this.isDuel || abandoned ? { cash: 0, points: 0 } : rewardFor(this.track.tier, playerPosition, playerWrecked)

    if (abandoned) {
      this.career = applyAbandonOutcome(this.career, player.damage)
    } else if (this.isDuel) {
      // the duel sits outside the championship: purse and crown, no points,
      // no background races
      this.career = applyDuelOutcome(this.career, {
        won,
        pickupCash: player.cash,
        endDamage: player.damage,
      })
    } else {
      this.career = applyRaceOutcome(this.career, {
        prizeCash: reward.cash,
        pointsEarned: reward.points,
        pickupCash: player.cash,
        endDamage: player.damage,
        won,
      })

      // rivals from this race earn ladder points by placement, then the two
      // skipped tiers run in the background
      const rivalPlacements = this.sim.placementOrder
        .map((id, i) => ({ id, placement: i + 1, wrecked: this.sim.cars.find((c) => c.id === id)!.wrecked }))
        .filter((r) => r.id !== this.localCarId)
      let ladder = applyRaceLadderResults(this.career.ladder, this.track.tier, rivalPlacements)
      ladder = simulateRound(ladder, this.track.tier, this.rivalIds, this.random)
      this.career = { ...this.career, ladder }
    }

    const oldRecord = this.career.records[this.track.id]
    if (!abandoned) {
      this.career = updateTrackRecord(this.career, {
        trackId: this.track.id,
        bestLapMs: player.lapTimes.length ? Math.min(...player.lapTimes) : null,
        raceTimeMs: player.finishedAt === null ? null : player.finishedAt - this.sim.raceStartAt,
        finish: player.finishedAt === null || playerWrecked ? null : playerPosition,
        won,
      })
    }
    const newRecord = this.career.records[this.track.id]
    const newRecords: string[] = []
    if (newRecord?.bestLapMs !== null && newRecord?.bestLapMs !== oldRecord?.bestLapMs) newRecords.push('BEST LAP')
    if (newRecord?.bestRaceMs !== null && newRecord?.bestRaceMs !== oldRecord?.bestRaceMs) newRecords.push('BEST RACE')
    if (newRecord?.bestFinish !== null && newRecord?.bestFinish !== oldRecord?.bestFinish) newRecords.push('BEST FINISH')

    // the loanshark's clock ticks on every race, duel included
    const settled = settleLoanAfterRace(this.career)
    this.career = settled.career
    saveCareer(this.career)

    if (this.isDuel && won && !abandoned) {
      this.scene.start('Champion')
      return
    }

    const loanNotes: Record<string, string | undefined> = {
      countdown: this.career.loan
        ? `Loan due: $${this.career.loan.owed} in ${this.career.loan.racesLeft} race${this.career.loan.racesLeft === 1 ? '' : 's'}`
        : undefined,
      collected: 'The loanshark collected in full.',
      enforced: "You couldn't pay. The crew took everything and left dents as a receipt.",
    }

    const results: RaceResults = {
      trackId: this.track.id,
      trackName: this.track.name,
      driverName: this.career.profile.driverName,
      laps: this.track.laps,
      totalMs: (player.finishedAt ?? now) - this.sim.raceStartAt,
      bestLapMs: player.lapTimes.length > 0 ? Math.min(...player.lapTimes) : null,
      lapTimes: player.lapTimes,
      standings,
      playerPosition,
      playerWrecked,
      abandoned,
      cashCollected: abandoned ? 0 : player.cash,
      prizeCash: this.isDuel ? 0 : reward.cash,
      pointsEarned: this.isDuel ? 0 : reward.points,
      careerCash: this.career.cash,
      duelLost: this.isDuel,
      loanNote: loanNotes[settled.event],
      newRecords,
      seed: this.raceSeed,
    }
    this.scene.start('Results', results)
  }

  private startCountdown() {
    const cx = this.scale.width / 2
    this.lightsGfx = this.add.graphics()
    this.countdownText = heading(this, cx, 250, '', {
      size: 'hero',
      color: C.textPrimary,
      strokeThickness: STROKE.hero,
    })
    this.hudContainer.add([this.lightsGfx, this.countdownText])

    // static "3" — the beats (and their beeps) arrive as sim events
    this.drawLights(1, false)
    this.countdownText.setText('3')
  }

  private drawLights(lit: number, green: boolean) {
    const cx = this.scale.width / 2
    this.lightsGfx.clear()
    for (let i = 0; i < 3; i++) {
      const x = cx - 90 + i * 90
      this.lightsGfx.fillStyle(0x0c0c12, 0.9)
      this.lightsGfx.fillCircle(x, 140, 34)
      this.lightsGfx.fillStyle(i < lit ? (green ? 0x3fd07f : 0xd23c2f) : 0x2a2a33, 1)
      this.lightsGfx.fillCircle(x, 140, 24)
    }
  }

  private drawCountdown(count: 3 | 2 | 1) {
    this.drawLights(4 - count, false)
    this.countdownText.setText(String(count))
    audioBus.countdownBeep(false)
  }

  private onRaceStarted() {
    this.drawLights(3, true)
    this.countdownText.setText('GO!')
    audioBus.countdownBeep(true)
    audioBus.engineStart()
    this.tweens.add({
      targets: [this.lightsGfx, this.countdownText],
      alpha: 0,
      delay: 700,
      duration: 400,
      onComplete: () => {
        this.lightsGfx.destroy()
        this.countdownText.destroy()
      },
    })
  }

  // ---------------------------------------------------------------- input glue

  private readPlayerInput(): CarInput {
    const im = this.inputManager
    const stick = im.touchStick()
    // Point-to-go touch stick: aim the thumb where the car should head. Steering
    // is proportional to the angle between the car's heading and the stick
    // direction (both measured cos/sin from +x), throttle to the push distance.
    if (stick.active) {
      const brake = im.down('brake') ? 1 : 0
      const handbrake = im.down('handbrake')
      const mag = Math.min(1, Math.hypot(stick.x, stick.y))
      const DEAD = 0.16
      if (mag < DEAD) return { throttle: 0, brake, steer: 0, handbrake }
      const target = Math.atan2(stick.y, stick.x)
      const err = Math.atan2(
        Math.sin(target - this.myCar().state.heading),
        Math.cos(target - this.myCar().state.heading),
      )
      const steer = Math.max(-1, Math.min(1, err / (Math.PI / 4)))
      const throttle = (mag - DEAD) / (1 - DEAD)
      return { throttle, brake, steer, handbrake }
    }
    return {
      throttle: im.down('accelerate') ? 1 : 0,
      brake: im.down('brake') ? 1 : 0,
      steer: (im.down('steerRight') ? 1 : 0) - (im.down('steerLeft') ? 1 : 0),
      handbrake: im.down('handbrake'),
    }
  }

  // ---------------------------------------------------------------- world & visuals

  private buildWorld() {
    const { w, h } = this.track.world
    const halfW = this.track.width / 2
    const shoulderHalf = halfW + this.track.shoulder
    const theme = this.track.theme ?? { ground: 0xffffff, shoulder: 0x46413a }

    this.add.tileSprite(0, 0, w, h, 'dirt').setOrigin(0).setDepth(0).setTint(theme.ground)

    const shoulderGfx = this.add.graphics().setDepth(0.5)
    shoulderGfx.lineStyle(shoulderHalf * 2, theme.shoulder, 1)
    shoulderGfx.strokePoints(this.centerline, true, true)

    const asphalt = this.add.tileSprite(0, 0, w, h, 'asphalt').setOrigin(0).setDepth(1)
    const maskGfx = this.make.graphics()
    maskGfx.lineStyle(this.track.width, 0xffffff, 1)
    maskGfx.strokePoints(this.centerline, true, true)
    asphalt.setMask(maskGfx.createGeometryMask())

    const marks = this.add.graphics().setDepth(1.5)
    marks.lineStyle(60, 0x000000, 0.1)
    marks.strokePoints(this.centerline, true, true)
    for (const side of [1, -1]) {
      const edge = offsetClosedPolyline(this.centerline, side * (halfW - 10))
      placeSpritesAlong(this, edge, 'edge-line', 40, 1.5, 0.4)
    }

    // red/white kerbs through sharp corners only (mirrors the chevron-sign gate)
    const clN = this.centerline.length
    let lastKerbAt = -100
    for (let i = 0; i < clN; i += 4) {
      if (turnAmount(this.centerline, i, 10) < 0.55 || i - lastKerbAt < 24) continue
      lastKerbAt = i
      for (const side of [1, -1]) {
        const edge = offsetClosedPolyline(this.centerline, side * (halfW - 4))
        for (let j = -8; j <= 8; j += 4) {
          const k = (i + j + clN) % clN
          const t = lineTangentAt(this.centerline, k)
          this.add
            .image(edge[k].x, edge[k].y, 'kerb')
            .setRotation(Math.atan2(t.y, t.x))
            .setScale(0.4)
            .setDepth(1.5)
        }
      }
    }
    this.drawStartLine()

    this.skidRT = this.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(2)
    this.pendingSkids.length = 0
    this.skidStamp = this.add.image(0, 0, 'skid-stamp').setVisible(false)
    this.scorchStamp = this.add.image(0, 0, 'scorch').setVisible(false)

    for (const p of computeBarriers(this.centerline, halfW, this.track.shoulder)) {
      this.barriers.push(p)
      this.add.image(p.x, p.y, 'tire-wall').setDepth(3)
    }

    // Drop shadow under a placed prop — same silhouette-tint idiom as the car
    // shadows, offset toward the same world light so everything grounds alike.
    // Overhead spans throw a longer, softer shadow that lands on the road.
    const dropShadow = (x: number, y: number, texture: string, angle: number, scale: number, overhead: boolean, spriteDepth: number) => {
      const off = overhead ? 22 : 9
      this.add
        .image(x + off, y + off * 1.35, texture)
        .setRotation(angle)
        .setScale(scale)
        .setTintFill(0x000000)
        .setAlpha(overhead ? 0.2 : 0.32)
        .setDepth(overhead ? 1.95 : spriteDepth - 0.06)
    }

    // authored set pieces: splitters and buffers collide via env.obstacleCircles
    // (core-owned); overhead spans draw above the cars, casting no collision
    for (const piece of this.env.obstacles) {
      dropShadow(piece.x, piece.y, piece.texture, piece.angle, piece.scale, piece.overhead, 3.2)
      const sprite = this.add
        .image(piece.x, piece.y, piece.texture)
        .setRotation(piece.angle)
        .setScale(piece.scale)
        .setDepth(piece.overhead ? 5.6 : 3.2)
      this.obstacleSprites.push(sprite)
    }

    // authored venue landmarks: stable non-colliding scenery beyond the
    // barriers, each grounded by a shadow and a warm work-light pool
    const glowWarm = this.track.environment?.glowWarm ?? 0xffbb55
    for (const d of resolveDecorations(this.track, this.centerline)) {
      dropShadow(d.x, d.y, d.texture, d.angle, d.scale, d.overhead, 3)
      this.add
        .image(d.x, d.y, d.texture)
        .setRotation(d.angle)
        .setScale(d.scale)
        .setDepth(d.overhead ? 5.6 : 3)
      if (!d.overhead) {
        this.add
          .image(d.x, d.y, 'glow-soft')
          .setScale(1.1)
          .setTint(glowWarm)
          .setAlpha(0.14)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(3.02)
      }
    }

    this.dressTrackForNight(halfW, shoulderHalf)

    // cosmetic dressing uses its own seeded RNG so it never disturbs the
    // gameplay (pickup/trap) RNG stream, while staying reproducible per seed.
    // Order-sensitive: these two calls (and the draws inside them) consume
    // decorRng in sequence — reordering changes the dressing layout for a seed.
    const decorRng = createSeededRandom(this.raceSeed ^ 0x9e3779b9)
    this.scatterDecals(halfW, decorRng)
    this.placeFurniture(shoulderHalf, decorRng)

    // venue-identity dressing gets its own seeded stream so adding/removing an
    // environment can never shift the shared decor layout for a given seed
    this.dressEnvironment(halfW, shoulderHalf, createSeededRandom(this.raceSeed ^ 0x51ab3e4d))
  }

  /**
   * Environment-specific dressing from the track's serializable identity:
   * a per-venue prop mix, boundary structures, surface decals, and accent
   * light pools. Purely cosmetic — everything off-road sits beyond the
   * tire-wall clearance (barriers stand at shoulderHalf + 24) and the on-road
   * pieces are flat decals, so nothing here collides or reads as a route.
   */
  private dressEnvironment(halfW: number, shoulderHalf: number, rng: () => number) {
    const env = this.track.environment
    if (!env) return
    const interior = signedLoopArea(this.centerline) > 0 ? 1 : -1

    // an offset line folds back across the road at corners tighter than its
    // offset — anything meant for the boundary must re-check its true distance
    const offRoad = (p: { x: number; y: number }, min: number) =>
      distanceToClosedPolyline(p, this.centerline) >= min

    // restrained generic filler: the authored TrackDef.decorations landmarks
    // carry the venue identity, so the seeded scatter is just a few barrel
    // pallets per side — low-priority secondary variation, never the scenery
    for (const side of [1, -1]) {
      const line = offsetClosedPolyline(this.centerline, side * (shoulderHalf + 150))
      const poses = scatterPointsAlong(line, 3, rng, { halfWidth: 40, lateralFrac: 0.5, minGap: 900 })
        .filter((p) => offRoad(p, shoulderHalf + 60))
      scatterImages(this, poses, ['set-barrel-pallet'], rng, {
        depth: 3,
        minScale: 0.5,
        maxScale: 0.65,
        jitter: Math.PI,
      })
    }

    // boundary structures that follow the road line, rotated to the tangent
    const structures: Record<TrackEnvironmentKind, { texture: string; side: number; spacing: number; scale: number }[]> = {
      harbor: [
        // quayside fender wall guards the water edge; chainlink on the yard side
        { texture: 'set-fender-wall', side: interior, spacing: 320, scale: 0.5 },
        { texture: 'set-chainlink', side: -interior, spacing: 1150, scale: 0.55 },
      ],
      refinery: [
        // jersey barriers pen the process pads; chainlink around the perimeter
        { texture: 'set-jersey-barrier', side: 1, spacing: 1250, scale: 0.5 },
        { texture: 'set-chainlink', side: -1, spacing: 1400, scale: 0.55 },
      ],
      quarry: [
        // guarded cliff edge above the excavation void
        { texture: 'set-jersey-barrier', side: interior, spacing: 1050, scale: 0.5 },
      ],
    }
    for (const s of structures[env.kind]) {
      const line = offsetClosedPolyline(this.centerline, s.side * (shoulderHalf + 88))
      for (const pose of spacedPosesAlong(line, s.spacing)) {
        if (!offRoad(pose, shoulderHalf + 50)) continue
        this.add.image(pose.x, pose.y, s.texture).setRotation(pose.angle).setScale(s.scale).setDepth(3)
      }
    }

    // sodium floodlight banks along the outer boundary, each with a warm pool
    const lightLine = offsetClosedPolyline(this.centerline, -interior * (shoulderHalf + 190))
    for (const pose of spacedPosesAlong(lightLine, 1500)) {
      if (!offRoad(pose, shoulderHalf + 120)) continue
      this.add.image(pose.x, pose.y, 'set-floodlight-bank').setRotation(pose.angle).setScale(0.5).setDepth(3)
      this.add
        .image(pose.x, pose.y, 'glow-soft')
        .setScale(1.3)
        .setTint(env.glowWarm)
        .setAlpha(0.22)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(3.05)
    }

    // venue surface decals: flat, non-colliding, biased toward the road
    // margins. (The windblown-sand set is retired — the yellow intrusions
    // read as paint spills at race zoom.)
    const surfaceDecals: Record<TrackEnvironmentKind, { keys: string[]; count: number; minScale: number; maxScale: number }> = {
      harbor: { keys: ['runoff-0', 'runoff-1', 'runoff-2', 'runoff-3', 'runoff-4', 'runoff-5', 'grate-0', 'grate-1', 'grate-2'], count: 14, minScale: 0.5, maxScale: 0.8 },
      refinery: { keys: ['grate-0', 'grate-1', 'grate-2'], count: 8, minScale: 0.5, maxScale: 0.75 },
      quarry: { keys: [], count: 0, minScale: 0.5, maxScale: 0.75 },
    }
    const decals = surfaceDecals[env.kind]
    if (decals.keys.length > 0) {
      const decalPoses = scatterPointsAlong(this.centerline, decals.count, rng, {
        halfWidth: halfW,
        lateralFrac: 0.85,
        minGap: 380,
      })
      scatterImages(this, decalPoses, decals.keys, rng, {
        depth: 1.85,
        minScale: decals.minScale,
        maxScale: decals.maxScale,
        jitter: Math.PI,
        alpha: 0.9,
      })
    }

    // accent pools: harbour water shimmer lives on the loop's inside (the
    // basin), quarry moonlit dust on the outer benches, refinery valve glow
    // sparse on both sides
    const accents: Record<TrackEnvironmentKind, { sides: number[]; scale: number; alpha: number; spacing: number }> = {
      harbor: { sides: [interior], scale: 1.9, alpha: 0.14, spacing: 780 },
      refinery: { sides: [1, -1], scale: 0.7, alpha: 0.28, spacing: 1150 },
      quarry: { sides: [-interior], scale: 2.1, alpha: 0.1, spacing: 900 },
    }
    const accent = accents[env.kind]
    for (const side of accent.sides) {
      const line = offsetClosedPolyline(this.centerline, side * (shoulderHalf + 260))
      for (const p of spacedPointsAlong(line, accent.spacing)) {
        if (!offRoad(p, shoulderHalf + 150)) continue
        this.add
          .image(p.x, p.y, 'glow-soft')
          .setScale(accent.scale)
          .setTint(env.glowCool)
          .setAlpha(accent.alpha)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(1.7)
      }
    }
  }

  /** Seeded flat decals (oil, skid, crack, patch) scattered on the track surface. */
  private scatterDecals(halfW: number, rng: () => number) {
    const keys = [
      'oil-0', 'oil-1', 'oil-2',
      'skid-0', 'skid-1', 'skid-2',
      'crack-0', 'crack-1', 'crack-2',
      'patch-0', 'patch-1', 'patch-2',
    ]
    const poses = scatterPointsAlong(this.centerline, 10, rng, {
      halfWidth: halfW,
      lateralFrac: 0.7,
      minGap: 220,
    })
    scatterImages(this, poses, keys, rng, {
      depth: 1.8,
      minScale: 0.42,
      maxScale: 0.68,
      jitter: Math.PI,
      alpha: 1,
    })
  }

  /** Seeded non-colliding furniture: just the start-line cluster — the
   *  track-wide tyre/sandbag scatter is gone so the road ribbon and the
   *  authored landmarks stay visually dominant. */
  private placeFurniture(shoulderHalf: number, rng: () => number) {
    // start/finish cluster on the shoulder: a short row of cones + one barricade
    const gate = this.gates[0]
    const t = gate.tangent
    const angle = Math.atan2(t.y, t.x)
    const nx = -t.y // left normal
    const ny = t.x
    const sideOff = shoulderHalf - 10
    const cones: Pose[] = []
    for (let i = 0; i < 4; i++) {
      const back = 40 + i * 55 // stepped back from the gate along -travel
      cones.push({
        x: gate.center.x - t.x * back + nx * sideOff,
        y: gate.center.y - t.y * back + ny * sideOff,
        angle,
      })
    }
    scatterImages(this, cones, ['cone-0', 'cone-1'], rng, {
      depth: 3,
      minScale: 0.45,
      maxScale: 0.5,
    })
    const barricade: Pose = {
      x: gate.center.x - t.x * 20 + nx * (sideOff + 20),
      y: gate.center.y - t.y * 20 + ny * (sideOff + 20),
      angle,
    }
    scatterImages(this, [barricade], ['barricade-0', 'barricade-1'], rng, {
      depth: 3,
      minScale: 0.5,
      maxScale: 0.5,
    })
  }

  /** Night-race dressing: cat-eye reflectors, corner chevrons, light poles. */
  private dressTrackForNight(halfW: number, shoulderHalf: number) {
    const glowWarm = this.track.environment?.glowWarm ?? 0xffbb55
    // cat-eye reflectors along both track edges
    for (const side of [1, -1]) {
      const edge = offsetClosedPolyline(this.centerline, side * (halfW - 6))
      for (const p of spacedPointsAlong(edge, 150)) {
        this.add
          .image(p.x, p.y, 'glow-soft')
          .setScale(0.07)
          .setTint(glowWarm)
          .setAlpha(0.85)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(1.6)
      }
    }

    // warm ground pools along the outer boundary (night lighting; pole sprite dropped)
    const poleLine = offsetClosedPolyline(this.centerline, shoulderHalf + 70)
    for (const p of spacedPointsAlong(poleLine, 620)) {
      this.add
        .image(p.x, p.y, 'glow-soft')
        .setScale(1.6)
        .setTint(glowWarm)
        .setAlpha(0.2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.7)
    }

    // chevron warning signs on the outside of sharp corners
    const n = this.centerline.length
    let lastSignAt = -100
    for (let i = 0; i < n; i += 4) {
      const turn = turnAmount(this.centerline, i, 10)
      if (turn < 0.55 || i - lastSignAt < 30) continue
      lastSignAt = i
      const t1 = lineTangentAt(this.centerline, i)
      const t2 = lineTangentAt(this.centerline, (i + 10) % n)
      const rightTurn = t1.x * t2.y - t1.y * t2.x > 0
      const side = rightTurn ? 1 : -1 // outer side of the corner
      const c = this.centerline[i]
      const sx = c.x - t1.y * -side * (halfW + 34)
      const sy = c.y + t1.x * -side * (halfW + 34)
      this.add
        .image(sx, sy, 'chevron')
        .setRotation(Math.atan2(t2.y, t2.x))
        .setDepth(3.1)
        .setFlipY(!rightTurn)
    }
  }

  /** Single authored checkered strip spanning the start gate, rotated to travel dir. */
  private drawStartLine() {
    const gate = this.gates[0]
    const width = Math.hypot(gate.b.x - gate.a.x, gate.b.y - gate.a.y)
    const strip = this.add
      .image(gate.center.x, gate.center.y, 'start-finish')
      // strip runs ACROSS the track (along a→b), i.e. perpendicular to travel
      .setRotation(Math.atan2(gate.b.y - gate.a.y, gate.b.x - gate.a.x))
      .setDepth(1.5)
    // stretch the tile across the full gate width; keep its native aspect for depth
    strip.setDisplaySize(width, strip.height * (width / strip.width))
  }

  private buildSharedEffects() {
    this.tireSmoke = this.add.particles(0, 0, 'smoke', {
      speed: { min: 10, max: 60 },
      scale: { start: 0.45, end: 1.0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 750,
      angle: { min: 0, max: 360 },
      tint: 0xb8bcc4,
      frequency: this.scaleFrequency(25),
      emitting: false,
    })
    this.tireSmoke.setDepth(4.5)

    this.explosionSmoke = this.add.particles(0, 0, 'smoke', {
      speed: { min: 40, max: 230 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 750,
      angle: { min: 0, max: 360 },
      tint: [0xffb347, 0xff6a33, 0x555555, 0x2a2a2a],
      frequency: -1,
    })
    this.explosionSmoke.setDepth(7)

    this.hitSparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 240 },
      scale: { start: 0.5, end: 0 },
      lifespan: 300,
      angle: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      frequency: -1,
    })
    this.hitSparks.setDepth(7)

    // faint hot trail behind every tracer
    this.bulletTrail = this.add.particles(0, 0, 'spark', {
      speed: 0,
      scale: { start: 0.14, end: 0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 100,
      blendMode: Phaser.BlendModes.ADD,
      frequency: -1,
    })
    this.bulletTrail.setDepth(5.9)
  }

  /** Short-lived floating text in world space (pickup feedback). */
  private spawnToast(x: number, y: number, message: string, color: number) {
    const toast = text(this, x, y - 30, message, {
      size: 'bodyLg',
      color,
      stroke: C.shadow,
      strokeThickness: 5,
      origin: [0.5, 0.5],
    }).setDepth(8)
    this.cameras.cameras[1]?.ignore(toast)
    this.tweens.add({
      targets: toast,
      y: y - 95,
      alpha: 0,
      duration: 800,
      ease: 'cubic.out',
      onComplete: () => toast.destroy(),
    })
  }

  private syncCarVisuals(car: CarSim, view: CarView) {
    view.sprite.setPosition(car.state.x, car.state.y).setRotation(car.state.heading)
    view.shadow.setRotation(car.state.heading)

    // livery pool follows the body, oval along its length; a wrecked hulk loses its colour
    view.liveryGlow
      .setPosition(car.state.x, car.state.y)
      .setRotation(car.state.heading)
      .setScale(view.baseScale * 1.7, view.baseScale * 1.1)
      .setAlpha(car.wrecked ? 0 : 0.55)

    const z = car.state.z
    if (z > 0) {
      // height reads as scale-up over a shadow that falls away and softens
      const lift = z / IMPACT_FX.liftPerScale
      view.sprite.setScale(view.baseScale * (1 + lift)).setDepth(5.6)
      view.shadow
        .setPosition(car.state.x + 6 + z * IMPACT_FX.shadowThrowX, car.state.y + 8 + z * IMPACT_FX.shadowThrowY)
        .setScale(view.baseScale * (1 - lift * 0.22))
        .setAlpha(Math.max(0.12, 0.34 - lift * 0.18))
    } else {
      view.sprite.setDepth(5)
      view.shadow.setPosition(car.state.x + 6, car.state.y + 8).setScale(view.baseScale).setAlpha(car.wrecked ? 0.2 : 0.3)
    }
  }

  private updateCarEffects(car: CarSim, view: CarView) {
    const input = car.lastInput
    const turboActive = car.lastTurboActive
    const cos = Math.cos(car.state.heading)
    const sin = Math.sin(car.state.heading)
    const airborne = isAirborne(car.state)
    view.exhaust.setPosition(car.state.x - 42 * cos, car.state.y - 42 * sin)
    view.exhaust.frequency = this.scaleFrequency(car.wrecked || airborne ? 999999 : turboActive ? 15 : input.throttle > 0 ? 40 : 120)

    view.turboFlame.setPosition(car.state.x - 46 * cos, car.state.y - 46 * sin)
    view.turboFlame.emitting = turboActive && !car.wrecked

    // flame cone off the tailpipe, breathing so it never looks like a decal
    const boosting = turboActive && !car.wrecked
    view.flameCone.setVisible(boosting)
    view.turboGlow.setVisible(boosting)
    if (boosting) {
      const flicker = 0.85 + this.random() * 0.3
      const overcharged = car.isPlayer && this.hasOverTurbo
      view.flameCone
        .setPosition(car.state.x - 40 * cos, car.state.y - 40 * sin)
        .setRotation(car.state.heading)
        .setScale((overcharged ? 1.35 : 1) * flicker, (overcharged ? 1.2 : 1) * flicker)
        .setAlpha(0.55 + 0.35 * this.random())
      view.turboGlow
        .setPosition(car.state.x - 52 * cos, car.state.y - 52 * sin)
        .setScale((overcharged ? 1.15 : 0.85) * flicker)
        .setAlpha(0.3 + 0.15 * this.random())
    }

    // headlight throw + taillights with brake flare
    view.headlights.forEach((light, i) => {
      const side = i === 0 ? -14 : 14
      light
        .setPosition(car.state.x + 95 * cos - side * sin, car.state.y + 95 * sin + side * cos)
        .setRotation(car.state.heading)
        .setVisible(!car.wrecked)
    })
    view.taillights.forEach((light, i) => {
      const side = i === 0 ? -13 : 13
      const braking = input.brake > 0
      light
        .setPosition(car.state.x - 40 * cos - side * sin, car.state.y - 40 * sin + side * cos)
        .setAlpha(braking ? 0.55 : 0.25)
        .setScale(braking ? 0.34 : 0.22)
        .setVisible(!car.wrecked)
    })

    // burning wreck flicker
    if (car.wrecked && view.fireGlow) {
      view.fireGlow
        .setPosition(car.state.x + (this.random() - 0.5) * 8, car.state.y + (this.random() - 0.5) * 8)
        .setAlpha(0.18 + this.random() * 0.22)
        .setScale(0.45 + this.random() * 0.18)
    }

    view.damageSmoke.setPosition(car.state.x + 10 * cos, car.state.y + 10 * sin)
    if (!car.wrecked) {
      view.damageSmoke.frequency = this.scaleFrequency(car.damage > 80 ? 45 : car.damage > 50 ? 110 : -1)
    }

    const skidding =
      !car.wrecked &&
      !airborne &&
      (Math.abs(lateralSpeed(car.state)) > 90 || (input.handbrake && speed(car.state) > 150))
    if (skidding) {
      const rearX = -25
      // Persistent streaks stamp into a RenderTexture (per-frame framebuffer
      // switch) — skipped on 'low' where it tanks mobile FPS; the tire-smoke
      // puff below still conveys the drift.
      if (this.skidMarks) {
        for (const side of [-13, 13]) {
          const wx = car.state.x + rearX * cos - side * sin
          const wy = car.state.y + rearX * sin + side * cos
          // Deferred: batched once per frame in flushSkids(), not drawn here.
          this.pendingSkids.push({ x: wx, y: wy, rot: car.state.heading })
        }
      }
      if (car.id === this.localCarId) {
        this.tireSmoke.setPosition(car.state.x + rearX * cos, car.state.y + rearX * sin)
      }
    }
    if (car.id === this.localCarId) this.tireSmoke.emitting = skidding
  }

  /** Stamp every skid mark collected this frame in one WebGL batch: a single
   *  framebuffer bind for all cars/tires instead of one per draw. This is the
   *  fix for the cornering FPS drop on mobile. */
  private flushSkids() {
    if (this.pendingSkids.length === 0) return
    this.skidRT.beginDraw()
    for (const s of this.pendingSkids) {
      this.skidStamp.setPosition(s.x, s.y).setRotation(s.rot).setAlpha(0.4)
      this.skidRT.batchDraw(this.skidStamp, s.x, s.y)
    }
    this.skidRT.endDraw()
    this.pendingSkids.length = 0
  }

  private updateCamera() {
    const player = this.myCar()
    const cam = this.cameras.main
    const speedRatio = Math.min(1, speed(player.state) / this.playerSpec.topSpeed)
    const boosting = player.lastTurboActive && !player.wrecked
    const overcharged = this.hasOverTurbo

    // boost pulls the camera back and shakes the frame
    const targetZoom = 1.35 - 0.17 * speedRatio - (boosting ? TURBO_FX.zoomOut : 0)
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.04))

    // look-ahead: shift the camera toward where the car is going
    this.lookAheadX = Phaser.Math.Linear(this.lookAheadX, player.state.vx * 0.22, 0.05)
    this.lookAheadY = Phaser.Math.Linear(this.lookAheadY, player.state.vy * 0.22, 0.05)
    let jitterX = 0
    let jitterY = 0
    if (boosting) {
      const amp = TURBO_FX.jitter * (overcharged ? TURBO_FX.overchargeJitterScale : 1) * speedRatio
      jitterX = (this.random() - 0.5) * amp
      jitterY = (this.random() - 0.5) * amp
    }
    cam.setFollowOffset(-this.lookAheadX + jitterX, -this.lookAheadY + jitterY)
    this.updateSpeedStreaks(boosting, speedRatio, overcharged)

    audioBus.setEngine(speedRatio, player.lastTurboActive)
  }

  /** Streaks rushing past the edges of the frame while the turbo is lit. */
  private updateSpeedStreaks(active: boolean, intensity: number, overcharged: boolean) {
    this.speedStreaks.clear()
    if (!active || intensity < 0.2) return

    const w = this.scale.width
    const h = this.scale.height
    const color = overcharged ? TURBO_FX.overchargeStreakColor : TURBO_FX.streakColor
    const cx = w / 2
    const cy = h / 2

    for (let i = 0; i < TURBO_FX.streakCount; i++) {
      const angle = this.random() * Math.PI * 2
      // ride an ellipse just outside the action, so the car stays unobscured
      const t = 0.72 + this.random() * 0.3
      const sx = cx + Math.cos(angle) * cx * t
      const sy = cy + Math.sin(angle) * cy * t
      const len = 50 + this.random() * 150 * intensity
      this.speedStreaks.lineStyle(2 + this.random() * 2, color, 0.12 + 0.38 * intensity * this.random())
      this.speedStreaks.lineBetween(sx, sy, sx + Math.cos(angle) * len, sy + Math.sin(angle) * len)
    }
  }

  private setupCameras() {
    const cam = this.cameras.main
    cam.setBounds(0, 0, this.track.world.w, this.track.world.h)
    cam.startFollow(this.myView().sprite, true, 0.08, 0.08)
    cam.setZoom(1.35)
    if (this.game.renderer.type === Phaser.WEBGL) {
      // vignette is cheap and part of the visual identity — keep it at every quality level
      cam.postFX.addVignette(0.5, 0.5, 1.0, 0.18)
      if (QUALITY_PROFILE[this.quality].bloom) cam.postFX.addBloom(0xffffff, 1, 1, 0.55, 1.05)
    }
    cam.ignore(this.hudContainer)
    const hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height)
    hudCam.ignore(this.children.list.filter((obj) => obj !== this.hudContainer))
  }

  private setupInput() {
    this.inputManager = new InputManager(this)
    const onKey = (event: KeyboardEvent) => {
      if (this.inputManager.matches('pause', event.code)) {
        // single-player pauses into RacePause; a network race leaves cleanly (no pause)
        if (this.mode === 'network') this.leaveNetworkRace()
        else if (this.sim.phase !== 'finished' && !this.scene.isPaused()) this.openPause()
      } else if (this.inputManager.matches('mute', event.code)) {
        this.toggleMute()
      }
    }
    this.input.keyboard?.on('keydown', onKey)

    if (isTouchDevice()) {
      this.touchControls = new TouchControls(this, this.hudContainer, this.inputManager, {
        onPause: () => {
          if (this.mode === 'network') this.leaveNetworkRace()
          else if (this.sim.phase !== 'finished' && !this.scene.isPaused()) this.openPause()
        },
        onMuteToggle: () => this.toggleMute(),
        weaponsEnabled: this.env.weaponsEnabled,
      })
    }

    this.events.once('shutdown', () => {
      audioBus.engineStop()
      this.netSource?.dispose() // detach net handlers so repeated visits don't stack
      this.input.keyboard?.off('keydown', onKey)
      if (this.onResultsKey) this.input.keyboard?.off('keydown', this.onResultsKey)
      this.onResultsKey = undefined
      if (this.pendingRematchHandler) this.net?.offMessage(this.pendingRematchHandler)
      this.pendingRematchHandler = undefined
      this.touchControls?.destroy()
      this.touchControls = undefined
      this.inputManager.destroy()
    })
  }

  private toggleMute() {
    this.settings.muted = !this.settings.muted
    saveSettings(this.settings)
    audioBus.applySettings(this.settings)
    this.touchControls?.refreshMute()
  }

  private openPause() {
    audioBus.engineStop()
    this.inputManager.reset()
    const position = this.sim.placementOrder.indexOf(this.localCarId) + 1
    this.scene.launch('RacePause', {
      trackName: this.track.name,
      lap: currentLap(this.myCar().progress),
      laps: this.track.laps,
      position,
      weaponsFree: this.env.weaponsEnabled && this.sim.simTimeMs > this.sim.raceStartAt + WEAPONS_FREE_DELAY_MS,
    })
    this.scene.pause()
  }

  // ---------------------------------------------------------------- HUD

  private buildHud() {
    // On touch devices the 1920x1080 canvas renders ~2.2x smaller physically
    // than on desktop, so the HUD's small type ramps become unreadable.
    // hudScale.ts resolves the factor once here: 1 on desktop (every `* S`
    // below is then a no-op, so desktop pixels are unchanged), TOUCH_HUD_SCALE
    // on touch. See hudScale.ts for why only some clusters also reposition.
    const isTouch = isTouchDevice()
    this.isTouchHud = isTouch
    const S = hudScale(isTouch)
    this.hudScaleFactor = S

    // full-frame overlays, under the readouts: boost streaks, then damage flash
    this.speedStreaks = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD)
    this.edgeFlash = this.add
      .image(this.scale.width / 2, this.scale.height / 2, 'edge-flash')
      .setDisplaySize(this.scale.width, this.scale.height)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)

    const plates = this.add.graphics()
    // status (bottom-left, desktop only): rows keep their 36px pitch and the
    // plate keeps its top edge (854), but the row grid — bar column and value
    // anchor — scales horizontally, so the plate widens with it. On touch this
    // whole cluster is gone: hull+speed move bottom-centre and ammo/turbo/mines
    // counts live on the buttons.
    if (!isTouch) plate(plates, STATUS_PLATE_X, this.scale.height - 226, statusPlateWidth(S), 210)
    // standings (top-right): scaled, since standings rows can be as wide as
    // "1. DRIVERNAME 100%" and were already tight against the plate edge at
    // 1x — grows from its screen-edge anchor via anchorRight/anchorBottom,
    // same math touchScheme.ts's HUD_RESERVED uses to clear it.
    plate(plates, anchorRight(this.scale.width, 320, S), 160 * S, 306 * S, 138 * S)

    const hintCopy = isTouchDevice()
      ? 'Aim dial to drive · hold buttons · II pause · MUTE mute'
      : 'Configured controls active · Esc pause/help · M mute'
    const hint = hintBar(this, hintCopy)
    hint.setFontSize(TYPE.caption * S)

    // desktop status rows (HULL/AMMO/TURBO/MINES). Touch shows these differently
    // (hull bottom-centre, ammo/turbo/mines on the buttons), so skip them there.
    if (!isTouch) {
      const statusRows = ['HULL', 'AMMO', this.hasOverTurbo ? 'OVERCHARGE' : 'TURBO', 'MINES']
      statusRows.forEach((label, i) => {
        const y = this.scale.height - 202 + i * 36
        const labelText = text(this, 28, y, label, {
          size: 'micro', color: i === 2 && this.hasOverTurbo ? C.warn : C.textSecondary,
        })
        labelText.setFontSize(TYPE.micro * S)
        this.hudStatusLabels.push(labelText)
        // right-anchored at the scaled grid's value column (386 at S=1) so the
        // widest values ("100% LEFT", "100 / 100") never reach the bar column
        const valueText = text(this, statusValueX(S), y - 2, '', {
          size: 'micro', color: C.textPrimary, origin: [1, 0],
        })
        valueText.setFontSize(TYPE.micro * S)
        this.hudStatusValues.push(valueText)
      })
    }

    this.cashText = text(this, 16, 62, '$0', {
      size: 'action',
      color: C.money,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
    })
    this.cashText.setFontSize(TYPE.action * S)
    // network races have no economy — cash always reads $0 there, so hide the chip
    // instead of showing a misleading static value (F3)
    this.cashText.setVisible(this.mode !== 'network')

    if (isTouch) {
      // bottom-centre, between the two corner control clusters: a hull bar (drawn
      // in updateHud) with its % above it, and the speed readout below.
      this.touchHullText = text(this, this.scale.width / 2, this.scale.height - 118, 'HULL 100%', {
        size: 'caption', color: C.ok, stroke: C.shadow, strokeThickness: STROKE.text, origin: [0.5, 1],
      })
      this.touchHullText.setFontSize(TYPE.caption * S)
      this.speedText = text(this, this.scale.width / 2, this.scale.height - 18, '0 MPH', {
        size: 'speed', color: C.oxide, stroke: C.shadow, strokeThickness: STROKE.heading, origin: [0.5, 1],
      })
    } else {
      this.speedText = text(this, 28, this.scale.height - speedTextBottomMargin(S), '0 MPH', {
        size: 'speed', color: C.oxide, stroke: C.shadow, strokeThickness: STROKE.heading, origin: [0, 1],
      })
    }
    // origin anchors the text corner at the fixed point, so a bigger font grows
    // away from it. On desktop the margin shrinks at touch scale so the enlarged
    // glyph clears the MINES pip row above it — see hudScale.ts.
    this.speedText.setFontSize(TYPE.speed * S)

    this.hudBars = this.add.graphics()

    // desktop: bottom-right corner. touch: top-centre (the bottom-right corner
    // now holds the action button cluster).
    this.positionText = isTouch
      ? text(this, this.scale.width / 2, 14, '4th', {
          size: 'readout', color: C.oxide, stroke: C.shadow, strokeThickness: STROKE.title, origin: [0.5, 0],
        })
      : text(this, anchorRight(this.scale.width, 28, S), anchorBottom(this.scale.height, 30, S), '4th', {
          size: 'readout', color: C.oxide, stroke: C.shadow, strokeThickness: STROKE.title, origin: [1, 1],
        })
    this.positionText.setFontSize(TYPE.readout * S)

    // top-right anchor: the lap/time/best stack and the standings rows below
    // it all share this x, and all reposition — at 1x their line gaps (54px,
    // 38px, 30px) were already close to the unscaled line heights, so a
    // bigger font needs a bigger gap, not just a bigger glyph.
    const right = anchorRight(this.scale.width, 28, S)
    this.lapText = text(this, right, 24 * S, `LAP 1/${this.track.laps}`, {
      size: 'heading',
      stroke: C.shadow,
      strokeThickness: STROKE.heading,
      origin: [1, 0],
    })
    this.lapText.setFontSize(TYPE.heading * S)
    this.timeText = text(this, right, 78 * S, '0:00.00', {
      size: 'bodyLg',
      color: C.textSecondary,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
      origin: [1, 0],
    })
    this.timeText.setFontSize(TYPE.bodyLg * S)
    this.bestText = text(this, right, 116 * S, '', {
      size: 'body',
      color: C.money,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
      origin: [1, 0],
    })
    this.bestText.setFontSize(TYPE.body * S)

    // black-market gear fitted for this race, shown above the status plate.
    // Overcharge is named directly on the boost bar instead of hidden here.
    const gear: string[] = []
    if (this.hasPlating) gear.push('RAM PLATING')
    // the band between the steer pad's touch zone (ends y=815) and the plate
    // top (854) can't grow, so on touch the tag's font caps at 1.25x and the
    // tag lifts ~6px to keep its bottom clear of the plate border (both are
    // identity at S=1; see hudScale.ts gearTagY / gearTagFontScale)
    // desktop: just above the bottom-left status plate. touch: that corner is
    // the joystick now, so tuck the tag top-left, under the identity line.
    const gearY = isTouch ? 62 + TYPE.action * S + 8 + TYPE.caption * S + 6 : gearTagY(this.scale.height, S)
    const gearText = text(this, 16, gearY, gear.join(' · '), {
      size: 'caption',
      color: C.oxideDim,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
    })
    gearText.setFontSize(TYPE.caption * gearTagFontScale(S))

    // identity is driven by the career in single-player, by the local roster entry online
    let identityLabel: string
    let identityColor: number
    if (this.mode === 'network') {
      const me = this.raceStart!.roster.find((r) => r.id === this.raceStart!.youId)!
      identityLabel = `${me.name.toUpperCase()} · WEAPONS ON`
      identityColor = me.color
    } else {
      identityLabel = `${this.career.profile.driverName.toUpperCase()} · WEAPONS ${this.career.profile.weaponsEnabled ? 'ON' : 'OFF'}`
      identityColor = this.career.profile.liveryColor
    }
    // y is derived from cashText's own (scaled) height, not a fixed 94: at
    // 1x that gap (94 = 62 + 24 + 8) was already tight, and cashText's own
    // font now grows into it.
    const identityY = 62 + TYPE.action * S + 8
    const identityText = text(this, 16, identityY, identityLabel, {
      size: 'caption', color: identityColor, stroke: C.shadow, strokeThickness: STROKE.text,
    })
    identityText.setFontSize(TYPE.caption * S)

    const hudChildren: Phaser.GameObjects.GameObject[] = [
      this.speedStreaks,
      this.edgeFlash,
      plates,
      hint,
      gearText,
      identityText,
      ...this.hudStatusLabels,
      ...this.hudStatusValues,
      this.cashText,
      this.speedText,
      ...(this.touchHullText ? [this.touchHullText] : []),
      this.hudBars,
      this.positionText,
      this.lapText,
      this.timeText,
      this.bestText,
    ]

    for (let i = 0; i < 4; i++) {
      const t = text(this, right, (170 + i * 30) * S, '', {
        size: 'bodySm',
        stroke: C.shadow,
        strokeThickness: STROKE.text,
        origin: [1, 0],
      })
      t.setFontSize(TYPE.bodySm * S)
      this.standingsTexts.push(t)
      hudChildren.push(t)
    }

    this.hudContainer = this.add.container(0, 0, hudChildren).setDepth(100)
  }

  private updateHud(now: number) {
    const player = this.myCar()
    this.speedText.setText(`${Math.round(speed(player.state) * MPH_PER_PX)} MPH`)
    this.cashText.setText(`$${player.cash}`)
    this.lapText.setText(`LAP ${currentLap(player.progress)}/${this.track.laps}`)
    if (this.sim.phase !== 'countdown') this.timeText.setText(formatTime(now - this.sim.raceStartAt))
    if (player.lapTimes.length > 0) {
      this.bestText.setText(`BEST ${formatTime(Math.min(...player.lapTimes))}`)
    }

    // HULL fills with safety remaining (not damage taken), so it answers
    // "how much do I have left?" the same direction as every other meter.
    const hullRemaining = Math.max(0, 100 - player.damage)
    this.hudBars.clear()

    if (this.isTouchHud) {
      // bottom-centre hull bar + %; ammo/turbo/mines counts go onto the buttons
      const bw = 280
      const bx = this.scale.width / 2 - bw / 2
      const by = this.scale.height - 112
      statBar(this.hudBars, bx, by, bw, 14, Phaser.Math.Clamp(hullRemaining / 100, 0, 1), damageColor(player.damage), { backdrop: true })
      this.touchHullText?.setText(`HULL ${Math.round(hullRemaining)}%`).setColor(hex(damageColor(player.damage)))
      this.touchControls?.setReadouts({ ammo: player.ammo, mines: player.mines, turbo: player.turbo })
    } else {
      // desktop bottom-left status grid. bx/bw come from the scaled row grid
      // (130/170 at S=1) so the bar clears its label and value — see hudScale.ts.
      const S = this.hudScaleFactor
      const bx = statusBarX(S)
      const by = this.scale.height - 200
      const bw = statusBarWidth(S)
      const bh = 14 * S
      const pipRadius = 7 * S
      const bars: Array<[number, number]> = [
        [hullRemaining / 100, damageColor(player.damage)],
        [player.ammo / GUN.ammoMax, C.ammo],
        [player.turbo, this.hasOverTurbo ? C.warn : C.turbo],
      ]
      bars.forEach(([ratio, color], i) => {
        statBar(this.hudBars, bx, by + i * 36, bw, bh, Phaser.Math.Clamp(ratio, 0, 1), color, { backdrop: true })
      })
      // Always draw the full mine capacity: an empty row now visibly means zero.
      for (let i = 0; i < MINES.count; i++) {
        const x = bx + 8 + i * 25
        const y = by + 3 * 36 + 6
        this.hudBars.fillStyle(i < player.mines ? C.danger : C.surfaceTrack, 1)
        this.hudBars.fillCircle(x, y, pipRadius)
        this.hudBars.lineStyle(2, i < player.mines ? C.warn : C.border, 0.9)
        this.hudBars.strokeCircle(x, y, pipRadius)
      }
      // env.weaponsEnabled mirrors career.profile.weaponsEnabled in single-player and
      // is always true online — read it so this per-frame HUD never touches the career
      const weapons = this.mode === 'network' ? this.env.weaponsEnabled : this.career.profile.weaponsEnabled
      this.hudStatusValues[0].setText(`${Math.round(hullRemaining)}% LEFT`).setColor(hex(damageColor(player.damage)))
      this.hudStatusValues[1].setText(weapons ? `${player.ammo} / ${GUN.ammoMax}` : 'DISABLED').setColor(hex(weapons ? C.ammo : C.textDisabled))
      this.hudStatusValues[2].setText(`${Math.round(player.turbo * 100)}%`).setColor(hex(this.hasOverTurbo ? C.warn : C.turbo))
      this.hudStatusValues[3].setText(weapons ? `${player.mines} / ${MINES.count}` : 'DISABLED').setColor(hex(weapons ? C.danger : C.textDisabled))
    }

    const playerPos = this.sim.placementOrder.indexOf(this.localCarId) + 1
    if (playerPos > 0) this.positionText.setText(player.wrecked ? 'OUT' : ordinal(playerPos))

    this.carsById.clear()
    for (const car of this.sim.cars) this.carsById.set(car.id, car)
    this.sim.placementOrder.forEach((id, i) => {
      const car = this.carsById.get(id)!
      const info = this.carInfo.get(id)!
      const row = this.standingsTexts[i]
      const status = car.wrecked ? ' ✗' : car.finishedAt !== null ? ' *' : ` ${Math.round(car.damage)}%`
      row.setText(`${i + 1}. ${info.name}${status}`)
      row.setColor(hex(car.id === this.localCarId ? C.oxide : info.color))
    })

    // rivals-done grace countdown toast — owned by the HUD, driven by sim state
    if (this.sim.allRivalsDoneAt !== null) {
      if (!this.rivalsDoneToast) {
        this.rivalsDoneToast = text(this, this.scale.width / 2, 320, '', {
          size: 'subtitle',
          color: C.danger,
          stroke: C.shadow,
          strokeThickness: STROKE.heading,
          origin: [0.5, 0.5],
        })
        // center-anchored on both axes — bigger font just grows in place, no reposition needed
        this.rivalsDoneToast.setFontSize(TYPE.subtitle * this.hudScaleFactor)
        // must join the container, or the HUD camera never draws it (D-011)
        this.hudContainer.add(this.rivalsDoneToast)
      }
      const remaining = Math.ceil((this.sim.allRivalsDoneAt + 5000 - now) / 1000)
      this.rivalsDoneToast.setVisible(true).setText(`ALL RIVALS DONE — RACE ENDS IN ${remaining}`)
    } else {
      this.rivalsDoneToast?.setVisible(false)
    }

    if (this.debugText) {
      const cars = this.sim.cars.map(
        (c) => `${c.id.slice(0, 4)} g${c.progress.gatesPassed} d${Math.round(c.damage)}${c.wrecked ? ' WRECK' : ''}`,
      )
      this.debugText.setText(
        [
          `phase ${this.sim.phase}  bullets ${this.sim.bullets.length}  ammo ${player.ammo}  turbo ${player.turbo.toFixed(2)}`,
          cars.join('  '),
        ].join('\n'),
      )
    }
  }

  // ---------------------------------------------------------------- debug

  private setupDebug() {
    const w = window as unknown as Record<string, unknown>
    w.__carSpec = this.playerSpec
    w.__career = () => ({ ...this.career })
    w.__setDrive = (input: DriveOverride | null) => {
      this.autoInput = input
    }
    w.__getRace = () => ({
      phase: this.sim.phase,
      duel: this.isDuel,
      placements: [...this.sim.placementOrder],
      cars: this.sim.cars.map((c) => ({
        id: c.id,
        gatesPassed: c.progress.gatesPassed,
        lap: currentLap(c.progress),
        finishedAt: c.finishedAt,
        speed: Math.round(speed(c.state)),
        x: Math.round(c.state.x),
        y: Math.round(c.state.y),
        heading: c.state.heading,
        z: Math.round(c.state.z),
        airborne: isAirborne(c.state),
        damage: Math.round(c.damage * 10) / 10,
        ammo: c.ammo,
        turbo: Math.round(c.turbo * 100) / 100,
        turboDepleted: c.turboDepleted,
        cash: c.cash,
        wrecked: c.wrecked,
        mines: c.mines,
        chassis: this.carInfo.get(c.id)?.chassisId,
        talent: c.ai?.grade,
        pace: c.ai ? Math.round(c.ai.speedScale * 1000) / 1000 : undefined,
      })),
      track: this.track.id,
      turboActive: this.myCar().lastTurboActive,
      bullets: this.sim.bullets.length,
      minesOnTrack: this.sim.mines.length,
      pickupsActive: this.sim.pickups.filter((p) => p.respawnAt === null).length,
    })
    w.__setCarState = (s: Partial<CarState>) => {
      this.myCar().state = { ...this.myCar().state, ...s }
      this.myCar().prevPos = { x: this.myCar().state.x, y: this.myCar().state.y }
    }
    w.__applyDamage = (id: string, amount: number) => {
      const car = this.sim.cars.find((c) => c.id === id)
      if (car) {
        const events: SimEvent[] = []
        damageCarSim(this.sim, this.env, car, amount, events)
        this.handleSimEvents(events)
      }
    }
    w.__launch = (id: string, vz = MINE_BLAST.launchVz) => {
      const car = this.sim.cars.find((c) => c.id === id)
      if (car) car.state = launchCar(car.state, vz)
    }
    w.__dropMineAt = (x: number, y: number) => {
      const car = this.myCar()
      const saved = { ...car.state }
      car.state = { ...car.state, x: x + 55 * Math.cos(car.state.heading), y: y + 55 * Math.sin(car.state.heading) }
      car.mines++
      car.lastMineAt = -1e9
      const events: SimEvent[] = []
      tryDropMineSim(this.sim, car, events)
      this.handleSimEvents(events)
      car.state = saved
    }
    // Drive the game loop by hand. A hidden browser tab throttles rAF to a
    // standstill, and scripted tuning runs want a fixed timestep anyway.
    w.__step = (frames = 1, dtMs = 1000 / 60) => {
      this.stepClock = this.stepClock || this.time.now
      for (let i = 0; i < frames; i++) {
        this.stepClock += dtMs
        this.game.step(this.stepClock, dtMs)
      }
      return this.time.now
    }
    /**
     * Hand the player over to the AI so difficulty can be measured instead of
     * guessed: `__autoPilot({fire:false, mines:false})` is "clean driving".
     * The player keeps its own chassis, gets no rank pace and no rubber band.
     */
    w.__autoPilot = (cfg: { fire?: boolean; turbo?: boolean; mines?: boolean; style?: number; talent?: 1 | 2 | 3 | 4 } | null) => {
      const player = this.myCar()
      if (!cfg) {
        this.sim.autoPilot = null
        player.ai = null
        return
      }
      this.sim.autoPilot = { fire: cfg.fire ?? false, turbo: cfg.turbo ?? true, mines: cfg.mines ?? false }
      const style = DRIVING_STYLES[cfg.style ?? 1]
      const talent = TALENT_PROFILES[cfg.talent ?? 3]
      let lineIdx = 0
      let bestD = Infinity
      this.centerline.forEach((p, i) => {
        const d = Math.hypot(p.x - player.state.x, p.y - player.state.y)
        if (d < bestD) {
          bestD = d
          lineIdx = i
        }
      })
      player.ai = {
        lineIdx,
        lookAheadSamples: style.lookAheadSamples,
        speedScale: 1,
        tuning: talentTuning(style.tuning, talent),
        spec: this.playerSpec,
        grade: talent.grade,
        aimSpread: GUN.playerSpread,
        mineCooldownMs: AI_MINES.cooldownMs,
        rubberBandGain: 0,
      }
    }
    /** Final order + who survived, readable the moment the race ends. */
    w.__raceSummary = () => ({
      phase: this.sim.phase,
      over: this.sim.phase === 'finished' || this.myCar().finishedAt !== null || this.myCar().wrecked,
      placements: [...this.sim.placementOrder],
      playerPosition: this.sim.placementOrder.indexOf(this.localCarId) + 1,
      playerWrecked: this.myCar().wrecked,
      playerDamage: Math.round(this.myCar().damage),
      playerLap: currentLap(this.myCar().progress),
      elapsedMs: Math.round(this.sim.simTimeMs - this.sim.raceStartAt),
      cars: this.sim.cars.map((c) => ({
        id: c.id,
        wrecked: c.wrecked,
        damage: Math.round(c.damage),
        gates: c.progress.gatesPassed,
        talent: c.ai?.grade,
      })),
    })
    w.__pickups = () => this.sim.pickups.map((p) => ({ type: p.type, x: p.x, y: p.y, active: p.respawnAt === null }))
    w.__gates = this.gates
    w.__restartRace = () => this.scene.restart()
    /** Restart the race on any venue, optionally against a chosen grid. */
    w.__setTrack = (id: string, rivalIds?: string[]) => {
      setCurrentOffer({ track: trackById(id), rivalIds: rivalIds ?? this.rivalIds, duel: this.isDuel })
      this.scene.restart()
    }
    w.__tracks = ALL_TRACKS.map((t) => t.id)

    if (SHOW_GATES) {
      const gfx = this.add.graphics().setDepth(50)
      this.gates.forEach((g, i) => {
        gfx.lineStyle(4, i === 0 ? 0xf2a33c : 0x4fc3f7, 0.55)
        gfx.lineBetween(g.a.x, g.a.y, g.b.x, g.b.y)
      })
      this.cameras.cameras[1]?.ignore(gfx)
    }

    // obstacle inspection overlay: red rings are the authoritative collision
    // circles (env.obstacleCircles via each piece), amber boxes the sprite AABB
    const obGfx = this.add.graphics().setDepth(50)
    for (const piece of this.env.obstacles) {
      obGfx.lineStyle(2, 0xff5f5f, 0.9)
      for (const c of piece.circles) obGfx.strokeCircle(c.x, c.y, c.r)
    }
    obGfx.lineStyle(1, 0xf2a33c, 0.6)
    for (const sprite of this.obstacleSprites) {
      const b = sprite.getBounds()
      obGfx.strokeRect(b.x, b.y, b.width, b.height)
    }
    this.cameras.cameras[1]?.ignore(obGfx)

    this.debugText = text(this, 16, 120, '', { size: 'micro', color: C.money })
    this.hudContainer.add(this.debugText)
  }
}
