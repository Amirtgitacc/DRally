# Technical Architecture — Deathrally

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Safety + refactorability for a growing codebase |
| Engine | Phaser 3 | Mature 2D WebGL engine: scenes, arcade physics, particles, lights, tweens |
| Build | Vite | Instant dev server, simple static build |
| Tests | Vitest | Fast unit tests for pure logic, no browser needed |
| Package manager | npm (package-lock.json) | Default, no extra tooling |

## Guiding principles

1. **Sim logic separate from rendering.** Game rules (damage, laps, placement, economy, upgrades) live in plain TypeScript modules with no Phaser imports → unit-testable, and keeps a lane open for future multiplayer.
2. **Data-driven configuration.** Cars, weapons, tracks, pickups, economy, and AI drivers are defined in typed config files, not hardcoded in systems.
3. **Small systems, clear owners.** One module per concern; scenes orchestrate, systems compute.

## Directory layout

```
src/
  main.ts                 // Phaser game bootstrap
  config/                 // game-wide constants (screen size, physics step)
  data/                   // DATA-DRIVEN content definitions (typed)
    cars.ts               // chassis stats, upgrade caps, gun class
    tracks/               // track definitions: waypoints, bounds, pickups, spawn grid
    economy.ts            // prizes, points, repair & upgrade costs
    drivers.ts            // AI roster: names, skill, aggression
  core/                   // PURE LOGIC — no Phaser imports (unit-tested)
    race/                 // lap counting, checkpoints, placement, race state machine
    combat/               // damage model, weapon specs
    economy/              // rewards, purchases, repairs, loans
    progression/          // ranking ladder, points, save/load (serializable state)
  game/                   // PHASER LAYER
    scenes/               // Boot, Menu, Race, Results, Garage, ...
    entities/             // Car (player + AI presentation), Pickup, Projectile
    systems/              // input, ai-driving, camera follow, vfx, audio hooks
    ui/                   // HUD sidebar, menus, shared widgets
  debug/                  // dev overlays: AI paths, checkpoints, physics tuning panel
tests/                    // Vitest specs mirroring src/core
public/assets/            // original placeholder art/audio (generated, ours)
docs/                     // planning documents
```

## Scene flow

```
BootScene (load assets)
   └─► MenuScene ──► RaceScene ──► ResultsScene ─┐
          ▲   (later: GarageScene, RaceSelect)   │
          └──────────────────────────────────────┘
```

Scenes communicate through a single `GameStateStore` (career money, rank, car, damage) that is plain-object serializable → trivially saved to `localStorage` and unit-testable.

## Key contracts

- `CarSpec` — top speed, accel, grip, turn rate, armor, gun class, upgrade caps. Upgrades apply as typed modifiers, never mutate the spec.
- `TrackDef` — ordered checkpoint polygons, racing-line waypoints, surface map, pickup spawns, grid slots. Lap/placement logic consumes only this (pure).
- `RaceState` — single source of truth during a race: per-car lap/checkpoint/damage/ammo/position. Updated by pure reducers; Phaser layer renders it.

## Rendering / feel targets

- 60 fps with 4 cars, particles, and lights on a mid-range laptop.
- Phaser Light2D pipeline for headlights/glow accents; particle emitters for exhaust, sparks, explosions; RenderTexture for persistent skid marks; camera shake/zoom effects.

## Debug tooling (built as needed)

Toggleable overlay: AI waypoints + targets, checkpoint gates, car physics values with live sliders, race-state log. Enabled via `?debug=1` query param.
