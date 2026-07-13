# Design — Project B: in-race top-down car sprites

**Date:** 2026-07-13
**Status:** Brainstorm complete, decisions locked. **Written for a fresh session to continue** (go straight to `superpowers:writing-plans`, then `superpowers:subagent-driven-development`).
**Depends on:** Project A (merged to `main` at `beeb68c`) — the pre-game screens already use `car-hero-<id>` renders; do not re-touch them.
**Supersedes:** the "tintable greyscale chassis / setTint per driver" plan in `docs/superpowers/2026-07-13-art-integration-phase3-4-handover.md` §4 and `docs/ART_INTEGRATION_STATUS.md` §5, and D-052's Project-B note.

---

## 0. Read-me-first for the new session

1. Real, shipping TypeScript + Phaser game. Read `AGENTS.md` + `CLAUDE.md` first. `docs/DECISIONS.md` and the actual source win over any historical plan.
2. The **brainstorm is already done** (this doc is its output). Do NOT re-brainstorm. Start at `superpowers:writing-plans` to turn this into a task plan, then execute with `superpowers:subagent-driven-development` (per-task implementer + spec/quality review, whole-branch review at the end). That is the established flow — see `.superpowers/sdd/progress.md` for how Project A ran (the reusable browser-drive recipe + throttled-tab pump are documented there).
3. **Never merge/push to main without explicit user permission** (standing rule). Commit per task during execution.
4. This is a **presentation + cleanup** change. No gameplay/simulation/economy/AI change. The race sim (`src/core`) is untouched.

## 1. Goal

The in-race cars are still procedural: painted at boot by `paintCarTexture` as grey silhouettes and `setTint`-ed per driver. Replace them with the **real top-down Iranian car sprites** the user generated, mapped to the chassis ladder, and delete the procedural car pipeline.

## 2. Locked decisions (from the brainstorm)

| # | Decision |
|---|---|
| B-1 | **Real sprites by chassis; drop per-driver tint.** Every driver's on-track sprite = its chassis's top-down sprite. Rivals stay trackable via the **colour-coded standings list** (already renders each `car.color`, `RaceScene.ts:2455`). No `setTint` for livery/body colour. |
| B-2 | **Delete the procedural car pipeline.** Remove `paintCarTexture` calls + the 3-variant loop from `BootScene.create` once every consumer uses a real sprite. (`paintCarTexture` in `src/game/textures/vehicleTextures.ts` becomes dead — remove it and its import too.) |
| B-3 | **Remove the New Career livery-colour picker.** Real sprites can't be tinted. `NewCareerScene` drops the colour selection; the starter car shows its **hero render** (`car-hero-jackal`), which also fixes the Project-A final-review note that New Career still showed the old procedural car. |
| B-4 | **Boss gets a distinct car.** The user generated a unique top-down boss (`Sovereign2.png`) for the race and a 3/4 hero (`Sovereign.png`) for the pre-duel reveal. |
| B-5 | **Wreck darkening stays.** `setTint(0x2c2c30)` on wreck (`RaceScene.ts:789,864`) multiplies a real coloured sprite → reads as burnt. Keep it. The white hit-flash `setTintFill(0xffffff)` (`:784`) also stays (works on any sprite). |

## 3. Source assets → chassis mapping

All sources are in `cars/green/`, true top-down roof view, nose pointing UP, green screen. Vehicle identity per chassis matches the Project-A hero renders.

| Chassis id | Top-down source (`cars/green/`) | New texture key |
|---|---|---|
| `jackal` | `Pride4.png` (Pride "111") | `car-top-jackal` |
| `vandal` | `taxi peykan2.png` (Peykan "33") | `car-top-vandal` |
| `marauder` | `Cielo Dawoo.png` (Cielo "21") | `car-top-marauder` |
| `harrier` | `405.png` (Peugeot-405, generated) | `car-top-harrier` |
| `basilisk` | `nissan vanet.png` (Nissan "24") | `car-top-basilisk` |
| `leviathan` | `Patrol nissan.png` (Patrol "74") | `car-top-leviathan` |
| boss (`BOSS.id`) | `Sovereign2.png` (armoured, generated) | `car-top-sovereign` |

