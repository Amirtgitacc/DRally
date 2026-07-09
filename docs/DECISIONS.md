# Decision Log — Deathrally

| # | Date | Decision | Why |
|---|---|---|---|
| D-001 | 2026-07-08 | Engine: **TypeScript + Phaser 3 + Vite + Vitest**, npm | Shareable web portfolio link; fastest iteration; automatable build/test loop. Chosen by AT over Godot/Unity. |
| D-002 | 2026-07-08 | Visual style: **modern 2D top-down** (dynamic lights, particles, skids, shake) | Truest to reference feel; highest polish ceiling at solo scope. |
| D-003 | 2026-07-08 | Platform v1: **web browser**; desktop wrapper only if wanted later | Reach + iteration speed. |
| D-004 | 2026-07-08 | Scope: **small playable MVP first**, then milestone layers to a vertical slice | Tune driving feel early; playable within days. |
| D-005 | 2026-07-08 | Single-player only for v1; sim logic kept separate from rendering to leave multiplayer open | Assumption, not user-confirmed requirement. |
| D-006 | 2026-07-08 | Original-content policy: no names/art/audio/layouts/text from the 1996 game; references used for high-level mechanics only | Legal/creative constraint set by AT. |
| D-007 | 2026-07-08 | "Deathrally" is a **dev-only working title**; distinct release name chosen before publishing | Trademark safety. |
| D-008 | 2026-07-08 | Architecture: pure-logic `src/core` (no Phaser imports) + data-driven configs in `src/data` | Testability, tunability, future multiplayer lane. |
| D-009 | 2026-07-08 | Essential mechanics to recreate: risk-tiered race choice, chassis ladder gating guns+upgrades, persistent damage + paid repair, black-market consumables, ranking ladder + boss duel, pickup-littered tracks | Distilled from manual/screenshot research (see RESEARCH_NOTES.md). Assumption — AT can trim. |

| D-010 | 2026-07-08 | Graphics-first bar ("Death Rally 4K", per AT): visual quality is a per-milestone requirement, not a final polish step. Internal render 1920×1080 (revisit native-DPR/4K after profiling), postFX bloom + vignette, procedural hi-fi placeholders until an asset pipeline is chosen (see open questions). | AT asked for much better graphics than the M1 placeholders. |
| D-011 | 2026-07-08 | HUD renders through a dedicated camera; gameplay camera zoom/postFX never touch UI. | Phaser camera zoom applies to scrollFactor-0 objects — HUD went off-screen without it. |

| D-012 | 2026-07-08 | The single current race pays at the "pro" tier ($3000/$1500/$375) so upgrade pacing feels good; the street/pro/death race-select from the backlog will restore the real 1×/4×/16× ladder. | One-track economy needs playable pacing now. |

| D-013 | 2026-07-08 | Night-race visual identity: additive glow sprites (headlights, reflectors, street lights) instead of Phaser's normal-mapped light pipeline. | Same visual payoff, no normal maps needed, tints freely, cheap at 60fps. |
| D-014 | 2026-07-08 | Audio is synthesized in WebAudio (no asset files) behind an AudioBus facade; real samples can replace each one-liner later. | Real game feel now, zero asset pipeline, clean upgrade path. |

| D-015 | 2026-07-08 | Final duel: at rank #1 sign-up is replaced by a mandatory 1-v-1 vs an original champion ("The Sovereign") who sits above the ladder. Winning = champion flag + $25k purse + win screen; the career **continues** after the crown (no hard ending, duel not re-offered). Losing costs only the damage. | Original ended the career at the duel; continuing is friendlier to a solo dev-loop and keeps the save useful. Assumption — AT can make it a hard ending. |
| D-016 | 2026-07-08 | Loanshark has **no chassis gate** (original required the 2nd-tier car): borrow $3,000 / owe $4,500 in 3 races. Missed payment: crew takes all cash + adds 40% damage, debt cleared. | The loan exists to fix the broke-with-a-wrecked-car death spiral; gating it behind a mid-tier car would exclude exactly the player who needs it. |

