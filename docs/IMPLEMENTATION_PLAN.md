# Deathrally — Implementation Plan

**Purpose:** turn the current vertical slice into a complete, shippable single-player browser game with a coherent menu flow, safe race lifecycle, strong player identity, and a visual language inspired by the reference without copying its assets or layouts.

**Baseline:** the project currently has the core career loop, six cars, six venues, combat, black market, ladder, final duel, shared UI tokens, 224 passing unit tests, and a successful production build.

## Product target

The next target is **UX-complete vertical slice 2.0**:

- A first-time player can create a profile, understand the controls, start a race, pause safely, abandon a race without exploiting the economy, and resume the career.
- Every major reference menu has an original modern equivalent or an explicit v1 decision.
- The player’s name, livery, combat preference, money, damage, and progression are visible throughout the career.
- The current core gameplay rules remain stable while the Phaser presentation layer becomes easier to extend.
- The game has one fully authored presentation slice before more systems or venues are added.

## Guiding rules

1. Preserve the existing separation: pure rules in `src/core`, tuning/content in `src/data`, Phaser presentation in `src/game`.
2. Do not copy original art, names, written copy, exact layouts, or branding.
3. Do not add multiplayer in this pass.
4. Every destructive action must be confirmed.
5. Every persistent value must have a clear owner, serialization rule, and migration path.
6. The player should always know what they can do next, what a purchase changes, and what a race loss costs.

## Priority summary

### P0 — fix before adding content

- Race pause and abandon flow.
- Prevent the `Esc` race-abort exploit.
- Confirm new-career reset.
- Centralize input bindings.
- Add versioned career-save migration.

### P1 — complete the player-facing loop

- New Career / Driver Profile screen.
- Player name, livery, portrait identifier, weapons preference, and difficulty profile.
- Complete main menu navigation.
- Settings / Controls screen.
- In-race controls/help overlay.
- Hall of Fame records.
- Credits and preview/demo screens.

### P2 — presentation and content expansion

- One fully authored venue presentation pass.
- Live entrant-slot filling on sign-up.
- Rotating black-market availability.
- Gamepad support and accessibility options.
- More venue themes and a desktop wrapper.

## Phase 0 — Freeze the design contract

**Goal:** remove ambiguity before implementation.

Record the following decisions in `docs/DECISIONS.md`:

- `Esc` during a race opens pause; it never returns directly to the menu.
- Abandoning a race counts as a DNF: no prize or points, current damage persists, one-race gear is consumed, and the loanshark clock advances.
- `N` opens New Career confirmation rather than wiping immediately.
- Weapons mode defaults to enabled. If disabled, combat and the black market are unavailable for that career, matching the reference’s high-level structure.
- Existing saves receive safe defaults for all new fields.
- Settings are stored separately from career progress, so resetting a career does not reset controls or audio preferences.
- The release name remains separate from the development working title.

**Acceptance criteria:** the decisions are written down and no implementation relies on an unstated behavior.

## Phase 1 — Race safety and input foundation

**Goal:** make the race lifecycle safe, understandable, and extensible.

### Implementation

Add a central input layer, for example:

```text
src/game/input/
  bindings.ts       // action names, defaults, serialized bindings
  inputManager.ts   // keyboard/gamepad state → game actions
  inputTypes.ts     // shared action contracts
```

Add a pause overlay or paused scene:

```text
src/game/scenes/RacePauseScene.ts
src/game/ui/racePause.ts
```

The pause flow should provide:

- Resume race.
- Controls/help.
- Restart race, if retained as a debug or casual option.
- Abandon race → confirmation → DNF result or safe return through a loss result screen.

Move race input out of direct key checks in `RaceScene`. The race should consume actions such as `accelerate`, `steer`, `fire`, `mine`, `turbo`, `handbrake`, `pause`, and `mute`.

### Tests and verification

- Unit-test default bindings and rebinding serialization.
- Verify pause freezes simulation time, AI, bullets, mines, particles that are simulation-driven, and race clocks.
- Verify resume restores the exact race state.
- Verify abandon cannot preserve the pre-race career state for free.
- Browser-test: race → Esc → pause → resume; race → Esc → abandon → confirm; race → cancel abandon.

**Exit condition:** there is no direct race-to-menu path and no free reset from a bad race.

## Phase 2 — Versioned career profile and New Career flow

**Goal:** give the player identity and make first launch understandable.

### Career data

