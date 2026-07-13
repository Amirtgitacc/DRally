# Art Integration — Phase 3: FX (design)

**Date:** 2026-07-13
**Branch:** `milestones-13-15-ai-and-fixes`
**Parent roadmap:** `docs/superpowers/specs/2026-07-12-art-integration-design.md` (§3, §5)
**Handover context:** `docs/superpowers/2026-07-13-art-integration-phase3-4-handover.md` (§3)

## 1. Goal and scope

Wire the AI-generated FX sprites in `Cars/output/generated/` into the game through
the established swap seam (optimizer → `public/assets/fx/*.webp` →
`LOADED_FX_TEXTURES` → BootScene), one FX per task, each independently
committable and revertible.

**In scope (5 FX, easiest first):**

| # | FX | Source art | New key | Change type |
|---|---|---|---|---|
| 1 | Bullet tracer | `fx_bullet_tracer.png` | `bullet` (existing key) | True 1:1 key swap |
| 2 | Muzzle flash | `fx_muzzle_flash.png` | `muzzle` | New key + one spawn-site edit |
| 3 | Headlights | `fx_headlight_glow_cone.png` | `headlight` | New key + per-car light restructure |
| 4 | Mine blast | `fx_mine_blast.png` | `mine-blast` | Composite: replace fireball layer |
| 5 | Explosion | `fx_explosion.png` | `explosion` | Composite: replace fireball layer |

**Out of scope:**

- `fx_damage_smoke.png` — **skipped by decision.** The art is a side-view
  vertical plume; the game is top-down. Damaged cars keep the shipped `smoke`
  puff texture. If dedicated damage smoke is wanted later, regenerate the art
  as a round top-down puff.
- `fx_spark_burst.png` / `fx_smoke_puff.png` — already wired (Phase 0) as
  `spark` / `smoke`.
- Deferred props from design §4d (wreck, jersey barrier, concrete surface) —
  no venue uses them yet.
- `glow-soft` (`paintGlowTexture`) is **not** an FX to replace. It stays for
  cat-eye reflectors, light pools, taillights, turbo glow, mine arm lights,
  and pickup glows.

## 2. Facts established during exploration

- All 6 PNGs have a real alpha channel (verified with sharp; muzzle/tracer
  just occupy a tiny fraction of their 1024² canvas — the optimizer's `trim`
  crops that).
- `fx_explosion` and `fx_mine_blast` have **baked-in dark smoke**. Under ADD
  blend, dark pixels vanish and the rest washes out. They must render as
  **NORMAL-blend one-shot sprites**, not additive layers.
- `fx_headlight_glow_cone` contains **both beams in a single image**, beams
  pointing down (+y). It maps to one sprite per car, not two.
- Current FX spawn sites (all in `src/game/scenes/RaceScene.ts`):
  - Bullet sprite: `tryFire`, `this.add.image(mx, my, 'bullet')` at ~683.
  - Muzzle flash: `tryFire`, `spark` image at scale 0.8, ADD, at ~697.
  - Headlights: two `glow-soft` images per car created at ~1180
    (scale 1.5×0.85, tint 0xfff2c0, alpha 0.13, ADD, depth 3.4), positioned
    each frame at ~2113 (95 px ahead, ±14 px side offset, hidden when
    wrecked).
  - Blast composite: `blastEffects(x, y, scale)` at ~592 — shockwave `ring`
    (ADD, depth 7.2) + `glow-soft` fireball (tint 0xffa040, ADD, depth 7.1).
    Called by `detonateMine` (scale 1) and `wreckCar` (scale 1.6), which add
    smoke particles, hit sparks, debris chunks, a `spark` flash, scorch stamp,
    and lingering fire glow around it.

## 3. Per-FX design

### Task 1 — Bullet tracer (`bullet`, true 1:1)

Register the optimized art under the **existing** `bullet` key in
`LOADED_FX_TEXTURES`; delete the `paintBulletTexture(this)` call in
`BootScene.create()` (and the now-dead painter if nothing else uses it).
No scene edits. Sprite has no `setScale`, so the optimizer row must resize the
art to approximately the painted texture's dimensions (read them from
`paintBulletTexture` at plan time). The sprite keeps ADD blend — the tracer
art is bright-on-transparent, which is ADD-safe.

### Task 2 — Muzzle flash (`muzzle`)

New key `muzzle`. In `tryFire`, replace the muzzle `spark` image with
`muzzle`, rotated to the shot direction (`dir`), ADD blend and short-lived
tween unchanged. Art faces +x after optimizer rotation if needed (check at
plan time; the source flash points roughly +x already). The `spark` key
itself is untouched (hit sparks, turbo flame, bullet trail still use it).

### Task 3 — Headlights (`headlight`)

