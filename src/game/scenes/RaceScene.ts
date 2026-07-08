import Phaser from 'phaser'
import { DEBUG } from '../../config/game'
import {
  IDLE_INPUT,
  lateralSpeed,
  speed,
  stepCar,
  type CarInput,
  type CarState,
} from '../../core/vehicle/carPhysics'
import {
  buildGates,
  catmullRomClosed,
  distanceToClosedPolyline,
  lineTangentAt,
  offsetClosedPolyline,
  segmentsIntersect,
  spacedPointsAlong,
  turnAmount,
  type Gate,
  type Vec2,
} from '../../core/track/geometry'
import {
  applyGateCrossing,
  createProgress,
  currentLap,
  nextGateIndex,
} from '../../core/race/progress'
import { computePlacements, ordinal, type PlacementEntry } from '../../core/race/placement'
import { applyDamage, impactDamage, repairDamage } from '../../core/combat/damage'
import { layoutPickups, type PickupType } from '../../core/track/pickups'
import { aiDrive, wrapAngle, type AiTuning } from '../../core/ai/driver'
import { formatTime } from '../../core/race/format'
import { armorResistance, effectiveCarSpec } from '../../core/vehicle/carSpec'
import { applyRaceOutcome, type CareerState } from '../../core/progression/career'
import { rewardFor } from '../../core/economy/rewards'
import { loadCareer, saveCareer } from '../state/saveGame'
import { getCurrentOffer, setCurrentOffer } from '../state/roundState'
import { audioBus } from '../systems/audio'
import {
  applyRaceLadderResults,
  pickRivals,
  rankOf,
  rivalStrength,
  simulateRound,
} from '../../core/progression/ladder'
import { rosterById } from '../../data/roster'
import { TRACKS_BY_TIER } from '../../data/tracks'
import { STARTER_CAR, carById } from '../../data/cars'
import { DRIVING_STYLES, RUBBER_BAND } from '../../data/drivers'
import {
  AI_GUNNER,
  GUN,
  MINES,
  PICKUPS,
  RAM_DAMAGE,
  TURBO,
  WALL_DAMAGE,
  WEAPONS_FREE_DELAY_MS,
} from '../../data/weapons'
import type { TrackDef } from '../../data/tracks/testCircuit'
import type { RaceResults } from './ResultsScene'

const CAR_SCALE = 0.75
const CAR_RADIUS = 34
const CAR_BODY_RADIUS = 30
const TIRE_RADIUS = 24
const MPH_PER_PX = 0.14
const OFF_TRACK_DRAG = 1.4
const AVOID_RANGE = 150

type RacePhase = 'countdown' | 'racing' | 'finished'

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
  headlights: Phaser.GameObjects.Image[]
  taillights: Phaser.GameObjects.Image[]
  fireGlow: Phaser.GameObjects.Image | null
  ai: {
    lineIdx: number
    lookAheadSamples: number
    speedScale: number
    tuning: AiTuning
  } | null
  finishedAt: number | null
  lapStartAt: number
  lapTimes: number[]
  damage: number
  wrecked: boolean
  ammo: number
  turbo: number
  gunCooldown: number
  cash: number
  mines: number
  lastMineAt: number
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
}

interface DriveOverride extends CarInput {
  fire?: boolean
  turbo?: boolean
  dropMine?: boolean
}

interface DroppedMine {
  x: number
  y: number
  armedAt: number
  sprite: Phaser.GameObjects.Image
}

export class RaceScene extends Phaser.Scene {
  private track!: TrackDef
  private rivalIds: string[] = []
  private centerline: Vec2[] = []
  private gates: Gate[] = []
  private barriers: Vec2[] = []
  private gateSpacing = 1

  private career!: CareerState
  private playerSpec = { ...STARTER_CAR }
  private aiBaseSpec = { ...STARTER_CAR }
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

  private skidRT!: Phaser.GameObjects.RenderTexture
  private skidStamp!: Phaser.GameObjects.Image
  private scorchStamp!: Phaser.GameObjects.Image
  private tireSmoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private explosionSmoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private hitSparks!: Phaser.GameObjects.Particles.ParticleEmitter

