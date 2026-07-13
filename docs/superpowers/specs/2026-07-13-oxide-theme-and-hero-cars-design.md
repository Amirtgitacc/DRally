# Design — Oxide theme + hero car renders (Project A)

**Date:** 2026-07-13
**Branch:** current working branch
**Supersedes for cars:** the "tintable greyscale chassis" decision in `docs/superpowers/2026-07-13-art-integration-phase3-4-handover.md` §4 and `docs/ART_INTEGRATION_STATUS.md` §5. See §8.

---

## 1. Goal

Two things the user asked for:

1. **Re-theme the pre-game screens** to match a new art direction.
2. **Change the cars** using the art in `cars/green/`.

Brainstorming settled the direction and split the work into two projects. **This spec covers Project A only.**

| | Project A (this spec) | Project B (later, own spec) |
|---|---|---|
| What | New "Oxide" theme, applied globally (incl. race HUD); Iranian hero-render car art wired into the pre-game screens | True top-down (roof-view) race sprites of the same Iranian cars, wired into the race |
| Art | Already generated (`cars/green/`), 3/4 hero angle | **Not generated yet** — needs new top-down art |
| Risk | Presentation only, no simulation impact | Re-keys the driver→sprite system in the race |

Project B is explicitly **out of scope here** (§7). The race keeps its current procedural cars until B ships.

## 2. Art direction — "Oxide, grittier"

Chosen from live mockups (`.superpowers/brainstorm/…/garage-oxide-gritty.html`). A dark, premium base warmed with oxide-orange, brass and concrete, with restrained grit: riveted metal plates, a faint scratched-metal grain, and a single hazard-stripe accent. Not full scrapyard; not the old clean industrial-night.

The Iranian vehicles (Peykan, Pride, Cielo, Patrol, Nissan) stay for flavour. **UI copy remains English** (user decision) — Farsi appears only where it is already baked into the car art. No RTL, no Farsi menu strings.

## 3. Theme changes (`src/game/ui/theme.ts`, `widgets.ts`)

Applied **globally**, including the in-race HUD (user decision).

New / changed tokens in `theme.ts` (numbers + `hex()` as today):

| Token | Value | Use |
|---|---|---|
| `oxide` | `0xe07a3c` | primary accent, actions, focus (replaces `amber` as the lead accent) |
| `oxideDim` | `0xb45e2c` | pressed / secondary |
| `brass` | `0xc9a227` | funds, best values (aligns with existing `gold`) |
| `concrete` | `0x8a8478` | secondary data text, stat values |
| `surfacePlate` / `surfacePlate2` | `0x191712` / `0x141210` | riveted-plate gradient |
| `line` | `0x332e26` | plate borders (warmer than current `border`) |

- Keep the tier colours (`tierStreet/Pro/Death`) and semantic `danger/warn/ok`.
- `amber` stays defined so nothing breaks, but the visual lead moves to `oxide`.
- Fonts unchanged (Oswald display, JetBrains Mono data).

New in `widgets.ts`: a **riveted-plate primitive** (panel gradient + warm border + corner-rivet dots) and an optional **metal-grain overlay** and **hazard-sliver** accent, so scenes compose the look instead of hand-rolling it. Reuse everywhere a panel exists today.

**Accessibility:** verify oxide/brass/concrete on the dark plate meet contrast for body and action text; keep focus rings visible (oxide ring on selection). `reducedShake`/`reducedFlash` behaviour is unchanged — the grain and plates are static, no new flashes.

## 4. Hero-render asset pipeline

Same swap seam as prior phases, on **new keys** so the race is untouched:

```
cars/green/<car>.png              (3/4 hero render; some green-screen, some dark studio bg)
   │  cutout: remove background → transparent PNG (green-key OR dark-matte per file)
   │  add optimizer row → npm run assets  (sharp: trim → resize → WebP)
   ▼
public/assets/cars/hero/<id>.webp   (committed)
   │  loadedAssets.ts: { key:'car-hero-<id>', url }
   ▼
BootScene.preload() auto-loads → available as texture key 'car-hero-<id>'
```

