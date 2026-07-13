import Phaser from 'phaser'
import { DEBUG, SHOW_GATES } from '../../config/game'
import {
  GROUNDED,
  IDLE_INPUT,
  forwardSpeed,
  isAirborne,
  justLanded,
  lateralSpeed,
  launchCar,
  speed,
  stepCar,
  type CarInput,
  type CarPhysicsSpec,
  type CarState,
} from '../../core/vehicle/carPhysics'
import {
  buildGates,
  catmullRomClosed,
  closedPolylineLength,
  distanceToClosedPolyline,
  lineTangentAt,
  offsetClosedPolyline,
  scatterPointsAlong,
  segmentsIntersect,
  spacedPointsAlong,
  turnAmount,
  type Gate,
  type Pose,
  type Vec2,
} from '../../core/track/geometry'
import { placeSpritesAlong, scatterImages } from '../track/placement'
import {
  applyGateCrossing,
  createProgress,
  currentLap,
  nextGateIndex,
} from '../../core/race/progress'
import { ordinal } from '../../core/race/placement'
import { applyDamage, impactDamage, repairDamage } from '../../core/combat/damage'
import { randomPickupLayout, randomPickupSpot, type PickupType } from '../../core/track/pickups'
import { aiDrive, lookAheadFor, wrapAngle, type AiTuning } from '../../core/ai/driver'
import {
  talentAimSpread,
  talentMineCooldown,
  talentMineCount,
  talentPace,
  talentRubberBand,
  talentTuning,
  type TalentProfile,
} from '../../core/ai/talent'
import { needsRescue, rescuePose, updateStuckMs } from '../../core/vehicle/rescue'
import { RESCUE } from '../../data/rescue'
import { shouldTurbo } from '../../core/ai/turbo'
import { leadTarget } from '../../core/combat/aim'
import { mineIsArmed, mineIsLive } from '../../core/combat/mines'
import { buildRacingLine } from '../../core/track/racingLine'
import { mineBlast } from '../../core/combat/blast'
import { formatTime } from '../../core/race/format'
import { armorResistance, effectiveCarSpec } from '../../core/vehicle/carSpec'
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
import { collideCars } from '../../core/vehicle/collision'
import { rosterById } from '../../data/roster'
import { BOSS } from '../../data/boss'
import { OVERCHARGED_TURBO, RAM_PLATING, SABOTAGE } from '../../data/blackMarket'
import { ALL_TRACKS, TRACKS_BY_TIER, trackById } from '../../data/tracks'
import { STARTER_CAR, carById } from '../../data/cars'
import { DRIVING_STYLES, RUBBER_BAND, TALENT_PROFILES, styleForGrade, talentOf } from '../../data/drivers'
import {
  AI_GUNNER,
  AI_MINES,
  GUN,
  IMPACT_FX,
  MINES,
  MINE_BLAST,
  PICKUPS,
  RAM_DAMAGE,
  TURBO,
  TURBO_FX,
  WALL_DAMAGE,
  WEAPONS_FREE_DELAY_MS,
} from '../../data/weapons'
import type { TrackDef } from '../../data/tracks/testCircuit'
import type { RaceResults } from './ResultsScene'
import { C, STROKE, hex } from '../ui/theme'
import { damageColor, heading, hintBar, plate, statBar, text } from '../ui/widgets'
import { InputManager } from '../input/inputManager'
import { loadSettings, saveSettings, type SettingsState } from '../state/settings'
import { createSeededRandom, randomSeed } from '../../core/race/random'
import type { RacePhase } from '../race/raceRuntime'
import { simulationDeltaSeconds } from '../race/raceSimulation'
import { racePlacements } from '../race/placementSystem'
import { stepTurboMeter } from '../../core/vehicle/turboMeter'

const CAR_SCALE = 0.44
const CAR_RADIUS = 34
const CAR_BODY_RADIUS = 30
const TIRE_RADIUS = 24
const MPH_PER_PX = 0.14
const OFF_TRACK_DRAG = 1.4
const AVOID_RANGE = 150

interface CarUnit {
  id: string
  name: string
  color: number
  isPlayer: boolean
  state: CarState
  prevPos: Vec2
  progress: ReturnType<typeof createProgress>
  sprite: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
  exhaust: Phaser.GameObjects.Particles.ParticleEmitter
  damageSmoke: Phaser.GameObjects.Particles.ParticleEmitter
  turboFlame: Phaser.GameObjects.Particles.ParticleEmitter
  /** exhaust flame drawn behind the car while boosting */
  flameCone: Phaser.GameObjects.Image
  turboGlow: Phaser.GameObjects.Image
  headlights: Phaser.GameObjects.Image[]
  taillights: Phaser.GameObjects.Image[]
  fireGlow: Phaser.GameObjects.Image | null
  ai: {
    lineIdx: number
    lookAheadSamples: number
    speedScale: number
    tuning: AiTuning
    /** base chassis for this AI (the boss drives a one-off machine) */
    spec: CarPhysicsSpec
    /** talent-scaled combat and rubber-band numbers */
    talent: TalentProfile
    aimSpread: number
    mineCooldownMs: number
    rubberBandGain: number
  } | null
  finishedAt: number | null
  lapStartAt: number
  lapTimes: number[]
  damage: number
  wrecked: boolean
  ammo: number
  turbo: number
  turboDepleted: boolean
  gunCooldown: number
  /** AI burst discipline: when the current burst ends, and when the rest ends */
  burstEndsAt: number
  restEndsAt: number
  cash: number
  mines: number
  lastMineAt: number
  /** relative collision mass from the chassis */
  mass: number
  /** how long this car has been beached on the scenery, ms */
  stuckMs: number
  /** catalog chassis this rival drives (debug/telemetry) */
  chassisId?: string
  /** armor tier a rival has fitted; the player's lives on the career */
  armorTier: number
}

/** A mine on the tarmac: casing, blinking arm light, danger ring once armed. */
interface DroppedMine {
  x: number
  y: number
  droppedAt: number
  ownerId: string
  sprite: Phaser.GameObjects.Image
  light: Phaser.GameObjects.Image
  ring: Phaser.GameObjects.Image
}

interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  ttl: number
  owner: CarUnit
  sprite: Phaser.GameObjects.Image
}

interface PickupInstance {
  type: PickupType
  x: number
  y: number
  sprite: Phaser.GameObjects.Image
  respawnAt: number | null
  pulse: Phaser.Tweens.Tween
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
  /** the line the AI drives: apex-clipping, straighter and shorter than centre */
  private racingLine: Vec2[] = []
  private gates: Gate[] = []
  private barriers: Vec2[] = []
  private gateSpacing = 1

  private career!: CareerState
  private playerSpec = { ...STARTER_CAR }
  private isDuel = false
  private hasPlating = false
  private hasOverTurbo = false
  private cars: CarUnit[] = []
  private bullets: Bullet[] = []
  private mines: DroppedMine[] = []
  private pickups: PickupInstance[] = []
  private placementOrder: string[] = []
  private allRivalsDoneAt: number | null = null
  private rivalsDoneToast?: Phaser.GameObjects.Text

  private phase: RacePhase = 'countdown'
  private raceStartAt = 0
  private trapUntil = 0
  private camRotation = 0
  private lookAheadX = 0
  private lookAheadY = 0
  private playerTurboActive = false
  /** wall-clock deadline for the crash time-dilation */
  private slowMoUntil = 0
  private random: () => number = Math.random
  private raceSeed = 0
  private settings!: SettingsState
  private inputManager!: InputManager
  private fireToggled = false
  private turboToggled = false
  private resultCommitted = false

  private skidRT!: Phaser.GameObjects.RenderTexture
  private skidStamp!: Phaser.GameObjects.Image
  private scorchStamp!: Phaser.GameObjects.Image
  private tireSmoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private explosionSmoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private hitSparks!: Phaser.GameObjects.Particles.ParticleEmitter
  private bulletTrail!: Phaser.GameObjects.Particles.ParticleEmitter

  private hudContainer!: Phaser.GameObjects.Container
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
  /** debug-only: drive the player with the AI, to measure difficulty */
  private autoPilot: { fire: boolean; turbo: boolean; mines: boolean } | null = null

  constructor() {
    super('Race')
  }

  create() {
    this.phase = 'countdown'
    this.autoInput = null
    this.cars = []
    this.bullets = []
    this.mines = []
    this.pickups = []
    this.barriers = []
    this.standingsTexts = []
    this.hudStatusLabels = []
    this.hudStatusValues = []
    this.trapUntil = 0
    this.allRivalsDoneAt = null
    this.resultCommitted = false
    this.fireToggled = false
    this.turboToggled = false

    this.career = loadCareer()
    this.settings = loadSettings()
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

    this.centerline = catmullRomClosed(this.track.controls, this.track.samplesPerSegment)
    // leave a car's width of tarmac between the line and the paint
    this.racingLine = buildRacingLine(this.centerline, { maxOffset: this.track.width / 2 - CAR_RADIUS - 8 })
    this.gates = buildGates(this.centerline, this.track.gateCount, this.track.width / 2 + this.track.shoulder)
    this.gateSpacing = closedPolylineLength(this.centerline) / this.track.gateCount

    this.buildWorld()
    this.buildPickups()
    this.buildCars()
    this.buildSharedEffects()
    this.buildHud()
    this.setupCameras()
    this.setupInput()
    this.startCountdown()

    if (DEBUG) this.setupDebug()
  }

