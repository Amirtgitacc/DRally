import type { CarPhysicsSpec } from '../core/vehicle/carPhysics'
import type { UpgradeKind } from './economy'

// Data-driven car catalog — the chassis ladder. Higher tiers cost more and
// allow more upgrade tiers per stat (caps), like the reference game's ladder.

/** Body silhouette painted by vehicleTextures — pure cosmetics. */
export type CarVariant = 'compact' | 'muscle' | 'sleek'

export interface CarSpec extends CarPhysicsSpec {
  id: string
  name: string
  price: number
  bodyColor: number
  accentColor: number
  upgradeCaps: Record<UpgradeKind, number>
  /** relative collision mass — heavier cars shove lighter ones around */
  mass: number
  variant: CarVariant
  blurb: string
}

export const CAR_CATALOG: CarSpec[] = [
  {
    id: 'jackal',
    name: 'Jackal',
    price: 500,
    bodyColor: 0x35d07f,
    accentColor: 0xf0f0e8,
    blurb: 'Cheap, honest, slightly rusty. It starts every time — that is the whole sales pitch.',
    upgradeCaps: { engine: 1, tires: 2, armor: 1 },
    mass: 1.0,
    variant: 'compact',

    accel: 620,
    brakeForce: 950,
    reverseAccel: 320,
    topSpeed: 520,
    reverseTopSpeed: 160,
    turnRate: 3.4,
    grip: 5.5,
    handbrakeGrip: 1.1,
    drag: 0.25,
    steerSaturationSpeed: 140,
  },
  {
    id: 'vandal',
    name: 'Vandal',
    price: 1400,
    bodyColor: 0xd0b435,
    accentColor: 0x16161c,
    blurb: 'A street brawler with the mirrors already snapped off. Light, twitchy, cheerfully illegal.',
    upgradeCaps: { engine: 2, tires: 2, armor: 1 },
    mass: 0.92,
    variant: 'compact',

    accel: 655,
    brakeForce: 970,
    reverseAccel: 330,
    topSpeed: 545,
    reverseTopSpeed: 162,
    turnRate: 3.45,
    grip: 5.7,
    handbrakeGrip: 1.12,
    drag: 0.25,
    steerSaturationSpeed: 142,
  },
  {
    id: 'marauder',
    name: 'Marauder',
    price: 2600,
    bodyColor: 0xd07a35,
    accentColor: 0x16161c,
    blurb: 'Mid-ladder muscle. Corners like it means it, and takes a punch without whining.',
    upgradeCaps: { engine: 2, tires: 3, armor: 2 },
    mass: 1.18,
    variant: 'muscle',

    accel: 690,
    brakeForce: 1000,
    reverseAccel: 340,
    topSpeed: 565,
    reverseTopSpeed: 165,
    turnRate: 3.5,
    grip: 6.0,
    handbrakeGrip: 1.15,
    drag: 0.25,
    steerSaturationSpeed: 145,
  },
  {
    id: 'harrier',
    name: 'Harrier',
    price: 4400,
    bodyColor: 0x4f8fd0,
    accentColor: 0xf0f0e8,
    blurb: 'Built by people who thought brakes were a compromise. Slippery, fast, faintly smug.',
    upgradeCaps: { engine: 3, tires: 3, armor: 2 },
    mass: 1.05,
    variant: 'muscle',

    accel: 730,
    brakeForce: 1040,
    reverseAccel: 350,
    topSpeed: 590,
    reverseTopSpeed: 168,
    turnRate: 3.55,
    grip: 6.25,
    handbrakeGrip: 1.18,
    drag: 0.25,
    steerSaturationSpeed: 148,
  },
  {
    id: 'basilisk',
    name: 'Basilisk',
    price: 6800,
    bodyColor: 0x8a5fd0,
    accentColor: 0xf0f0e8,
    blurb: 'Fast enough that braking becomes a philosophical question.',
    upgradeCaps: { engine: 3, tires: 3, armor: 3 },
    mass: 1.12,
    variant: 'sleek',

    accel: 760,
    brakeForce: 1080,
    reverseAccel: 360,
    topSpeed: 615,
    reverseTopSpeed: 170,
    turnRate: 3.6,
    grip: 6.5,
    handbrakeGrip: 1.2,
    drag: 0.25,
    steerSaturationSpeed: 150,
  },
  {
    id: 'leviathan',
    name: 'Leviathan',
    price: 16000,
    bodyColor: 0xc23b4e,
    accentColor: 0xc9a227,
    blurb: 'Top of the ladder. Heavy, vicious, and faster than anything this heavy has a right to be.',
    upgradeCaps: { engine: 3, tires: 3, armor: 3 },
    mass: 1.3,
    variant: 'sleek',

    accel: 830,
    brakeForce: 1150,
    reverseAccel: 370,
    topSpeed: 655,
    reverseTopSpeed: 172,
    turnRate: 3.65,
    grip: 6.9,
    handbrakeGrip: 1.22,
    drag: 0.25,
    steerSaturationSpeed: 154,
  },
]

export function carById(id: string): CarSpec {
  const car = CAR_CATALOG.find((c) => c.id === id)
  if (!car) throw new Error(`Unknown car id: ${id}`)
  return car
}

/** The free chassis every career starts with. */
export const STARTER_CAR = CAR_CATALOG[0]
