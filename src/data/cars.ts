import type { CarPhysicsSpec } from '../core/vehicle/carPhysics'
import type { UpgradeKind } from './economy'

// Data-driven car catalog — the chassis ladder. Higher tiers cost more and
// allow more upgrade tiers per stat (caps), like the reference game's ladder.

export interface CarSpec extends CarPhysicsSpec {
  id: string
  name: string
  price: number
  bodyColor: number
  accentColor: number
  upgradeCaps: Record<UpgradeKind, number>
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
    id: 'marauder',
    name: 'Marauder',
    price: 2600,
    bodyColor: 0xd07a35,
    accentColor: 0x16161c,
    blurb: 'Mid-ladder muscle. Corners like it means it, and takes a punch without whining.',
    upgradeCaps: { engine: 2, tires: 3, armor: 2 },

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
    id: 'basilisk',
    name: 'Basilisk',
    price: 6800,
    bodyColor: 0x8a5fd0,
    accentColor: 0xf0f0e8,
    blurb: 'Top of the current ladder. Fast enough that braking becomes a philosophical question.',
    upgradeCaps: { engine: 3, tires: 3, armor: 3 },

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
]

export function carById(id: string): CarSpec {
  const car = CAR_CATALOG.find((c) => c.id === id)
  if (!car) throw new Error(`Unknown car id: ${id}`)
  return car
}

/** The free chassis every career starts with (also the AI rival chassis). */
export const STARTER_CAR = CAR_CATALOG[0]