  update(time: number, delta: number) {
    this.inputManager.update()
    if (this.settings.toggleFire && this.inputManager.justDown('fire')) this.fireToggled = !this.fireToggled
    if (this.settings.toggleTurbo && this.inputManager.justDown('turbo')) this.turboToggled = !this.turboToggled
    // a heavy crash dilates time for a moment — the whole sim lurches
    const dilation = time < this.slowMoUntil ? IMPACT_FX.crashSlowMoScale : 1
    const dt = simulationDeltaSeconds(delta, dilation)
    const locked = this.phase === 'countdown'
    const weaponsFree = this.career.profile.weaponsEnabled && this.phase === 'racing' && time > this.raceStartAt + WEAPONS_FREE_DELAY_MS

    for (const car of this.cars) {
      let input: CarInput = IDLE_INPUT
      let wantsFire = false
      let wantsTurbo = false

      if (!locked && !car.wrecked) {
        if (car.isPlayer) {
          if (car.finishedAt === null) {
            if (this.autoPilot && car.ai) {
              // scripted difficulty runs: the player drives itself
              input = this.computeAiInput(car)
              const curvature = Math.min(1, turnAmount(this.centerline, car.ai.lineIdx, 20) / 1.1)
              wantsFire = this.autoPilot.fire && this.hasTargetInSights(car)
              wantsTurbo = this.autoPilot.turbo && curvature < 0.12 && car.turbo > 0.35
              if (this.autoPilot.mines && this.phase === 'racing') this.maybeAutoDropMine(car, time)
            } else {
              const drive: DriveOverride = this.autoInput ?? this.readPlayerInput()
              input = drive
              wantsFire = drive.fire ?? (this.settings.toggleFire ? this.fireToggled : this.inputManager.down('fire'))
              wantsTurbo = drive.turbo ?? (this.settings.toggleTurbo ? this.turboToggled : this.inputManager.down('turbo'))
              if ((drive.dropMine ?? this.inputManager.justDown('mine')) && this.phase === 'racing' && this.career.profile.weaponsEnabled) {
                this.tryDropMine(car, time)
              }
            }
          }
        } else {
          input = this.computeAiInput(car)
          const combat = this.computeAiCombat(car, time)
          wantsFire = combat.fire && this.career.profile.weaponsEnabled
          wantsTurbo = combat.turbo
        }
      }

      // Empty turbo stays locked while the button is held. Without that latch,
      // a zero tank alternated recharge/boost every frame and left the VFX on.
      const overcharged = car.isPlayer && this.hasOverTurbo
      const drain = TURBO.drainPerSec * (overcharged ? OVERCHARGED_TURBO.drainScale : 1)
      const turboStep = stepTurboMeter(
        { charge: car.turbo, depleted: car.turboDepleted },
        wantsTurbo,
        !car.wrecked && !locked && !isAirborne(car.state),
        dt,
        { drainPerSec: drain, rechargePerSec: TURBO.rechargePerSec, restartThreshold: TURBO.restartThreshold },
      )
      car.turbo = turboStep.state.charge
      car.turboDepleted = turboStep.state.depleted
      const turboActive = turboStep.active
      if (car.isPlayer) this.playerTurboActive = turboActive
      // the overcharged mix cooks your own engine while boosting — it can wreck you
      if (turboActive && overcharged) {
        this.damageCar(car, OVERCHARGED_TURBO.selfDamagePerSec * dt, null)
      }

      car.prevPos = { x: car.state.x, y: car.state.y }
      const before = car.state
      car.state = stepCar(car.state, input, this.effectiveSpec(car, turboActive), dt, MINE_BLAST.gravity)
      if (justLanded(before, car.state)) this.onLanding(car)
      if (car.wrecked) {
        const decay = Math.exp(-3 * dt)
        car.state.vx *= decay
        car.state.vy *= decay
      }
      // a car in the air clears the scenery, but never the tire wall: a mine
      // launch that sailed into the infield left the car beached in there
      if (!isAirborne(car.state)) this.applyOffTrackDrag(car, dt)
      this.resolveBarrierCollisions(car)
      this.updateStuckRescue(car, dt)

      car.gunCooldown = Math.max(0, car.gunCooldown - dt)
      if (wantsFire && weaponsFree && !car.wrecked && (car.finishedAt === null || !car.isPlayer)) {
        this.tryFire(car)
      }

      if (this.phase !== 'countdown' && !car.wrecked) this.checkGateCrossing(car, time)

      this.syncCarVisuals(car)
      this.updateCarEffects(car, input, turboActive)
    }

    this.resolveCarCollisions()
    this.updateBullets(dt)
    this.updateMines(time)
    this.updatePickups(time)
    this.updatePlacements()
    this.checkAllRivalsDone(time)
    this.updateCamera(time)
    this.updateHud(time)
  }

  /** If every rival is finished or wrecked, give the player a short grace, then end the race. */
  private checkAllRivalsDone(now: number) {
    if (this.phase !== 'racing' || this.player.finishedAt !== null || this.player.wrecked) return
    const rivalsDone = this.cars.every((c) => c.isPlayer || c.finishedAt !== null || c.wrecked)
    if (!rivalsDone) {
      this.allRivalsDoneAt = null
      this.rivalsDoneToast?.setVisible(false)
      return
    }
    if (this.allRivalsDoneAt === null) {
      this.allRivalsDoneAt = now
      if (!this.rivalsDoneToast) {
        this.rivalsDoneToast = text(this, this.scale.width / 2, 320, '', {
          size: 'subtitle',
          color: C.danger,
          stroke: C.shadow,
          strokeThickness: STROKE.heading,
          origin: [0.5, 0.5],
        })
        // must join the container, or the HUD camera never draws it (D-011)
        this.hudContainer.add(this.rivalsDoneToast)
      }
    }
    const remaining = Math.ceil((this.allRivalsDoneAt + 5000 - now) / 1000)
    this.rivalsDoneToast!.setVisible(true).setText(`ALL RIVALS DONE — RACE ENDS IN ${remaining}`)
    if (now >= this.allRivalsDoneAt + 5000) {
      this.phase = 'finished'
      this.transitionToResults(now, false)
    }
  }

  // ---------------------------------------------------------------- mines

  private tryDropMine(car: CarUnit, now: number) {
    if (car.mines <= 0 || now - car.lastMineAt < MINES.dropCooldownMs) return
    car.mines--
    car.lastMineAt = now
    const cos = Math.cos(car.state.heading)
    const sin = Math.sin(car.state.heading)
    const x = car.state.x - 55 * cos
    const y = car.state.y - 55 * sin

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

    this.mines.push({ x, y, droppedAt: now, ownerId: car.id, sprite, light, ring })
    audioBus.pickup(true) // placement click; real sample hook later
  }

  private updateMines(now: number) {
    if (this.mines.length === 0) return
    const survivors: DroppedMine[] = []
    for (const mine of this.mines) {
      const armed = mineIsArmed(mine, now, MINES)
      // unarmed: dim and inert. armed: the light blinks and the ring breathes.
      const blink = 0.55 + 0.45 * Math.sin(now * 0.014)
      mine.sprite.setAlpha(armed ? 1 : 0.6)
      mine.light.setAlpha(armed ? 0.35 + 0.55 * blink : 0.12).setScale(armed ? 0.3 + 0.1 * blink : 0.22)
      mine.ring.setAlpha(armed ? 0.1 + 0.16 * blink : 0)

      let triggered: CarUnit | null = null
      for (const car of this.cars) {
        if (car.wrecked) continue
        if (car.isPlayer && this.phase === 'finished') continue
        // a car in the air flies straight over an armed mine
        if (isAirborne(car.state)) continue
        // the dropper gets a long grace; everyone else only gets the fuse
        if (!mineIsLive(mine, car.id, now, MINES)) continue
        if (Math.hypot(car.state.x - mine.x, car.state.y - mine.y) < MINES.triggerRadius) {
          triggered = car
          break
        }
      }

      if (!triggered) {
        survivors.push(mine)
        continue
      }

      this.detonateMine(mine, triggered)
    }
    this.mines = survivors
  }

  /** Full damage + launch for whoever ran it over, splash for anyone close. */
  private detonateMine(mine: DroppedMine, triggered: CarUnit) {
    audioBus.explosion()
    this.explosionSmoke.explode(16, mine.x, mine.y)
    this.hitSparks.explode(8, mine.x, mine.y)
    this.blastEffects(mine.x, mine.y, 1, 'mine-blast')
    this.scorchStamp.setPosition(mine.x, mine.y).setRotation(this.random() * Math.PI)
    this.skidRT.draw(this.scorchStamp)

    const tuning = {
      damage: MINES.damage,
      splashDamage: MINES.splashDamage,
      blastRadius: MINES.blastRadius,
      ...MINE_BLAST,
    }
    for (const car of this.cars) {
      if (car.wrecked) continue
      const impulse = mineBlast(
        { x: car.state.x, y: car.state.y, mass: car.mass, direct: car === triggered },
        mine,
        tuning,
        this.random,
      )
      if (!impulse) continue

      this.damageCar(car, impulse.damage, null)
      car.state = launchCar(
        {
          ...car.state,
          vx: car.state.vx + impulse.dvx,
          vy: car.state.vy + impulse.dvy,
          heading: car.state.heading + impulse.spin,
        },
        impulse.dvz,
      )
    }

    if (Math.hypot(this.player.state.x - mine.x, this.player.state.y - mine.y) < 500) {
      this.shake(200, 0.008)
    }
    mine.sprite.destroy()
    mine.light.destroy()
    mine.ring.destroy()
  }

