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
