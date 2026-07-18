import type { CarPhysicsSpec } from '../core/vehicle/carPhysics'
import type { CarVariantSpec } from './cars'

// The champion — an original character who sits ABOVE the 20-driver ladder.
// Reaching rank #1 earns you a mandatory 1-v-1 duel against them; winning
// ends the career with the crown.

export const BOSS = {
  id: 'sovereign',
  name: 'The Sovereign',
  bodyColor: 0x16161c,
  accentColor: 0xc9a227,
  variants: [
    { key: 'base', label: 'Factory' },
    { key: 'a', label: 'Oxblood Black Champion' },
    { key: 'b', label: 'Ivory Lapis Imperator' },
  ] as CarVariantSpec[],
  /** pace multiplier, a step above the rank-#1 ladder rival */
  paceScale: 1.06,
  /** collision mass — the heaviest thing on any grid */
  mass: 1.35,
  /** winner-takes-the-crown purse */
  prizeCash: 25000,
  blurb: 'Nobody remembers crowning them. Nobody has taken the crown back either.',
  /** a one-off machine, a notch above the Leviathan in every stat */
  spec: {
    accel: 880,
    brakeForce: 1180,
    reverseAccel: 370,
    topSpeed: 690,
    reverseTopSpeed: 172,
    turnRate: 3.75,
    grip: 7.2,
    handbrakeGrip: 1.25,
    drag: 0.25,
    steerSaturationSpeed: 158,
  } as CarPhysicsSpec,
}
