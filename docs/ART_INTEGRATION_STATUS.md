# Art Integration Status

**Date:** 2026-07-12
**Branch:** `milestones-13-15-ai-and-fixes`
**Scope of this report:** migrating the game from procedural placeholder textures to authored AI-generated art.

---

## 1. TL;DR

The game used to draw **every** texture procedurally at boot (`paint*Texture()` functions → Phaser canvas). We generated a set of top-down art assets (track, barriers, pickups, FX) and have now wired in the **first, safe tier** — the assets that drop straight onto an existing texture key with no new code. Cars are still procedural and are the hardest remaining problem.

| | Count |
|---|---|
| Authored assets generated | ~27 |
| **Wired into the game so far** | **11** |
| Generated but deferred | ~15 |
| Car sprites | **not generated yet** |

Result: track surfaces, tyre walls, street lights, pickups, and two FX now render as real art. Verified live in-race — no reverts needed. 249 tests pass, `tsc` clean.

---

## 2. How the pipeline works (the swap seam)

This is the important part for everything that follows — adding any future asset is the same three moves.

```
 Cars/output/generated/*.png          (raw AI art, ~1–2.5 MB each, local only, untracked)
            │
            │   scripts/optimize-assets.mjs   (sharp: resize + WebP encode)
            ▼
 public/assets/{env,pickups,fx}/*.webp   (small, committed — 260 KB total)
            │
            │   src/game/textures/loadedAssets.ts   (key → url map)
            ▼
 BootScene.preload()   load.image(key, url)   ← real art registered under the key
 BootScene.create()    (no longer paints that key)
            │
            ▼
 RaceScene & co. ask for 'asphalt' / 'pk-cash' / …   →   game code never changes
```

**To add a new asset:** add a row to `optimize-assets.mjs` (source → output + size), run `npm run assets`, add a `{key,url}` to `loadedAssets.ts`, load it in `preload()`, and delete the matching `paint*` call. That's it.

---

## 3. What's DONE — wired and verified

Eleven texture keys now resolve to authored WebP art:

| Texture key | Source art | In-game use |
|---|---|---|
| `asphalt` | dark grungy wet asphalt | tiled track surface (masked to path) |
| `dirt` | off-track dry sandy ground | tiled off-track ground (theme-tinted) |
| `tire-wall` | red/white tyre-wall segment | barrier posts around the circuit |
| `pole` | amber street light (top-down) | light poles on the outer boundary |
| `pk-ammo` | weapon/ammo crate | pickup |
| `pk-turbo` | turbo/boost | pickup |
| `pk-repair` | repair wrench | pickup |
| `pk-cash` | cash/money | pickup |
| `pk-trap` | hazard skull booby-trap | pickup (`trap` type) |
| `spark` | spark burst | impact/collision FX |
| `smoke` | smoke puff | tyre-smoke + exhaust + damage particles |

**Process followed:** design spec → implementation plan → 3 tasks, each with an implementer + independent two-verdict review (spec compliance + code quality) → live browser verification → final whole-branch review (ready to merge) → dead-code cleanup.

**Commits:** `979fc2c` pipeline · `4a79d56` surfaces/walls/poles/pickups · `39abfa4` spark+smoke · `b12465d` remove 7 orphaned paint functions.

---

## 4. What's LEFT — generated but not yet wired

These assets exist in `Cars/output/generated/` but are **not** in the game yet, grouped by why.

### 4a. Needs new placement code (currently drawn as vector strokes, not sprites)
| Asset | Notes |
|---|---|
| Worn white edge + dashed centre-line pieces | today the lane lines are `graphics.strokePoints`; real art needs segment placement along the path |
| Red/white kerb tile | same — needs path-following placement |
| Start/finish checkered strip | currently a procedural checker; swap needs positioned sprite |

### 4b. Atlases — one image holds many items, needs slicing first
| Asset | Contains |
|---|---|
| Track-surface decal set | ~12 oil stains / skid marks / cracks |
| Track-furniture set | cones, signs, tyre stacks, sandbags |

