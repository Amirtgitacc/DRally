# Art Integration — Phase 3 (FX) & Phase 4 (Cars) Handover

**Date:** 2026-07-13
**Branch:** `milestones-13-15-ai-and-fixes`
**For:** a fresh session starting Phase 3, then Phase 4.
**Authoritative roadmap:** `docs/superpowers/specs/2026-07-12-art-integration-design.md` (§3 roadmap, §4.9 Phase 4 decision, §5 working order). Read it first — this handover adds the current state and the code-level detail that spec doesn't have.

---

## 0. Read-me-first for the new session

1. This is a real, shipping TypeScript + Phaser game. Read `AGENTS.md` and `CLAUDE.md` before touching anything.
2. **Don't invent behavior from the roadmap** — `docs/DECISIONS.md` and the actual source win over any historical plan.
3. Process: each phase is its own **brainstorm → spec → plan → subagent-driven execution → final review** cycle, exactly like Phases 1–2. Start Phase 3 by invoking `superpowers:brainstorming`. Do **not** jump straight to code.
4. Nothing is merged to main. The user reviews/commits; **never merge or push to main without explicit permission** (their standing rule). Commit per-task during execution is fine (that's the established flow).

## 1. What's already done (Phases 0–2, all committed on this branch)

| Phase | What shipped | Commits |
|---|---|---|
| 0 | 11 texture keys → authored WebP (surfaces, tyre wall, pole art, 5 pickups, spark, smoke) | pre-existing (`979fc2c`…`b12465d`) |
| 1 | Markings: edge lines, corner kerbs, start/finish sprite + `placeSpritesAlong` + `spacedPosesAlong` | in checkpoint `0ed63c0` |
| 2 | Atlases: 12 surface decals + 8 furniture props, `scatterPointsAlong`, `scatterImages`, two-pass optimizer | `939c42e`…`da724dc` |

**Verify state at handover:** 257 tests pass · `npm run build` clean · `git diff --check` clean · working tree clean.

**SDD progress ledger** (per-task status, reviews, browser-verify notes, tuning notes): `.superpowers/sdd/progress.md`. Read it to see how Phases 1–2 were executed and the reusable browser-drive recipe.

## 2. The swap seam (unchanged — every asset uses this)

```
Cars/output/generated/*.png   (raw AI art, local, untracked)
   │  scripts/optimize-assets.mjs   (sharp: [extract] → [trim] → resize → WebP)   run: npm run assets
   ▼
public/assets/{env,pickups,fx,cars}/*.webp   (small, committed)
   │  src/game/textures/loadedAssets.ts   (key → url;  LOADED_TEXTURES + LOADED_FX_TEXTURES)
   ▼
BootScene.preload()  auto-loops both arrays → load.image(key,url)   ← no BootScene edit to ADD a key
BootScene.create()   delete the matching paint*() call so the real art wins under that key
   ▼
RaceScene & co. ask for the key → game code unchanged (for a true 1:1 swap)
```

**Optimizer capability note (added in Phase 2):** `optimize-assets.mjs` now does **two-pass** (`extract` to a PNG buffer, then `trim`) whenever a job sets **both** `extract` and `trim` — sharp throws `bad extract area` on some cells one-pass. Jobs with only one of them keep the original single-pass path. FX are single sprites (no slicing), so they'll use plain `fit:'inside'` rows like `spark`/`smoke` already do.

## 3. PHASE 3 — FX

### 3.1 Discipline: verify-and-revert per asset
FX are **additive-blended** and color-baked. Unlike a surface swap, a baked-color PNG under `ADD` blend can wash out, tint wrong, or over-brighten. So Phase 3 ships **one FX at a time**, browser-verifies it in a live fight, and **reverts that single asset** if it looks worse than the procedural version — then reports shipped-vs-reverted. This is exactly how spark/smoke were done in Phase 0 (both kept). Do not batch-swap all FX and hope.

### 3.2 Available source art (in `Cars/output/generated/`, none wired yet)
`fx_explosion.png` · `fx_mine_blast.png` · `fx_muzzle_flash.png` · `fx_bullet_tracer.png` · `fx_damage_smoke.png` · `fx_headlight_glow_cone.png`
(`fx_spark_burst.png` + `fx_smoke_puff.png` are already wired as `spark`/`smoke`.)

### 3.3 The critical distinction — 1:1 keys vs. composites
Some FX are a **single texture key** you can swap cleanly; others are **built procedurally from several layers** and have **no single key** to swap. Check the code before promising a swap:

| FX | Today (procedural) | Swap difficulty |
|---|---|---|
| Muzzle flash | painted key (`paintEdgeFlashTexture`/flash art) at gunfire | **1:1-ish** — add `muzzle` key, swap the image; watch ADD blend |
| Bullet / tracer | `paintBulletTexture` → `bullet` key | **1:1-ish** — add `tracer` key |
| Headlight cone | `car.headlights: Image[]` (see `RaceScene.ts:134`), likely `glow-soft`/flame-cone | **1:1-ish** — add `headlight` key, additive cone |
| Damage plume | already uses the `smoke` key | **optional** — dedicated `fx_damage_smoke` plume vs. reuse `smoke` |
| **Explosion** | **composite**: `spark` + `ring` + `scorch` + `explosionSmoke` particles (`RaceScene.ts:255`, `detonateMine`/crash FX) | **hard** — no single `explosion` key; either add `fx_explosion` as one more additive layer, or leave procedural |
| **Mine blast** | **composite**, same additive layering as explosion | **hard** — same as above |

`paint*` texture functions live in `src/game/textures/` and are wired in `BootScene.create()` (`BootScene.ts:47–56`). **Keep `paintGlowTexture` (`glow-soft`)** — it drives cat-eye reflectors and light pools and is not an FX to replace.

### 3.4 How to start Phase 3
1. `superpowers:brainstorming` — decide, per FX, whether it's a clean key swap, an added additive layer, or left procedural. The explosion/mine-blast composites are the real design question. Also decide the ship-vs-revert bar (what "looks worse" means).
2. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-art-integration-phase3-fx.md`.
3. `superpowers:writing-plans` → one task per FX asset (add optimizer row → add `LOADED_FX_TEXTURES` key → swap/layer → browser-verify → keep or revert), because each must be independently reviewable and revertible.
4. Execute with `superpowers:subagent-driven-development`. **Browser verification is controller-only** (subagents can't drive Chrome) — see §5 for the recipe. Report shipped-vs-reverted in the ledger.

### 3.5 Risks
- ADD-blend + baked color = washed/oversaturated FX (the whole reason for verify-and-revert).
- FX fire fast and briefly — verify in an actual weapons-on fight (DEATH tier, drive into rivals/mines), not a static frame.
- Respect `reducedShake`/`reducedFlash` — any new full-screen flash must honor them (`AGENTS.md`).
- Deferred, not Phase 3: `generic_burnt_out_car_wreck.png`, `concrete_jersey_barrier_segment.png`, `cracked_concrete_pit_lane_surface.png` — no venue/prop uses them yet (design §4d).

## 4. PHASE 4 — Cars (marquee; needs art gen + its own brainstorm)

### 4.1 The locked decision (design §4.9)
Use the **tintable-base** model: generate **3 lighting-neutral greyscale chassis** (`compact` / `muscle` / `sleek`, ~128×64, top-down facing +x). Register as `car-compact` / `car-muscle` / `car-sleek`. Delete `paintCarTexture`. Keep the runtime `setTint(liveryColor)` so all 20 rivals + player + boss keep free per-driver colour.

### 4.2 Two things that make Phase 4 more than a drop-in
1. **Art must be generated first** — the 3 chassis PNGs do **not** exist yet. Phase 4 opens with a brainstorm on the generation prompt: shading must be **tint-neutral** (mid-grey, even lighting) or `setTint` flattens the colour. Generate → eyeball → commit only if tint-neutral.
2. **Re-keying, not a pure swap.** Today every driver gets a **unique baked texture per driver** and *then* a tint:
   - `paintCarTexture(scene, key, bodyColor, accentColor, variant)` — `vehicleTextures.ts:160`
   - painted in `BootScene.create()` as `car-<id>` (player), `car-<id>-<variant>` (rivals ×3 variants), `car-<BOSS.id>` — `BootScene.ts:35–44`
   - referenced by **variant/id** at sprite-creation time in several scenes:
     `RaceScene.ts` (rival `chassisId`, ~1298; player sprite; wreck/tint at 773–774, 848), `ChampionScene.ts:46` (`car-${career.carId}`), `MenuScene.ts:60` (`car-${career.carId}`), `NewCareerScene.ts:106`.
   The tintable-base model means **one texture per variant** shared by all drivers. So the work is: register 3 variant keys, delete the per-driver paint calls, and **repoint every `car-<id>` / `car-<id>-<variant>` / `car-${career.carId}` lookup to the driver's variant key** (`car-<variant>`). That indirection (driver → variant → key) is the bulk of Phase 4 and touches Boot, Race, Champion, Menu, and NewCareer scenes. The `setTint` calls themselves stay.

### 4.3 How to start Phase 4
1. `superpowers:brainstorming` — first the generation prompt (tint-neutral shading, 3 variants, orientation, size), then the re-keying plan (driver→variant mapping, which scenes, boss handling).
2. Generate the 3 chassis, optimize to `public/assets/cars/*.webp`, commit only if tint holds.
3. Spec → plan → subagent-driven execution. Browser-verify tint across: garage preview, race grid (many rivals, distinct colours), champion, menu, new-career livery picker, and **wrecked** tint (`0x2c2c30`).

### 4.4 Risks
- Non-neutral shading → tinted colours look muddy/flat. This is the whole gamble; settle it in the brainstorm before generating final art.
- Missing a `car-<id>` lookup → a scene renders a blank/wrong sprite. Grep every `car-` usage (§4.2 list) and cover each.
- Boss uses a fixed `sleek` variant with its own colours — confirm it still reads as the boss after re-keying.

## 5. Process pointers (carry over from Phases 1–2)

- **SDD tooling** lives in the skill dir: `scripts/task-brief PLAN N`, `scripts/review-package BASE HEAD`, workspace under `.superpowers/sdd/`. Ledger: `.superpowers/sdd/progress.md` (append per task; it survives compaction — trust it + `git log` over memory).
- **Model tiers:** cheap (haiku) for transcription tasks whose plan has full code; standard (sonnet) for integration/visual-judgment; opus for the final whole-branch review. Always set `model` explicitly on every dispatch.
- **Browser verification is controller-only.** The background tab is rAF-throttled and the race camera follows the player, so:
  - Drive scenes programmatically via `window.__game` (needs `?debug=1`):
    `Menu.selected=0; Menu.activate()` → pump → `Garage.selected=6; Garage.activate()` (tile 6 = RACE) → pump → `SignUp.selected=0; SignUp.confirm()` → pump → `PrepareRace.input.keyboard.emit('keydown-ENTER')` → pump.
  - Pump the loop manually between/within steps: `for(i…) g.loop.step(performance.now()+i*16)` (scene transitions are async and won't advance on a throttled tab otherwise).
  - To frame a spot, teleport the player car (`race.cars.find(c=>c.isPlayer).state.x/y = …`) so the follow-camera lands there; you can't hold a manual camera across a `loop.step` (update re-follows).
  - Inspect display objects directly: `race.children.list` filtered by `texture.key` to count/verify sprites, depths, alpha — this is the most reliable verification and how Phases 1–2 confirmed placement.
  - **Heads-up:** driving real races mutates the user's local career save (`deathrally-career-v2`). Don't let a verification race complete unless you intend to; it's their dev save.
- **Optimizer** already supports `extract`+`trim` two-pass (Phase 2). FX/cars are single sprites → simple `fit:'inside'` rows.
- **Depth bands in use** (so new FX/props slot correctly): dirt 0 · shoulder 0.5 · asphalt 1 · markings 1.5 · cat-eye 1.6 · light pools 1.7 · decals 1.8 · skid RT 2 · mines 2.4 · pickups 2.5 · tyre walls + furniture 3 · chevrons 3.1 · cars ~5 · crash flash 7.

## 6. Suggested order

Phase 3 first (lower risk, no art-gen, immediate polish), then Phase 4 (marquee, needs generation + re-keying). Each is its own full cycle. After Phase 4, only design §4d optional content (concrete surface, jersey barriers, wreck props) remains — introduce those only when a venue/prop actually needs them.
