# Game Design Document — Deathrally

An original modern top-down combat racer. This document describes OUR game. `RESEARCH_NOTES.md` describes the 1996 reference; everything below is an original design that recreates its high-level mechanics with new names, art, tracks, writing, and values.

## Vision

**"Win dirty, spend smart, climb the ladder."**
Fast, drift-happy arcade racing where every race is also a knife fight and a shopping trip. Short 60–120 second races, chunky feedback (particles, screen shake, skids, explosions), and a career economy where damage, repairs, upgrades, and dirty tricks force real decisions between rounds.

Tone: criminal-underworld motorsport, campy and tongue-in-cheek. Dark tracks, neon-accent UI, pulpy original flavor text.

## Core loop

```
                ┌──────────────────────────────────────────────┐
                ▼                                              │
  GARAGE ──► BLACK MARKET ──► RACE SELECT ──► RACE ──► RESULTS │
  buy cars,   consumables,     pick 1 of 3     4 cars,  cash +  │
  upgrades,   loans, dirty     (risk tiers)    guns,    points ─┘
  repairs     tricks                           pickups
                         Climb rank 20 → 1 → boss duel
```

## Systems

### Driving
- Top-down 2D, non-rotating camera with smooth follow + subtle look-ahead and speed zoom.
- Arcade physics: acceleration, braking, grip vs slide (drift when turning hard at speed), off-track surfaces slow you down.
- Metered turbo: self-recharges slowly, refilled faster by pickups.
- All handling values data-driven per car (see TECHNICAL_ARCHITECTURE.md).

### Combat
- Every car has a mounted forward gun; finite ammo, refilled by pickups. Higher chassis tiers mount heavier guns.
- Damage 0–100%. 100% = wrecked: eliminated from the race, zero rewards. Damage sources: gunfire, ramming, mines, hazards.
- Weapons disabled for the first ~2 seconds of each race.
- Consumables (one race only, from the Black Market): drop-mines, ram plating, overcharged turbo that self-damages, rival sabotage.
- Feedback: hit sparks, smoke states as damage rises, explosion + wreck husk on destruction, screen shake.

### Races
- 4 cars per race: player + 3 AI rivals drawn from the persistent 20-driver ladder.
- Lap-based (3–6 laps). Grid start with countdown lights.
- Each round offers three concurrent events — **Street / Pro / Deathmatch-tier** payouts roughly 1× / 4× / 16× — player picks one.
- Track pickups: turbo cell, ammo crate, cash, repair kit, big repair kit, and one booby-trap pickup disguised among them.

### Economy & progression
- Prize money + championship points by placement; 4th or wrecked = nothing.
- Persistent damage between races; repairs cost money.
- Six-car chassis ladder (original names TBD, see Content). Tier gates gun class and max upgrade slots.
- Upgrades: Engine (top speed/accel), Tires (grip/handling), Armor (damage resistance) — tiered, capped per chassis.
- Trade-in credit when buying a new car.
- Loanshark: short-term loans with interest, gated behind owning a mid-tier car.
- Career: start rank #20; points climb the ladder; at #1 unlock a final 1-v-1 duel against the reigning champion (our original boss character).

### AI
- Path following on authored racing lines with per-driver skill/aggression parameters.
- Avoidance + overtaking; rubber-banding kept light and tunable.
- Rivals persist across the career: they earn points, take damage, and can be wrecked, by the same rules as the player.

## Content plan (all original)

| Content | MVP | Vertical slice | Later |
|---|---|---|---|
| Tracks | 1 test track | 1 polished themed track | 6+ themes (city night, desert, industrial, ...) |
| Cars | 1 | 3 of the 6-car ladder | full ladder |
| Weapons | gun only | gun + 1 consumable (mines) | full black market |
| Drivers | 3 generic AI | named rivals w/ portraits | full 20-driver ladder + boss |
| Screens | race + results | menu, garage, race select, results | career hub, ranking, hall of fame |

## Naming policy

No names from the original game (cars, drivers, tracks, characters, "Death Rally" itself for release). Working title "Deathrally" is dev-only. Original names to be generated per content batch and recorded in DECISIONS.md.

## Expansion path (post-slice)

Campaign beats/bosses, more consumables, track hazards, time-trial + hall of fame, gamepad support, desktop wrapper, and optionally multiplayer (architecture keeps sim logic deterministic-friendly and separated from rendering to leave this open).
