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
]

// Blend/particle-sensitive; wired in Task 3 (verify-and-revert).
export const LOADED_FX_TEXTURES: LoadedTexture[] = [
  { key: 'spark', url: 'assets/fx/spark.webp' },
  { key: 'smoke', url: 'assets/fx/smoke.webp' },
]
