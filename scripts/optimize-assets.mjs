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
]

for (const j of JOBS) {
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
console.log(`done: ${JOBS.length} assets`)
