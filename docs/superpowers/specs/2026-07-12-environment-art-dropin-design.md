# Environment art drop-in (Approach A)

**Date:** 2026-07-12
**Scope:** First pass of the graphics upgrade. Wire the already-generated environment assets into the game via the drop-in texture-key seam. Cars stay procedural. Markings/atlases/blend-heavy FX are deferred to a later pass.

## Goal

Replace procedural placeholder textures with authored art for the assets that map **1:1 onto an existing texture key** and require **no new placement logic**. This validates the full load → optimize → render pipeline across several asset types while touching zero game logic.

## Non-goals (explicitly deferred)

- Car / vehicle sprites — remain procedural (`paintCarTexture`).
- Track markings, kerbs, start/finish line — currently drawn as graphics strokes; converting to placed sprites needs new code.
- Multi-item **atlases** (track-surface decal set, track-furniture set, edge + dashed-line pieces) — need slicing + placement logic.
- Blend-sensitive / non-1:1 FX: explosion, mine blast, muzzle flash, bullet tracer, damage smoke, headlight glow cone. Explosions have no single texture key (built from `spark`/`ring`/`scorch` + particles).
- Unused-so-far assets: concrete/pit-lane surface, jersey barrier, burnt-out car wreck.

## Architecture: hybrid boot

`BootScene` remains the swap seam (its own comment already anticipates this). Today it only paints procedural textures in `create()`. Change:

- Add `preload()` that `this.load.image(key, url)`s the real art under the **same texture keys** the game already uses.
- In `create()`, remove the `paint*` calls for the swapped keys; keep painting everything not yet swapped.
- Game code is untouched — it still references `'asphalt'`, `'pk-cash'`, `'tire-wall'`, etc.

```
preload():  load.image('asphalt',   '/assets/env/asphalt.webp')
            load.image('dirt',      '/assets/env/dirt.webp')
            load.image('tire-wall', '/assets/env/tire-wall.webp')
            load.image('pole',      '/assets/env/street-light.webp')
            load.image('pk-ammo',   '/assets/pickups/ammo.webp')   ... (6 pickups)
            load.image('spark',     '/assets/fx/spark.webp')
            load.image('smoke',     '/assets/fx/smoke.webp')
create():   paintCarTexture(...)              // still procedural (cars out of scope)
            // paintPickupTextures REMOVED     // now loaded
            // paintSmoke/Spark REMOVED         // now loaded
            paintChevron/Debris/Pole?/...      // deferred keys stay procedural
```

Note: `paintPickupTextures` creates all six `pk-*` keys in one call; since all six are being swapped, the whole call is removed. `spark` and `smoke` come from their own paint functions (`paintSparkTexture`, `paintSmokeTexture`) — remove those calls individually. `pole` is painted by `paintPoleTexture`; it is being swapped, so remove it. Any paint function whose key is NOT in the swap list stays.

## Asset-prep pipeline

| Decision | Choice | Rationale |
|---|---|---|
| Served location | `public/assets/{env,fx,pickups}/` | Phaser convention; served at web root, referenced by absolute path, no import wiring |
| Format | WebP | ~4–8× smaller than raw PNGs, preserves alpha, universal modern-browser + Phaser support |
| Optimize tool | one-shot `scripts/optimize-assets.mjs` using `sharp` (new devDependency) | no ImageMagick/sharp currently installed; Node is available |
| Sizing | resize each asset to ~2× its in-game footprint (retina headroom), re-encode WebP | raw PNGs are 1024²–1536² and 1–2.5 MB each; far larger than needed |
| Raw sources | stay in `Cars/` (untracked, local only) | large originals do not belong in git |
| Committed artifacts | optimized `public/assets/**/*.webp` + `scripts/optimize-assets.mjs` | reproducible and lightweight |

`optimize-assets.mjs` is a plain one-shot script (documented mapping of source PNG → output path + target size). It is run manually when assets change, not part of `npm run build`.

## In-scope swap mapping

| Texture key | Source file (`Cars/output/generated/`) | In-game use | Target size (approx) |
|---|---|---|---|
| `asphalt` | `dark_grungy_wet_asphalt.png` | `tileSprite`, masked to track | 512² seamless |
| `dirt` | `off_track_dirt_dry_sandy_ground.png` | `tileSprite`, tinted by `theme.ground` | 512² seamless |
| `tire-wall` | `red_white_tyre_wall_segment.png` | `add.image` every 54px along wall line | ~128 px wide |
| `pole` | `amber_street_light_top_down.png` | `add.image` at outer boundary; existing ADD glow stays separate | small (~48 px) |
| `pk-ammo` | `pickup_weapon_ammo_crate.png` | pickup sprite (~1/3 car width) | ~96² |
| `pk-cash` | `pickup_cash_money.png` | pickup sprite | ~96² |
| `pk-repair` | `pickup_repair_wrench.png` | pickup sprite | ~96² |
| `pk-turbo` | `pickup_turbo_boost.png` | pickup sprite | ~96² |
| `pk-trap` | `pickup_hazard_skull_booby_trap.png` | pickup sprite (`trap` = booby-trap) | ~96² |
| `spark` | `fx_spark_burst.png` | FX, may use ADD blend | ~128² |
| `smoke` | `fx_smoke_puff.png` | particle emitter texture | ~128² |

**Verify-and-revert rule:** `spark` and `smoke` are the risky ones (particle/blend usage). Include them; if either reads wrong in the browser (e.g. baked color fights ADD blend, or the detailed texture looks noisy at particle scale), revert that single key back to its `paint*` call. Everything else is a plain opaque/alpha sprite and should be a safe swap.

`PickupType` has **five** values (`ammo`, `turbo`, `repair`, `cash`, `trap`), so five `pk-*` keys are swapped. `pickup_mine.png` has no matching pickup type and is **left unused** this pass (the in-world deployed-mine key `mine` is a different, procedural texture and stays procedural).

## Error handling / edge cases

- If a `load.image` fails (missing/renamed file), Phaser logs and the key is absent → the sprite renders as a green box. Mitigation: after wiring, the browser smoke test must confirm every swapped sprite renders as real art, not a missing-texture box.
- Deployed-mine texture key `mine` (the armed in-world mine) is **not** the same as pickup `pk-mine`; leave `mine` procedural.
- `dirt` is tinted by `theme.ground`. A full-color WebP tinted may look off; verify. If the tint clashes, either drop the tint for the loaded dirt or keep dirt procedural (treat like spark/smoke: verify-and-revert).

## Testing / verification

1. `npm run build` — strict TypeScript check + production build passes.
2. `npm test` — full Vitest suite green (no test touches BootScene rendering, but guards regressions).
3. `git diff --check` — no whitespace errors.
4. Browser smoke (`npm run dev`, load a race):
   - Track asphalt + off-track dirt render as real art at correct scale, no seams, no missing-texture boxes.
   - Tyre walls and street-light poles render as real art.
   - All six pickups render as real art with correct alpha and scale.
   - Trigger a skid/impact to view `smoke` (particles) and `spark`; confirm they read correctly or revert.
   - No visible perf regression; check total WebP payload is small (target: whole `public/assets/` well under a few MB).

## Rollback

Each swap is one `load.image` line + one removed `paint*` call. Reverting any single asset = restore its `paint*` call and drop its `load.image` line. Reverting the whole pass = restore BootScene and delete `public/assets/` + the script.