Extend `CareerState` with a versioned profile, using safe defaults:

```ts
profile: {
  driverName: string
  liveryColor: number
  portraitId: string
  weaponsEnabled: boolean
  difficulty: 'street' | 'standard' | 'hard'
}
schemaVersion: number
```

Keep settings outside the career save:

```ts
interface SettingsState {
  masterVolume: number
  musicVolume: number
  effectsVolume: number
  muted: boolean
  bindings: SerializedBindings
  reducedShake: boolean
}
```

Suggested storage keys:

- `deathrally-career-v2`
- `deathrally-settings-v1`

Implement a migration path from the current career format. Existing saves should become a valid profile with a generated default name, existing livery, weapons enabled, and standard difficulty.

### New Career screen

Create a `NewCareerScene` or `ProfileScene` with:

- Driver name entry.
- Original driver portrait/silhouette selection.
- Livery colour selection.
- Weapons enabled/disabled.
- Difficulty explanation.
- Starting-car and starting-cash summary.
- Final confirmation before overwriting an existing career.

Do not replicate the original driver-license layout. Reuse the project’s current type, colour, and panel tokens while adding a stronger identity presentation.

### Acceptance criteria

- First launch enters profile creation before the garage.
- Existing players can continue without recreating a profile.
- Player name appears in garage, HUD, results, ranking, and champion screens.
- Weapons-off careers cannot buy or enter the black market.
- `npm test && npm run build` passes.
- Old saves load without data loss.

## Phase 3 — Complete the menu and reference-screen equivalents

**Goal:** remove the largest menu-coverage gaps identified in `Ess/`.

### Main menu

Replace hidden hotkeys with a visible, navigable menu:

1. Continue Career
2. New Career
3. Venues
4. Championship Ladder
5. Hall of Fame
6. Settings / Controls
7. Credits
8. Preview / Demo

The current `V`, `L`, and `N` shortcuts may remain as shortcuts, but they must not be the only way to discover those features.

### New screens

Add:

```text
src/game/scenes/HallOfFameScene.ts
src/game/scenes/SettingsScene.ts
src/game/scenes/CreditsScene.ts
src/game/scenes/PreviewScene.ts
```

The Preview screen can be a modern, non-interactive venue reel rather than a literal recreation of the original slideshow.

### Navigation rules

- Every screen has a visible back action.
- Every destructive action has a confirmation step.
- Every menu supports keyboard navigation.
- Focused, disabled, and actionable states are visually distinct.
- No screen depends on the player remembering an undocumented key.

### Acceptance criteria

From the main menu, a new player can reach every shipped screen without debug hooks or hidden keys. Every screen can return to a valid parent screen without stacking duplicate keyboard listeners.

## Phase 4 — In-race information and pre-race planning

**Goal:** match the reference’s useful information structure while improving clarity for modern players.

### Pre-race briefing

Insert a short `PrepareRaceScene` or briefing state after sign-up and before countdown:

- Large track outline.
- Track tier and lap count.
- Rival names, talent stars, and chassis tier.
- Player car condition.
- Current loadout.
- Controls reminder.
- Confirm / back.

This should be a planning moment, not a redundant loading screen.

### In-race pause/help

The pause screen should include:

- Current objective and race state.
- Complete controls.
- Weapons-free countdown information.
- Explanation of damage, turbo, ammo, mines, and pickups.
- Resume and abandon actions.

### HUD improvements

Preserve the current readable HUD, but add:

- Player name and livery colour.
- Clear weapon mode indicator.
- A visible “paused” state.
- Optional reduced-shake and reduced-flash behavior.
- Better distinction between damage taken, damage dealt, and wreck state.

## Phase 5 — RaceScene refactor without behavior changes

**Goal:** reduce risk before adding hazards, weapons, and more venues.

### Target structure

```text
src/game/race/
  raceRuntime.ts       // mutable runtime state and phase transitions
  raceSimulation.ts    // fixed-step orchestration
  combatSystem.ts      // bullets, guns, damage, wrecks
  mineSystem.ts        // placement, arming, blasts, airborne state
  pickupSystem.ts      // collection and respawn
  placementSystem.ts   // progress, gates, rankings
  rescueSystem.ts      // stuck-car recovery
  raceEvents.ts        // typed gameplay events
```

`RaceScene` should become the coordinator for rendering, cameras, audio, and scene transitions. Systems should communicate through typed state and events rather than direct access to the scene’s visual objects.

### Determinism

