# Art Integration — Phase 3 (FX) Spec

**Date:** 2026-07-13
**Branch:** `milestones-13-15-ai-and-fixes`
**Predecessor:** `docs/superpowers/specs/2026-07-12-art-integration-design.md` (§3 roadmap, Phase 3 = FX)
**Handover:** `docs/superpowers/2026-07-13-art-integration-phase3-4-handover.md`

---

## 1. Goal

Swap four procedural combat FX for authored WebP art, reusing the existing swap seam. Bullet
tracer and muzzle flash are near-1:1 swaps; explosion and mine blast are **added additive layers**
on top of the existing procedural composite (they have no single key to replace).

Not in Phase 3 (decided in brainstorm): the **headlight cone** (a reshape of the shared `glow-soft`
radial blob — origin/rotation + per-frame rework, out of scope) and a dedicated **damage plume**
(marginal payoff over the already-authored `smoke`).

## 2. Source-verified state (what the code actually does today)

| FX | Today | Site | Swap type |
|---|---|---|---|
| Bullet / tracer | `bullet` key, procedural `paintBulletTexture`, ADD blend | `RaceScene.ts:683`, painted `BootScene.ts:48` | **True 1:1** |
| Muzzle flash | reuses the **`spark`** key (not a dedicated flash), ADD blend, 70ms tween | `RaceScene.ts:695–702` | **Re-key** (1 line) |
| Car explosion | composite: `smoke` particles + `ring` + `spark` burst + `scorch` ground stamp | `RaceScene.ts:809–847` | **Add-a-layer** |
| Mine blast | same composite as explosion | `RaceScene.ts:545–551` | **Add-a-layer** |

Note two handover corrections confirmed in source: the muzzle flash currently reuses `spark`, and
the "headlight cone" is really a soft radial `glow-soft` blob — neither is the clean swap the
handover implied. The headlight is therefore excluded from Phase 3.

## 3. Swap seam (unchanged)

```
Cars/output/generated/fx_*.png
   │  scripts/optimize-assets.mjs   (sharp: trim → resize → WebP)   run: npm run assets
   ▼
public/assets/fx/*.webp   (small, committed)
   │  src/game/textures/loadedAssets.ts   (LOADED_FX_TEXTURES: key → url)
   ▼
BootScene.preload()  auto-loops LOADED_FX_TEXTURES → load.image(key,url)
BootScene.create()   delete the matching paint*() call so the real art wins under that key
```

FX are single sprites (no atlas slicing) → simple `fit:'inside'` + `trim:true` rows.

## 4. Assets → optimizer rows

Add to `scripts/optimize-assets.mjs` `JOBS`:

| src PNG | out | resize |
|---|---|---|
| `fx_bullet_tracer.png` | `fx/tracer.webp` | `w: 48, fit:'inside', trim:true` |
| `fx_muzzle_flash.png` | `fx/muzzle.webp` | `w: 128, fit:'inside', trim:true` |
| `fx_explosion.png` | `fx/explosion.webp` | `w: 256, fit:'inside', trim:true` |
| `fx_mine_blast.png` | `fx/mine-blast.webp` | `w: 256, fit:'inside', trim:true` |

Run `npm run assets` to emit the four committed WebPs.

`loadedAssets.ts` — add to `LOADED_FX_TEXTURES`. The tracer art loads under the **existing `bullet`
key** so the flying-bullet sprite (`RaceScene.ts:683`) picks it up with **zero game-code change** —
a true 1:1. (Key names need not match filenames.)
```ts
{ key: 'bullet',     url: 'assets/fx/tracer.webp' },
{ key: 'muzzle',     url: 'assets/fx/muzzle.webp' },
{ key: 'explosion',  url: 'assets/fx/explosion.webp' },
{ key: 'mine-blast', url: 'assets/fx/mine-blast.webp' },
```
No `BootScene.preload()` edit needed — it auto-loops `LOADED_FX_TEXTURES`.

## 5. Wiring, per asset

### 5.1 Bullet (true 1:1)
- Load the tracer art under the existing **`bullet`** key (see §4). The flying-bullet sprite at
  `RaceScene.ts:683` (`add.image(mx, my, 'bullet')`) then picks up the art with **no code change**.
- Delete `paintBulletTexture(this)` (`BootScene.ts:48`) and its named import (`BootScene.ts:8`) so
  the loaded WebP wins under the `bullet` key. `paintBulletTexture` in `combatTextures.ts` may stay
  defined/exported (an unused export is not a build error); dropping the *call* + *import* keeps
  strict TS clean.
- The tracer art must point **+x** so `.setRotation(dir)` aims it down the shot line — verify.
- ADD blend and depth 6 at `:683` are unchanged.
- **Reverts by:** restore the `paintBulletTexture` call+import and remove the `bullet` key row.

