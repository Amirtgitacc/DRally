# Real Names, Livery Variants, Posters, Menu Fix, MP Phase 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename cars to real Iranian-market models, add selectable cosmetic livery variants (+ MP-only 206 Anahita), show posters in car selection, fix menu hover alignment, clarify room-code UI, merge + verify + smooth networked multiplayer, then a final multi-agent review.

**Architecture:** Work happens on a new branch off `main` with the phase-3 netcode branch merged in first. Assets follow the existing pipeline (green sources in ignored `cars/green/` → `scripts/cutout-*.py` (rembg+despill) → `cars/output/generated/` → `scripts/optimize-assets.mjs` (sharp) → shipped webp in `public/assets/`). Variants are cosmetic-only data on `CarSpec`; chosen livery persists in `CareerState` (career) and travels in the lobby protocol (MP).

**Tech Stack:** TypeScript strict, Phaser 3.87, Vitest, Vite, Node WS server, sharp, Python rembg/PIL.

## Global Constraints

- Internal car ids (`jackal`, `vandal`, …) never change — no save-file id migration.
- Variants are cosmetic only: zero stat changes; difficulty and economy untouched.
- Name mapping (exact `name:` values): jackal→`Daewoo Cielo`, vandal→`Peykan`, marauder→`Pride`, harrier→`Peugeot 405`, basilisk→`Nissan Vanet`, leviathan→`Patrol`, boss stays `The Sovereign`. New MP car: id `anahita`, name `206 Anahita`.
- `anahita` is multiplayer-only: never in `CAR_CATALOG`, never in dealer/garage/career.
- Room codes stay server-generated; UI must stop implying otherwise.
- Simulation-affecting randomness only from the race offer seed; rival variant assignment must be seed-derived.
- Persistence contract: new fields need safe default, sanitization, migration tests. Career schema stays v2 (`deathrally-career-v2`), settings untouched.
- Do not commit: `.claude/`, `cars/`, `dist/`, screenshots, Playwright state.
- Verify before "done": `npm test`, `npm run build`, `git diff --check`; browser-test changed scene flows.
- Never merge to `main` or push; all commits stay on the working branch.

---

### Task 1: Branch + source-asset housekeeping

**Files:**
- Create branch `feat/cars-real-names-mp` from `main`.
- Move: `public/assets/cars/top/variants-green/*` → `cars/green/variants/` (ignored source material; do NOT ship RGB green-screen PNGs).
- Copy: `/Users/at/Downloads/206anahita.png` → `cars/green/variants/206-anahita-hero.png`.
- Move: `public/assets/cars/top/posters/*` → `cars/output/posters-src/` (they are alpha-less full-scene PNG sources; shipped form will be webp produced in Task 3).
- Commit: `docs/CAR_POSTER_PROMPTS.md`, `docs/TOP_DOWN_CAR_VARIANT_PROMPTS.md`, spec + this plan.

**Steps:**
- [ ] `git switch -c feat/cars-real-names-mp main` (untracked files carry over).
- [ ] Move/copy assets as listed; `git status` must show no `public/assets/cars/top/variants-green` or `top/posters` remnants.
- [ ] Commit docs only (`git add docs/ && git commit`). `.claude/`, `cars/` stay untracked.

### Task 2: Merge multiplayer phase 3

**Files:**
- Merge branch `worktree-multiplayer-phase1` (19 commits ahead of `origin/multiplayer-phase3`; contains RaceScene net integration, `NetworkSource`, `LocalPredictor`, interpolation, server race host).
- Likely conflicts: `src/game/scenes/RaceScene.ts`, `src/game/scenes/MenuScene.ts`, `src/game/textures/loadedAssets.ts`, `src/main.ts` (mainline gained screen backgrounds + livery glow after the worktree branched).

**Interfaces produced (already exist in that branch, later tasks rely on):**
- `src/core/net/protocol.ts` — `ClientMsg`/`ServerMsg` unions, `create`/`join` messages with `{ name, carId }`.
- `server/rooms.ts` `RoomStore.createRoom`, `server/raceHost.ts` (30 Hz tick), `src/game/race/raceSource.ts` `NetworkSource`.

**Steps:**
- [ ] `git merge worktree-multiplayer-phase1` — resolve conflicts keeping BOTH mainline visuals (authored backgrounds, glow pool) and worktree netcode. Read each conflicted file fully before resolving.
- [ ] `npm test` → all green. `npm run build` → green. Fix fallout (imports, scene keys) before continuing.
- [ ] Sanity: `rg "MultiplayerScene|LobbyScene" src/main.ts` shows both registered.
- [ ] Commit the merge.

### Task 3: Process variant/hero/poster art through the pipeline

