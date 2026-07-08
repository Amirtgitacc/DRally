# Research Notes — Reference Material Analysis

Source material in project root: `manual-death rally.pdf` (28-page scan of the 1996 manual) and 39 usable screenshots (menus, shop, black market, race sign-up, pre-race, in-race, ranking). Analyzed 2026-07-08.

These notes describe the ORIGINAL game so we can honor its design at a high level. Nothing here is to be copied literally (names, art, layouts, text).

## Core structure

- Single-player career: climb a **20-driver ranking ladder** from rank #20 via championship points. At rank #1 you unlock a mandatory **1-on-1 final boss duel** that ends the career.
- Every round offers **three concurrent races — Easy / Medium / Hard** — with steeply scaled prizes and limited 4-car grids. Payouts (original values, for calibration):

| Tier | 1st | 2nd | 3rd | 4th / destroyed |
|---|---|---|---|---|
| Easy | $750 + 3 pts | $375 + 2 pts | $188 + 1 pt | nothing |
| Medium | $3,000 + 5 pts | $1,500 + 3 pts | $375 + 1 pt | nothing |
| Hard | $12,000 + 8 pts | $6,000 + 7 pts | $1,500 + 4 pts | nothing |

- Player starts with ~$495 and the free starter car. Three difficulty levels chosen at career start. A "weapons OFF" pacifist toggle exists at career creation (disables combat AND the black market).

## Race rules

- 4 cars per race (player + 3 named AI rivals from the persistent ladder), lap-based (4–6 laps observed).
- Race start: grid + traffic-light countdown. **Weapons disabled for the first 2 seconds.**
- Race ends when you finish, all opponents finish, or your damage hits 100% (destroyed → zero reward). Same rules apply to AI.
- Post-race: results with race income, bonus income, race time, best lap, best lap ever; then the full ranking ladder.

## Vehicles & upgrades

- Six cars forming a strict price/quality ladder (~$500 → $45,000; top speeds ~55 → 140 mph, boostable higher).
- Chassis tier gates BOTH firepower (single vs double machine gun) and **max upgrade slots per stat**.
- Three upgrade tracks, bought one tier at a time: **Engine** (top speed, ~$1000/tier), **Tires** (traction/handling, ~$500/tier), **Armor** (survivability, ~$200/tier).
- Trade-in: buying a new car refunds 25% of current car + upgrades value.
- **Damage persists between races.** Repair costs money (~$22 per 10% observed). Winning ugly eats next round's budget.

## Combat

- Built-in machine guns with **finite ammo** (refilled by track pickups).
- Black-market one-race consumables: mines (dropped behind car), spiked bumpers (ram damage), rocket fuel (much faster turbo that damages YOUR own car — risk/reward), sabotage (strongest rival starts the next race pre-damaged, e.g. 45%).
- Loanshark: short-term loans (borrow $9,000 → repay $13,500 in 3 races); requires owning at least the 2nd-tier car.
- Market items can be OUT OF STOCK (rotating availability).
- Metered, self-recharging **turbo boost**.

## Track pickups (racing lines double as looting decisions)

| Pickup | Effect |
|---|---|
| Lightning bolt | Refill turbo meter |
| Bullets | Refill ammo |
| $ / big $ | Cash bonus |
| Wrench / big wrench | Repair damage (big = 25%) |
| Mushroom | BOOBY TRAP — distorts your view (harmful pickup among the goodies) |

## Camera, HUD, presentation

- Strict top-down 90°, camera does not rotate (car sprite rotates). Tight zoom: ~3–5 car lengths visible ahead; reaction driving, with a pre-race isometric track model for route planning.
- HUD = one fixed **left sidebar**: name, analog speed dial, turbo bar, ammo bar (mines as dots), damage % + degrading car portrait, position badge, lap counter; then 3 rival panels (name color-coded to car, lap, position, flag on finish / cross on destruction). **No minimap during driving** (track-outline inset appears at race end).
- Between-race screens share a persistent right-hand "character sheet" panel: car render, cash, Engine/Tires/Armor pips, damage %, speed, rank.
- Race sign-up shows AI drivers **filling entrant slots in real time** — light time pressure.
- Track themes observed: desert/oasis, downtown city, jungle, dark industrial, indoor complex, concrete stadium. Tracks are narrow (~1.5–2.5 car widths of asphalt) with rough drivable shoulders, wrecks, skidmarks, splatter decals, and wandering pedestrians at the edges.
- Art direction: gritty 90s pre-rendered look; riveted-metal UI frames; dark backgrounds with saturated accents. Tone is criminal-underworld motorsport — violent but campy and tongue-in-cheek (joke difficulty names, pulpy flavor text on every screen).

## Controls (original defaults)

Accelerate / brake / steer left-right / turbo / fire / drop mine / horn. Fully redefinable; gamepad supported.

## Distinctive mechanics to recreate (as original designs)

1. Ranking-ladder career capped by a rank-1 boss duel.
2. Self-selected risk: pick 1 of 3 concurrent races with steep payout scaling.
3. Combat racing: finite-ammo guns, mines, ram damage, elimination at 100% damage forfeits rewards, weapons-free grace at start.
4. Persistent damage + paid repair.
5. Chassis ladder gating firepower and upgrade capacity; trade-in on upgrade path.
6. Black-market consumables + loanshark.
7. Metered self-recharging turbo.
8. Pickup-littered tracks including a booby-trap item.
