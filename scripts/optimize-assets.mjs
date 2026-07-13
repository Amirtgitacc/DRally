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
]

for (const j of JOBS) {
  const dest = join(OUT, j.out)
  await mkdir(dirname(dest), { recursive: true })
  const resize = j.h
    ? { width: j.w, height: j.h, fit: j.fit }
    : { width: j.w, fit: j.fit }
  let pipe = sharp(join(SRC, j.src))
  if (j.extract) pipe = pipe.extract(j.extract)
  if (j.trim) pipe = pipe.trim({ threshold: 16 })
  await pipe.resize(resize).webp({ quality: j.q }).toFile(dest)
  console.log('wrote', dest)
}
console.log(`done: ${JOBS.length} assets`)