**Files:**
- Create: `scripts/cutout-variants.py` (mirror `scripts/cutout-topdown.py`: rembg → despill → crop bbox; copy its `despill()` verbatim).
- Modify: `scripts/optimize-assets.mjs` — append JOBS entries.
- Output (shipped): `public/assets/cars/top/variants/<id>-a.webp`, `<id>-b.webp` (7 cars: jackal, vandal, marauder, harrier, basilisk, leviathan, sovereign), `public/assets/cars/top/anahita.webp`, `public/assets/cars/hero/anahita.webp`, `public/assets/cars/posters/<id>.webp` (8: six catalog + boss + sovereign).

**Key facts:**
- Variant sources face RIGHT already (nose +x) → NO rotation. `206-Anahita Version.png` faces UP → rotate 90° CW like `cutout-topdown.py` does. Hero source gets no rotation.
- Match existing top sprite scale: existing `top/*.webp` are 220 px wide; encode variants at w=220 `fit:'inside'`, q=85. Posters: w=768, q=82. Hero: match `hero/*.webp` size (460 px wide), q=85.

**Steps:**
- [ ] Verify rembg importable (`python3 -c "import rembg"`); if missing, `pip install --user "rembg[cpu]" onnxruntime pillow numpy`.
- [ ] Write + run `scripts/cutout-variants.py` over `cars/green/variants/` → `cars/output/generated/variants/`.
- [ ] Append optimize JOBS; run `npm run assets`.
- [ ] Visually verify EVERY output webp (Read tool): transparent background, no green fringe, correct orientation, size matches base sprite of same chassis.
- [ ] Commit script changes + shipped webp files only.

### Task 4: Register and load new textures

**Files:**
- Modify: `src/game/textures/loadedAssets.ts` — add `LOADED_TOP_VARIANT_TEXTURES` (`car-top-<id>-a/b` → `assets/cars/top/variants/<id>-a.webp` …), add `car-top-anahita`, `car-hero-anahita`, and `LOADED_POSTER_TEXTURES` (`car-poster-<id>` → `assets/cars/posters/<id>.webp`).
- Modify: `src/game/scenes/BootScene.ts` — include the new arrays in the load loop.

**Interfaces produced:** texture keys `car-top-<id>` (base), `car-top-<id>-<variantKey>` (variants), `car-poster-<id>`, `car-hero-anahita`, `car-top-anahita`.

**Steps:**
- [ ] Add arrays + loader entries; `npm run build` green.
- [ ] Browser check (`npm run dev`, `?debug=1`): no 404s in network log, no missing-texture warnings in console.
- [ ] Commit.

### Task 5: Data — real names + variant specs + MP-only car

**Files:**
- Modify: `src/data/cars.ts` — rename `name:` per Global Constraints; add to `CarSpec`:
  ```ts
  export interface CarVariantSpec { key: string; label: string }
  // on CarSpec:
  variants: CarVariantSpec[]  // texture key = `car-top-${id}-${variant.key}`; 'base' = `car-top-${id}`
  ```
  Every catalog car + sovereign gets `[{key:'base',label:'Factory'},{key:'a',label:<from docs/TOP_DOWN_CAR_VARIANT_PROMPTS.md, e.g. 'Ivory Courier'>},{key:'b',label:…}]`.
- Create: `src/data/mpCars.ts` — `export const MP_ONLY_CARS: CarSpec[]` containing `anahita` (name `206 Anahita`, compact-class stats between vandal and marauder, `variants:[{key:'base',label:'Factory'}]`), and `export function mpCarById(id)` searching `CAR_CATALOG` + `MP_ONLY_CARS`.
- Modify: `src/data/boss.ts` — sovereign gains `variants` (base/a/b).
- Test: `tests/core/vehicle/carSpec.test.ts` — names match mapping exactly; every variant key unique per car; anahita absent from `CAR_CATALOG`; `mpCarById('anahita')` resolves.
- Sweep: `rg -i "jackal|vandal|marauder|harrier|basilisk|leviathan" src/ tests/ --type ts` — update any user-visible copy that hardcodes old display names (ids in code stay).

**Steps:** failing tests first → implement → `npm test` green → commit.

### Task 6: Persistence — chosen liveries in career

**Files:**
- Modify: `src/game/state/` career module (locate `CareerState` serializer) — add `liveries: Record<string, string>` (carId → variant key), default `{}`.
- Sanitization: non-object → `{}`; entries whose carId isn't in catalog or whose variant key isn't on that car → dropped.
- Test: mirror existing persistence tests — round-trip, legacy v1/v2-without-field loads default `{}`, malformed values sanitized, career reset clears it, settings untouched.

**Interfaces produced:** `career.liveries[carId] ?? 'base'` is THE read path for the player's chosen livery.

**Steps:** failing tests → implement → `npm test` green → commit.

### Task 7: UI — posters, livery pickers, menu hover fix, room-code clarity

Sub-task 7a — **Dealer posters**: `src/game/scenes/CarDealerScene.ts` replace `car-hero-${id}` image (line ~63) with `car-poster-${id}`, `fitImage` into the left panel (portrait 2:3 — size to panel height, keep stats/price panel untouched). Browse swap updates poster texture. Keyboard nav unchanged.

