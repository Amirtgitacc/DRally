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
    mass: 0.9,
    sizeScale: 0.95,
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

/** Full quick-race / lobby car roster: the single-player catalog plus the
 *  MP-only guest cars. The one list every MP car picker cycles, so the guest
 *  cars (e.g. 206 Anahita) are reachable in the lobby, not just at create time. */
export const MP_CAR_OPTIONS: CarSpec[] = [...CAR_CATALOG, ...MP_ONLY_CARS]

/** Resolve a car id across the single-player catalog and the MP-only cars.
 *  The boss/sovereign is deliberately excluded — it is not selectable in MP. */
export function mpCarById(id: string): CarSpec | undefined {
  return CAR_CATALOG.find((c) => c.id === id) ?? MP_ONLY_CARS.find((c) => c.id === id)
}
