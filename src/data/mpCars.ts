import { CAR_CATALOG, type CarSpec } from './cars'

// Cars that exist for online multiplayer only — never sold, never in the
// single-player catalog, dealer, garage, or career. Kept in a separate file
// (rather than CAR_CATALOG) so nothing in single-player code that iterates
// CAR_CATALOG (dealer listings, ladder rivals, save migrations) ever sees them.

export const MP_ONLY_CARS: CarSpec[] = [
  {
    id: 'anahita',
    name: '206 Anahita',
    price: 2000,
    bodyColor: 0x3fa7d1,
    accentColor: 0xf0f0e8,
    blurb: 'A tidy hatchback nobody sells for career mode — quick, light, purely a multiplayer guest.',
    upgradeCaps: { engine: 2, tires: 2, armor: 1 },
    mass: 1.05,
    variant: 'compact',
    variants: [{ key: 'base', label: 'Factory' }],

    // Every numeric stat sits strictly between vandal and marauder.
    accel: 672,
    brakeForce: 985,
    reverseAccel: 335,
    topSpeed: 555,
    reverseTopSpeed: 163,
    turnRate: 3.475,
    grip: 5.85,
    handbrakeGrip: 1.135,
    drag: 0.25,
    steerSaturationSpeed: 143,
  },
]

/** Resolve a car id across the single-player catalog and the MP-only cars.
 *  The boss/sovereign is deliberately excluded — it is not selectable in MP. */
export function mpCarById(id: string): CarSpec | undefined {
  return CAR_CATALOG.find((c) => c.id === id) ?? MP_ONLY_CARS.find((c) => c.id === id)
}