Sub-task 7b — **Garage livery picker**: `src/game/scenes/GarageScene.ts` add a "LIVERY ◄ ► " row (reuse `widgets.tile`), cycling the owned car's `variants`; writes `career.liveries[carId]`, saves via existing save path; shows variant label. Keyboard + visible route back preserved.

Sub-task 7c — **Menu hover fix**: root-cause FIRST (superpowers:systematic-debugging). Reproduce at 1280×720, 1920×1080, and an ultrawide/mobile viewport with dev server + screenshots. Lead suspect: hard-coded `PLATE_X/Y/W/H` constants (`src/game/scenes/MenuScene.ts:22-27`) vs `sceneBackground.cover()` transform; also verify scale mode wasn't changed by mobile work. Fix must compute focus-rect geometry from the background image's actual displayed transform (expose a helper from `src/game/ui/sceneBackground.ts` returning `{scale, offsetX, offsetY}` and map authored art-space coords through it). Add `tests/game/ui/menuPlateAlignment.test.ts` mapping known art-space plate centres through the helper for cover scale 1.0 and a cropped case. Screenshot-verify all three sizes after.

Sub-task 7d — **Room-code clarity**: `src/game/scenes/MultiplayerScene.ts` — retitle field to `ROOM CODE — TO JOIN A FRIEND`, and when CREATE ROOM is highlighted show helper text "a fresh code will be generated for you"; typed code must never look like an input to CREATE. Lobby already shows the assigned code + copy.

Sub-task 7e — **MP picker art + variants + anahita**: `MultiplayerScene.ts` car row cycles `CAR_CATALOG + MP_ONLY_CARS`; render selected car's poster (`car-poster-<id>`; anahita → `car-hero-anahita`) beside the form; add `LIVERY` row cycling that car's variants; persist last picks in the scene's existing localStorage prefs if present.

**Steps per sub-task:** implement → `npm test` + `npm run build` → browser screenshot verify → commit (one commit per sub-task).

### Task 8: Variant over the network + in-race rendering

**Files:**
- Modify: `src/core/net/protocol.ts` — `create`/`join` client msgs gain `variantId: string`; lobby player payload gains `variantId`.
- Modify: `server/index.ts` + `server/rooms.ts` — accept/validate `variantId` via `mpCarById(carId)`; unknown → `'base'`. `server/raceSetup.ts` — thread `variantId` into `RaceCarInfo`; AI fill picks seed-derived variants.
- Modify: `src/game/race/` unit creation (RaceScene `makeUnit` path) — resolve texture: `variant === 'base' ? car-top-${id} : car-top-${id}-${variant}`; career races: player uses `career.liveries`, rivals get seed-derived variant (use race offer seed, not `Math.random`); MP races: use lobby `variantId`s.
- Tests: `tests/core/net/protocol.test.ts` + `tests/net/raceSetup.test.ts` — variantId round-trips, invalid variant sanitized to `'base'`, same seed → same rival variants.

**Steps:** failing tests → implement → `npm test` + build green → commit.

### Task 9: Two-tab networked playtest + smoothness/perf pass

- [ ] Start WS server + `npm run dev`. Drive TWO browser tabs (chrome-devtools MCP): tab A create room (verify code display, room-code field clarity), tab B join via code; both ready; add 1 AI; race with `?debug=1` autopilot (`__autoPilot`) until `raceEnd`; assert both tabs reach results, consoles free of errors, no desync (positions agree at finish).
- [ ] Repeat the loop after any fix (this is the regression loop for every later change).
- [ ] Perf: record a performance trace during the networked race in each tab. If frame time p95 > 16.7 ms, apply in order and re-measure: (1) cap/reduce particle emitter frequencies (exhaust `RaceScene.ts:~1136`, damage smoke, turbo sparks), (2) pool/limit additive-blend FX (fireball/shockwave rings), (3) drop `postFX.addGlow` on non-essential elements, (4) reduce livery-glow pool cost. Gameplay/netcode smoothness (interp delay 66 ms, 30 Hz tick) is only tuned if the playtest shows visible rubber-banding — smaller steps first (e.g. interp delay to 100 ms for stability or snapshot buffer trim).
- [ ] Verify `reducedShake`/`reducedFlash` paths still respected. Commit tuning as its own commit with before/after p95 numbers in the message.

### Task 10: Final multi-agent review + fixes + full verification

- [ ] Run a multi-agent adversarial review (Workflow tool; user opted in) over `git diff main...HEAD` + the merged MP architecture: dimensions = correctness/race-invariants, architecture boundaries (core vs game per AGENTS.md), persistence contract, perf, UX/accessibility. Each finding adversarially verified before acceptance.
- [ ] Fix confirmed findings; re-run `npm test`, `npm run build`, `git diff --check`, and the Task 9 two-tab loop once more.
- [ ] Final browser smoke: profile → menu (hover aligned) → garage (livery picker) → dealer (posters) → MP create/join → race → results.
- [ ] Final commit; report with verification evidence.