### 5.2 Muzzle flash (re-key)
- Repoint `RaceScene.ts:697` from `.image(mx, my, 'spark')` → `.image(mx, my, 'muzzle')`.
- `.setScale(0.8)`, ADD blend, and the 70ms alpha/scale tween stay unchanged.
- **Reverts by:** one-line revert to `'spark'`.

### 5.3 Explosion (added layer)
- In the car-explosion FX (`RaceScene.ts:809–847`, where `explosionSmoke.explode(30, ...)` fires),
  add one image:
  ```ts
  const boom = this.add
    .image(car.state.x, car.state.y, 'explosion')
    .setDepth(7)
    .setScale(0.6)
    .setBlendMode(Phaser.BlendModes.NORMAL)
  this.cameras.cameras[1]?.ignore(boom)   // match the existing FX minimap-ignore pattern
  this.tweens.add({
    targets: boom, scale: 1.4, alpha: 0, duration: 260, ease: 'Quad.out',
    onComplete: () => boom.destroy(),
  })
  ```
- The existing composite (smoke + ring + spark + scorch) is **kept**; the fireball is purely
  additive on top. Depth 7 matches `explosionSmoke.setDepth(7)` and the crash-flash band.
- **Blend rationale:** the baked fireball carries its own dark smoke; NORMAL blend preserves it.
  ADD is the tuning fallback if NORMAL reads flat against the near-black ground.
- **Reverts by:** delete the added block.

### 5.4 Mine blast (added layer)
- Same pattern in `detonateMine` (`RaceScene.ts:545–551`, near `explosionSmoke.explode(16, ...)`),
  using key `'mine-blast'` at `(mine.x, mine.y)`.
- **Reverts by:** delete the added block.

## 6. Depth & accessibility

- Explosion/mine fireball layer: **depth 7** (with `explosionSmoke` and crash flash, above cars ~5).
- These are localized world-space FX at the blast point — **not** full-screen. No new full-screen
  flash is introduced, so `reducedShake`/`reducedFlash` behavior is unchanged. The existing
  screen edge-flash (`RaceScene.ts:2273`) and its reduced-flash gating are untouched.

## 7. Files touched

| File | Change |
|---|---|
| `scripts/optimize-assets.mjs` | +4 JOBS rows |
| `public/assets/fx/*.webp` | +4 committed assets (via `npm run assets`) |
| `src/game/textures/loadedAssets.ts` | +4 keys in `LOADED_FX_TEXTURES` |
| `src/game/scenes/BootScene.ts` | delete `paintBulletTexture` call + import |
| `src/game/scenes/RaceScene.ts` | repoint muzzle `:697` (bullet needs no edit); add explosion/mine fireball layers |

No changes to `src/core/` (no rule changes). No new tests (FX are Phaser-bound; covered by browser verify).

## 8. Verification (controller-only; keep-all-tune-later)

1. `npm test` — 257 green (no rule changes expected).
2. `npm run build` — strict TS + prod build clean.
3. `git diff --check` — whitespace.
4. Browser (`?debug=1`), one live weapons-on fight (DEATH tier):
   - **Muzzle + tracer:** trigger player gunfire; tracer aims down the shot line, muzzle flash reads.
   - **Explosion:** kill a rival (or self-destruct a car) and confirm the fireball reads as fire,
     not a white bloom or a washed frame.
   - **Mine blast:** drive over / detonate a mine; confirm the added blast layer.
   - No depth flicker; framerate unaffected; reduced-flash setting still calms the screen edge-flash.
   - Do **not** let a verification race *complete* — it mutates the local `deathrally-career-v2` dev save.
5. **One tuning pass** over scale/alpha/blend on any FX that looks worse than procedural; keep the
   rest. Report shipped-vs-tuned state in `.superpowers/sdd/progress.md`.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Baked fireball washes out under ADD | Ship NORMAL blend first; ADD is the fallback, not the default |
| Tracer art not oriented +x → wrong rotation | Verify orientation; the trim keeps the alpha box tight so rotation pivots cleanly |
| Explosion layer makes the composite too busy | Purely additive block, fully revertible; tune scale/alpha or drop it |
| FX fire fast and briefly | Verify in an actual fight, not a static frame (per handover §3.5) |

## 10. Tasks (for the plan)

1. **Assets & keys** — 4 optimizer rows, `npm run assets`, 4 keys in `LOADED_FX_TEXTURES`.
2. **Clean swaps** — bullet (repoint + delete paint call/import) and muzzle (repoint).
3. **Added layers** — explosion and mine-blast fireball blocks.
4. **Verify & tune** — browser drive, tuning pass, ledger update.