The procedural `car-<id>` keys **stay** (race still uses them). Hero keys are additive.

**Cutout note:** files vary — `cielo`, `pride3` are on green; `taxi peykan`, `patrolgreen` on dark studio bg. Each gets the appropriate matte removal to a clean transparent edge during asset prep.

## 5. Car mapping (proposed — adjustable)

| Game car id | Tier | Source file (`cars/green/`) |
|---|---|---|
| `jackal` (free starter) | Street | `pride3.png` (Pride) |
| `vandal` | Street | `taxi peykan.png` (Peykan taxi) |
| `marauder` | Pro | `cielo.png` (Cielo) |
| `harrier` | Pro | `nissan vanet.png` (Vanet) |
| `basilisk` | Death | `nisasan2.png` (Nissan) |
| `leviathan` | Death | `patrolgreen.png` (Patrol) |

Best variant per car may be swapped during prep if another file cuts out cleaner.

## 6. Per-screen changes

| Screen | Change |
|---|---|
| **theme.ts / widgets.ts** | New tokens + plate/grain/hazard primitives (§3) |
| **Garage** | Re-skin to plates; swap car image `car-${carId}` → `car-hero-${carId}`. **No new elements** — the career owns one car at a time (buying trades in the old one), so there is no fleet to strip; the CarDealer already browses all six chassis. |
| **CarDealer** | Re-skin; show hero renders for each purchasable chassis |
| **Preview** | Re-skin; hero render of the previewed car |
| **Menu** | Re-skin; player's current car shown as hero render where the identity/car appears |
| **Results** | Re-skin to plates |
| **Champion** | Re-skin; hero render for the champion car |
| **Race HUD** | Re-skin HUD panels/readouts to oxide tokens (no layout or gameplay change) |

Other menu scenes (Venues, HallOfFame, Settings, Credits, SignUp, PrepareRace, Ranking, RacePause, NewCareer, BlackMarket) inherit the token change automatically; touch them only where a hard-coded old colour or panel style needs updating to look right. Every existing element stays; every screen keeps a visible route back and keyboard nav.

## 7. Out of scope (Project B, deferred)

- True top-down race car sprites and the driver→sprite re-keying in `RaceScene`.
- Generating new top-down art. The 3/4 hero renders are **not** usable as the driving car.
- Track/world art beyond what already shipped in Phases 0–2.

## 8. Divergence from prior docs

The handover's Phase 4 assumed generic greyscale tintable chassis. That is superseded: art is now specific pre-coloured Iranian hero renders on their own keys. Update `docs/DECISIONS.md` and the memory `visual-direction-sprite-pivot` at the end of Project A (the old "clean & premium, pristine" note is now "Oxide, grittier"; the "orthographic top-down, tint" note applies only to the deferred Project B).

## 9. Verification

- `npm test`, `npm run build`, `git diff --check` clean before done.
- Browser-verify each re-skinned pre-game screen: theme reads correctly, hero renders load on the right cars, garage roster strip is visible and keyboard-navigable, every back route works.
- Verify the race HUD re-skin does not shift layout or break the follow-camera / readouts.
- Confirm contrast on oxide/brass/concrete text; confirm `reducedShake`/`reducedFlash` unaffected.

## 10. Risks

- **Global token change** ripples to every scene — a hard-coded old colour could look off. Mitigate by grepping for direct colour literals during implementation.
- **Cutout quality** — a poor matte leaves a green/black fringe on the hero render. Verify each cutout at garage scale before committing.
- **3/4 angle in a grid** — hero renders are for single-car showroom framing (garage/dealer/preview). The roster strip crops them as thumbnails; verify they read at thumbnail size.
- **Race HUD re-skin** touches race presentation earlier than Project B — keep it strictly cosmetic (tokens only), no gameplay or layout edits.
