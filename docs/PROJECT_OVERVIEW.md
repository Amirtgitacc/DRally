# Deathrally — Project Overview

**Working title:** Deathrally (a distinct release name will be chosen before publishing — see DECISIONS.md D-007)

## What this is

An original, modern top-down combat racing game — a spiritual successor to the 1996 classic *Death Rally*. Fast arcade driving, 4-car races with mounted guns and track pickups, wrapped in a career economy: prize money, car upgrades, a chassis ladder, dirty-tricks consumables, and a 20-driver ranking climb toward a final boss duel.

## Legal / creative constraint (non-negotiable)

The uploaded manual and screenshots are **reference only** for gameplay, UX, and design understanding. This project must NOT copy:

- Original art, sprites, music, or sound effects
- Exact maps/track layouts or exact UI layouts
- Car names, driver names, track names, character names ("The Adversary", etc.)
- Logos, trademarked branding, or written copy
- Original code

Everything shipped is original: art, naming, visuals, writing, and code. We recreate **high-level mechanics** (which are not copyrightable) with our own execution.

## Stack & targets

| Decision | Choice |
|---|---|
| Engine | TypeScript + Phaser 3 |
| Build tool | Vite |
| Tests | Vitest (pure-logic unit tests) |
| Visual style | Modern 2D top-down: dynamic lighting, glow, particles, skid marks, screen shake |
| Platform v1 | Web browser (desktop wrapper possible later) |
| Scope strategy | Small playable MVP first, then layered milestones to a vertical slice |
| Multiplayer | Single-player only for v1; architecture keeps a lane open |

## Where things live

| Doc | Purpose |
|---|---|
| `docs/RESEARCH_NOTES.md` | Everything extracted from the reference manual/screenshots |
| `docs/GAME_DESIGN_DOCUMENT.md` | The game we are building (vision, systems, content) |
| `docs/TECHNICAL_ARCHITECTURE.md` | Code structure, data-driven configs, scene flow |
| `docs/DEVELOPMENT_ROADMAP.md` | Milestones and current status |
| `docs/TESTING_PLAN.md` | Test strategy and manual checklists |
| `docs/DECISIONS.md` | Decision log |
| `README.md` | Setup / run / build / test instructions |

## Current status

Milestone 1 (project foundation) — in progress. See `DEVELOPMENT_ROADMAP.md`.