  private hudContainer!: Phaser.GameObjects.Container
  private hudBars!: Phaser.GameObjects.Graphics
  private speedText!: Phaser.GameObjects.Text
  private cashText!: Phaser.GameObjects.Text
  private positionText!: Phaser.GameObjects.Text
  private lapText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private bestText!: Phaser.GameObjects.Text
  private standingsTexts: Phaser.GameObjects.Text[] = []
  private countdownText!: Phaser.GameObjects.Text
  private lightsGfx!: Phaser.GameObjects.Graphics
  private debugText?: Phaser.GameObjects.Text

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'SPACE' | 'X' | 'SHIFT' | 'C', Phaser.Input.Keyboard.Key>
  private autoInput: DriveOverride | null = null

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
    this.trapUntil = 0
    this.allRivalsDoneAt = null

    this.career = loadCareer()
    this.playerSpec = effectiveCarSpec(carById(this.career.carId), this.career.upgrades)

    // the accepted sign-up offer decides track and grid; fall back to a
    // default pro-tier round if the scene starts without one
    let offer = getCurrentOffer()
    if (!offer) {
      offer = {
        track: TRACKS_BY_TIER.pro,
        rivalIds: pickRivals(this.career.ladder, this.career.points, Math.random),
      }
      setCurrentOffer(offer)
    }
    this.track = offer.track
    this.rivalIds = offer.rivalIds

    this.centerline = catmullRomClosed(this.track.controls, this.track.samplesPerSegment)
    this.gates = buildGates(this.centerline, this.track.gateCount, this.track.width / 2 + this.track.shoulder)
    let perimeter = 0
    for (let i = 0; i < this.centerline.length; i++) {
      const a = this.centerline[i]
      const b = this.centerline[(i + 1) % this.centerline.length]
      perimeter += Math.hypot(b.x - a.x, b.y - a.y)
    }
    this.gateSpacing = perimeter / this.track.gateCount

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
    const dt = Math.min(delta / 1000, 0.05)
    const locked = this.phase === 'countdown'
    const weaponsFree = this.phase === 'racing' && time > this.raceStartAt + WEAPONS_FREE_DELAY_MS

    for (const car of this.cars) {
      let input: CarInput = IDLE_INPUT
      let wantsFire = false
      let wantsTurbo = false

      if (!locked && !car.wrecked) {
        if (car.isPlayer) {
          if (car.finishedAt === null) {
            const drive: DriveOverride = this.autoInput ?? this.readPlayerInput()
            input = drive
            wantsFire = drive.fire ?? this.keys.X.isDown
            wantsTurbo = drive.turbo ?? this.keys.SHIFT.isDown
            if ((drive.dropMine ?? this.keys.C.isDown) && this.phase === 'racing') {
              this.tryDropMine(car, time)
            }
          }
        } else {
          input = this.computeAiInput(car)
          const combat = this.computeAiCombat(car)
          wantsFire = combat.fire
          wantsTurbo = combat.turbo
        }
      }

      // turbo meter
      const turboActive = wantsTurbo && car.turbo > 0 && !car.wrecked && !locked
      if (car.isPlayer) this.playerTurboActive = turboActive
      car.turbo = Phaser.Math.Clamp(
        car.turbo + (turboActive ? -TURBO.drainPerSec : TURBO.rechargePerSec) * dt,
        0,
        1,
      )

      car.prevPos = { x: car.state.x, y: car.state.y }
      car.state = stepCar(car.state, input, this.effectiveSpec(car, turboActive), dt)
      if (car.wrecked) {
        const decay = Math.exp(-3 * dt)
        car.state.vx *= decay
        car.state.vy *= decay
      }
      this.applyOffTrackDrag(car, dt)
      this.resolveBarrierCollisions(car)

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
        this.rivalsDoneToast = this.add
          .text(this.scale.width / 2, 320, '', {
            fontFamily: 'monospace',
            fontSize: '30px',
            color: '#d23c2f',
            stroke: '#000000',
            strokeThickness: 6,
          })
          .setOrigin(0.5)
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
    const sprite = this.add.image(car.state.x - 55 * cos, car.state.y - 55 * sin, 'mine').setDepth(2.4)
    this.cameras.cameras[1]?.ignore(sprite)
    this.mines.push({ x: sprite.x, y: sprite.y, armedAt: now + MINES.armDelayMs, sprite })
    audioBus.pickup(true) // placement click; real sample hook later
  }

