# Testing Plan — Deathrally

## Layers

| Layer | Tool | What it covers | When |
|---|---|---|---|
| Type/compile check | `tsc --noEmit` (in `npm run build`) | Whole codebase | Every change |
| Unit tests | Vitest (`npm test`) | All `src/core` pure logic | Every change |
| Play test | `npm run dev` + browser | Feel, rendering, integration | Every feature |
| Performance | Browser devtools FPS/heap | 60fps target, object counts | Each milestone |

## Unit-test targets (pure logic, no Phaser)

- Lap/checkpoint counting: out-of-order checkpoints don't count; reverse driving doesn't count; lap increments only on full sequence.
- Race placement: by laps+checkpoints+distance; ties; wrecked cars ranked last.
- Damage model: sources accumulate, clamps 0–100, destruction at 100, armor reduction.
- Economy: prize/points tables, repair costs, upgrade purchase rules (caps, funds), trade-in credit, loan accrual.
- Progression: points → ladder movement, save/load round-trips (serialize → deserialize → deep-equal).

UI components, scenes, and VFX are NOT unit-tested (per project convention) — covered by the manual checklist.

## Manual test checklist (run before calling a milestone done)

**Driving:** accelerates/brakes/turns as tuned; drift triggers at speed; off-track slows; camera never jitters.
**Race flow:** countdown blocks input; laps count correctly on-screen; finish triggers results; results values match race.
**AI:** follows track, recovers when knocked off, doesn't pile up on walls, overtakes.
**Combat:** ammo depletes/refills; damage reflects hits; wreck eliminates car and forfeits rewards; no friendly-fire during countdown grace.
**Economy:** money changes match tables; can't buy without funds; upgrades respect caps; save survives reload.
**UI:** every screen reachable and exitable by keyboard; no dead ends.

## Performance checks

- 60 fps during a 4-car race with particles + lights (mid-range laptop, Chrome).
- No unbounded growth: projectiles, particles, and skid-mark textures are pooled/capped.
- Scene restart leaks nothing (heap snapshot before/after 5 restarts roughly stable).

## Regression rule

After each milestone: run `npm run build` + `npm test`, then the manual checklist sections touched by that milestone plus **Driving** and **Race flow** (always).