New key `headlight`. Because the art holds both beams, each car's
`headlights: Image[]` array of two `glow-soft` images becomes that same array
holding a single `headlight` image — the `CarUnit` type and wreck/visibility
code paths stay untouched:

- Created once per car: ADD blend, low alpha (start from the current 0.13 and
  tune in browser), warm tint (~0xfff2c0) to neutralize the art's olive-green
  cast, depth 3.4 (below cars at ~5).
- Per-frame update: positioned ahead of the car on its heading (start from
  the current 95 px throw, tune so the beam origin sits at the bumper),
  rotated with heading, hidden when wrecked. The ±14 px side offsets go away —
  the art encodes the two-beam spread.
- Optimizer rotates the art so beams point +x, matching car heading
  convention.
- Taillights are untouched (`glow-soft`).

### Tasks 4 & 5 — Mine blast (`mine-blast`), then explosion (`explosion`)

`blastEffects(x, y, scale)` gains a texture-key parameter:
`detonateMine` passes `mine-blast`; `wreckCar` passes `explosion`.
Inside, the procedural `glow-soft` fireball is **replaced** by the art:

- NORMAL blend (baked dark smoke forbids ADD), depth 7.1 (same band as the
  fireball it replaces).
- One-shot life: spawn small, tween scale up and alpha to 0, destroy on
  complete — mirroring the current fireball's timing so the beat of the
  explosion doesn't change. Exact scale/duration tuned in browser.
- A small random rotation per spawn so repeated blasts don't look stamped.
- Everything else in the composite stays: shockwave `ring`, smoke particle
  bursts, hit sparks, debris chunks, `spark` flash, scorch stamp, lingering
  fire glow, camera shake.

Mine blast ships first (smaller, more frequent in a fight → faster verify
loop); explosion reuses the exact same code path, so Task 5 is mostly art +
tuning.

Randomness note: the per-spawn rotation is presentation-only and must use the
scene's seeded `this.random()` like the existing FX code does, not
`Math.random()`.

## 4. Pipeline per asset (established seam)

1. Add optimizer row in `scripts/optimize-assets.mjs` — single sprite:
   `trim` + `fit:'inside'` + resize to target in-game size (+ rotation where
   the design says so). Run `npm run assets` → `public/assets/fx/<name>.webp`.
2. Add entry to `LOADED_FX_TEXTURES` in `src/game/textures/loadedAssets.ts`.
3. BootScene: delete the matching `paint*` call (Task 1) — other tasks keep
   their painters because `spark`/`glow-soft`/`ring` remain in use.
4. Scene edit per §3.
5. `npm test` + `npm run build` + `git diff --check`.
6. Browser-verify (§5). Keep → commit; worse → revert the asset's commit.
7. Ledger entry in `.superpowers/sdd/progress.md` (shipped or reverted, with
   reasoning).

## 5. Verify-and-revert protocol

- **Judge:** Claude (controller session) judges each FX; the user reviews the
  final shipped-vs-reverted report. (Decided in brainstorm.)
- **Bar for keeping:** no ADD washout or over-brightness, silhouette readable
  at race speed, doesn't obscure gameplay (mines, pickups, cars), and overall
  no worse than the procedural version it replaces.
- **Method:** live weapons-on fight via the `?debug=1` drive recipe from the
  handover §5 (drive scenes programmatically, pump `loop.step`, teleport the
  player to frame the action, inspect `race.children.list` by texture key).
  FX are verified mid-fight, not as static frames. Screenshots captured for
  the final report.
- **Save-safety:** verification races are never allowed to complete — the
  local `deathrally-career-v2` save is the user's real dev save.
- **Revert unit:** one asset = one commit; revert restores the procedural
  version exactly (painter calls are only deleted when the swap ships —
  Task 1's painter deletion is part of that task's single commit).
- Headlights interact with `reducedShake`/`reducedFlash` in no new way; no
  new full-screen effects are introduced in this phase.

## 6. Execution

Subagent-driven development per the Phase 1–2 flow: one task per FX from §3's
table, browser verification controller-only, per-task commits, ledger updated
per task. Model tiers per handover §5. After Task 5, run the phase review and
report shipped-vs-reverted.

## 7. Risks

| Risk | Mitigation |
|---|---|
| ADD washout on tracer/muzzle/headlight | These three are bright-on-transparent (ADD-safe shapes); verified live, reverted if washed |
| Blast art reads as a flat sticker under NORMAL blend | Scale-up + fade tween keeps motion; random rotation avoids the stamped look; revert if it still reads flat |
| Headlight cone too strong/green at night palette | Warm tint + alpha tuning in browser; art is behind cars (depth 3.4) so it can't cover them |
| Repeated blasts look identical | Seeded random rotation per spawn |
| Missing a `spark`/`glow-soft` consumer when editing | Those keys and painters are never removed in this phase |