  /** Touchdown after a launch: dust ring, bounce, and a thump you feel. */
  private onLanding(car: CarUnit) {
    const { x, y } = car.state
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
    this.tireSmoke.explode(IMPACT_FX.landingDustCount, x, y)

    // suspension bounce: the sprite squashes and settles
    car.sprite.setScale(CAR_SCALE)
    this.tweens.add({
      targets: car.sprite,
      scaleX: CAR_SCALE * 1.12,
      scaleY: CAR_SCALE * 0.86,
      duration: 90,
      yoyo: true,
      ease: 'quad.out',
    })

    const nearPlayer = car.isPlayer || Math.hypot(this.player.state.x - x, this.player.state.y - y) < 420
    if (nearPlayer) {
      this.shake(160, IMPACT_FX.landingShake)
      audioBus.thud()
    }
  }

  private get player(): CarUnit {
    return this.cars[0]
  }

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

  // ---------------------------------------------------------------- combat

  private tryFire(car: CarUnit) {
    if (car.ammo <= 0 || car.gunCooldown > 0) return
    car.ammo--
    car.gunCooldown = 1 / GUN.fireRate

    const distToPlayer = car.isPlayer
      ? 0
      : Math.hypot(car.state.x - this.player.state.x, car.state.y - this.player.state.y)
    if (distToPlayer < 900) audioBus.shot(1 - distToPlayer / 1000)

    // talent decides how straight a rival shoots
    const spread = car.isPlayer ? GUN.playerSpread : car.ai!.aimSpread
    const dir = car.state.heading + (this.random() * 2 - 1) * spread
    const mx = car.state.x + Math.cos(car.state.heading) * GUN.muzzleOffset
    const my = car.state.y + Math.sin(car.state.heading) * GUN.muzzleOffset

    const sprite = this.add.image(mx, my, 'bullet').setRotation(dir).setDepth(6).setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(sprite)
    this.bullets.push({
      x: mx,
      y: my,
      vx: Math.cos(dir) * GUN.bulletSpeed + car.state.vx,
      vy: Math.sin(dir) * GUN.bulletSpeed + car.state.vy,
      ttl: GUN.ttl,
      owner: car,
      sprite,
    })

    // muzzle flash (audio hook: gunshot)
    const flash = this.add
      .image(mx, my, 'muzzle')
      .setScale(0.8)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(flash)
    this.tweens.add({ targets: flash, alpha: 0, scale: 0.3, duration: 70, onComplete: () => flash.destroy() })
  }

  private updateBullets(dt: number) {
    const survivors: Bullet[] = []
    for (const b of this.bullets) {
      b.ttl -= dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.sprite.setPosition(b.x, b.y)
      if (this.random() < 0.5) this.bulletTrail.emitParticleAt(b.x, b.y)

      let dead = b.ttl <= 0
      if (!dead) {
        for (const car of this.cars) {
          if (car === b.owner || car.wrecked) continue
          if (car.isPlayer && this.phase === 'finished') continue
          // bullets pass under a launched car
          if (isAirborne(car.state)) continue
          if (Math.hypot(car.state.x - b.x, car.state.y - b.y) < CAR_BODY_RADIUS + 4) {
            this.onBulletHit(car, b)
            dead = true
            break
          }
        }
      }
      if (!dead) {
        for (const wall of this.barriers) {
          if (Math.abs(wall.x - b.x) > TIRE_RADIUS + 6 || Math.abs(wall.y - b.y) > TIRE_RADIUS + 6) continue
          if (Math.hypot(wall.x - b.x, wall.y - b.y) < TIRE_RADIUS + 4) {
            this.hitSparks.explode(3, b.x, b.y)
            dead = true
            break
          }
        }
      }

      if (dead) b.sprite.destroy()
      else survivors.push(b)
    }
    this.bullets = survivors
  }

  /** A round connects: sparks, a white flash, a shove, and — if it's you — a jolt. */
  private onBulletHit(car: CarUnit, b: Bullet) {
    // the rivals' handicap shrinks as the purse grows: full value on a death race
    const damage = GUN.damagePerHit * (b.owner.isPlayer ? 1 : AI_GUNNER.damageScale[this.track.tier])
    this.damageCar(car, damage, b.owner)
    this.hitSparks.explode(5, b.x, b.y)
    this.flashCar(car)

    // every hit shoves the victim a little along the bullet's path
    const bulletSpeed = Math.hypot(b.vx, b.vy) || 1
    const kick = GUN.impactKick / car.mass
    car.state.vx += (b.vx / bulletSpeed) * kick
    car.state.vy += (b.vy / bulletSpeed) * kick

    if (car.isPlayer) {
      this.shake(60, IMPACT_FX.playerHitShake)
      this.flashScreenEdge(C.danger, IMPACT_FX.playerHitFlashAlpha)
    }
  }

