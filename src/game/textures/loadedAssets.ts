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
  { key: 'bg-mp', url: 'assets/screens/mp-quick-race.webp' },
  { key: 'bg-lobby', url: 'assets/screens/mp-lobby.webp' },
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

// Livery-colour top-down variants (two per chassis) for multiplayer car
// selection. Additive to LOADED_TOP_TEXTURES; the base car-top-<id> keys are
// unaffected and still used by single-player race code.
export const LOADED_TOP_VARIANT_TEXTURES: LoadedTexture[] = [
  { key: 'car-top-jackal-a', url: 'assets/cars/top/variants/jackal-a.webp' },
  { key: 'car-top-jackal-b', url: 'assets/cars/top/variants/jackal-b.webp' },
  { key: 'car-top-vandal-a', url: 'assets/cars/top/variants/vandal-a.webp' },
  { key: 'car-top-vandal-b', url: 'assets/cars/top/variants/vandal-b.webp' },
  { key: 'car-top-marauder-a', url: 'assets/cars/top/variants/marauder-a.webp' },
  { key: 'car-top-marauder-b', url: 'assets/cars/top/variants/marauder-b.webp' },
  { key: 'car-top-harrier-a', url: 'assets/cars/top/variants/harrier-a.webp' },
  { key: 'car-top-harrier-b', url: 'assets/cars/top/variants/harrier-b.webp' },
  { key: 'car-top-basilisk-a', url: 'assets/cars/top/variants/basilisk-a.webp' },
  { key: 'car-top-basilisk-b', url: 'assets/cars/top/variants/basilisk-b.webp' },
  { key: 'car-top-leviathan-a', url: 'assets/cars/top/variants/leviathan-a.webp' },
  { key: 'car-top-leviathan-b', url: 'assets/cars/top/variants/leviathan-b.webp' },
  { key: 'car-top-sovereign-a', url: 'assets/cars/top/variants/sovereign-a.webp' },
  { key: 'car-top-sovereign-b', url: 'assets/cars/top/variants/sovereign-b.webp' },
]

// MP-only car "anahita": not in CAR_CATALOG or BOSS, so kept out of
// LOADED_TOP_TEXTURES / LOADED_HERO_TEXTURES to avoid tripping their
// catalog-coverage tests.
export const LOADED_MP_ONLY_TEXTURES: LoadedTexture[] = [
  { key: 'car-top-anahita', url: 'assets/cars/top/anahita.webp' },
  { key: 'car-hero-anahita', url: 'assets/cars/hero/anahita.webp' },
  { key: 'car-poster-anahita', url: 'assets/cars/posters/anahita.webp' },
]

// Livery-colour poster variants (two per chassis), shown by the multiplayer
// screens where a player's chosen livery — not just the chassis — is on
// display. Additive to LOADED_POSTER_TEXTURES; the base car-poster-<id> keys
// are unaffected and still used by the garage/dealer.
export const LOADED_POSTER_VARIANT_TEXTURES: LoadedTexture[] = [
  { key: 'car-poster-jackal-a', url: 'assets/cars/posters/variants/jackal-a.webp' },
  { key: 'car-poster-jackal-b', url: 'assets/cars/posters/variants/jackal-b.webp' },
  { key: 'car-poster-vandal-a', url: 'assets/cars/posters/variants/vandal-a.webp' },
  { key: 'car-poster-vandal-b', url: 'assets/cars/posters/variants/vandal-b.webp' },
  { key: 'car-poster-marauder-a', url: 'assets/cars/posters/variants/marauder-a.webp' },
  { key: 'car-poster-marauder-b', url: 'assets/cars/posters/variants/marauder-b.webp' },
  { key: 'car-poster-harrier-a', url: 'assets/cars/posters/variants/harrier-a.webp' },
  { key: 'car-poster-harrier-b', url: 'assets/cars/posters/variants/harrier-b.webp' },
  { key: 'car-poster-basilisk-a', url: 'assets/cars/posters/variants/basilisk-a.webp' },
  { key: 'car-poster-basilisk-b', url: 'assets/cars/posters/variants/basilisk-b.webp' },
  { key: 'car-poster-leviathan-a', url: 'assets/cars/posters/variants/leviathan-a.webp' },
  { key: 'car-poster-leviathan-b', url: 'assets/cars/posters/variants/leviathan-b.webp' },
]

/** Poster texture for a chassis + livery: 'base' (or missing) → the factory
 *  poster, else the livery-variant poster. The Anahita only has a factory
 *  poster, but it also only has the 'base' livery, so the mapping holds. */
export function posterTextureFor(carId: string, variantId: string): string {
  return variantId && variantId !== 'base' ? `car-poster-${carId}-${variantId}` : `car-poster-${carId}`
}

