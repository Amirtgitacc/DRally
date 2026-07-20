// One-shot: optimize raw generated PNGs into small WebP game assets.
// Run manually when source art changes:  npm run assets
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const SRC = 'Cars/output/generated'
const OUT = 'public/assets'

// fit 'fill' = exact square (seamless surfaces); 'inside' = preserve aspect + alpha (sprites)
const JOBS = [
  { src: 'dark_grungy_wet_asphalt.png',          out: 'env/asphalt.webp',      w: 512, h: 512, fit: 'fill',   q: 88 },
  { src: 'off_track_dirt_dry_sandy_ground.png',  out: 'env/dirt.webp',         w: 512, h: 512, fit: 'fill',   q: 88 },
  { src: 'red_white_tyre_wall_segment.png',      out: 'env/tire-wall.webp',    w: 192,         fit: 'inside', q: 85 },
  { src: 'amber_street_light_top_down.png',      out: 'env/street-light.webp', w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_weapon_ammo_crate.png',         out: 'pickups/ammo.webp',     w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_turbo_boost.png',               out: 'pickups/turbo.webp',    w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_repair_wrench.png',             out: 'pickups/repair.webp',   w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_cash_money.png',                out: 'pickups/cash.webp',     w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'pickup_hazard_skull_booby_trap.png',   out: 'pickups/trap.webp',     w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'fx_spark_burst.png',                   out: 'fx/spark.webp',         w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'fx_smoke_puff.png',                    out: 'fx/smoke.webp',         w: 128, h: 128, fit: 'inside', q: 85 },
  { src: 'fx_bullet_tracer.png', out: 'fx/tracer.webp',     w: 48,  fit: 'inside', q: 85, trim: true },
  { src: 'fx_muzzle_flash.png',  out: 'fx/muzzle.webp',     w: 128, fit: 'inside', q: 85, trim: true },
  { src: 'fx_explosion.png',     out: 'fx/explosion.webp',  w: 256, fit: 'inside', q: 85, trim: true },
  { src: 'fx_mine_blast.png',    out: 'fx/mine-blast.webp', w: 256, fit: 'inside', q: 85, trim: true },
  { src: 'worn_white_edge_and_dashed_line_pieces.png', out: 'env/edge-line.webp',    w: 128, fit: 'inside', q: 85, extract: { left: 324, top: 382, width: 281, height: 62 } },
  { src: 'red_white_kerb_tile.png',                    out: 'env/kerb.webp',         w: 128, fit: 'inside', q: 85, trim: true },
  { src: 'start_finish_checkered_tile.png',            out: 'env/start-finish.webp', w: 256, fit: 'inside', q: 85, trim: true },
  // --- Phase 2 decals (track_surface_decal_set.png, 1536x1024, 3 cols x 4 rows, cell 512x256) ---
  { src: 'track_surface_decal_set.png', out: 'decals/oil-0.webp',   w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 0,   width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/oil-1.webp',   w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 0,   width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/oil-2.webp',   w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 0,   width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/skid-0.webp',  w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 256, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/skid-1.webp',  w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 256, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/skid-2.webp',  w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 256, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/crack-0.webp', w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 512, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/crack-1.webp', w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 512, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/crack-2.webp', w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 512, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/patch-0.webp', w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 768, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/patch-1.webp', w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 768, width: 512, height: 256 }, trim: true },
  { src: 'track_surface_decal_set.png', out: 'decals/patch-2.webp', w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 768, width: 512, height: 256 }, trim: true },
  // --- Phase 2 furniture (track_furniture_set.png, 1536x1024; per-item rects + trim) ---
  { src: 'track_furniture_set.png', out: 'furniture/cone-0.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 300,  top: 70,  width: 260, height: 220 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/cone-1.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 1020, top: 70,  width: 260, height: 220 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/barricade-0.webp', w: 200, fit: 'inside', q: 85, extract: { left: 330,  top: 340, width: 440, height: 250 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/barricade-1.webp', w: 200, fit: 'inside', q: 85, extract: { left: 810,  top: 340, width: 440, height: 250 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/tyre-0.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 270,  top: 620, width: 250, height: 290 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/tyre-1.webp',      w: 160, fit: 'inside', q: 85, extract: { left: 520,  top: 620, width: 250, height: 290 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/sandbag-0.webp',   w: 160, fit: 'inside', q: 85, extract: { left: 780,  top: 630, width: 240, height: 270 }, trim: true },
  { src: 'track_furniture_set.png', out: 'furniture/sandbag-1.webp',   w: 160, fit: 'inside', q: 85, extract: { left: 1020, top: 630, width: 250, height: 270 }, trim: true },
  // --- Project A: Iranian hero car renders (3/4 angle, transparent) ---
  { src: 'car_hero_jackal.png',    out: 'cars/hero/jackal.webp',    w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_vandal.png',    out: 'cars/hero/vandal.webp',    w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_marauder.png',  out: 'cars/hero/marauder.webp',  w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_harrier.png',   out: 'cars/hero/harrier.webp',   w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_basilisk.png',  out: 'cars/hero/basilisk.webp',  w: 460, fit: 'inside', q: 88, trim: true },
  { src: 'car_hero_leviathan.png', out: 'cars/hero/leviathan.webp', w: 460, fit: 'inside', q: 88, trim: true },
  // --- Project B: Iranian top-down race sprites (roof view, nose +x, transparent) ---
  { src: 'car_top_jackal.png',    out: 'cars/top/jackal.webp',    w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_vandal.png',    out: 'cars/top/vandal.webp',    w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_marauder.png',  out: 'cars/top/marauder.webp',  w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_harrier.png',   out: 'cars/top/harrier.webp',   w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_basilisk.png',  out: 'cars/top/basilisk.webp',  w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_leviathan.png', out: 'cars/top/leviathan.webp', w: 220, fit: 'inside', q: 88, trim: true },
  { src: 'car_top_sovereign.png', out: 'cars/top/sovereign.webp', w: 220, fit: 'inside', q: 88, trim: true },
  // Boss 3/4 hero for the pre-duel reveal (matches the hero pipeline)
  { src: 'car_hero_sovereign.png', out: 'cars/hero/boss.webp',    w: 460, fit: 'inside', q: 88, trim: true },
  // --- Livery-variant top-down sprites (roof view, nose +x, transparent) ---
  { src: 'variants/car_top_jackal-a.png',    out: 'cars/top/variants/jackal-a.webp',    w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_jackal-b.png',    out: 'cars/top/variants/jackal-b.webp',    w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_vandal-a.png',    out: 'cars/top/variants/vandal-a.webp',    w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_vandal-b.png',    out: 'cars/top/variants/vandal-b.webp',    w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_marauder-a.png',  out: 'cars/top/variants/marauder-a.webp',  w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_marauder-b.png',  out: 'cars/top/variants/marauder-b.webp',  w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_harrier-a.png',   out: 'cars/top/variants/harrier-a.webp',   w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_harrier-b.png',   out: 'cars/top/variants/harrier-b.webp',   w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_basilisk-a.png',  out: 'cars/top/variants/basilisk-a.webp',  w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_basilisk-b.png',  out: 'cars/top/variants/basilisk-b.webp',  w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_leviathan-a.png', out: 'cars/top/variants/leviathan-a.webp', w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_leviathan-b.png', out: 'cars/top/variants/leviathan-b.webp', w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_sovereign-a.png', out: 'cars/top/variants/sovereign-a.webp', w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_top_sovereign-b.png', out: 'cars/top/variants/sovereign-b.webp', w: 220, fit: 'inside', q: 85, trim: true },
  // --- MP-only car: anahita (top-down + 3/4 hero) ---
  // Real-world car model (Peugeot 206) used deliberately per project owner
  // direction -- AGENTS.md's no-branding constraint targets the reference
  // game's material (manual/screenshots), not real car models; owner
  // supplied these renders for this exact purpose.
  { src: 'variants/car_top_anahita.png',  out: 'cars/top/anahita.webp',  w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'variants/car_hero_anahita.png', out: 'cars/hero/anahita.webp', w: 460, fit: 'inside', q: 85, trim: true },
  // --- Poster art (full-bleed, not green-screen: straight encode, no trim) ---
  { src: 'posters/jackal-poster.png',    out: 'cars/posters/jackal.webp',    w: 768, fit: 'inside', q: 82 },
  { src: 'posters/vandal-poster.png',    out: 'cars/posters/vandal.webp',    w: 768, fit: 'inside', q: 82 },
  { src: 'posters/marauder-poster.png',  out: 'cars/posters/marauder.webp',  w: 768, fit: 'inside', q: 82 },
  { src: 'posters/harrier-poster.png',   out: 'cars/posters/harrier.webp',   w: 768, fit: 'inside', q: 82 },
  { src: 'posters/basilisk-poster.png',  out: 'cars/posters/basilisk.webp',  w: 768, fit: 'inside', q: 82 },
  { src: 'posters/leviathan-poster.png', out: 'cars/posters/leviathan.webp', w: 768, fit: 'inside', q: 82 },
  { src: 'posters/sovereign-poster.png', out: 'cars/posters/sovereign.webp', w: 768, fit: 'inside', q: 82 },
  { src: 'posters/boss-poster.png',      out: 'cars/posters/boss.webp',      w: 768, fit: 'inside', q: 82 },
  // --- Track set pieces (structural/safety infrastructure that survived the
  //     obstacle-art replacement; transparent top-down) ---
  { src: 'modular_quayside_fender_wall.png',    out: 'env/set/fender-wall.webp',       w: 300, fit: 'inside', q: 85, trim: true },
  { src: 'refinery_pipe_rack_overpass.png',     out: 'env/set/pipe-rack.webp',         w: 640, fit: 'inside', q: 85, trim: true },
  // --- Environment scatter (per-venue off-road dressing) ---
  { src: 'portable_sodium_floodlight_bank.png',  out: 'env/set/floodlight-bank.webp', w: 180, fit: 'inside', q: 85, trim: true },
  { src: 'environment_barrel_pallet_cluster.png',out: 'env/set/barrel-pallet.webp',   w: 220, fit: 'inside', q: 85, trim: true },
  { src: 'environment_chainlink_fence_segment.png', out: 'env/set/chainlink.webp',    w: 320, fit: 'inside', q: 85, trim: true },
  { src: 'concrete_jersey_barrier_segment.png',  out: 'env/set/jersey-barrier.webp',  w: 280, fit: 'inside', q: 85, trim: true },
  // --- Collidable obstacles (track_assets masters, 1024² transparent RGBA) ---
  { src: 'track_assets/obstacles/obstacle_armoured_concrete_divider.png', out: 'env/obstacles/armoured-concrete-divider.webp', w: 512, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/obstacles/obstacle_strapped_tyre_bale.png',        out: 'env/obstacles/strapped-tyre-bale.webp',        w: 448, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/obstacles/obstacle_sealed_cargo_pallet.png',       out: 'env/obstacles/sealed-cargo-pallet.webp',       w: 448, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/obstacles/obstacle_low_pipe_manifold_island.png',  out: 'env/obstacles/low-pipe-manifold-island.webp',  w: 512, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/obstacles/obstacle_contained_rockfall_island.png', out: 'env/obstacles/contained-rockfall-island.webp', w: 512, fit: 'inside', q: 85, trim: true },
  // --- Venue landmark decorations (track_assets masters, non-colliding) ---
  { src: 'track_assets/decorations/blacktide_exchange/decor_blacktide_container_stack.png',      out: 'env/decor/blacktide-exchange/container-stack.webp',      w: 640, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/blacktide_exchange/decor_blacktide_mooring_cluster.png',      out: 'env/decor/blacktide-exchange/mooring-cluster.webp',      w: 512, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/blacktide_exchange/decor_blacktide_crane_drive_platform.png', out: 'env/decor/blacktide-exchange/crane-drive-platform.webp', w: 512, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/glassburn_works/decor_glassburn_pump_skid.png',           out: 'env/decor/glassburn-works/pump-skid.webp',           w: 512, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/glassburn_works/decor_glassburn_valve_tree.png',          out: 'env/decor/glassburn-works/valve-tree.webp',          w: 512, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/glassburn_works/decor_glassburn_heat_exchanger_bank.png', out: 'env/decor/glassburn-works/heat-exchanger-bank.webp', w: 640, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/ironveil_ascent/decor_ironveil_excavator.png',      out: 'env/decor/ironveil-ascent/excavator.webp',      w: 448, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/ironveil_ascent/decor_ironveil_conveyor_drive.png', out: 'env/decor/ironveil-ascent/conveyor-drive.webp', w: 640, fit: 'inside', q: 85, trim: true },
  { src: 'track_assets/decorations/ironveil_ascent/decor_ironveil_ore_hopper.png',     out: 'env/decor/ironveil-ascent/ore-hopper.webp',     w: 512, fit: 'inside', q: 85, trim: true },
  // --- Venue decal sheets (3 cols x 2 rows, cell 512x512) ---
  { src: 'rainwater_runoff_decal_set.png', out: 'decals/runoff-0.webp', w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 0,   width: 512, height: 512 }, trim: true },
  { src: 'rainwater_runoff_decal_set.png', out: 'decals/runoff-1.webp', w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 0,   width: 512, height: 512 }, trim: true },
  { src: 'rainwater_runoff_decal_set.png', out: 'decals/runoff-2.webp', w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 0,   width: 512, height: 512 }, trim: true },
  { src: 'rainwater_runoff_decal_set.png', out: 'decals/runoff-3.webp', w: 256, fit: 'inside', q: 85, extract: { left: 0,    top: 512, width: 512, height: 512 }, trim: true },
  { src: 'rainwater_runoff_decal_set.png', out: 'decals/runoff-4.webp', w: 256, fit: 'inside', q: 85, extract: { left: 512,  top: 512, width: 512, height: 512 }, trim: true },
  { src: 'rainwater_runoff_decal_set.png', out: 'decals/runoff-5.webp', w: 256, fit: 'inside', q: 85, extract: { left: 1024, top: 512, width: 512, height: 512 }, trim: true },
  { src: 'environment_drain_grate_decal_set.png', out: 'decals/grate-0.webp', w: 128, fit: 'inside', q: 85, extract: { left: 0,    top: 0,   width: 512, height: 512 }, trim: true },
  { src: 'environment_drain_grate_decal_set.png', out: 'decals/grate-1.webp', w: 128, fit: 'inside', q: 85, extract: { left: 512,  top: 0,   width: 512, height: 512 }, trim: true },
  { src: 'environment_drain_grate_decal_set.png', out: 'decals/grate-2.webp', w: 128, fit: 'inside', q: 85, extract: { left: 0,    top: 512, width: 512, height: 512 }, trim: true },
]

// Optional filter: `node scripts/optimize-assets.mjs <substring>` converts only
// jobs whose output path contains the substring (avoids re-encoding the world).
const only = process.argv[2]
const RUN = only ? JOBS.filter((j) => j.out.includes(only)) : JOBS

for (const j of RUN) {
  const dest = join(OUT, j.out)
  await mkdir(dirname(dest), { recursive: true })
  const resize = j.h
    ? { width: j.w, height: j.h, fit: j.fit }
    : { width: j.w, fit: j.fit }
  let pipe
  if (j.extract && j.trim) {
    // sharp can't reliably extract+trim in one pipeline (throws "bad extract
    // area" on some regions); materialize the crop to a buffer, then trim.
    const cut = await sharp(join(SRC, j.src)).extract(j.extract).png().toBuffer()
    pipe = sharp(cut).trim({ threshold: 16 })
  } else {
    pipe = sharp(join(SRC, j.src))
    if (j.extract) pipe = pipe.extract(j.extract)
    if (j.trim) pipe = pipe.trim({ threshold: 16 })
  }
  await pipe.resize(resize).webp({ quality: j.q }).toFile(dest)
  console.log('wrote', dest)
}
console.log(`done: ${RUN.length} assets`)