  /** Victim blinks white for a frame or two — the universal "that hurt" tell. */
  private flashCar(car: CarUnit) {
    if (car.wrecked) return
    car.sprite.setTintFill(0xffffff)
    this.time.delayedCall(IMPACT_FX.hitFlashMs, () => {
      if (!car.sprite.active) return
      // clearTint() leaves tintFill set, which would paint the car solid white
      car.sprite.tintFill = false
      if (car.wrecked) car.sprite.setTint(0x2c2c30)
      else car.sprite.clearTint()
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

  private damageCar(car: CarUnit, amount: number, _source: CarUnit | null) {
    if (car.wrecked || this.phase === 'countdown') return
    // rivals fit armor too, from their ladder rank — an ace is not a soft target
    const resistance = armorResistance(car.isPlayer ? this.career.upgrades.armor : car.armorTier)
    const result = applyDamage(car.damage, amount, resistance)
    car.damage = result.damage
    if (result.wrecked) this.wreckCar(car)
  }

  private wreckCar(car: CarUnit) {
    if (car.wrecked) return
    car.wrecked = true

    audioBus.explosion()
    this.explosionSmoke.explode(30, car.state.x, car.state.y)
    this.blastEffects(car.state.x, car.state.y, 1.6, 'explosion')

    // flying debris chunks
    for (let i = 0; i < 8; i++) {
      const angle = this.random() * Math.PI * 2
      const dist = 60 + this.random() * 130
      const piece = this.add
        .image(car.state.x, car.state.y, 'debris')
        .setRotation(this.random() * Math.PI * 2)
        .setDepth(6.9)
      this.cameras.cameras[1]?.ignore(piece)
      this.tweens.add({
        targets: piece,
        x: car.state.x + Math.cos(angle) * dist,
        y: car.state.y + Math.sin(angle) * dist,
        rotation: piece.rotation + (this.random() - 0.5) * 10,
        alpha: 0.25,
        duration: 500 + this.random() * 300,
        ease: 'cubic.out',
      })
    }

    // lingering fire
    car.fireGlow = this.add
      .image(car.state.x, car.state.y, 'glow-soft')
      .setTint(0xff8833)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(6.8)
    this.cameras.cameras[1]?.ignore(car.fireGlow)
    const flash = this.add
      .image(car.state.x, car.state.y, 'spark')
      .setScale(4)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(flash)
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.2, duration: 320, onComplete: () => flash.destroy() })
    this.scorchStamp.setPosition(car.state.x, car.state.y).setRotation(this.random() * Math.PI)
    this.skidRT.draw(this.scorchStamp)
    car.sprite.setTint(0x2c2c30)
    car.shadow.setAlpha(0.2)
    car.damageSmoke.frequency = 30
    this.shake(260, 0.008)

    if (car.isPlayer) {
      this.phase = 'finished'
      this.time.delayedCall(2200, () => this.transitionToResults(this.time.now, true))
    }
  }

  /** Is an enemy inside gun range and inside the aim cone? */
  /**
   * The gun is bolted to the nose, so "aiming" is really deciding when to pull
   * the trigger. Two things decide it:
   *
   *  - aces fire at where you WILL be (the bullet's intercept point), everyone
   *    else at where you are, which at racing speeds is where you were
   *  - if the race leader is within range, that is who they shoot at; nobody
   *    wastes ammo on a backmarker while the win is driving away
   */
  private hasTargetInSights(car: CarUnit): boolean {
    if (car.ammo <= 0) return false
    const leaderId = this.placementOrder[0]
    const candidates = this.cars.filter((other) => {
      if (other === car || other.wrecked) return false
      if (other.isPlayer && this.phase === 'finished') return false
      return Math.hypot(other.state.x - car.state.x, other.state.y - car.state.y) <= AI_GUNNER.range
    })
    if (!candidates.length) return false

    const leader = candidates.find((c) => c.id === leaderId)
    const targets = leader ? [leader] : candidates
    return targets.some((other) => this.canHit(car, other))
  }

  private canHit(car: CarUnit, other: CarUnit): boolean {
    const grade = car.ai?.talent.grade ?? 1
    const aim =
      grade >= AI_GUNNER.leadTargetFromGrade
        ? leadTarget(car.state, { x: other.state.x, y: other.state.y, vx: other.state.vx, vy: other.state.vy }, GUN.bulletSpeed)
        : { x: other.state.x, y: other.state.y }
    const angle = Math.atan2(aim.y - car.state.y, aim.x - car.state.x)
    return Math.abs(wrapAngle(angle - car.state.heading)) < AI_GUNNER.aimCone
  }

  /**
   * Drop a mine on the nose of anyone tailing close behind — but not in the
   * packed opening seconds, which would just mine the whole grid at the line.
   */
  private maybeAutoDropMine(car: CarUnit, now: number) {
    const cooldown = car.ai?.mineCooldownMs ?? AI_MINES.cooldownMs
    if (car.mines <= 0 || now < this.raceStartAt + AI_MINES.graceMs || now - car.lastMineAt <= cooldown) return
    // a car merely sitting behind you is not a threat; one that is closing is
    if (this.isBeingChased(car)) this.tryDropMine(car, now)
  }

  /**
   * Rivals shoot in bursts rather than holding the trigger forever. Caps the
   * damage a single tailing car can pour into you, without making them dumb.
   */
  private burstGate(car: CarUnit, hasTarget: boolean, now: number): boolean {
    if (!hasTarget) {
      car.burstEndsAt = 0
      return false
    }
    if (now < car.restEndsAt) return false
    if (car.burstEndsAt === 0) car.burstEndsAt = now + AI_GUNNER.burstMs
    if (now >= car.burstEndsAt) {
      car.restEndsAt = now + AI_GUNNER.restMs
      car.burstEndsAt = 0
      return false
    }
    return true
  }

  private computeAiCombat(car: CarUnit, now: number): { fire: boolean; turbo: boolean } {
    const ai = car.ai!
    const fire = this.burstGate(car, this.hasTargetInSights(car), now)
    if (this.phase === 'racing') this.maybeAutoDropMine(car, now)

    const curvature = Math.min(1, turnAmount(this.racingLine, ai.lineIdx, ai.lookAheadSamples * 2) / 1.1)
    const leader = this.placementOrder[0]
    const leaderCar = this.cars.find((c) => c.id === leader)
    const turbo = shouldTurbo({
      curvatureAhead: curvature,
      turbo: car.turbo,
      forwardSpeed: forwardSpeed(car.state),
      topSpeed: this.effectiveSpec(car, false).topSpeed,
      deficit: leaderCar ? this.progressScore(leaderCar) - this.progressScore(car) : 0,
      underAttack: this.isBeingChased(car),
    })
    return { fire, turbo }
  }

  /** Is somebody close behind and closing? Worth a mine, and worth the turbo. */
  private isBeingChased(car: CarUnit): boolean {
    const fx = Math.cos(car.state.heading)
    const fy = Math.sin(car.state.heading)
    for (const other of this.cars) {
      if (other === car || other.wrecked || other.finishedAt !== null) continue
      const dx = other.state.x - car.state.x
      const dy = other.state.y - car.state.y
      const d = Math.hypot(dx, dy)
      if (d >= AI_MINES.dropRange || dx * fx + dy * fy > -d * 0.5) continue
      // closing = their velocity along the gap between us beats ours
      const closing = (car.state.vx - other.state.vx) * (dx / d) + (car.state.vy - other.state.vy) * (dy / d)
      if (closing > AI_MINES.closingSpeed) return true
    }
    return false
  }

  // ---------------------------------------------------------------- pickups

  private buildPickups() {
    const spots = randomPickupLayout(
      this.centerline,
      [...PICKUPS.types],
      {
        lateralOffsets: [...PICKUPS.lateralOffsets],
        clearRadiusAroundStart: PICKUPS.clearRadiusAroundStart,
        minDistance: PICKUPS.minDistance,
      },
      this.random,
    )
    for (const spot of spots) {
      const sprite = this.add.image(spot.x, spot.y, `pk-${spot.type}`).setDepth(2.5)
      const pulse = this.startPickupPulse(sprite, spot.type)
      this.pickups.push({ type: spot.type, x: spot.x, y: spot.y, sprite, respawnAt: null, pulse })
    }
  }

  /** The skull trap art fills its frame more than the other icons — shrink it to match. */
  private pickupBaseScale(type: PickupType): number {
    return type === 'trap' ? 0.62 : 1
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

  private updatePickups(now: number) {
    for (const p of this.pickups) {
      if (p.respawnAt !== null) {
        if (now >= p.respawnAt) {
          this.relocatePickup(p)
          p.respawnAt = null
          p.sprite.setVisible(true).setAlpha(0)
          this.tweens.add({ targets: p.sprite, alpha: 1, duration: 400 })
        }
        continue
      }
      for (const car of this.cars) {
        if (car.wrecked) continue
        if (Math.hypot(car.state.x - p.x, car.state.y - p.y) < PICKUPS.radius) {
          this.collectPickup(p, car, now)
          break
        }
      }
    }
  }

  private collectPickup(p: PickupInstance, car: CarUnit, now: number) {
    if (car.isPlayer) audioBus.pickup(p.type !== 'trap')
    switch (p.type) {
      case 'ammo':
        car.ammo = Math.min(GUN.ammoMax, car.ammo + PICKUPS.ammoAmount)
        break
      case 'turbo':
        car.turbo = Math.min(1, car.turbo + PICKUPS.turboAmount)
        if (car.turbo >= TURBO.restartThreshold) car.turboDepleted = false
        break
      case 'repair':
        car.damage = repairDamage(car.damage, PICKUPS.repairAmount)
        break
      case 'cash':
        car.cash += PICKUPS.cashAmount
        break
      case 'trap':
        if (car.isPlayer) this.trapUntil = now + PICKUPS.trapDurationMs
        break
    }
    if (car.isPlayer) {
      const toasts: Record<PickupType, [string, number]> = {
        ammo: [`+${PICKUPS.ammoAmount} AMMO`, C.ammo],
        turbo: [`+${Math.round(PICKUPS.turboAmount * 100)}% TURBO`, C.turbo],
        repair: [`-${PICKUPS.repairAmount}% DMG`, C.money],
        cash: [`+$${PICKUPS.cashAmount}`, C.money],
        trap: ['TRAPPED!', 0xd68cff],
      }
      this.spawnToast(p.x, p.y, ...toasts[p.type])
    }
    p.respawnAt = now + PICKUPS.respawnMs
    p.sprite.setVisible(false)
    this.hitSparks.explode(4, p.x, p.y)
  }

  private relocatePickup(pickup: PickupInstance) {
    const occupied = this.pickups
      .filter((other) => other !== pickup && other.respawnAt === null)
      .map((other) => ({ x: other.x, y: other.y }))
    const position = randomPickupSpot(
      this.centerline,
      {
        lateralOffsets: [...PICKUPS.lateralOffsets],
        clearRadiusAroundStart: PICKUPS.clearRadiusAroundStart,
        minDistance: PICKUPS.minDistance,
      },
      this.random,
      occupied,
    )
    pickup.type = this.nextPickupType(pickup)
    pickup.x = position.x
    pickup.y = position.y
    pickup.sprite.setPosition(position.x, position.y).setTexture(`pk-${pickup.type}`)
    // texture may have changed type; restart the pulse at the new type's base scale
    pickup.pulse.stop()
    pickup.pulse = this.startPickupPulse(pickup.sprite, pickup.type)
  }

  /** Preserve the sparse type mix even as individual slots respawn. */
  private nextPickupType(respawning: PickupInstance): PickupType {
    const active = this.pickups.filter((pickup) => pickup !== respawning && pickup.respawnAt === null)
    const caps = new Map<PickupType, number>()
    PICKUPS.types.forEach((type) => caps.set(type, (caps.get(type) ?? 0) + 1))
    const start = Math.floor(this.random() * PICKUPS.types.length)
    for (let offset = 0; offset < PICKUPS.types.length; offset++) {
      const type = PICKUPS.types[(start + offset) % PICKUPS.types.length]
      const count = active.filter((pickup) => pickup.type === type).length
      if (count < (caps.get(type) ?? 0)) return type
    }
    return 'trap'
  }

  // ---------------------------------------------------------------- cars

  private buildCars() {
    const gate = this.gates[0]
    const normal = { x: -gate.tangent.y, y: gate.tangent.x }
    const heading = Math.atan2(gate.tangent.y, gate.tangent.x)

    const spawnAt = (slot: number): CarState => {
      const row = Math.floor(slot / 2)
      const col = slot % 2
      const back = 80 + row * 120
      const side = (col === 0 ? -1 : 1) * 58
      return {
        x: gate.center.x - gate.tangent.x * back + normal.x * side,
        y: gate.center.y - gate.tangent.y * back + normal.y * side,
        heading,
        vx: 0,
        vy: 0,
        ...GROUNDED,
      }
    }

    const makeUnit = (
      slot: number,
      id: string,
      name: string,
      color: number,
      textureKey: string,
      ai: CarUnit['ai'],
    ): CarUnit => {
      const state = spawnAt(slot)
      const shadow = this.add
        .image(0, 0, textureKey)
        .setScale(CAR_SCALE)
        .setTintFill(0x000000)
        .setAlpha(0.3)
        .setDepth(4)
      const sprite = this.add.image(0, 0, textureKey).setScale(CAR_SCALE).setDepth(5)
      const exhaust = this.add.particles(0, 0, 'smoke', {
        speed: { min: 15, max: 50 },
        scale: { start: 0.22, end: 0.55 },
        alpha: { start: 0.25, end: 0 },
        lifespan: 550,
        angle: { min: 0, max: 360 },
        tint: 0x8a8f98,
        frequency: 100,
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
        frequency: 18,
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

      const unit: CarUnit = {
        id,
        name,
        color,
        isPlayer: ai === null,
        state,
        prevPos: { x: state.x, y: state.y },
        progress: createProgress(this.track.gateCount, this.track.laps),
        sprite,
        shadow,
        exhaust,
        damageSmoke,
        turboFlame,
        flameCone,
        turboGlow,
        headlights,
        taillights,
        fireGlow: null,
        ai,
        finishedAt: null,
        lapStartAt: 0,
        lapTimes: [],
        damage: 0,
        wrecked: false,
        ammo: GUN.ammoMax,
        turbo: 1,
        turboDepleted: false,
        gunCooldown: 0,
        burstEndsAt: 0,
        restEndsAt: 0,
        cash: 0,
        mines: 0,
        lastMineAt: 0,
        mass: 1,
        stuckMs: 0,
        armorTier: 0,
      }
      this.syncCarVisuals(unit)
      return unit
    }

    const playerCar = carById(this.career.carId)
    const player = makeUnit(0, 'player', this.career.profile.driverName, this.career.profile.liveryColor, `car-top-${playerCar.id}`, null)
    player.damage = this.career.damage // persistent damage carries into the race
    player.mines = this.career.profile.weaponsEnabled ? this.career.mines : 0
    player.ammo = this.career.profile.weaponsEnabled ? GUN.ammoMax : 0
    player.mass = playerCar.mass
    if (this.hasOverTurbo) {
      // the volatile mix burns red and angry
      player.turboFlame.setParticleTint(TURBO_FX.overchargeFlameTint)
      player.flameCone.setTint(TURBO_FX.overchargeFlameTint)
      player.turboGlow.setTint(TURBO_FX.overchargeGlowTint)
    }
    this.cars.push(player)

    if (this.isDuel) {
      // 1-v-1 against the champion: one-off machine, charger style, ace hands
      const talent = talentOf(BOSS.id)
      const style = DRIVING_STYLES[0]
      const boss = makeUnit(1, BOSS.id, BOSS.name, BOSS.bodyColor, `car-top-${BOSS.id}`, {
        lineIdx: 0,
        lookAheadSamples: style.lookAheadSamples,
        speedScale: BOSS.paceScale * this.difficultyPaceScale(),
        tuning: talentTuning(style.tuning, talent),
        spec: BOSS.spec,
        talent,
        aimSpread: talentAimSpread(GUN.aiSpread, talent),
        mineCooldownMs: talentMineCooldown(AI_MINES.cooldownMs, talent),
        rubberBandGain: talentRubberBand(RUBBER_BAND.gainPerGate, talent),
      })
      boss.mass = BOSS.mass
      this.cars.push(boss)
    } else {
      this.rivalIds.forEach((id, i) => {
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
        const rival = makeUnit(i + 1, id, driver.name, driver.bodyColor, `car-top-${chassis.id}`, {
          lineIdx: 0,
          lookAheadSamples: style.lookAheadSamples,
          speedScale: talentPace(rivalStrength(rank), talent) * this.difficultyPaceScale(),
          tuning: talentTuning(style.tuning, talent),
          spec: effectiveCarSpec(chassis, upgrades),
          talent,
          aimSpread: talentAimSpread(GUN.aiSpread, talent),
          mineCooldownMs: talentMineCooldown(AI_MINES.cooldownMs, talent),
          rubberBandGain: talentRubberBand(RUBBER_BAND.gainPerGate, talent),
        })
        rival.mass = chassis.mass
        rival.mines = this.career.profile.weaponsEnabled ? talentMineCount(AI_MINES.count[this.track.tier], talent) : 0
        rival.ammo = this.career.profile.weaponsEnabled ? GUN.ammoMax : 0
        rival.chassisId = chassis.id
        rival.armorTier = upgrades.armor
        this.cars.push(rival)
      })
    }

    // sabotage bought at the black market: the strongest rival on this grid
    // (best speed scale — for the duel that's the champion) starts pre-damaged
    if (this.career.sabotage) {
      const strongest = this.cars
        .filter((c) => c.ai)
        .reduce((best, c) => (c.ai!.speedScale > best.ai!.speedScale ? c : best))
      strongest.damage = SABOTAGE.rivalStartDamage
    }

    for (const car of this.cars) {
      if (!car.ai) continue
      let best = 0
      let bestD = Infinity
      this.centerline.forEach((p, i) => {
        const d = Math.hypot(p.x - car.state.x, p.y - car.state.y)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      car.ai.lineIdx = best
    }
  }

  private difficultyPaceScale(): number {
    if (this.career.profile.difficulty === 'street') return 0.94
    if (this.career.profile.difficulty === 'hard') return 1.06
    return 1
  }

  private computeAiInput(car: CarUnit): CarInput {
    const ai = car.ai!
    const line = this.racingLine
    const n = line.length

    let bestD = Infinity
    let bestIdx = ai.lineIdx
    for (let step = 0; step < 30; step++) {
      const i = (ai.lineIdx + step) % n
      const p = line[i]
      const d = Math.hypot(p.x - car.state.x, p.y - car.state.y)
      if (d < bestD) {
        bestD = d
        bestIdx = i
      }
    }
    ai.lineIdx = bestIdx

    // Steering chases a point a fixed distance ahead — pushing it further out
    // just makes the car cut the corner into the inside barrier.
    const target = line[(bestIdx + ai.lookAheadSamples) % n]
    // Braking is the part that must see further the faster we travel. Measured
    // on the racing line, which straightens the corner the centerline exaggerates.
    const spec = this.effectiveSpec(car, false)
    const brakeHorizon = lookAheadFor(ai.lookAheadSamples * 2, forwardSpeed(car.state), spec.topSpeed)
    const curvatureAhead = Math.min(1, turnAmount(line, bestIdx, brakeHorizon) / 1.1)

    let avoid: Vec2 | null = null
    let avoidD = AVOID_RANGE
    const fx = Math.cos(car.state.heading)
    const fy = Math.sin(car.state.heading)
    for (const other of this.cars) {
      if (other === car) continue
      const dx = other.state.x - car.state.x
      const dy = other.state.y - car.state.y
      const d = Math.hypot(dx, dy)
      if (d < avoidD && dx * fx + dy * fy > d * 0.3) {
        avoidD = d
        avoid = { x: other.state.x, y: other.state.y }
      }
    }
    // an armed mine on the line is worth more of a swerve than a car is
    const mine = this.nearestArmedMineAhead(car, fx, fy)
    if (mine) avoid = mine

    return aiDrive(car.state, { target, curvatureAhead, avoid }, spec, ai.tuning)
  }

  /** The nearest mine ahead that would actually go off under this car, or null. */
  private nearestArmedMineAhead(car: CarUnit, fx: number, fy: number): Vec2 | null {
    const now = this.time.now
    let best: Vec2 | null = null
    let bestD = AI_MINES.dropRange
    for (const mine of this.mines) {
      if (!mineIsLive(mine, car.id, now, MINES)) continue
      const dx = mine.x - car.state.x
      const dy = mine.y - car.state.y
      const d = Math.hypot(dx, dy)
      if (d < bestD && dx * fx + dy * fy > d * 0.6) {
        bestD = d
        best = { x: mine.x, y: mine.y }
      }
    }
    return best
  }

  private effectiveSpec(car: CarUnit, turboActive: boolean) {
    let spec = car.isPlayer ? this.playerSpec : car.ai!.spec
    // rank pace and the rubber band are rival-only, even when the debug
    // autopilot has given the player an ai profile to drive with
    if (car.ai && !car.isPlayer) {
      const playerScore = this.progressScore(this.player)
      const aiScore = this.progressScore(car)
      // talented drivers lean on the rubber band less
      const band = Phaser.Math.Clamp(
        1 + car.ai.rubberBandGain * (playerScore - aiScore),
        RUBBER_BAND.min,
        RUBBER_BAND.max,
      )
      // raw pace comes from ladder rank (set at grid build), banded here
      const scale = car.ai.speedScale * band
      spec = { ...spec, topSpeed: spec.topSpeed * scale, accel: spec.accel * scale }
    }
    if (turboActive) {
      // the black market's fuel mix hits far harder than a stock turbo
      const boost = car.isPlayer && this.hasOverTurbo ? OVERCHARGED_TURBO : TURBO
      spec = { ...spec, topSpeed: spec.topSpeed * boost.topSpeedScale, accel: spec.accel * boost.accelScale }
    }
    return spec
  }

  private progressScore(car: CarUnit): number {
    const gate = this.gates[nextGateIndex(car.progress)]
    const dist = Math.hypot(gate.center.x - car.state.x, gate.center.y - car.state.y)
    return car.progress.gatesPassed + Math.max(0, 1 - dist / this.gateSpacing)
  }

  // ---------------------------------------------------------------- race flow

  private checkGateCrossing(car: CarUnit, now: number) {
    const gate = this.gates[nextGateIndex(car.progress)]
    if (!segmentsIntersect(car.prevPos, { x: car.state.x, y: car.state.y }, gate.a, gate.b)) return

    const result = applyGateCrossing(car.progress, nextGateIndex(car.progress))
    car.progress = result.progress

    if (result.armed) car.lapStartAt = now
    if (result.lapCompleted) {
      car.lapTimes.push(now - car.lapStartAt)
      car.lapStartAt = now
    }
    if (result.finished && car.finishedAt === null) {
      car.finishedAt = now
      if (car.isPlayer) {
        this.phase = 'finished'
        this.time.delayedCall(1400, () => this.transitionToResults(now, false))
      }
    }
  }

  /** Called only by the pause overlay after the player confirms the destructive action. */
  public abandonRace() {
    if (this.resultCommitted) return
    this.phase = 'finished'
    this.transitionToResults(this.time.now, false, true)
  }

  public resumeRaceAudio() {
    if (this.phase === 'racing') audioBus.engineStart()
  }

  private transitionToResults(now: number, playerWrecked: boolean, abandoned = false) {
    if (this.resultCommitted) return
    this.resultCommitted = true
    this.updatePlacements()
    const standings = this.placementOrder.map((id) => {
      const car = this.cars.find((c) => c.id === id)!
      return {
        name: car.name,
        isPlayer: car.isPlayer,
        timeMs: car.finishedAt !== null ? car.finishedAt - this.raceStartAt : null,
        wrecked: car.wrecked,
        dnf: car.isPlayer && abandoned,
      }
    })
    const player = this.player
    const playerPosition = this.placementOrder.indexOf('player') + 1
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
      const rivalPlacements = this.placementOrder
        .map((id, i) => ({ id, placement: i + 1, wrecked: this.cars.find((c) => c.id === id)!.wrecked }))
        .filter((r) => r.id !== 'player')
      let ladder = applyRaceLadderResults(this.career.ladder, this.track.tier, rivalPlacements)
      ladder = simulateRound(ladder, this.track.tier, this.rivalIds, this.random)
      this.career = { ...this.career, ladder }
    }

    const oldRecord = this.career.records[this.track.id]
    if (!abandoned) {
      this.career = updateTrackRecord(this.career, {
        trackId: this.track.id,
        bestLapMs: player.lapTimes.length ? Math.min(...player.lapTimes) : null,
        raceTimeMs: player.finishedAt === null ? null : player.finishedAt - this.raceStartAt,
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
      totalMs: (player.finishedAt ?? now) - this.raceStartAt,
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

  private updatePlacements() {
    this.placementOrder = racePlacements(this.cars, this.gates)
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

    const drawLights = (lit: number, green: boolean) => {
      this.lightsGfx.clear()
      for (let i = 0; i < 3; i++) {
        const x = cx - 90 + i * 90
        this.lightsGfx.fillStyle(0x0c0c12, 0.9)
        this.lightsGfx.fillCircle(x, 140, 34)
        this.lightsGfx.fillStyle(i < lit ? (green ? 0x3fd07f : 0xd23c2f) : 0x2a2a33, 1)
        this.lightsGfx.fillCircle(x, 140, 24)
      }
    }

    drawLights(1, false)
    this.countdownText.setText('3')
    audioBus.countdownBeep(false)
    this.time.delayedCall(1000, () => {
      drawLights(2, false)
      this.countdownText.setText('2')
      audioBus.countdownBeep(false)
    })
    this.time.delayedCall(2000, () => {
      drawLights(3, false)
      this.countdownText.setText('1')
      audioBus.countdownBeep(false)
    })
    this.time.delayedCall(3000, () => {
      drawLights(3, true)
      this.countdownText.setText('GO!')
      audioBus.countdownBeep(true)
      audioBus.engineStart()
      this.phase = 'racing'
      this.raceStartAt = this.time.now
      for (const car of this.cars) car.lapStartAt = this.time.now
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
    })
  }

  // ---------------------------------------------------------------- physics glue

  private readPlayerInput(): CarInput {
    return {
      throttle: this.inputManager.down('accelerate') ? 1 : 0,
      brake: this.inputManager.down('brake') ? 1 : 0,
      steer: (this.inputManager.down('steerRight') ? 1 : 0) - (this.inputManager.down('steerLeft') ? 1 : 0),
      handbrake: this.inputManager.down('handbrake'),
    }
  }

  private applyOffTrackDrag(car: CarUnit, dt: number) {
    const dist = distanceToClosedPolyline({ x: car.state.x, y: car.state.y }, this.centerline)
    if (dist > this.track.width / 2) {
      const decay = Math.exp(-OFF_TRACK_DRAG * dt)
      car.state.vx *= decay
      car.state.vy *= decay
    }
  }

  /**
   * The safety net. Nothing should be able to strand a car any more, but a car
   * with no way out is an unrecoverable race, so we put it back on the line.
   */
  private updateStuckRescue(car: CarUnit, dt: number) {
    if (this.phase !== 'racing' || car.wrecked || car.finishedAt !== null || isAirborne(car.state)) {
      car.stuckMs = 0
      return
    }
    const sample = {
      speed: speed(car.state),
      offCenter: distanceToClosedPolyline({ x: car.state.x, y: car.state.y }, this.centerline),
      halfWidth: this.track.width / 2,
    }
    car.stuckMs = updateStuckMs(car.stuckMs, sample, dt * 1000, RESCUE)
    if (!needsRescue(car.stuckMs, RESCUE)) return

    car.stuckMs = 0
    const gate = this.gates[nextGateIndex(car.progress) % this.gates.length]
    const pose = rescuePose(gate.a, gate.b, gate.tangent)
    car.state = { ...car.state, ...pose, ...GROUNDED, vx: 0, vy: 0 }
    car.prevPos = { x: pose.x, y: pose.y }
    this.syncCarVisuals(car)
    if (car.isPlayer) this.cameraFlash(160, 40, 40, 50)
  }

  private resolveBarrierCollisions(car: CarUnit) {
    const s = car.state
    const minDist = CAR_RADIUS + TIRE_RADIUS
    for (const b of this.barriers) {
      const dx = s.x - b.x
      const dy = s.y - b.y
      if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) continue
      const dist = Math.hypot(dx, dy)
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist
        const ny = dy / dist
        s.x = b.x + nx * minDist
        s.y = b.y + ny * minDist
        const vn = s.vx * nx + s.vy * ny
        if (vn < 0) {
          s.vx -= 1.5 * vn * nx
          s.vy -= 1.5 * vn * ny
          s.vx *= 0.8
          s.vy *= 0.8
          const impact = Math.abs(vn)
          // bouncing off the wall mid-flight is the mine's doing, not a crash
          if (impact > WALL_DAMAGE.threshold && !isAirborne(s)) {
            this.damageCar(car, impactDamage(impact, WALL_DAMAGE), null)
          }
          if (car.isPlayer && impact > 160) {
            this.shake(90, Math.min(0.006, impact / 60000))
          }
        }
      }
    }
  }

  private resolveCarCollisions() {
    const minDist = CAR_BODY_RADIUS * 2
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const carA = this.cars[i]
        const carB = this.cars[j]
        const a = carA.state
        const b = carB.state
        // a launched car passes over the top of the pack
        if (isAirborne(a) || isAirborne(b)) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)
        if (dist === 0 || dist >= minDist) continue

        const nx = dx / dist
        const ny = dy / dist
        const push = (minDist - dist) / 2
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push

        // mass-weighted impulse + spin kick from the pure collision model
        const response = collideCars(
          { x: a.x, y: a.y, vx: a.vx, vy: a.vy, mass: carA.mass },
          { x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: carB.mass },
        )
        if (response) {
          const rel = response.impact
          a.vx += response.a.dvx
          a.vy += response.a.dvy
          b.vx += response.b.dvx
          b.vy += response.b.dvy
          // glancing hits twist the cars — only on real impacts, not pack rubbing
          if (rel > 120) {
            a.heading += response.a.spin
            b.heading += response.b.spin
          }

          const contactX = a.x + dx / 2
          const contactY = a.y + dy / 2

          if (rel > RAM_DAMAGE.threshold && !carA.wrecked && !carB.wrecked) {
            const dmg = impactDamage(rel, RAM_DAMAGE)
            // black-market ram plating: the player's side of the exchange
            // hits harder and hurts less for one race
            const plated = this.hasPlating && (carA.isPlayer || carB.isPlayer)
            const scaleFor = (car: CarUnit) =>
              !plated ? 1 : car.isPlayer ? RAM_PLATING.takeScale : RAM_PLATING.dealScale
            this.damageCar(carA, dmg * scaleFor(carA), carB)
            this.damageCar(carB, dmg * scaleFor(carB), carA)
            // metal on metal: sparks scale with how hard they met
            this.hitSparks.explode(Math.round(6 + Math.min(18, rel / 40)), contactX, contactY)
            this.flashCar(carA)
            this.flashCar(carB)
          }
          if ((carA.isPlayer || carB.isPlayer) && rel > 180) {
            this.shake(70 + Math.min(140, rel / 6), Math.min(IMPACT_FX.crashMaxShake, rel / 45000))
          }
          // a real crunch stops the world for a moment
          if (rel > IMPACT_FX.crashSlowMoImpact && (carA.isPlayer || carB.isPlayer)) {
            this.crashLurch(contactX, contactY)
          }
        }
      }
    }
  }

  /** Time dilation + a white kiss of light on a heavy impact. */
  private crashLurch(x: number, y: number) {
    this.slowMoUntil = this.time.now + IMPACT_FX.crashSlowMoMs
    const flash = this.add
      .image(x, y, 'spark')
      .setScale(3)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.cameras.cameras[1]?.ignore(flash)
    this.tweens.add({ targets: flash, alpha: 0, scale: 1, duration: 180, onComplete: () => flash.destroy() })
    this.flashScreenEdge(0xffffff, 0.28)
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
    this.skidStamp = this.add.image(0, 0, 'skid-stamp').setVisible(false)
    this.scorchStamp = this.add.image(0, 0, 'scorch').setVisible(false)

    for (const side of [1, -1]) {
      const wallLine = offsetClosedPolyline(this.centerline, side * (shoulderHalf + TIRE_RADIUS))
      for (const p of spacedPointsAlong(wallLine, 54)) {
        this.barriers.push(p)
        this.add.image(p.x, p.y, 'tire-wall').setDepth(3)
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

  /** Seeded non-colliding furniture: boundary props + a start-line cluster. */
  private placeFurniture(shoulderHalf: number, rng: () => number) {
    // tyre stacks + sandbags on the dirt just beyond the shoulder, both sides
    const boundaryKeys = ['tyre-0', 'tyre-1', 'sandbag-0', 'sandbag-1']
    for (const side of [1, -1]) {
      const line = offsetClosedPolyline(this.centerline, side * (shoulderHalf + 70))
      const poses = scatterPointsAlong(line, 4, rng, {
        halfWidth: 0,
        lateralFrac: 0,
        minGap: 400,
      })
      scatterImages(this, poses, boundaryKeys, rng, {
        depth: 3,
        minScale: 0.45,
        maxScale: 0.6,
        jitter: 0.4,
      })
    }

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
    // cat-eye reflectors along both track edges
    for (const side of [1, -1]) {
      const edge = offsetClosedPolyline(this.centerline, side * (halfW - 6))
      for (const p of spacedPointsAlong(edge, 150)) {
        this.add
          .image(p.x, p.y, 'glow-soft')
          .setScale(0.07)
          .setTint(0xffbb55)
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
        .setTint(0xffcf8a)
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
      frequency: 25,
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
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.45, end: 0 },
      lifespan: 150,
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

  private syncCarVisuals(car: CarUnit) {
    car.sprite.setPosition(car.state.x, car.state.y).setRotation(car.state.heading)
    car.shadow.setRotation(car.state.heading)

    const z = car.state.z
    if (z > 0) {
      // height reads as scale-up over a shadow that falls away and softens
      const lift = z / IMPACT_FX.liftPerScale
      car.sprite.setScale(CAR_SCALE * (1 + lift)).setDepth(5.6)
      car.shadow
        .setPosition(car.state.x + 6 + z * IMPACT_FX.shadowThrowX, car.state.y + 8 + z * IMPACT_FX.shadowThrowY)
        .setScale(CAR_SCALE * (1 - lift * 0.22))
        .setAlpha(Math.max(0.12, 0.34 - lift * 0.18))
    } else {
      car.sprite.setDepth(5)
      car.shadow.setPosition(car.state.x + 6, car.state.y + 8).setScale(CAR_SCALE).setAlpha(car.wrecked ? 0.2 : 0.3)
    }
  }

  private updateCarEffects(car: CarUnit, input: CarInput, turboActive: boolean) {
    const cos = Math.cos(car.state.heading)
    const sin = Math.sin(car.state.heading)
    const airborne = isAirborne(car.state)
    car.exhaust.setPosition(car.state.x - 42 * cos, car.state.y - 42 * sin)
    car.exhaust.frequency = car.wrecked || airborne ? 999999 : turboActive ? 15 : input.throttle > 0 ? 40 : 120

    car.turboFlame.setPosition(car.state.x - 46 * cos, car.state.y - 46 * sin)
    car.turboFlame.emitting = turboActive && !car.wrecked

    // flame cone off the tailpipe, breathing so it never looks like a decal
    const boosting = turboActive && !car.wrecked
    car.flameCone.setVisible(boosting)
    car.turboGlow.setVisible(boosting)
    if (boosting) {
      const flicker = 0.85 + this.random() * 0.3
      const overcharged = car.isPlayer && this.hasOverTurbo
      car.flameCone
        .setPosition(car.state.x - 40 * cos, car.state.y - 40 * sin)
        .setRotation(car.state.heading)
        .setScale((overcharged ? 1.35 : 1) * flicker, (overcharged ? 1.2 : 1) * flicker)
        .setAlpha(0.55 + 0.35 * this.random())
      car.turboGlow
        .setPosition(car.state.x - 52 * cos, car.state.y - 52 * sin)
        .setScale((overcharged ? 1.15 : 0.85) * flicker)
        .setAlpha(0.3 + 0.15 * this.random())
    }

    // headlight throw + taillights with brake flare
    car.headlights.forEach((light, i) => {
      const side = i === 0 ? -14 : 14
      light
        .setPosition(car.state.x + 95 * cos - side * sin, car.state.y + 95 * sin + side * cos)
        .setRotation(car.state.heading)
        .setVisible(!car.wrecked)
    })
    car.taillights.forEach((light, i) => {
      const side = i === 0 ? -13 : 13
      const braking = input.brake > 0
      light
        .setPosition(car.state.x - 40 * cos - side * sin, car.state.y - 40 * sin + side * cos)
        .setAlpha(braking ? 0.55 : 0.25)
        .setScale(braking ? 0.34 : 0.22)
        .setVisible(!car.wrecked)
    })

    // burning wreck flicker
    if (car.wrecked && car.fireGlow) {
      car.fireGlow
        .setPosition(car.state.x + (this.random() - 0.5) * 8, car.state.y + (this.random() - 0.5) * 8)
        .setAlpha(0.18 + this.random() * 0.22)
        .setScale(0.45 + this.random() * 0.18)
    }

    car.damageSmoke.setPosition(car.state.x + 10 * cos, car.state.y + 10 * sin)
    if (!car.wrecked) {
      car.damageSmoke.frequency = car.damage > 80 ? 45 : car.damage > 50 ? 110 : -1
    }

    const skidding =
      !car.wrecked &&
      !airborne &&
      (Math.abs(lateralSpeed(car.state)) > 90 || (input.handbrake && speed(car.state) > 150))
    if (skidding) {
      const rearX = -25
      for (const side of [-13, 13]) {
        const wx = car.state.x + rearX * cos - side * sin
        const wy = car.state.y + rearX * sin + side * cos
        this.skidStamp.setPosition(wx, wy).setRotation(car.state.heading).setAlpha(0.4)
        this.skidRT.draw(this.skidStamp)
      }
      if (car.isPlayer) {
        this.tireSmoke.setPosition(car.state.x + rearX * cos, car.state.y + rearX * sin)
      }
    }
    if (car.isPlayer) this.tireSmoke.emitting = skidding
  }

  private updateCamera(now: number) {
    const cam = this.cameras.main
    const speedRatio = Math.min(1, speed(this.player.state) / this.playerSpec.topSpeed)
    const boosting = this.playerTurboActive && !this.player.wrecked
    const overcharged = this.hasOverTurbo

    // boost pulls the camera back and shakes the frame
    const targetZoom = 1.05 - 0.17 * speedRatio - (boosting ? TURBO_FX.zoomOut : 0)
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.04))

    // look-ahead: shift the camera toward where the car is going
    this.lookAheadX = Phaser.Math.Linear(this.lookAheadX, this.player.state.vx * 0.22, 0.05)
    this.lookAheadY = Phaser.Math.Linear(this.lookAheadY, this.player.state.vy * 0.22, 0.05)
    let jitterX = 0
    let jitterY = 0
    if (boosting) {
      const amp = TURBO_FX.jitter * (overcharged ? TURBO_FX.overchargeJitterScale : 1) * speedRatio
      jitterX = (this.random() - 0.5) * amp
      jitterY = (this.random() - 0.5) * amp
    }
    cam.setFollowOffset(-this.lookAheadX + jitterX, -this.lookAheadY + jitterY)
    this.updateSpeedStreaks(boosting, speedRatio, overcharged)

    audioBus.setEngine(speedRatio, this.playerTurboActive)

    // booby-trap disorientation: the camera swims for a couple of seconds
    if (now < this.trapUntil) {
      this.camRotation = Math.sin(now * 0.008) * 0.07
    } else if (this.camRotation !== 0) {
      this.camRotation = Phaser.Math.Linear(this.camRotation, 0, 0.12)
      if (Math.abs(this.camRotation) < 0.002) this.camRotation = 0
    }
    cam.setRotation(this.camRotation)
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
    cam.startFollow(this.player.sprite, true, 0.08, 0.08)
    cam.setZoom(1.05)
    if (this.game.renderer.type === Phaser.WEBGL) {
      cam.postFX.addVignette(0.5, 0.5, 1.0, 0.18)
      cam.postFX.addBloom(0xffffff, 1, 1, 0.55, 1.05)
    }
    cam.ignore(this.hudContainer)
    const hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height)
    hudCam.ignore(this.children.list.filter((obj) => obj !== this.hudContainer))
  }

  private setupInput() {
    this.inputManager = new InputManager(this)
    const onKey = (event: KeyboardEvent) => {
      if (this.inputManager.matches('pause', event.code) && this.phase !== 'finished' && !this.scene.isPaused()) {
        this.openPause()
      } else if (this.inputManager.matches('mute', event.code)) {
        this.settings.muted = !this.settings.muted
        saveSettings(this.settings)
        audioBus.applySettings(this.settings)
      }
    }
    this.input.keyboard?.on('keydown', onKey)
    this.events.once('shutdown', () => {
      audioBus.engineStop()
      this.input.keyboard?.off('keydown', onKey)
      this.inputManager.destroy()
    })
  }

  private openPause() {
    audioBus.engineStop()
    this.inputManager.reset()
    const position = this.placementOrder.indexOf('player') + 1
    this.scene.launch('RacePause', {
      trackName: this.track.name,
      lap: currentLap(this.player.progress),
      laps: this.track.laps,
      position,
      weaponsFree: this.career.profile.weaponsEnabled && this.time.now > this.raceStartAt + WEAPONS_FREE_DELAY_MS,
    })
    this.scene.pause()
  }

  // ---------------------------------------------------------------- HUD

  private buildHud() {
    // full-frame overlays, under the readouts: boost streaks, then damage flash
    this.speedStreaks = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD)
    this.edgeFlash = this.add
      .image(this.scale.width / 2, this.scale.height / 2, 'edge-flash')
      .setDisplaySize(this.scale.width, this.scale.height)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)

    const plates = this.add.graphics()
    plate(plates, 14, this.scale.height - 226, 390, 210) // status (bottom-left)
    plate(plates, this.scale.width - 320, 160, 306, 138) // standings (right)

    const hint = hintBar(this, 'Configured controls active · Esc pause/help · M mute')

    const statusRows = ['HULL', 'AMMO', this.hasOverTurbo ? 'OVERCHARGE' : 'TURBO', 'MINES']
    statusRows.forEach((label, i) => {
      const y = this.scale.height - 202 + i * 36
      this.hudStatusLabels.push(text(this, 28, y, label, {
        size: 'micro', color: i === 2 && this.hasOverTurbo ? C.warn : C.textSecondary,
      }))
      this.hudStatusValues.push(text(this, 386, y - 2, '', {
        size: 'micro', color: C.textPrimary, origin: [1, 0],
      }))
    })

    this.cashText = text(this, 16, 62, '$0', {
      size: 'action',
      color: C.money,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
    })

    this.speedText = text(this, 28, this.scale.height - 28, '0 MPH', {
      size: 'speed',
      color: C.oxide,
      stroke: C.shadow,
      strokeThickness: STROKE.heading,
      origin: [0, 1],
    })

    this.hudBars = this.add.graphics()

    this.positionText = text(this, this.scale.width - 28, this.scale.height - 30, '4th', {
      size: 'readout',
      color: C.oxide,
      stroke: C.shadow,
      strokeThickness: STROKE.title,
      origin: [1, 1],
    })

    const right = this.scale.width - 28
    this.lapText = text(this, right, 24, `LAP 1/${this.track.laps}`, {
      size: 'heading',
      stroke: C.shadow,
      strokeThickness: STROKE.heading,
      origin: [1, 0],
    })
    this.timeText = text(this, right, 78, '0:00.00', {
      size: 'bodyLg',
      color: C.textSecondary,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
      origin: [1, 0],
    })
    this.bestText = text(this, right, 116, '', {
      size: 'body',
      color: C.money,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
      origin: [1, 0],
    })

    // black-market gear fitted for this race, shown above the status plate.
    // Overcharge is named directly on the boost bar instead of hidden here.
    const gear: string[] = []
    if (this.hasPlating) gear.push('RAM PLATING')
    const gearText = text(this, 16, this.scale.height - 254, gear.join(' · '), {
      size: 'caption',
      color: C.oxideDim,
      stroke: C.shadow,
      strokeThickness: STROKE.text,
    })

    const identityText = text(this, 16, 94, `${this.career.profile.driverName.toUpperCase()} · WEAPONS ${this.career.profile.weaponsEnabled ? 'ON' : 'OFF'}`, {
      size: 'caption', color: this.career.profile.liveryColor, stroke: C.shadow, strokeThickness: STROKE.text,
    })

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
      this.hudBars,
      this.positionText,
      this.lapText,
      this.timeText,
      this.bestText,
    ]

    for (let i = 0; i < 4; i++) {
      const t = text(this, right, 170 + i * 30, '', {
        size: 'bodySm',
        stroke: C.shadow,
        strokeThickness: STROKE.text,
        origin: [1, 0],
      })
      this.standingsTexts.push(t)
      hudChildren.push(t)
    }

    this.hudContainer = this.add.container(0, 0, hudChildren).setDepth(100)
  }

  private updateHud(now: number) {
    const player = this.player
    this.speedText.setText(`${Math.round(speed(player.state) * MPH_PER_PX)} MPH`)
    this.cashText.setText(`$${player.cash}`)
    this.lapText.setText(`LAP ${currentLap(player.progress)}/${this.track.laps}`)
    if (this.phase !== 'countdown') this.timeText.setText(formatTime(now - this.raceStartAt))
    if (player.lapTimes.length > 0) {
      this.bestText.setText(`BEST ${formatTime(Math.min(...player.lapTimes))}`)
    }

    // HULL fills with safety remaining (not damage taken), so every bar answers
    // "how much do I have left?" in the same direction.
    const bx = 130
    const by = this.scale.height - 200
    const bw = 170
    const bh = 14
    const hullRemaining = Math.max(0, 100 - player.damage)
    const bars: Array<[number, number]> = [
      [hullRemaining / 100, damageColor(player.damage)],
      [player.ammo / GUN.ammoMax, C.ammo],
      [player.turbo, this.hasOverTurbo ? C.warn : C.turbo],
    ]
    this.hudBars.clear()
    bars.forEach(([ratio, color], i) => {
      statBar(this.hudBars, bx, by + i * 36, bw, bh, Phaser.Math.Clamp(ratio, 0, 1), color, { backdrop: true })
    })
    // Always draw the full mine capacity: an empty row now visibly means zero.
    for (let i = 0; i < MINES.count; i++) {
      const x = bx + 8 + i * 25
      const y = by + 3 * 36 + 6
      this.hudBars.fillStyle(i < player.mines ? C.danger : C.surfaceTrack, 1)
      this.hudBars.fillCircle(x, y, 7)
      this.hudBars.lineStyle(2, i < player.mines ? C.warn : C.border, 0.9)
      this.hudBars.strokeCircle(x, y, 7)
    }

    const weapons = this.career.profile.weaponsEnabled
    this.hudStatusValues[0].setText(`${Math.round(hullRemaining)}% LEFT`).setColor(hex(damageColor(player.damage)))
    this.hudStatusValues[1].setText(weapons ? `${player.ammo} / ${GUN.ammoMax}` : 'DISABLED').setColor(hex(weapons ? C.ammo : C.textDisabled))
    this.hudStatusValues[2].setText(`${Math.round(player.turbo * 100)}%`).setColor(hex(this.hasOverTurbo ? C.warn : C.turbo))
    this.hudStatusValues[3].setText(weapons ? `${player.mines} / ${MINES.count}` : 'DISABLED').setColor(hex(weapons ? C.danger : C.textDisabled))

    const playerPos = this.placementOrder.indexOf('player') + 1
    if (playerPos > 0) this.positionText.setText(player.wrecked ? 'OUT' : ordinal(playerPos))

    this.placementOrder.forEach((id, i) => {
      const car = this.cars.find((c) => c.id === id)!
      const row = this.standingsTexts[i]
      const status = car.wrecked ? ' ✗' : car.finishedAt !== null ? ' *' : ` ${Math.round(car.damage)}%`
      row.setText(`${i + 1}. ${car.name}${status}`)
      row.setColor(hex(car.isPlayer ? C.oxide : car.color))
    })

    if (this.debugText) {
      const cars = this.cars.map(
        (c) => `${c.id.slice(0, 4)} g${c.progress.gatesPassed} d${Math.round(c.damage)}${c.wrecked ? ' WRECK' : ''}`,
      )
      this.debugText.setText(
        [
          `phase ${this.phase}  bullets ${this.bullets.length}  ammo ${player.ammo}  turbo ${player.turbo.toFixed(2)}`,
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
      phase: this.phase,
      duel: this.isDuel,
      placements: [...this.placementOrder],
      cars: this.cars.map((c) => ({
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
        chassis: c.chassisId,
        talent: c.ai?.talent.grade,
        pace: c.ai ? Math.round(c.ai.speedScale * 1000) / 1000 : undefined,
      })),
      track: this.track.id,
      turboActive: this.playerTurboActive,
      bullets: this.bullets.length,
      minesOnTrack: this.mines.length,
      pickupsActive: this.pickups.filter((p) => p.respawnAt === null).length,
    })
    w.__setCarState = (s: Partial<CarState>) => {
      this.player.state = { ...this.player.state, ...s }
      this.player.prevPos = { x: this.player.state.x, y: this.player.state.y }
    }
    w.__applyDamage = (id: string, amount: number) => {
      const car = this.cars.find((c) => c.id === id)
      if (car) this.damageCar(car, amount, null)
    }
    w.__launch = (id: string, vz = MINE_BLAST.launchVz) => {
      const car = this.cars.find((c) => c.id === id)
      if (car) car.state = launchCar(car.state, vz)
    }
    w.__dropMineAt = (x: number, y: number) => {
      const car = this.player
      const saved = { ...car.state }
      car.state = { ...car.state, x: x + 55 * Math.cos(car.state.heading), y: y + 55 * Math.sin(car.state.heading) }
      car.mines++
      car.lastMineAt = 0
      this.tryDropMine(car, this.time.now)
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
      const player = this.player
      if (!cfg) {
        this.autoPilot = null
        player.ai = null
        return
      }
      this.autoPilot = { fire: cfg.fire ?? false, turbo: cfg.turbo ?? true, mines: cfg.mines ?? false }
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
        talent,
        aimSpread: GUN.playerSpread,
        mineCooldownMs: AI_MINES.cooldownMs,
        rubberBandGain: 0,
      }
    }
    /** Final order + who survived, readable the moment the race ends. */
    w.__raceSummary = () => ({
      phase: this.phase,
      over: this.phase === 'finished' || this.player.finishedAt !== null || this.player.wrecked,
      placements: [...this.placementOrder],
      playerPosition: this.placementOrder.indexOf('player') + 1,
      playerWrecked: this.player.wrecked,
      playerDamage: Math.round(this.player.damage),
      playerLap: currentLap(this.player.progress),
      elapsedMs: Math.round(this.time.now - this.raceStartAt),
      cars: this.cars.map((c) => ({
        id: c.id,
        wrecked: c.wrecked,
        damage: Math.round(c.damage),
        gates: c.progress.gatesPassed,
        talent: c.ai?.talent.grade,
      })),
    })
    w.__pickups = () => this.pickups.map((p) => ({ type: p.type, x: p.x, y: p.y, active: p.respawnAt === null }))
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

    this.debugText = text(this, 16, 120, '', { size: 'micro', color: C.money })
    this.hudContainer.add(this.debugText)
  }
}
