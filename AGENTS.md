# Deathrally repository guide

Deathrally is an original single-player browser combat-racing game built with strict TypeScript and Phaser. The development name is a working title; do not present it as the eventual release name.

## Non-negotiable creative constraint

The manual, screenshots, and `Ess/` material are research references only. Never copy original art, sprites, audio, names, branding, written copy, exact tracks, or exact UI layouts. Recreate only high-level mechanics with original execution. See `docs/PROJECT_OVERVIEW.md` and `docs/DECISIONS.md`.

## Commands

- `npm run dev` — Vite development server, normally on `http://localhost:5199`.
- `npm test` — complete Vitest suite.
- `npm run build` — strict TypeScript check plus production Vite build.
- `npm run preview` — serve the production build.

Before declaring implementation work complete, run `npm test`, `npm run build`, and `git diff --check`. Browser-test changed scene flows when input, persistence, timing, navigation, or rendering is involved.

## Architecture

- `src/core/` — pure deterministic rules. No Phaser imports. Put career, economy, race, combat, track, vehicle, and AI rules here and unit-test them.
- `src/data/` — typed content and tuning: cars, drivers, weapons, economy, boss, tracks, and market items.
- `src/game/` — Phaser presentation and browser integration.
  - `scenes/` owns scene composition, rendering, navigation, and scene-local UI.
  - `race/` contains extracted runtime/simulation systems and typed race events.
  - `input/` maps configurable keyboard/gamepad state to named actions.
  - `state/` owns browser persistence and the current in-memory race offer.
  - `ui/theme.ts` and `ui/widgets.ts` are the shared visual language; reuse them rather than creating ad-hoc scene styles.
  - `systems/audio.ts` is the synthesized WebAudio facade.
- `tests/` mirrors pure rules and browser-independent game foundations.
- `docs/DECISIONS.md` is authoritative when a historical plan conflicts with an implemented behavior.

Preserve the boundary: core rules must remain serializable and browser-independent; Phaser scenes coordinate presentation rather than becoming the sole owner of game rules.

## Current scene flow

First launch enters `Profile`, then:

`Menu → Garage → SignUp → PrepareRace → Race → Results → Ranking → Garage`

Supporting menu scenes are `Venues`, `HallOfFame`, `Settings`, `Credits`, and `Preview`. `RacePause` overlays and pauses `Race` rather than replacing it. The rank-one duel can route a win to `Champion`.

Every shipped menu action must be visible and keyboard navigable. Every screen needs a visible route back. Remove keyboard listeners on scene shutdown so repeated visits cannot stack handlers.

## Race lifecycle invariants

- `Esc` in a race opens `RacePause`; it must never jump directly to a menu.
- Pausing must freeze simulation, AI, weapons, pickups, timers, and the race clock.
- Confirmed abandon is a committed DNF: no prize, points, or pickup cash; damage persists; starts and loan time advance; one-race gear is consumed.
- Cancelling abandon or resuming must preserve the exact pre-pause race state.
- Weapons-off careers disable player and AI weapons/mines and black-market entry.
- Simulation-affecting randomness comes from the race offer seed. Keep debug seeds and fixed-step hooks reproducible.
- Difficulty changes rival pace, not the economy or player vehicle stats.

## Persistence contracts

- Career key: `deathrally-career-v2`; schema version 2.
- Legacy key: `deathrally-career-v1`; migrate once without losing valid progress.
- Settings key: `deathrally-settings-v1`; resetting a career must not reset settings.
- `CareerState` owns profile, progression, economy, damage, gear, ladder, champion state, and per-track records.
- Settings own volume, mute, bindings, reduced shake/flash, and fire/turbo hold behavior.

New persistent fields require a safe default, serializer/deserializer handling, malformed-value sanitization, and migration tests. Do not make `loadCareer()` the test for whether a save exists because it creates a fresh career; use `hasSavedCareer()`/`readCareer()` where first-launch behavior matters.

## Input and accessibility

Race code consumes named actions from `InputManager`, never direct hard-coded movement keys. Quick one-shot actions such as pause and mute use binding-aware key events; continuous actions are polled. Keep keyboard rebinding and the conventional gamepad mapping functional.

Respect `reducedShake` and `reducedFlash` for every new camera or full-screen effect. Keep the 1920×1080 internal layout readable when scaled to 1280×720.

## Presentation conventions

The visual language is industrial night racing: near-black surfaces, amber focus/actions, distinct tier colors, technical plates, Oswald display type, and JetBrains Mono data type. Use tokens from `src/game/ui/theme.ts` and primitives from `src/game/ui/widgets.ts`.

Player identity should remain visible across the menu, garage, briefing, race HUD, results, ladder, and champion flow. Purchases must state their exact data-derived effect, availability, cost, and whether they last one race.

## Debug and verification

- `?debug=1` exposes `window.__game` and race hooks used for scripted smoke/tuning runs.
- `?gates=1` renders checkpoint gates independently of the normal debug overlay.
- Preserve `__step`, `__autoPilot`, race summaries, seed output, and track-selection hooks when refactoring `RaceScene`.
- For browser smoke tests, cover profile creation, existing-save continue, New Career cancel/confirm, briefing, pause/resume, abandon cancel/confirm, results progression, settings rebinding, and weapons-off market denial as relevant to the change.

Do not commit generated `dist/`, browser screenshots, Playwright state, reference material, or local environment files.