Introduce a seeded random source for race setup, pickups, rival selection, and combat spread. Keep the seed in debug tools and optionally in results. This is valuable for tuning and replays even if multiplayer remains out of scope.

### Migration strategy

Do not rewrite the race in one pass:

1. Extract types and interfaces.
2. Extract one system at a time behind the existing behavior.
3. Keep the current debug hooks working.
4. Add regression tests for each extracted system.
5. Remove duplicated scene-owned logic only after browser verification.

### Acceptance criteria

- No gameplay behavior changes in the existing race loop unless explicitly intended.
- RaceScene is reduced to orchestration and presentation responsibilities.
- Debug hooks continue to support automated difficulty testing.
- Simulation can run from a fixed timestep with a supplied seed.

## Phase 6 — Hall of Fame and persistent records

**Goal:** provide a long-term reason to revisit tracks and complete the reference-inspired meta layer.

Add per-track records:

```ts
records: {
  [trackId: string]: {
    bestLapMs: number | null
    bestRaceMs: number | null
    bestFinish: number | null
    wins: number
  }
}
```

Show records in:

- Hall of Fame.
- Venue gallery.
- Results screen as “new record” feedback.
- Optional post-champion free-race flow.

Add tests for record updates, ties, migration defaults, and malformed saved values.

## Phase 7 — Settings, gamepad, and accessibility

**Goal:** make the browser release comfortable to play.

Implement:

- Master, music, and effects volume.
- Mute toggle.
- Keyboard rebinding.
- Gamepad detection and binding.
- Reduced screen shake.
- Reduced flash / colour-safe damage indicators.
- Optional hold/toggle behavior for turbo and fire where appropriate.

Keep the default controls compatible with the current README, but make them editable through `SettingsScene`.

## Phase 8 — Authored presentation slice

**Goal:** replace the prototype feel before expanding the content catalogue.

Decide the art pipeline before commissioning or generating a large asset set. The visual direction should be an original combination of:

- Dark industrial night racing.
- Saturated tier colours.
- Riveted/technical interface language.
- Pulpy criminal-motorsport writing.
- Strong car silhouettes and readable damage states.
- Venue-specific materials, signage, hazards, and ambient motion.

Build one complete venue package:

- Menu background treatment.
- Driver portrait set.
- Car livery pass.
- Track dressing.
- Pickup and weapon icons.
- Garage and dealer presentation.
- Results and ranking backdrop.
- Audio identity.

The current procedural textures should remain useful as fallback/debug assets until the authored package is verified.

## Phase 9 — Content expansion

Only after Phases 1–8 are stable:

- Live sign-up entrant filling.
- Rotating black-market stock.
- More hazards and pickup patterns.
- More driver-specific behavior and dialogue.
- More venue themes.
- Desktop wrapper.

Each new system should include data definitions, core tests, browser verification, and UI copy before being marked complete.

## Verification matrix

Run after every phase:

```text
npm test
npm run build
```

Browser smoke paths:

1. First launch → profile → garage.
2. Existing save → continue → garage.
3. New Career → cancel → preserve save.
4. New Career → confirm → replace save.
5. Garage → dealer → garage.
6. Garage → market → garage.
7. Garage → sign-up → briefing → race.
8. Race → pause → resume.
9. Race → pause → abandon → confirmed DNF.
10. Race → results → ranking → garage.
11. Settings → rebind → race uses new control.
12. Weapons-off career → black market unavailable.
13. Reload after each persistent-state transition.

Manual quality checks:

- 1280×720 readability.
- 1920×1080 layout balance.
- Keyboard-only completion.
- No duplicated listeners after repeated scene visits.
- No direct destructive action without confirmation.
- No free escape from a losing race.
- No console errors.
- Stable frame rate during a four-car combat race.

## Recommended execution order

Implement in this order:

1. Phase 0 decisions.
2. Phase 1 race safety/input.
3. Phase 2 profile/save migration.
4. Phase 3 menu completion.
5. Phase 4 briefing/pause/HUD clarity.
6. Phase 5 RaceScene extraction.
7. Phase 6 Hall of Fame.
8. Phase 7 settings/gamepad/accessibility.
9. Phase 8 authored presentation slice.
10. Phase 9 content expansion.

The key sequencing decision is to complete player safety and identity before adding more weapons, tracks, or progression systems. The existing gameplay foundation is strong enough; the next gains should come from UX completeness, maintainability, and presentation quality.