  private updateMines(now: number) {
    if (this.mines.length === 0) return
    const survivors: DroppedMine[] = []
    for (const mine of this.mines) {
      // armed mines blink their red core
      mine.sprite.setAlpha(now < mine.armedAt ? 0.7 : 0.85 + 0.15 * Math.sin(now * 0.02))

      let triggered: CarUnit | null = null
      if (now >= mine.armedAt) {
        for (const car of this.cars) {
          if (car.wrecked) continue
          if (car.isPlayer && this.phase === 'finished') continue
          if (Math.hypot(car.state.x - mine.x, car.state.y - mine.y) < MINES.triggerRadius) {
            triggered = car
            break
          }
        }
      }

      if (!triggered) {
        survivors.push(mine)
        continue
      }

      // detonate: full damage to the triggering car, splash to anyone close
      audioBus.explosion()
      this.explosionSmoke.explode(16, mine.x, mine.y)
      this.hitSparks.explode(8, mine.x, mine.y)
      this.scorchStamp.setPosition(mine.x, mine.y).setRotation(Math.random() * Math.PI)
      this.skidRT.draw(this.scorchStamp)
      for (const car of this.cars) {
        if (car.wrecked) continue
        const d = Math.hypot(car.state.x - mine.x, car.state.y - mine.y)
        if (car === triggered) {
          this.damageCar(car, MINES.damage, null)
          // blast shove
          const push = 260 / Math.max(1, d)
          car.state.vx += (car.state.x - mine.x) * push * 0.06
          car.state.vy += (car.state.y - mine.y) * push * 0.06
        } else if (d < MINES.blastRadius) {
          this.damageCar(car, MINES.splashDamage, null)
        }
      }
      if (Math.hypot(this.player.state.x - mine.x, this.player.state.y - mine.y) < 500) {
        this.cameras.main.shake(160, 0.006)
      }
      mine.sprite.destroy()
    }
    this.mines = survivors
  }