| D-017 | 2026-07-08 | AI difficulty comes from machinery, not cheats: a rival's chassis derives from ladder rank (rank 1 → top car, rank 20 → starter), on top of a modest pace scale (0.90–1.08). | The old "everyone drives the starter car" made mid/late career trivially easy once the player upgraded; scaling their hardware mirrors the original's design and keeps rubber-banding subtle. |
| D-018 | 2026-07-08 | Car-to-car hits use a pure mass-weighted impulse model (restitution 0.4) + capped tangential spin kick; AI carry 2/4 mines in pro/death races with an 8-second no-drop grace after GO. | Mass makes the chassis ladder tangible in combat; the grace period exists because launch-packed grids otherwise mine themselves at the start line (found in browser testing). |

| D-019 | 2026-07-09 | AI skill = **permanent per-driver talent grades** (4 aces / 6 veterans / **5** journeymen / 4 rookies = the 19 ladder rivals; the plan's "6 journeymen" assumed 20 rivals, but the 20th seat is the player. The champion drives as an ace) scaling pace, cornering, aim, and mine use; chassis still derives from current rank (D-017). Grades are data keyed by driver id, never stored in the save, so existing careers pick them up. Overall difficulty target: **Challenging** (same-tier car + clean driving → 2nd–4th; weapons needed to fight for 1st). | Chosen by AT over rank-derived skill: named rivals keep an identity ("watch out for her"), aces climbing the ladder makes the top ranks dangerous. |
| D-020 | 2026-07-09 | Mine hits **launch the victim airborne ~0.8s** — a real core sim state (z/vz, steering + traction ignored in the air), not just a visual; upgrade/market UI must show **exact computed effects** (e.g. GRIP +12%) derived from the data tables, never hand-written strings. | AT: hits must be *felt* and everything must be *measurable*. Computing labels from data prevents drift. |

### Milestone 12 tuning findings (2026-07-09)
Four defects the scripted difficulty loop surfaced. Each was diagnosed by instrumenting where the player's damage actually came from, not by guessing.

| # | Date | Decision | Why |
|---|---|---|---|
| D-021 | 2026-07-09 | The AI's **corner-braking horizon scales with speed** (`lookAheadFor`), while the **steering target stays at a fixed distance**. | Braking distance grows with speed but the look-ahead was a constant number of samples, so a fast car met every corner too late: a Leviathan ground itself from 0 → 91% damage on walls in one race while a Harrier took none. Scaling the *steering* target too is the opposite bug — the car then cuts the corner into the inside barrier (measured: brave pilots wrecked 3/3). Only the braking scan looks further ahead. |
| D-022 | 2026-07-09 | Rival gunners fire in **bursts** (900ms on / 700ms off) instead of holding the trigger. | A rival parked on your bumper poured ~24 dmg/s into you for a whole lap. That is an execution, not difficulty. Bursts cap sustained DPS and give the player a rhythm to drive around. |
| D-023 | 2026-07-09 | **Rival bullets do half damage** (`AI_GUNNER.damageScale = 0.5`); the player's do full. | The grid is three guns pointed at one player and one gun pointed at a grid. Symmetric per-shot damage is not a symmetric fight: a single ace tailing the player dealt 137 damage in one race (wreck at 100). Halving rival rounds made the top-tier race survivable (76% damage, 2nd place) without making it easy. |
| D-024 | 2026-07-09 | **AI mine counts halved** (pro 2→1, death 4→2 per rival, before talent scaling). | A direct mine hit now costs 26% *and* takes the car off the tarmac (D-020), so it is far more punishing than in M11. A death-tier grid of three aces carried 18 mines; four hits killed the player. Density had to come down once mines gained the airborne penalty. |
| D-025 | 2026-07-09 | A rival's **driving style follows their talent grade**, not their grid slot. | Styles were cycled by index, so an ace seeded third inherited the bruiser's timid line — the best drivers on the ladder driving the fastest cars slowly. Aces now charge, rookies bruise. |
| D-026 | 2026-07-09 | Rubber-band catch-up ceiling lowered 1.15 → 1.10. | At 1.15 a trailing rival clawed back almost any machinery advantage, so buying a better car never made you the favourite — contradicting the milestone's own difficulty target. |
| D-027 | 2026-07-09 | Debug-only `__autoPilot` (drives the player with the AI) + `__step` (runs the game loop by hand) are kept in the `?debug=1` build. | Difficulty is now *measured* rather than guessed, and races can be simulated ~50× faster than real time by skipping rendering. Caveat recorded: the pilot is an AI proxy — it corners conservatively and loses ~4s/race to the racing line, so it under-reports what a skilled human can do. Final difficulty calls need hands-on play. |

### Milestone 13 fixes (2026-07-09)

| # | Date | Decision | Why |
|---|---|---|---|
| D-028 | 2026-07-09 | The tire wall is **solid at any height** — airborne cars bounce off it instead of clearing it (they still fly over the scenery, i.e. off-track drag is skipped). Wall damage is not dealt mid-flight. | A mine launch sailed clean over the barrier and dropped the car in the infield, ringed by tires, with no way out for the rest of the race. Giving the wall a finite height only narrows the window; the launch apex (128px direct, more on a chain hit) always beats it eventually. |
| D-029 | 2026-07-09 | **Stuck-car rescue**: a car that is both crawling (< 32 px/s) *and* off the tarmac for 3s is placed back on the racing line at the gate it was heading for. Both conditions are required. | The safety net for anything D-028 misses. Requiring "off the tarmac" too is what keeps a player parked on the racing line — handbrake on, lining up a shot — from being teleported out from under themselves. |
| D-030 | 2026-07-09 | Race tier picks rivals from a **talent band** (`TIER_TALENT_BANDS`: street ★–★★, pro ★★–★★★, death ★★★–★★★★), not from a window around the player's rank. | The tier was cosmetic: all three sign-up cards drew from the same 7-driver neighborhood, so a death race paid 16× for the same rookies as a street race. The purse now buys a harder field. |
| D-031 | 2026-07-09 | Rival pace band re-floored: `rivalStrength` #20 0.90 → **0.94**, #1 1.08 → **1.09**. Corner speeds up ~10% across all three driving styles. | AT: "the AI cars are very slow". A rookie's 0.96 talent scale on a 0.90 base put the slowest car on the grid at 0.864× — a clean lap beat the field. Measured: lifting the *ceiling* as well (to 1.13) put three aces beyond a fully-upgraded Leviathan (4th, 3 gates down), so only the floor moved. |
| D-032 | 2026-07-09 | Checkpoint-gate debug lines moved from `?debug=1` to their own `?gates=1`. | They paint cyan lines across the track, and `?debug=1` is the flag you actually want while playing. |
| D-033 | 2026-07-09 | The booby-trap pickup wears a **skull**, and its camera-swim lasts 4.5s (was 2.6s). | It was deliberately drawn as the shiniest orb on the track. A pickup that hurts has to say so from a car's length away, or taking it reads as the game cheating. |

### Milestone 14 — the AI learns to drive (2026-07-09)
AT beat the death tier four times running, winning by nearly a lap. The scripted pilot had said "4th". The pilot was wrong; measurement found out why.

| # | Date | Decision | Why |
|---|---|---|---|
| D-034 | 2026-07-09 | The AI drives a **racing line** (`core/track/racingLine.ts`), not the centerline: relaxation inside the track corridor, pulling each sample toward the midpoint of its neighbours until the line runs wide-apex-wide. | The centerline is both a longer path and a curvier one, so the cornering model braked for bends the grip would have carried flat. Measured on Serpent's Throat, aces averaged **63% of their own top speed** while taking 26 damage on the walls all race — they were never near the limit. |
| D-035 | 2026-07-09 | **Cornering caution cut hard** (charger 0.44→0.16, floor 330→470 px/s) and re-spread across talent. | Probing found no crash cliff: caution ×0.6 → +20% pace, ×0.4 → +27%, ×0.2 → +34%, and wall damage never moved off 26. The grip was always there. The AI's slowness was a phantom of the braking model, not of its car. |
| D-036 | 2026-07-09 | Turbo is a decision, not a condition (`core/ai/turbo.ts`): boost on corner exit, to chase a car getting away, and to defend a bumper — holding a reserve otherwise. | The old rule ("track looks straight and tank over a third") almost never fires on a twisty circuit, and never when it matters. |
| D-037 | 2026-07-09 | Rival gun damage scales with the purse: `AI_GUNNER.damageScale` 0.5 flat → **street 0.5 · pro 0.75 · death 1.0**. Aces fire at the bullet's intercept point (`core/combat/aim.ts`), everyone else at where you are. Rivals with the leader in range shoot the **leader**, not the nearest car. | D-023's flat 0.5 made the top tier a shooting gallery: a player who aims better than the AI simply wins the fight. The handicap exists for a 3-vs-1 grid, so it should shrink where the money says the drivers are better. |
| D-038 | 2026-07-09 | AI mines: death tier 2 → **3** per rival, dropped when a car behind is genuinely **closing** (not merely present), and rivals now **steer around armed mines** on their line. | Mines were dropped at anyone tailing, so they were spent on cars that were not a threat, and the AI drove over its own minefield. |

### Milestone 15 — machinery, not multipliers (2026-07-09)
Death tier still lost. Two causes, both structural.

| # | Date | Decision | Why |
|---|---|---|---|
| D-039 | 2026-07-09 | A mine's arming delay protects **only the car that dropped it** (`ownerSafeMs` 900ms). Everyone else gets a **45ms fuse**. | `armDelayMs` applied to all cars, so a mine dropped at a tailgater was still inert when they drove over it and armed itself harmlessly behind them — the weapon could not do the one job it has. 45ms is not arbitrary: the mine lands 55px off the dropper's tail, so a pursuer on the bumper is ~35px away and covers that in 58ms at racing speed. Any longer fuse and the mine misses. Verified at 140/90/70px gaps: all now hit for 19 damage and an 111px launch. |
| D-040 | 2026-07-09 | **Rivals fit upgrades from their ladder rank** (`rivalUpgrades`: #1 runs engine/tires/armor 3, #20 runs stock). | The real asymmetry. Rivals drove showroom cars while the player fitted tier-3 tires — **+40% grip**. No amount of pace tuning could fix that: probing showed the AI was at the *grip* limit, not the braking limit (caution ×0.2 bought nothing over ×0.4). It is also why the player could wreck aces at will: no armor. Aces now survive 179 damage in a race. |
| D-041 | 2026-07-09 | With real machinery behind them, the rank pace band **narrows to 0.94–1.00** (was 0.94–1.09) and the rubber-band ceiling drops 1.10 → **1.06**. | D-017 says difficulty comes from machinery, not cheats. Left as-was, a rank-1 ace on a built car with the band behind them would run down a leading player at 955 px/s in a 758 px/s car. The multiplier shrinks precisely because the machinery gap is now real. |
| — | 2026-07-09 | Rejected: "average speed = 95% of top". | Probing proved the ceiling is grip, not courage. Cutting cornering caution from 0.16 to 0.05 moved the aces from 80% to 84% of top and no further — 95% would mean taking hairpins flat. Real racing sits at 70–85%. The right lever was to make the top speed (and the grip under it) bigger, not the fraction. |

## Open questions
- Art asset pipeline for the "4K" bar: AI-generated sprites (e.g. Higgsfield), procedural only, CC0 packs, or commissioned art — decide before Milestone 7.
- Release name and final tone of original flavor writing.
- Whether the "weapons OFF" pacifist mode from the original is worth carrying over (post-slice call).
- Gamepad support priority.
