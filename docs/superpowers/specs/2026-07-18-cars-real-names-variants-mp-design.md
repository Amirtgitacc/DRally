# Real car names, livery variants, posters, menu fix, multiplayer phase 3 — design

Date: 2026-07-18. Approved by user ("go all the way").

## Goals

1. Rename cars to real Iranian-market models.
2. Wire the green-screen livery variants (A/B per car) as selectable cosmetic liveries.
3. Add 206 Anahita as a multiplayer-only car.
4. Show posters instead of hero cutouts when choosing a car.
5. Fix the menu hover-rectangle misalignment.
6. Make the room-code field clearly join-only (behavior stays: server generates codes).
7. Merge multiplayer phase 3 (networked race), playtest it two-tab, then a smoothness/perf pass. Gameplay smoothness beats graphics.
8. Final multi-agent code review with fixes.

## Decisions (user-confirmed)

| Topic | Decision |
|---|---|
| Name mapping | jackal→Daewoo Cielo, vandal→Peykan, marauder→Pride, harrier→Peugeot 405, basilisk→Nissan Vanet, leviathan→Patrol, boss stays The Sovereign |
| Name style | Real names only, replacing codenames in UI. Internal ids (`jackal` etc.) stay unchanged — no save-file migration of ids. |
| 206 Anahita | Multiplayer-only car named "206 Anahita". Top-down: `variants-green/206-Anahita Version.png`. Hero: `/Users/at/Downloads/206anahita.png` (copy into repo). Never appears in career dealer/garage. |
| Variants | Cosmetic only, zero stat changes. Base + A + B per catalog car (labels from the variant prompt doc, e.g. "Ivory Courier"). Chosen livery persists in career save; rivals may use variants for visual diversity. |
| Room codes | Server keeps generating codes. UI relabeled so the code field is clearly join-only. |
| Posters | Car dealer selection shows the poster (converted to webp). Multiplayer car picker gets car art (206 uses keyed hero). Garage/other scenes keep hero cutouts. |
| Base branch | New working branch off `main` (which already contains phase 2 + screen backgrounds). Merge `worktree-multiplayer-phase1` (phase 3 netcode, ahead of origin/multiplayer-phase3) into it first. |

## Architecture notes

- **Asset pipeline**: one-off Node script (scratch, not shipped) chroma-keys `#00ff00`-family green to alpha with despill, trims, resizes variants to match existing `public/assets/cars/top/*.webp` sprite scale, outputs webp. Posters → webp (~1024w). 206 hero keyed → webp matching `hero/` set.
- **Data**: `CarSpec` gains `realName`-style rename (just change `name`) and `variants: CarVariantSpec[]` (`key`, `label`, texture suffix). `src/data/` also gains the 206 Anahita spec in a multiplayer-cars module (not in `CAR_CATALOG`, similar to how `boss.ts` sits outside).
- **Textures**: extend `loadedAssets.ts` with `car-top-<id>-a/b`, `car-top-anahita`, `car-hero-anahita`, `poster-<id>` keys.
- **Persistence**: `CareerState` gains chosen variant key with safe default `'base'`, sanitization of malformed values, migration tests. Settings untouched. Schema version stays 2 (additive field with default).
- **Protocol**: lobby/join/create messages carry `variantId` alongside `carId`; server validates against known variants; snapshots unaffected (texture chosen client-side from lobby info).
- **Menu fix**: root-cause first (hard-coded `PLATE_*` constants vs background transform under scaling). Fix must derive focus-rect geometry from the same transform applied to the background art; verify by screenshot at 1280×720, 1920×1080, ultrawide.
- **Perf pass**: measure with browser performance traces during a networked race; reduce particle counts/additive FX/glow only where frame times justify it; respect reducedShake/reducedFlash paths.

## Verification per phase

Unit tests (`npm test`), strict build (`npm run build`), `git diff --check`, plus browser verification for UI phases and a scripted two-tab create→join→ready→autopilot-race→finish loop for multiplayer. Final phase: multi-agent adversarial code review, verified findings fixed, full re-run.
