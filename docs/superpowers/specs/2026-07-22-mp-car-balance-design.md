# Multiplayer car balance — design

Date: 2026-07-22
Status: approved, pre-implementation
Scope: **multiplayer only.** Single-player rules, economy, upgrades, and boss duel are untouched.

## Problem

In multiplayer today, every human car drives one shared stock spec
(`DEFAULT_PLAYER_SPEC` = base Cielo, zero upgrades — `server/index.ts:20-23`,
`server/raceSetup.ts:69-86`). Car choice only changes collision **mass** and
cosmetics. Speed, acceleration, handling, and armor are identical for all
players, and upgrades do not exist in MP.

The engine enforces this: `aiControl.ts:29` resolves every human car
(`isPlayer: true`) through the single `env.playerSpec`; only AI rivals carry a
per-car `ai.spec`.

## Goal

Give each MP car its own identity so players can pick any car and still compete:

- All cars sit at a **fully-upgraded power level** (the shared center).
- Differences are **small and controlled** (~±5% speed band, no dominant car).
- Differences follow **car size**:
  - smaller cars → a little faster, but less grip/turn (twitchy),
  - bigger cars → a little slower, but better grip/turn and tougher (planted, tanky),
  - bigger cars also shove harder (existing mass, unchanged).

## Design decisions (confirmed with user)

1. **Speed spread:** moderate, ~±5% around center (≈10% fastest-to-slowest).
2. **"Tougher" means both:** damage resistance (new) **and** shoving (existing mass).
3. **Build method:** compress real fully-upgraded stats toward a shared center,
   then tilt by size.

## The tilt formula

Size axis `t` normalized from `sizeScale` (mid 1.05, half-range 0.15):
`t = clamp((sizeScale - 1.05) / 0.15, -1, +1)`.

Shared MP centers (≈ average of the roster's fully-upgraded stats):
`topSpeed 640, accel 850, grip 8.2, turnRate 4.0`.

| Axis | Factor | Direction |
|---|---|---|
| topSpeed | `× (1 − 0.05·t)` | small faster |
| accel | `× (1 − 0.05·t)` | small faster |
| grip | `× (1 + 0.06·t)` | big grippier |
| turnRate | `× (1 + 0.06·t)` | big turns better |
| damage taken | `× (1 − 0.10·t)` | big tougher (lower = tougher) |

Non-tuned spec fields (`brakeForce`, `reverseAccel`, `reverseTopSpeed`,
`handbrakeGrip`, `drag`, `steerSaturationSpeed`) are reused from each car's real
base values — they vary little and are out of scope. `mass` keeps its real
per-car value (already 0.80–1.40). `sizeScale` uses each car's real value.

## Resulting per-car MP stats (7 cars = `MP_CAR_OPTIONS`)

| Car | id | sizeScale | t | topSpeed | accel | grip | turnRate | dmg taken | mass |
|---|---|---|---|---|---|---|---|---|---|
| Pride (small) | marauder | 0.90 | −1.00 | 672 | 893 | 7.71 | 3.76 | ×1.10 | 0.80 |
| 206 Anahita | anahita | 0.95 | −0.67 | 661 | 879 | 7.87 | 3.84 | ×1.07 | 0.90 |
| Cielo | jackal | 1.00 | −0.33 | 650 | 864 | 8.04 | 3.92 | ×1.03 | 1.00 |
| Peykan | vandal | 1.01 | −0.27 | 649 | 862 | 8.07 | 3.94 | ×1.03 | 1.02 |
| Peugeot 405 | harrier | 1.03 | −0.13 | 644 | 856 | 8.14 | 3.97 | ×1.01 | 1.06 |
| Patrol | leviathan | 1.14 | +0.60 | 621 | 825 | 8.50 | 4.14 | ×0.94 | 1.28 |
| Vanet (big) | basilisk | 1.20 | +1.00 | 608 | 808 | 8.69 | 4.24 | ×0.90 | 1.40 |

Numbers are illustrative of the formula; the implementation computes them from
`mpCarSpec()` and a snapshot test locks them so intentional changes are visible.

## Architecture

New pure module, browser-independent, unit-tested in `tests/`:

```
src/core/vehicle/mpBalance.ts
  mpCarSpec(carId): CarPhysicsSpec       // compress-to-center + size-tilt
  mpDamageResist(carId): number          // 1 − 0.10·t
```

Edits (all preserve the SP path by making the MP behavior opt-in per car):

| File | Change |
|---|---|
| `src/core/race/aiControl.ts` | `spec = car.spec ?? (car.isPlayer ? env.playerSpec : car.ai!.spec)` — per-car spec override; absent in SP |
| `src/core/race/carMovement.ts` | thread the per-car spec override through `effectiveSpec` |
| `src/core/race/combatStep.ts` | `resistance = car.damageResist ?? armorResistance(car.armorTier)` |
| car state type (`stepRace`/`createRaceState`) | optional `spec?` and `damageResist?` on the car; default undefined |
| `server/raceSetup.ts` | each human: `spec = mpCarSpec(carId)`, `damageResist = mpDamageResist(carId)`, `mass` + `sizeScale` from data |
| `server/index.ts` | remove dependence on a single `DEFAULT_PLAYER_SPEC` for humans |
| `src/game/scenes/RaceScene.ts` (net client path) | local car predicts with `mpCarSpec(myCarId)` instead of stock starter |
| `src/game/race/raceSource.ts` (`NetworkSource`) | local predicted spec uses `mpCarSpec` |

Key invariants:

- **SP is inert.** Human cars carry no `spec`/`damageResist` override, so they
  keep `env.playerSpec` + real upgrades exactly as today.
- Setting `sizeScale` server-side **also fixes a latent mismatch**: the client
  predictor already assumes each car's real `sizeScale`, but the server sends
  1.0 for all humans today. This aligns them.
- Determinism preserved: MP specs are pure functions of `carId`, no new
  randomness; the race offer seed still drives simulation randomness.

## Testing

Core unit tests (`tests/`, no Phaser):

- `mpCarSpec` snapshot locks the table above.
- Monotonic checks: smaller car ⇒ higher topSpeed/accel, lower grip/turnRate,
  higher damage-taken multiplier.
- SP unchanged: a fully-upgraded SP car's `effectiveCarSpec` is byte-identical
  to current behavior (no accidental coupling).

Browser MP smoke (`server` + two clients):

- Small car pulls ahead on straights; big car out-corners and out-tanks it.
- Client/server prediction stays smooth — no rubber-banding from spec mismatch.
- Weapons-off MP still disables weapons/mines and black-market entry.

## Known risk / tuning knob

Big cars gain grip + toughness + shove for only ~5% less speed — generous on
paper. The speed band is centralized in `mpBalance.ts`; if playtesting shows the
heavies dominate, widen the speed penalty toward −8% for the two large cars as a
one-number change.
