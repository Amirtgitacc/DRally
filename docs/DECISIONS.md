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

## Open questions
- Art asset pipeline for the "4K" bar: AI-generated sprites (e.g. Higgsfield), procedural only, CC0 packs, or commissioned art — decide before Milestone 7.
- Release name and final tone of original flavor writing.
- Whether the "weapons OFF" pacifist mode from the original is worth carrying over (post-slice call).
- Gamepad support priority.