Plus one **hero** render for the boss reveal (see §5d):

| Use | Source | Key |
|---|---|---|
| Boss pre-duel reveal + portrait | `Sovereign.png` (3/4 hero, generated) | `car-hero-sovereign` |

(The `p405.png` 3/4 hero is an alternate for harrier's pre-game hero — NOT needed for Project B; Project A's `car-hero-harrier` stays as-is. Leave `p405.png` unused.)

## 4. Asset pipeline

Same swap seam as Project A. **Two differences from the hero pipeline:**

1. **Rotate to the engine's facing convention.** The procedural cars faced **+x** (heading 0 = east); these sources face **UP (north)**. Bake a **90° clockwise** rotation into the cutout so the nose points +x, so the existing rotation code (`car.sprite` follows `car.state.heading`, `RaceScene.ts` ~:483, `:610`) needs **no change**. Verify the sign in-browser (a car should point where it drives, not sideways) — if 90° CW is wrong, it's 90° CCW; do not add a code offset, fix the bake.
2. **Cutout = rembg + green-despill** (reuse `scripts/cutout-hero.py`'s `despill`): green-screen spill must be removed or the rusty edges fringe green. Extend that script (or add `scripts/cutout-topdown.py`) with the 7 top-down jobs + the 90° rotation + bbox crop.

Then, exactly like Project A:
- Add optimizer rows to `scripts/optimize-assets.mjs` (source `car_top_<id>.png` → `public/assets/cars/top/<id>.webp`, `fit:'inside'`, `trim:true`, transparent). Boss hero → `public/assets/cars/hero/boss.webp`.
- `npm run assets`.
- Register keys in `src/game/textures/loadedAssets.ts` (`LOADED_TOP_TEXTURES` array + add `car-hero-sovereign` to `LOADED_HERO_TEXTURES`).
- Load them in `BootScene.preload` (add the new array to the loop).
- Do NOT commit source PNGs under `cars/` (AGENTS.md); commit only the `public/assets/cars/top/*.webp` + `public/assets/cars/hero/boss.webp`.

## 5. Code changes (with current line refs — verify before editing)

### a. `RaceScene.ts` — the core swap (in `makeUnit`/spawn block ~1130-1314)
- **Player** (`:1257`): texture `car-${playerCar.id}` → `car-top-${playerCar.id}`; **remove** `player.sprite.setTint(this.career.profile.liveryColor)` (`:1258`).
- **Boss** (`:1275`): `car-${BOSS.id}` → `car-top-sovereign`; remove any boss body-colour tint.
- **Rivals** (`:1300`): `car-${id}-${chassis.variant}` → `car-top-${chassis.id}` (the chassis's top-down sprite). Keep `rival.chassisId = chassis.id` (`:1314`) and keep passing `driver.bodyColor` as the unit `color` — it still drives the standings-list colour. Remove any rival `setTint` for body colour.
- Keep: wreck `setTint(0x2c2c30)`, hit-flash `setTintFill`, `CAR_SCALE` handling, all sim/physics.
- `CAR_SCALE = 0.75` (`:110`) is tuned for the procedural sprite's pixel size. The real webp will be a different native size — **re-tune `CAR_SCALE`** (or size per-key) so cars read at the right on-track scale; settle this in browser during execution.

### b. `BootScene.ts` — delete procedural painting (`:33-43`)
- Remove the `CAR_CATALOG` paint loop, the `ROSTER` × 3-variant paint loop, and the boss paint line.
- Remove the now-unused imports (`paintCarTexture`, `CAR_CATALOG`, `ROSTER` if unused elsewhere in Boot).
- Add the new top-down (+ boss hero) arrays to the `preload` loop.

### c. `NewCareerScene.ts` — remove livery picker, hero starter (`:20,49,84,97,106-125`)
- Delete the livery selection option (the `livery` index, its `LIVERIES` cycling at `:84`, the swatch draw `:122-125`, and the livery entry in the options list/summary `:116`).
- Starter car image (`:49`): `car-${STARTER_CAR.id}` (scale 2.6, angle -90) → `car-hero-${STARTER_CAR.id}` (= `car-hero-jackal`) with `fitImage(...)`, **no angle** (hero renders aren't rotated — see Project A). Import `fitImage`.
- Persistence: `liveryColor` STILL gets written to the save (keep a fixed default, e.g. the current `LIVERIES[0]`, so `CareerState`/schema v2 is unchanged and existing saves load). It is simply no longer player-chosen or displayed. **Do not** bump the schema or migration.
- Name colour that used `LIVERIES[this.livery]` (`:107`) → use `C.oxide`.

### d. `SignUpScene.ts` — boss reveal (`:156`)
- `car-${BOSS.id}` (scale 1.7, angle -90) → the boss **hero** `car-hero-sovereign` with `fitImage(...)`, no angle (it's a pre-game reveal, hero-style like the rest of Project A's pre-game screens).

### e. `src/game/textures/vehicleTextures.ts`
- Once b/a/c/d land, `paintCarTexture` has no callers — delete the function (and any now-dead helpers it alone used). Confirm with a repo-wide grep first.

## 6. What is explicitly OUT of scope / untouched

- All Project-A pre-game screens already on hero renders (Garage, CarDealer, Menu, Champion) — untouched.
- Race simulation, AI, economy, damage, physics, pickups, weapons — untouched. Rival **chassis-from-rank** logic (`:1298`) is reused as-is; only the texture key it maps to changes.
- No `CareerState` schema change (B-3 keeps `liveryColor` with a default).

## 7. Orientation / rotation detail

Engine convention: heading 0 = +x (east), Phaser rotation clockwise-positive in screen space (y-down). Sources face north (up). Bake **90° CW** at cutout so nose → +x; then `sprite.rotation = heading` (existing) is correct. **Verify in-browser**: drive forward, the car nose must point along travel. If it's 90° off, flip the bake direction — never paper over it with a code offset (keeps every consumer consistent).

## 8. Risks

- **Wrong rotation bake** → every car drives sideways. First browser check after wiring one car. Cheap to fix at the bake.
- **CAR_SCALE mismatch** → cars too big/small vs track + collision *visual* (collision uses sim radii, not sprite size, so it's cosmetic, but must look right). Re-tune in browser.
- **Deleting `paintCarTexture` before all four consumers (Race, Boot, NewCareer, SignUp) are swapped** → missing-texture `__MISSING` green boxes. Do the swaps first, delete last; grep `car-\${`/`` `car-` `` to confirm zero procedural refs remain.
- **Green despill on the boss/405** → check edges at scale (magenta backdrop) before committing, like Project A.
- **Standings readability** now carries all rival identity (no on-track colour). Confirm the standings list still colours each rival distinctly and the player row reads (`C.oxide`).

## 9. Verification

- `npm test`, `npm run build`, `git diff --check` clean before "done".
- Browser-verify (controller-only; throttled-tab pump recipe in `.superpowers/sdd/progress.md` / Project-A plan appendix): start a real race and confirm — every car (player, rivals across tiers, boss) is a correct real top-down sprite; nose points along travel; scale reads right; wreck darkens; standings colours intact; New Career shows the hero starter with no livery picker and still starts a career; SignUp shows the boss hero. Do NOT let a verification race complete (mutates the dev save `deathrally-career-v2`).

## 10. Suggested task slicing (for writing-plans)

1. Cutout + optimizer + key registration + Boot preload for the 7 top-down keys + `car-hero-sovereign` (asset pipeline; controller does the cutouts/eyeballing as in Project A). Coverage test: one `car-top-<id>` per `CAR_CATALOG` id + boss.
2. RaceScene swap (player/boss/rivals → `car-top-*`, drop tints) + CAR_SCALE re-tune. Browser-verify rotation + scale here (the make-or-break).
3. NewCareer (remove livery picker + hero starter).
4. SignUp boss hero.
5. Delete `paintCarTexture` + BootScene procedural loops + dead imports; final grep for stray `car-<id>` refs.
6. Docs (D-05x entry, ART_INTEGRATION_STATUS) + memory update + final whole-branch review.