// Track set pieces and environment scatter: authored transparent top-down
// sprites. The obstacle-* keys are referenced by TrackDef.setPieces
// (collidable splitters authored per venue); the decor-* keys by
// TrackDef.decorations (non-colliding venue landmarks); the set-* keys are
// surviving structural dressing (walls, fences, overheads, lights); plus the
// runoff/sand/grate decal cells.
export const LOADED_ENVIRONMENT_TEXTURES: LoadedTexture[] = [
  { key: 'obstacle-armoured-concrete-divider', url: 'assets/env/obstacles/armoured-concrete-divider.webp' },
  { key: 'obstacle-strapped-tyre-bale', url: 'assets/env/obstacles/strapped-tyre-bale.webp' },
  { key: 'obstacle-sealed-cargo-pallet', url: 'assets/env/obstacles/sealed-cargo-pallet.webp' },
  { key: 'obstacle-low-pipe-manifold', url: 'assets/env/obstacles/low-pipe-manifold-island.webp' },
  { key: 'obstacle-contained-rockfall', url: 'assets/env/obstacles/contained-rockfall-island.webp' },
  { key: 'decor-blacktide-container-stack', url: 'assets/env/decor/blacktide-exchange/container-stack.webp' },
  { key: 'decor-blacktide-mooring-cluster', url: 'assets/env/decor/blacktide-exchange/mooring-cluster.webp' },
  { key: 'decor-blacktide-crane-drive-platform', url: 'assets/env/decor/blacktide-exchange/crane-drive-platform.webp' },
  { key: 'decor-glassburn-pump-skid', url: 'assets/env/decor/glassburn-works/pump-skid.webp' },
  { key: 'decor-glassburn-valve-tree', url: 'assets/env/decor/glassburn-works/valve-tree.webp' },
  { key: 'decor-glassburn-heat-exchanger-bank', url: 'assets/env/decor/glassburn-works/heat-exchanger-bank.webp' },
  { key: 'decor-ironveil-excavator', url: 'assets/env/decor/ironveil-ascent/excavator.webp' },
  { key: 'decor-ironveil-conveyor-drive', url: 'assets/env/decor/ironveil-ascent/conveyor-drive.webp' },
  { key: 'decor-ironveil-ore-hopper', url: 'assets/env/decor/ironveil-ascent/ore-hopper.webp' },
  { key: 'set-fender-wall', url: 'assets/env/set/fender-wall.webp' },
  { key: 'set-pipe-rack', url: 'assets/env/set/pipe-rack.webp' },
  { key: 'set-floodlight-bank', url: 'assets/env/set/floodlight-bank.webp' },
  { key: 'set-barrel-pallet', url: 'assets/env/set/barrel-pallet.webp' },
  { key: 'set-chainlink', url: 'assets/env/set/chainlink.webp' },
  { key: 'set-jersey-barrier', url: 'assets/env/set/jersey-barrier.webp' },
  { key: 'runoff-0', url: 'assets/decals/runoff-0.webp' },
  { key: 'runoff-1', url: 'assets/decals/runoff-1.webp' },
  { key: 'runoff-2', url: 'assets/decals/runoff-2.webp' },
  { key: 'runoff-3', url: 'assets/decals/runoff-3.webp' },
  { key: 'runoff-4', url: 'assets/decals/runoff-4.webp' },
  { key: 'runoff-5', url: 'assets/decals/runoff-5.webp' },
  { key: 'grate-0', url: 'assets/decals/grate-0.webp' },
  { key: 'grate-1', url: 'assets/decals/grate-1.webp' },
  { key: 'grate-2', url: 'assets/decals/grate-2.webp' },
]

// Venue poster art: one authored portrait 2:3 poster per track. Shown by the
// venues gallery and preview reel inside a portrait frame, never stretched to
// fullscreen — the real centerline-derived track map stays alongside it.
export const LOADED_TRACK_POSTER_TEXTURES: LoadedTexture[] = [
  { key: 'track-poster-blacktide-exchange', url: 'assets/tracks/posters/blacktide-exchange.webp' },
  { key: 'track-poster-glassburn-works', url: 'assets/tracks/posters/glassburn-works.webp' },
  { key: 'track-poster-ironveil-ascent', url: 'assets/tracks/posters/ironveil-ascent.webp' },
]

/** Poster texture key for a track id, or null when no poster is registered
 *  (unknown/legacy ids fail safely — callers fall back to plain framing). */
export function trackPosterTextureFor(trackId: string): string | null {
  const key = `track-poster-${trackId}`
  return LOADED_TRACK_POSTER_TEXTURES.some((t) => t.key === key) ? key : null
}

// Garage/dealer poster art: one authored portrait per chassis, plus the boss
// car under both its boss and sovereign identities.
export const LOADED_POSTER_TEXTURES: LoadedTexture[] = [
  { key: 'car-poster-jackal', url: 'assets/cars/posters/jackal.webp' },
  { key: 'car-poster-vandal', url: 'assets/cars/posters/vandal.webp' },
  { key: 'car-poster-marauder', url: 'assets/cars/posters/marauder.webp' },
  { key: 'car-poster-harrier', url: 'assets/cars/posters/harrier.webp' },
  { key: 'car-poster-basilisk', url: 'assets/cars/posters/basilisk.webp' },
  { key: 'car-poster-leviathan', url: 'assets/cars/posters/leviathan.webp' },
  { key: 'car-poster-boss', url: 'assets/cars/posters/boss.webp' },
  { key: 'car-poster-sovereign', url: 'assets/cars/posters/sovereign.webp' },
]
