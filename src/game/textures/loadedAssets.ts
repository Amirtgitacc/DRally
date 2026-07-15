export interface LoadedTexture {
  key: string
  url: string
}

// Safe 1:1 drop-ins: surfaces, barrier, pole, pickups.
export const LOADED_TEXTURES: LoadedTexture[] = [
  { key: 'asphalt', url: 'assets/env/asphalt.webp' },
  { key: 'dirt', url: 'assets/env/dirt.webp' },
  { key: 'tire-wall', url: 'assets/env/tire-wall.webp' },
  { key: 'pole', url: 'assets/env/street-light.webp' },
  { key: 'pk-ammo', url: 'assets/pickups/ammo.webp' },
  { key: 'pk-turbo', url: 'assets/pickups/turbo.webp' },
  { key: 'pk-repair', url: 'assets/pickups/repair.webp' },
  { key: 'pk-cash', url: 'assets/pickups/cash.webp' },
  { key: 'pk-trap', url: 'assets/pickups/trap.webp' },
  { key: 'edge-line', url: 'assets/env/edge-line.webp' },
  { key: 'kerb', url: 'assets/env/kerb.webp' },
  { key: 'start-finish', url: 'assets/env/start-finish.webp' },
  { key: 'oil-0', url: 'assets/decals/oil-0.webp' },
  { key: 'oil-1', url: 'assets/decals/oil-1.webp' },
  { key: 'oil-2', url: 'assets/decals/oil-2.webp' },
  { key: 'skid-0', url: 'assets/decals/skid-0.webp' },
  { key: 'skid-1', url: 'assets/decals/skid-1.webp' },
  { key: 'skid-2', url: 'assets/decals/skid-2.webp' },
  { key: 'crack-0', url: 'assets/decals/crack-0.webp' },
  { key: 'crack-1', url: 'assets/decals/crack-1.webp' },
  { key: 'crack-2', url: 'assets/decals/crack-2.webp' },
  { key: 'patch-0', url: 'assets/decals/patch-0.webp' },
  { key: 'patch-1', url: 'assets/decals/patch-1.webp' },
  { key: 'patch-2', url: 'assets/decals/patch-2.webp' },
  { key: 'cone-0', url: 'assets/furniture/cone-0.webp' },
  { key: 'cone-1', url: 'assets/furniture/cone-1.webp' },
  { key: 'barricade-0', url: 'assets/furniture/barricade-0.webp' },
  { key: 'barricade-1', url: 'assets/furniture/barricade-1.webp' },
  { key: 'tyre-0', url: 'assets/furniture/tyre-0.webp' },
  { key: 'tyre-1', url: 'assets/furniture/tyre-1.webp' },
  { key: 'sandbag-0', url: 'assets/furniture/sandbag-0.webp' },
  { key: 'sandbag-1', url: 'assets/furniture/sandbag-1.webp' },
]

// Blend/particle-sensitive; wired in Task 3 (verify-and-revert).
export const LOADED_FX_TEXTURES: LoadedTexture[] = [
  { key: 'spark', url: 'assets/fx/spark.webp' },
  { key: 'smoke', url: 'assets/fx/smoke.webp' },
  { key: 'bullet', url: 'assets/fx/tracer.webp' },
  { key: 'muzzle', url: 'assets/fx/muzzle.webp' },
  { key: 'explosion',  url: 'assets/fx/explosion.webp' },
  { key: 'mine-blast', url: 'assets/fx/mine-blast.webp' },
]

// Project A: 3/4 hero renders for pre-game screens. Separate from the
// procedural car-<id> keys the race still uses — nothing here touches the race.
export const LOADED_HERO_TEXTURES: LoadedTexture[] = [
  { key: 'car-hero-jackal', url: 'assets/cars/hero/jackal.webp' },
  { key: 'car-hero-vandal', url: 'assets/cars/hero/vandal.webp' },
  { key: 'car-hero-marauder', url: 'assets/cars/hero/marauder.webp' },
  { key: 'car-hero-harrier', url: 'assets/cars/hero/harrier.webp' },
  { key: 'car-hero-basilisk', url: 'assets/cars/hero/basilisk.webp' },
  { key: 'car-hero-leviathan', url: 'assets/cars/hero/leviathan.webp' },
  // Project B: boss pre-duel reveal render (3/4 hero, distinct armoured car)
  { key: 'car-hero-sovereign', url: 'assets/cars/hero/boss.webp' },
]

// Screen backgrounds: authored 1920×1080 WebP art, one per menu/flow screen plus
// one per venue. Presentational only — loaded once at boot and drawn behind scene
// content by `sceneBackground()`. No race/vehicle keys touched.
export const LOADED_SCREEN_TEXTURES: LoadedTexture[] = [
  { key: 'bg-menu', url: 'assets/screens/menu-peykan-background.webp' },
  { key: 'bg-profile', url: 'assets/screens/profile-registration-bay.webp' },
  { key: 'bg-garage', url: 'assets/screens/garage-workshop.webp' },
  { key: 'bg-black-market', url: 'assets/screens/black-market-cage.webp' },
  { key: 'bg-car-dealer', url: 'assets/screens/underground-car-dealer.webp' },
  { key: 'bg-race-ops', url: 'assets/screens/race-operations.webp' },
  { key: 'bg-records', url: 'assets/screens/records-hall.webp' },
  { key: 'bg-champion', url: 'assets/screens/champion-victory-stage.webp' },
  { key: 'bg-venue-dust-bowl-run', url: 'assets/screens/venue-dust-bowl-run.webp' },
  { key: 'bg-venue-boneyard-loop', url: 'assets/screens/venue-boneyard-loop.webp' },
  { key: 'bg-venue-rust-belt-circuit', url: 'assets/screens/venue-rust-belt-circuit.webp' },
  { key: 'bg-venue-cinder-yards', url: 'assets/screens/venue-cinder-yards.webp' },
  { key: 'bg-venue-serpents-throat', url: 'assets/screens/venue-serpents-throat.webp' },
  { key: 'bg-venue-widows-coil', url: 'assets/screens/venue-widows-coil.webp' },
]

// Project B: real top-down roof-view race sprites, one per chassis + the boss.
// Replace the procedural car-<id> keys the race used to paint at boot.
export const LOADED_TOP_TEXTURES: LoadedTexture[] = [
  { key: 'car-top-jackal', url: 'assets/cars/top/jackal.webp' },
  { key: 'car-top-vandal', url: 'assets/cars/top/vandal.webp' },
  { key: 'car-top-marauder', url: 'assets/cars/top/marauder.webp' },
  { key: 'car-top-harrier', url: 'assets/cars/top/harrier.webp' },
  { key: 'car-top-basilisk', url: 'assets/cars/top/basilisk.webp' },
  { key: 'car-top-leviathan', url: 'assets/cars/top/leviathan.webp' },
  { key: 'car-top-sovereign', url: 'assets/cars/top/sovereign.webp' },
]