  private get player(): CarUnit {
    return this.cars[0]
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

    const spread = car.isPlayer ? GUN.playerSpread : GUN.aiSpread
    const dir = car.state.heading + (Math.random() * 2 - 1) * spread
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
      .image(mx, my, 'spark')
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

      let dead = b.ttl <= 0
      if (!dead) {
        for (const car of this.cars) {
          if (car === b.owner || car.wrecked) continue
          if (car.isPlayer && this.phase === 'finished') continue
          if (Math.hypot(car.state.x - b.x, car.state.y - b.y) < CAR_BODY_RADIUS + 4) {
            this.damageCar(car, GUN.damagePerHit, b.owner)
            this.hitSparks.explode(5, b.x, b.y)
            if (car.isPlayer) this.cameras.main.shake(50, 0.0016)
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

  private damageCar(car: CarUnit, amount: number, _source: CarUnit | null) {
    if (car.wrecked || this.phase === 'countdown') return
    const resistance = car.isPlayer ? armorResistance(this.career.upgrades.armor) : 1
    const result = applyDamage(car.damage, amount, resistance)
    car.damage = result.damage
    if (result.wrecked) this.wreckCar(car)
  }

  private wreckCar(car: CarUnit) {
    if (car.wrecked) return
    car.wrecked = true

    audioBus.explosion()
    this.explosionSmoke.explode(30, car.state.x, car.state.y)

    // flying debris chunks
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 60 + Math.random() * 130
      const piece = this.add
        .image(car.state.x, car.state.y, 'debris')
        .setRotation(Math.random() * Math.PI * 2)
        .setDepth(6.9)
      this.cameras.cameras[1]?.ignore(piece)
      this.tweens.add({
        targets: piece,
        x: car.state.x + Math.cos(angle) * dist,
        y: car.state.y + Math.sin(angle) * dist,
        rotation: piece.rotation + (Math.random() - 0.5) * 10,
        alpha: 0.25,
        duration: 500 + Math.random() * 300,
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
    this.scorchStamp.setPosition(car.state.x, car.state.y).setRotation(Math.random() * Math.PI)
    this.skidRT.draw(this.scorchStamp)
    car.sprite.setTint(0x2c2c30)
    car.shadow.setAlpha(0.2)
    car.damageSmoke.frequency = 30
    this.cameras.main.shake(260, 0.008)

    if (car.isPlayer) {
      this.phase = 'finished'
      this.time.delayedCall(2200, () => this.transitionToResults(this.time.now, true))
    }
  }

  private computeAiCombat(car: CarUnit): { fire: boolean; turbo: boolean } {
    const ai = car.ai!
    let fire = false
    if (car.ammo > 0) {
      for (const other of this.cars) {
        if (other === car || other.wrecked) continue
        if (other.isPlayer && this.phase === 'finished') continue
        const dx = other.state.x - car.state.x
        const dy = other.state.y - car.state.y
        const dist = Math.hypot(dx, dy)
        if (dist > AI_GUNNER.range) continue
        if (Math.abs(wrapAngle(Math.atan2(dy, dx) - car.state.heading)) < AI_GUNNER.aimCone) {
          fire = true
          break
        }
      }
    }
    const curvature = Math.min(1, turnAmount(this.centerline, ai.lineIdx, ai.lookAheadSamples * 2) / 1.1)
    const turbo = curvature < 0.12 && car.turbo > 0.35
    return { fire, turbo }
  }

  // ---------------------------------------------------------------- pickups

  private buildPickups() {
    const spots = layoutPickups(this.centerline, {
      spacingSamples: 16,
      lateralOffsets: [-70, 0, 70],
      pattern: ['ammo', 'cash', 'turbo', 'repair', 'cash', 'trap', 'ammo', 'turbo'],
      clearRadiusAroundStart: 350,
    })
    for (const spot of spots) {
      const sprite = this.add.image(spot.x, spot.y, `pk-${spot.type}`).setDepth(2.5)
      this.tweens.add({
        targets: sprite,
        scale: 1.12,
        duration: 600 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      })
      this.pickups.push({ type: spot.type, x: spot.x, y: spot.y, sprite, respawnAt: null })
    }
  }

  private updatePickups(now: number) {
    for (const p of this.pickups) {
      if (p.respawnAt !== null) {
        if (now >= p.respawnAt) {
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
        car.turbo = 1
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
    p.respawnAt = now + PICKUPS.respawnMs
    p.sprite.setVisible(false)
    this.hitSparks.explode(4, p.x, p.y)
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
        gunCooldown: 0,
        cash: 0,
        mines: 0,
        lastMineAt: 0,
      }
      this.syncCarVisuals(unit)
      return unit
    }

    const playerCar = carById(this.career.carId)
    const player = makeUnit(0, 'player', 'You', playerCar.bodyColor, `car-${playerCar.id}`, null)
    player.damage = this.career.damage // persistent damage carries into the race
    player.mines = this.career.mines // one-race consumable bought in the garage
    this.cars.push(player)
    this.rivalIds.forEach((id, i) => {
      const driver = rosterById(id)
      const style = DRIVING_STYLES[i % DRIVING_STYLES.length]
      const rank = rankOf(this.career.ladder, this.career.points, id)
      this.cars.push(
        makeUnit(i + 1, id, driver.name, driver.bodyColor, `car-${id}`, {
          lineIdx: 0,
          lookAheadSamples: style.lookAheadSamples,
          speedScale: rivalStrength(rank),
          tuning: style.tuning,
        }),
      )
    })

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

  private computeAiInput(car: CarUnit): CarInput {
    const ai = car.ai!
    const n = this.centerline.length

    let bestD = Infinity
    let bestIdx = ai.lineIdx
    for (let step = 0; step < 30; step++) {
      const i = (ai.lineIdx + step) % n
      const p = this.centerline[i]
      const d = Math.hypot(p.x - car.state.x, p.y - car.state.y)
      if (d < bestD) {
        bestD = d
        bestIdx = i
      }
    }
    ai.lineIdx = bestIdx

    const target = this.centerline[(bestIdx + ai.lookAheadSamples) % n]
    const curvatureAhead = Math.min(1, turnAmount(this.centerline, bestIdx, ai.lookAheadSamples * 2) / 1.1)

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

    return aiDrive(car.state, { target, curvatureAhead, avoid }, this.effectiveSpec(car, false), ai.tuning)
  }

  private effectiveSpec(car: CarUnit, turboActive: boolean) {
    let spec = car.isPlayer ? this.playerSpec : this.aiBaseSpec
    if (car.ai) {
      const playerScore = this.progressScore(this.player)
      const aiScore = this.progressScore(car)
      const band = Phaser.Math.Clamp(
        1 + RUBBER_BAND.gainPerGate * (playerScore - aiScore),
        RUBBER_BAND.min,
        RUBBER_BAND.max,
      )
      // raw pace comes from ladder rank (set at grid build), banded here
      const scale = car.ai.speedScale * band
      spec = { ...spec, topSpeed: spec.topSpeed * scale, accel: spec.accel * scale }
    }
    if (turboActive) {
      spec = { ...spec, topSpeed: spec.topSpeed * TURBO.topSpeedScale, accel: spec.accel * TURBO.accelScale }
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

  private transitionToResults(now: number, playerWrecked: boolean) {
    this.updatePlacements()
    const standings = this.placementOrder.map((id) => {
      const car = this.cars.find((c) => c.id === id)!
      return {
        name: car.name,
        isPlayer: car.isPlayer,
        timeMs: car.finishedAt !== null ? car.finishedAt - this.raceStartAt : null,
        wrecked: car.wrecked,
      }
    })
    const player = this.player
    const playerPosition = this.placementOrder.indexOf('player') + 1
    const reward = rewardFor(this.track.tier, playerPosition, playerWrecked)

    this.career = applyRaceOutcome(this.career, {
      prizeCash: reward.cash,
      pointsEarned: reward.points,
      pickupCash: player.cash,
      endDamage: player.damage,
      won: playerPosition === 1 && !playerWrecked,
    })

    // rivals from this race earn ladder points by placement, then the two
    // skipped tiers run in the background
    const rivalPlacements = this.placementOrder
      .map((id, i) => ({ id, placement: i + 1, wrecked: this.cars.find((c) => c.id === id)!.wrecked }))
      .filter((r) => r.id !== 'player')
    let ladder = applyRaceLadderResults(this.career.ladder, this.track.tier, rivalPlacements)
    ladder = simulateRound(ladder, this.track.tier, this.rivalIds, Math.random)
    this.career = { ...this.career, ladder }
    saveCareer(this.career)

    const results: RaceResults = {
      trackName: this.track.name,
      laps: this.track.laps,
      totalMs: (player.finishedAt ?? now) - this.raceStartAt,
      bestLapMs: player.lapTimes.length > 0 ? Math.min(...player.lapTimes) : null,
      lapTimes: player.lapTimes,
      standings,
      playerPosition,
      playerWrecked,
      cashCollected: player.cash,
      prizeCash: reward.cash,
      pointsEarned: reward.points,
      careerCash: this.career.cash,
    }
    this.scene.start('Results', results)
  }

  private updatePlacements() {
    const entries: PlacementEntry[] = this.cars.map((car) => {
      const gate = this.gates[nextGateIndex(car.progress)]
      return {
        id: car.id,
        gatesPassed: car.progress.gatesPassed,
        distToNextGate: Math.hypot(gate.center.x - car.state.x, gate.center.y - car.state.y),
        finishedAtMs: car.finishedAt,
        wrecked: car.wrecked,
      }
    })
    this.placementOrder = computePlacements(entries)
  }

  private startCountdown() {
    const cx = this.scale.width / 2
    this.lightsGfx = this.add.graphics()
    this.countdownText = this.add
      .text(cx, 250, '', {
        fontFamily: 'monospace',
        fontSize: '96px',
        color: '#e8e8f0',
        stroke: '#000000',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
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
      throttle: this.cursors.up.isDown || this.keys.W.isDown ? 1 : 0,
      brake: this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0,
      steer:
        (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0) -
        (this.cursors.left.isDown || this.keys.A.isDown ? 1 : 0),
      handbrake: this.cursors.space.isDown || this.keys.SPACE.isDown,
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
          if (impact > WALL_DAMAGE.threshold) {
            this.damageCar(car, impactDamage(impact, WALL_DAMAGE), null)
          }
          if (car.isPlayer && impact > 160) {
            this.cameras.main.shake(90, Math.min(0.006, impact / 60000))
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

        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
        if (rel > 0) {
          const impulse = 0.65 * rel
          a.vx -= impulse * nx
          a.vy -= impulse * ny
          b.vx += impulse * nx
          b.vy += impulse * ny

          if (rel > RAM_DAMAGE.threshold && !carA.wrecked && !carB.wrecked) {
            const dmg = impactDamage(rel, RAM_DAMAGE)
            this.damageCar(carA, dmg, carB)
            this.damageCar(carB, dmg, carA)
            this.hitSparks.explode(6, a.x + dx / 2, a.y + dy / 2)
          }
          if ((carA.isPlayer || carB.isPlayer) && rel > 180) {
            this.cameras.main.shake(70, Math.min(0.005, rel / 70000))
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- world & visuals

  private buildWorld() {
    const { w, h } = this.track.world
    const halfW = this.track.width / 2
    const shoulderHalf = halfW + this.track.shoulder

    this.add.tileSprite(0, 0, w, h, 'dirt').setOrigin(0).setDepth(0)

    const shoulderGfx = this.add.graphics().setDepth(0.5)
    shoulderGfx.lineStyle(shoulderHalf * 2, 0x46413a, 1)
    shoulderGfx.strokePoints(this.centerline, true, true)

    const asphalt = this.add.tileSprite(0, 0, w, h, 'asphalt').setOrigin(0).setDepth(1)
    const maskGfx = this.make.graphics()
    maskGfx.lineStyle(this.track.width, 0xffffff, 1)
    maskGfx.strokePoints(this.centerline, true, true)
    asphalt.setMask(maskGfx.createGeometryMask())

    const marks = this.add.graphics().setDepth(1.5)
    marks.lineStyle(60, 0x000000, 0.1)
    marks.strokePoints(this.centerline, true, true)
    marks.lineStyle(6, 0xe8e8f0, 0.35)
    marks.strokePoints(offsetClosedPolyline(this.centerline, halfW - 10), true, true)
    marks.strokePoints(offsetClosedPolyline(this.centerline, -(halfW - 10)), true, true)
    this.drawStartLine(marks)

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

    // street lights along the outer boundary with warm ground pools
    const poleLine = offsetClosedPolyline(this.centerline, shoulderHalf + 70)
    for (const p of spacedPointsAlong(poleLine, 620)) {
      this.add
        .image(p.x, p.y, 'glow-soft')
        .setScale(1.6)
        .setTint(0xffcf8a)
        .setAlpha(0.2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.7)
      this.add.image(p.x, p.y, 'pole').setDepth(3.2)
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

  private drawStartLine(gfx: Phaser.GameObjects.Graphics) {
    const gate = this.gates[0]
    const across = { x: gate.b.x - gate.a.x, y: gate.b.y - gate.a.y }
    const len = Math.hypot(across.x, across.y)
    const ux = across.x / len
    const uy = across.y / len
    const cell = 20
    const cells = Math.floor(len / cell)
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < cells; i++) {
        gfx.fillStyle((i + row) % 2 === 0 ? 0xe8e8f0 : 0x14141a, 0.85)
        const bx = gate.a.x + ux * i * cell + gate.tangent.x * row * cell
        const by = gate.a.y + uy * i * cell + gate.tangent.y * row * cell
        gfx.fillPoints(
          [
            { x: bx, y: by },
            { x: bx + ux * cell, y: by + uy * cell },
            { x: bx + ux * cell + gate.tangent.x * cell, y: by + uy * cell + gate.tangent.y * cell },
            { x: bx + gate.tangent.x * cell, y: by + gate.tangent.y * cell },
          ],
          true,
        )
      }
    }
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
  }

  private syncCarVisuals(car: CarUnit) {
    car.sprite.setPosition(car.state.x, car.state.y).setRotation(car.state.heading)
    car.shadow.setPosition(car.state.x + 6, car.state.y + 8).setRotation(car.state.heading)
  }

  private updateCarEffects(car: CarUnit, input: CarInput, turboActive: boolean) {
    const cos = Math.cos(car.state.heading)
    const sin = Math.sin(car.state.heading)
    car.exhaust.setPosition(car.state.x - 42 * cos, car.state.y - 42 * sin)
    car.exhaust.frequency = car.wrecked ? 999999 : turboActive ? 15 : input.throttle > 0 ? 40 : 120

    car.turboFlame.setPosition(car.state.x - 46 * cos, car.state.y - 46 * sin)
    car.turboFlame.emitting = turboActive && !car.wrecked

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
        .setPosition(car.state.x + (Math.random() - 0.5) * 8, car.state.y + (Math.random() - 0.5) * 8)
        .setAlpha(0.18 + Math.random() * 0.22)
        .setScale(0.45 + Math.random() * 0.18)
    }

    car.damageSmoke.setPosition(car.state.x + 10 * cos, car.state.y + 10 * sin)
    if (!car.wrecked) {
      car.damageSmoke.frequency = car.damage > 80 ? 45 : car.damage > 50 ? 110 : -1
    }

    const skidding =
      !car.wrecked && (Math.abs(lateralSpeed(car.state)) > 90 || (input.handbrake && speed(car.state) > 150))
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
    const targetZoom = 1.05 - 0.17 * speedRatio
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.04))

    // look-ahead: shift the camera toward where the car is going
    this.lookAheadX = Phaser.Math.Linear(this.lookAheadX, this.player.state.vx * 0.22, 0.05)
    this.lookAheadY = Phaser.Math.Linear(this.lookAheadY, this.player.state.vy * 0.22, 0.05)
    cam.setFollowOffset(-this.lookAheadX, -this.lookAheadY)

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
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,X,SHIFT,C') as RaceScene['keys']
    this.input.keyboard!.on('keydown-ESC', () => this.scene.start('Menu'))
    this.input.keyboard!.on('keydown-M', () => audioBus.toggleMute())
    this.events.on('shutdown', () => {
      audioBus.engineStop()
      this.input.keyboard?.off('keydown-ESC')
      this.input.keyboard?.off('keydown-M')
    })
  }

  // ---------------------------------------------------------------- HUD

  private buildHud() {
    const plates = this.add.graphics()
    // status-bar plate (bottom-left)
    plates.fillStyle(0x0a0a10, 0.65)
    plates.fillRoundedRect(14, this.scale.height - 172, 300, 156, 10)
    plates.lineStyle(2, 0xf2a33c, 0.35)
    plates.strokeRoundedRect(14, this.scale.height - 172, 300, 156, 10)
    // standings plate (right)
    plates.fillStyle(0x0a0a10, 0.65)
    plates.fillRoundedRect(this.scale.width - 320, 160, 306, 138, 10)
    plates.lineStyle(2, 0xf2a33c, 0.35)
    plates.strokeRoundedRect(this.scale.width - 320, 160, 306, 138, 10)

    const hint = this.add.text(
      16,
      16,
      'Arrows/WASD drive · X fire · C mine · Shift turbo · Space handbrake · M mute · Esc menu',
      {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8e8f0',
        backgroundColor: '#000000aa',
        padding: { x: 10, y: 6 },
      },
    )

    const barLabels = ['DMG', 'AMMO', 'TURBO'].map((label, i) =>
      this.add.text(32, this.scale.height - 168 + i * 28, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9aa0ac',
      }),
    )

    this.cashText = this.add.text(16, 62, '$0', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#7fe0a8',
      stroke: '#000000',
      strokeThickness: 4,
    })

    this.speedText = this.add
      .text(28, this.scale.height - 34, '0 MPH', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0, 1)

    this.hudBars = this.add.graphics()

    this.positionText = this.add
      .text(this.scale.width - 28, this.scale.height - 30, '4th', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#f2a33c',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(1, 1)

    const right = this.scale.width - 28
    this.lapText = this.add
      .text(right, 24, `LAP 1/${this.track.laps}`, {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#e8e8f0',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(1, 0)
    this.timeText = this.add
      .text(right, 78, '0:00.00', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#9aa0ac',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 0)
    this.bestText = this.add
      .text(right, 116, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#7fe0a8',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 0)

    const hudChildren: Phaser.GameObjects.GameObject[] = [
      plates,
      hint,
      ...barLabels,
      this.cashText,
      this.speedText,
      this.hudBars,
      this.positionText,
      this.lapText,
      this.timeText,
      this.bestText,
    ]

    for (let i = 0; i < 4; i++) {
      const t = this.add.text(right, 170 + i * 30, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e8e8f0',
        stroke: '#000000',
        strokeThickness: 4,
      })
      t.setOrigin(1, 0)
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

    // status bars: damage / ammo / turbo (labels sit above each bar)
    const bx = 28
    const by = this.scale.height - 150
    const bw = 272
    const bh = 12
    const bars: Array<[string, number, number]> = [
      ['DMG', player.damage / 100, player.damage > 75 ? 0xd23c2f : player.damage > 40 ? 0xd0b435 : 0x3fd07f],
      ['AMMO', player.ammo / GUN.ammoMax, 0xffd75e],
      ['TURBO', player.turbo, 0x4fc3f7],
    ]
    this.hudBars.clear()
    bars.forEach(([label, ratio, color], i) => {
      const y = by + i * 28
      this.hudBars.fillStyle(0x000000, 0.55)
      this.hudBars.fillRect(bx - 4, y - 4, bw + 8, bh + 8)
      this.hudBars.fillStyle(0x2a2a33, 1)
      this.hudBars.fillRect(bx, y, bw, bh)
      this.hudBars.fillStyle(color as number, 1)
      this.hudBars.fillRect(bx, y, bw * Phaser.Math.Clamp(ratio as number, 0, 1), bh)
      void label
    })
    // mine stock as dots under the bars (original-style ordnance pips)
    for (let i = 0; i < player.mines; i++) {
      this.hudBars.fillStyle(0x1c1c24, 1)
      this.hudBars.fillCircle(bx + 8 + i * 22, by + 3 * 28 + 4, 7)
      this.hudBars.fillStyle(0xd23c2f, 1)
      this.hudBars.fillCircle(bx + 8 + i * 22, by + 3 * 28 + 4, 3)
    }

    const playerPos = this.placementOrder.indexOf('player') + 1
    if (playerPos > 0) this.positionText.setText(player.wrecked ? 'OUT' : ordinal(playerPos))

    this.placementOrder.forEach((id, i) => {
      const car = this.cars.find((c) => c.id === id)!
      const text = this.standingsTexts[i]
      const status = car.wrecked ? ' ✗' : car.finishedAt !== null ? ' *' : ` ${Math.round(car.damage)}%`
      text.setText(`${i + 1}. ${car.isPlayer ? 'YOU' : car.name}${status}`)
      text.setColor(car.isPlayer ? '#f2a33c' : `#${car.color.toString(16).padStart(6, '0')}`)
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
        damage: Math.round(c.damage * 10) / 10,
        ammo: c.ammo,
        turbo: Math.round(c.turbo * 100) / 100,
        cash: c.cash,
        wrecked: c.wrecked,
        mines: c.mines,
      })),
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
    w.__pickups = () => this.pickups.map((p) => ({ type: p.type, x: p.x, y: p.y, active: p.respawnAt === null }))
    w.__gates = this.gates
    w.__restartRace = () => this.scene.restart()

    const gfx = this.add.graphics().setDepth(50)
    this.gates.forEach((g, i) => {
      gfx.lineStyle(4, i === 0 ? 0xf2a33c : 0x4fc3f7, 0.55)
      gfx.lineBetween(g.a.x, g.a.y, g.b.x, g.b.y)
    })
    this.cameras.cameras[1]?.ignore(gfx)

    this.debugText = this.add.text(16, 120, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#7fe0a8',
    })
    this.hudContainer.add(this.debugText)
  }
}