Each needs slicing into frames (manual coordinates or a texture packer) before any of it can be placed.

### 4c. Blend-sensitive / non-1:1 FX (no single texture key to swap)
| Asset | Why deferred |
|---|---|
| Explosion | built procedurally from `spark`+`ring`+`scorch`+particles — no single `explosion` key |
| Mine blast | same, additive layering |
| Muzzle flash | additive; needs eyeball vs baked color |
| Bullet / tracer | additive blend |
| Damage smoke | uses `smoke` key already, but a dedicated plume asset exists |
| Headlight glow cone | additive cone |

### 4d. Generated but currently unused
| Asset | Reason |
|---|---|
| Cracked concrete / pit-lane surface | no track uses a concrete surface yet |
| Concrete jersey barrier | tyre wall is the only barrier in use |
| Burnt-out car wreck | no wreck props placed on track |
| `pickup_mine.png` | there is no `mine` **pickup** type (`PickupType` = ammo/turbo/repair/cash/trap); the in-world deployed mine is a different, still-procedural texture |

---

## 5. The big one — CARS (not generated, hardest problem)

> **Update 2026-07-13 (Project A, branch `project-a-oxide-theme`):** Superseded for the pre-game screens. Rather than tintable greyscale chassis, the game now uses **specific pre-coloured Iranian 3/4 hero renders** (`car-hero-<id>` keys) for Garage/CarDealer/Menu/Champion, alongside a global "Oxide, grittier" re-theme. See spec `docs/superpowers/specs/2026-07-13-oxide-theme-and-hero-cars-design.md`, plan `docs/superpowers/plans/2026-07-13-oxide-theme-and-hero-cars.md`, and D-052. The **in-race** cars are untouched and remain the deferred **Project B** (true top-down roof-view sprites — note: overhead source renders for these already exist in `cars/green/`). The tint discussion below applies only to Project B.

Cars are still 100% procedural (`paintCarTexture`) and were deliberately left out of this pass. They are **not** a simple drop-in, for one reason:

> The game **recolors cars at runtime**. The player's livery and all 20 rivals get their colour by `setTint` over a grey silhouette, across 3 chassis variants (compact / muscle / sleek). A flat painted PNG can't be recoloured that cleanly.

So before generating car art we have to decide **how liveries work with real sprites**. Options to brainstorm:

| Approach | Idea | Trade-off |
|---|---|---|
| Tintable base | generate greyscale/neutral car sprites designed to accept `setTint` | keeps the 20-driver colour system; art must be lighting-neutral or tint looks flat |
| Per-livery sprites | generate a fixed set of pre-coloured cars, assign to drivers | best-looking; loses free per-driver colour, more assets |
| Base + decal layer | neutral body + a separate tinted accent/stripe layer | flexible; more compositing code |

This deserves its own brainstorm before any car art is generated.

---

## 6. Recommended next steps (in order)

1. **Markings pass (4a)** — biggest remaining *visual* payoff after surfaces. Edge lines, kerbs, start/finish as placed sprites. Needs a small path-placement helper; no slicing.
2. **Furniture + decal atlases (4b)** — slice the two sheets, place cones/signs/decals. Adds a lot of "dressing" detail.
3. **FX pass (4c)** — swap the additive FX one at a time with verify-and-revert (the same discipline we used for spark/smoke).
4. **Cars** — brainstorm the livery/tint model **first**, then generate + integrate. This is the marquee visual upgrade and the most work.
5. **Optional content (4d)** — introduce a concrete-surface track, wreck props, jersey barriers if/when a venue calls for them.

Each of steps 1–4 is its own spec → plan → build → verify cycle, same as this pass.

---

## 7. How to see the current state

```
npm run dev        # then: Continue Career → RACE → any tier
npm test           # 249 tests
npm run build      # strict TS + production build
npm run assets     # re-run the optimizer if source art changes
```

The in-race track now shows: textured wet asphalt, warm sandy off-track dirt, red/white tyre walls, glowing amber street lights, and real pickup crates/icons. Cars remain the procedural coloured silhouettes.
