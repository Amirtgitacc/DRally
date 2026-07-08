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

## Open questions
- Art asset pipeline for the "4K" bar: AI-generated sprites (e.g. Higgsfield), procedural only, CC0 packs, or commissioned art — decide before Milestone 7.
- Release name and final tone of original flavor writing.
- Whether the "weapons OFF" pacifist mode from the original is worth carrying over (post-slice call).
- Gamepad support priority.
