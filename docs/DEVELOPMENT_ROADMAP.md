# Development Roadmap — Deathrally

Status legend: ✅ done · 🔨 in progress · ⬜ not started

## Milestone 1 — Project foundation ✅ (2026-07-08)
- [x] Planning documents
- [x] Vite + TypeScript + Phaser + Vitest scaffold
- [x] Build/run instructions in README
- [x] Placeholder assets (programmatic textures in BootScene; art files come in Milestone 7)
- [x] Scene loading (Boot → Menu → Race stub, verified in browser)
- [x] First unit tests passing (`npm test`: economy rewards, 4 tests)

## Milestone 2 — Vehicle prototype ✅ (2026-07-08)
- [x] Player car movement: acceleration, braking, reverse, handbrake drift (pure-logic model, 8 tests)
- [x] Camera follow + speed-reactive zoom
- [x] Collision (tire walls + world bounds) with bounce and screen shake
- [x] Data-driven car physics values + `?debug=1` overlay (live tuning via `__carSpec`, scripted driving via `__setDrive`)
- [x] Graphics baseline pulled forward from M7 ("Death Rally 4K" bar): 1080p internal render, detailed procedural car sprite + shadow, textured asphalt, persistent skid marks, exhaust/tire smoke, bloom + vignette, dedicated HUD camera
- Verified in browser: drift trails, HUD, no console errors, ~75 fps under load

## Milestone 3 — Track prototype ✅ (2026-07-08)
- [x] Data-driven track ("Rust Belt Circuit"): spline centerline → asphalt ribbon, rough shoulder (slows the car), tire-wall boundaries, checkered start line
- [x] Checkpoint gates + lap counter (pure logic, out-of-order/reverse crossings ignored; 12 new tests)
- [x] Race countdown with start lights (input locked until GO), finish after 3 laps
- [x] Results screen: total time, best lap, per-lap times; R to restart, Enter to menu
- [x] Debug additions: gate visualisation, `__getRace`, `__setCarState`, `__restartRace`
- Verified in browser: full 3-lap race via scripted gate crossings → results screen; countdown lock; 76 fps; no console errors

## Milestone 4 — AI racers ✅ (2026-07-08)
- [x] 3 original AI rivals (Vex, Mara Kane, Diesel Ott) follow the racing line: waypoint chasing + corner braking from track curvature (pure `aiDrive`, 6 tests)
- [x] Avoidance/overtaking: chase target shifts sideways around cars ahead
- [x] Per-driver skill as data (pace scale, look-ahead, cornering caution) + light rubber-banding vs the player
- [x] Live placement system (pure logic + 4 tests): position badge, color-coded standings HUD, results standings with finish times
- [x] Car-to-car collisions with impulse response; grid start for 4 cars
- Verified in browser: AI laps the circuit unassisted at skill-ordered pace, standings update live, results show mixed finished/unfinished states; 76 fps; no console errors

## Milestone 5 — Combat ✅ (2026-07-08)
- [x] Mounted gun: 10 shots/s tracers, finite ammo (100), muzzle flash, bullets stop on cars and tire walls; 2s weapons-free grace after GO; AI fires when an enemy is in its aim cone
- [x] Damage model (pure logic + tests): gunfire, ram damage, wall impacts; wreck at 100% → explosion, scorch mark, charred hulk stays as obstacle, ranked last; player wreck ends the race ("WRECKED" results)
- [x] Track pickups (pure layout + tests): ammo, turbo, repair, cash, disguised booby trap (camera sway); 10s respawn
- [x] Turbo boost: meter with drain/recharge, Shift to boost, AI uses it on straights
- [x] Hit feedback: sparks, explosion particles, screen shake on hits/rams/wrecks; damage smoke states at 50%/80%; HUD bars (damage/ammo/turbo), damage % in standings, cash counter
- Verified in browser: shot a rival to 100% → wreck + last place; cash/repair/turbo/trap pickups all apply; turbo 520→638 px/s; player wreck → results; 76 fps; no console errors

## Milestone 6 — Economy & progression ✅ (2026-07-08)
- [x] Race rewards + championship points wired into a persistent career (prize by tier/placement, wreck forfeits; pickups cash banks too)
- [x] Garage scene: repair per 10% step, Engine/Tires/Armor upgrades with per-chassis caps + pips, live stats panel, keyboard navigation, flavor text
- [x] 3-car catalog (Jackal/Marauder/Basilisk) with prices, stat ladders, upgrade caps; buy with 25% trade-in of car + upgrades (pure logic + 10 tests)
- [x] Upgrades actually apply in-race (effectiveCarSpec; armor reduces incoming damage) — AI stays on the starter chassis
- [x] Persistent damage: carried out of races into the career, costs money to repair, carried back into the next race
- [x] Save/load: career auto-saves to localStorage on every change; validated on load (pure serialize + 5 tests); menu shows career summary; N = new career
- Flow is now Menu → Garage → Race → Results → Garage
- Verified in browser: bought tires ($500), won a race (+$3000 +5pts), bought the Marauder (net $2350 after trade-in), damage persisted and repaired, career survived a full page reload; no console errors
- Known risk (post-slice): damage-heavy losses can drain cash with no recovery — the loanshark mechanic from the backlog is the designed fix

## Milestone 7 — Visual polish ✅ (2026-07-08)
- [x] Night-race treatment: darker world, additive-glow lighting — headlight throw + brake-flare taillights on every car, cat-eye reflectors along track edges, street lights with warm ground pools, chevron warning signs at sharp corners (curvature-derived)
- [x] VFX upgrades: turbo exhaust flame, explosion debris chunks, lingering flickering fire on wrecks
- [x] Synthesized audio (WebAudio, no assets): engine hum tracks speed/turbo, gunfire (distance-attenuated), explosions, pickup chimes + trap sting, countdown beeps; M mutes; each call site is a swap-point for real samples later
- [x] UI polish: HUD plates with labels for DMG/AMMO/TURBO bars, standings panel plate, glowing menu title, drifting haze + career car showcase on the menu
- [x] Game feel: camera look-ahead toward velocity
- Verified in browser: night lighting, brake flares, burning wreck, 71 fps under load, no console errors
- Note: chevron sign side-of-corner placement is approximate; revisit when tracks get an art pass. Art-pipeline decision (AI-gen vs authored sprites) still open — see DECISIONS.md.

## Milestone 8 — Playable vertical slice ✅ (2026-07-08)
- [x] One polished (night-dressed) track — Rust Belt Circuit
- [x] 3 named AI rivals, retuned to race hard: they now finish 3 laps in ~67–82s in skill order; difficulty also ramps with career points (DIFFICULTY_RAMP) so upgrades stay earned
- [x] Gun + mines: $450 garage pack of 6 proximity mines (one race only), dropped behind with C, 900ms arming, 26 damage + splash + blast shove, scorch marks; mine stock shown as HUD pips
- [x] Garage + upgrade loop + career progression (from M6), now including the mines tile — the first black-market-style consumable
- [x] Race can no longer hang: when every rival is finished/wrecked, a 5-second on-screen countdown ends the race at the player's current placement
- [x] Stable publishable build: `base: './'` for itch.io subdirectory hosting, localStorage guarded for private/iframe contexts, production `dist` verified end-to-end in the browser (career, garage, mines, race, results); README documents the itch.io upload
- Verified against production `vite preview`, not just dev: full loop, mine detonation, auto race-end, save persistence; no console errors

**Vertical slice complete.** Next work comes from the post-slice backlog below.

## Milestone 9 — Career ladder ✅ (2026-07-08)
- [x] Three risk-tier races on offer every round (Street/Pro/Death, 1×/4×/16× payouts) — sign-up screen with color-coded tier cards, prizes, laps, and the grid for each
- [x] Three tracks, one per tier: Dust Bowl Run (wide street opener), Rust Belt Circuit (pro), Serpent's Throat (narrow 4-lap death gauntlet) — all pure data files
- [x] Persistent 20-driver championship ladder (19 original roster rivals + player starting #20): rivals near your rank fill your grid, podiums earn them points by the same tables, and the two skipped tiers run as simulated background races (pure logic + 8 tests)
- [x] Rival pace comes from ladder rank (#1 ≈ 1.05×, #20 ≈ 0.90×) with 3 driving-style personalities cycled across the grid; replaces the fixed-rival difficulty ramp
- [x] Ranking scene after every race: full 20-row table, player highlighted; menu shows career rank
- Flow: Garage → Sign-Up → Race → Results → Ladder → Garage
- Verified in browser: tier cards with tail-ender grids for a rank-20 rookie, death race on Serpent's Throat won (+$12,000/+8 pts), ladder points awarded exactly per tables, save round-trips; no console errors

## Milestone 10 — Final duel & black market ✅ (2026-07-08)
- [x] Final boss duel: at rank #1 the sign-up screen becomes a single mandatory 1-v-1 challenge from **The Sovereign**, an original champion above the 20-driver ladder (one-off car spec + pace above the rank-1 rival, black/gold livery)
- [x] Winning pays a $25,000 purse, sets a persistent `champion` flag, and lands on a proper CHAMPION win screen (glow title, ember drift, career stats); menu + ranking show champion status; career continues after the crown, duel is not re-offered
- [x] Losing the duel costs nothing but the damage — stay rank #1, retry next round (pure duel logic + 4 tests)
- [x] Black-market scene (garage MINES tile → MARKET) with mines + 4 new items, all data-driven:
  - Ram plating ($650, one race): your rams deal 2.2×, you take 0.5×
  - Overcharged turbo ($900, one race): 1.45× top speed / 2.7× accel boost that self-damages 3.5%/s while boosting (orange flame + HUD badge) and drains 1.5× faster
  - Sabotage ($1,400): strongest rival on your next grid starts at 40% damage
  - Loanshark: borrow $3,000, owe $4,500 within 3 races; early repay in the market; due-and-paid collects from winnings; due-and-broke sends the enforcers (all cash + 40% damage, debt written off) — the designed fix for the broke-with-a-wrecked-car death spiral (pure logic + 12 tests)
- [x] Results screen shows the loan clock / collection / enforcement; save format extended with backward-compatible deserialization (old saves load clean)
- Verified in browser via debug hooks: all 5 purchases + early repay (cash math exact), sabotaged rival spawns at 40%, plated ram dealt 39.6 (18 cap × 2.2) vs halved return, overcharged top speed exactly 520×1.45=754 px/s, loan countdown → enforcement on results, duel offer/loss/win end-to-end twice, champion menu line, sign-up back to 3 tiers post-crown; 91 unit tests, no console errors

## Milestone 11 — Content & feel: cars, tracks, AI, combat physics ✅ (2026-07-08)
- [x] 6-car chassis ladder (Jackal $500 → Vandal $1.4k → Marauder $2.6k → Harrier $4.4k → Basilisk $6.8k → Leviathan $16k), each with collision mass and one of three body silhouettes (compact/muscle/sleek, procedural variants); garage got min-max-normalized stat-compare bars with a tick marking your current car
- [x] 3 new tracks — Boneyard Loop (street, sand theme), Cinder Yards (pro, cold industrial), Widow's Coil (death, swamp folds) — with per-track ground/shoulder color themes; sign-up rolls one venue per tier per round and draws a mini track-outline preview on each card; geometry guarded by data tests (world bounds + no distant-fold wall overlap)
- [x] AI difficulty: rivals now drive the chassis their ladder rank earns (rank 1 = Leviathan … rank 20 = Jackal — this was the big fix: they all drove the starter car before), pace curve raised (#1 ≈ 1.08×), braver cornering, stronger rubber band, and 2/4 mines carried in pro/death races dropped on tailgaters (with an 8s opening grace so the packed grid doesn't get mined at the line); boss rebalanced above the Leviathan
- [x] Collision physics: pure mass-weighted impulse model with restitution + tangential spin kick (core/vehicle/collision.ts, 6 tests) — heavy cars shove light ones, glancing hits twist you round; mine blasts got a radial falloff shove + spin-out and can no longer be shrugged off
- [x] Combat feel: elongated gradient tracers with hot particle trails, shockwave ring + fireball on mine blasts and wrecks, floating pickup toasts (+$200 / +50 AMMO / TRAPPED!), orange overcharge flame
- Verified in browser: all 3 new tracks driven (fold corridors clean), rank-based chassis confirmed via debug hook (harrier/marauder at mid-rank), scripted ram spun the rival 13° with mass-correct momentum split, mine self-test dealt 26+ damage with spin kick, AI finished a 4-lap death race in <90s (was 67-82s for 3 laps in M8), grid-start mining regression caught and fixed; 117 unit tests, no console errors

## Milestone 12 — Feel & clarity ✅ (2026-07-09)
Full spec: **docs/MILESTONE_12_PLAN.md**. Delivered:
- [x] **Airborne is core state, not a visual**: `CarState` gained `z`/`vz`; while airborne `stepCar` ignores steering, throttle, brake, grip and drag — the car carries its velocity and arcs down (0.8s / 128px apex for a direct hit at mass 1.0, `airtime = 2·vz/gravity`). Mine blast response moved into a pure `core/combat/blast.ts` (damage, radial shove with falloff, spin, launch, all mass-damped). Airborne cars fly over barriers, mines, bullets and the pack. Rendering: sprite scales over a thrown drop shadow, lands with a dust ring, squash-and-settle bounce and a thump
- [x] Combat feel: bullet hits spark + flash the victim white + shove it along the bullet's path (player hits add shake + a red screen-edge flash); car-vs-car crunch scales sparks and shake with closing speed and dilates time (0.35× for 120ms) above a threshold; turbo gained a flame cone, heat glow, screen-edge speed streaks, camera pull-back and jitter (red and twice as violent on the overcharged mix)
- [x] Mine redesign: 40px dark disc with a bone-white rim, hazard wedges, blinking amber arm-light and a breathing danger ring once armed — verified readable on all 6 ground themes
- [x] AI talent grades: permanent per-driver skill (4 aces / 6 veterans / 5 journeymen / 4 rookies over the 19 rivals; the champion drives as an ace) scaling pace, cornering bravery, aim spread, mine aggression and rubber-band reliance. Grades are data keyed by driver id, so old saves pick them up for free. Driving **style now follows talent** (aces charge, rookies bruise) instead of grid slot. Stars shown on the ladder and on every sign-up grid
- [x] UI clarity: **CAR DEALER** scene (browse all 6 chassis, stat bars with a marker for the car you own, ▲/▼ deltas, price − trade-in = net, unaffordable cars stay browsable), **VENUES** gallery from the menu (V), full-size track maps on the sign-up cards, ladder stars, and **measurable upgrade labels** computed from the real data tables (`ARMOR Lv0→Lv1 · DAMAGE TAKEN -15%`, `RAM DAMAGE DEALT ×2.2 · TAKEN ×0.5`) — never hand-written, so tuning changes can't leave a lying price tag. Garage bars animate to their new value after a purchase
- [x] Difficulty tuned to "Challenging" with a scripted harness (debug `__autoPilot` drives the player with the AI; `__step` runs the loop by hand). Measured, mid-career, same-tier car: clean driving → 3rd; + guns and mines → 1st at the cost of ~55% damage; late career in a Leviathan vs the three aces on a death track → 2nd, survived
- Four real defects surfaced by the tuning loop and fixed (see DECISIONS.md): AI corner look-ahead didn't scale with speed, rivals held the trigger forever, gun damage was symmetric in a 3-vs-1 fight, and death-tier mine density was lethal after airborne landed
- Verified: 170 unit tests, clean `tsc` + build, browser playthroughs on all 6 venues (mine readability, airborne, turbo, crash lurch, dealer/venues/garage/market/ladder screens), no console errors; test career cleared afterwards
- Open: the final "Challenging" call is AT's — the scripted pilot is an AI proxy, not a human. Hands-on races are the last check

## Milestone 13 — Fix & sharpen ✅ (2026-07-09)
Four problems AT hit while playing. See DECISIONS.md D-028…D-033.
- [x] **Cars no longer land in the infield**: the tire wall is solid at any height, so a mine launch bounces off it instead of clearing it (airborne cars still ignore off-track drag). Backed by a **stuck-car rescue** — crawling *and* off the tarmac for 3s puts a car back on the racing line at its next gate; a car parked on the line is never moved. Pure logic in `core/vehicle/rescue.ts`, 8 tests
- [x] **The race tier now decides who you race**, not just what it pays: rivals are drawn from a talent band (street ★–★★ · pro ★★–★★★ · death ★★★–★★★★). Before this, all three sign-up cards drew from the same window around your rank — a death race fielded the same rookies for 16× the money
- [x] **The AI is no longer slow**: the pace floor rose 0.90 → 0.94 (a rookie's talent scale had dragged the slowest car on the grid to 0.864×) and all three driving styles corner ~10% faster. The ceiling barely moved — measurement showed lifting it too put three aces beyond a fully-upgraded Leviathan
- [x] The booby-trap pickup wears a skull and swims your camera for 4.5s (was 2.6s); checkpoint debug lines moved off `?debug=1` onto `?gates=1`
- Measured with the scripted pilot (Cinder Yards, same clean-driving proxy, mid-career Harrier): **street → 1st** (also 1st in the starter car on Dust Bowl), **pro → 2nd**, **death → 4th** at 31% damage. Armed: pro → 1st, death → 3rd with an ace wrecked. Late career, Leviathan + weapons vs the three aces on Serpent's Throat → 3rd, one gate down, two aces over 45% damage
- Verified: 181 unit tests, clean `tsc` + build; in-browser — a car launched to a 601px apex never gets more than 170px off-centre (the wall holds), a stranded car recovers at 3008ms, a parked car drifts 0px over 6.4s, the skull reads clearly at race zoom
- Open: as with M12, the final "is it challenging?" call is AT's — the scripted pilot corners conservatively and under-reports a human

## Milestone 14 — The AI learns to drive ✅ (2026-07-09)
AT won four death races in a row by nearly a lap. The scripted pilot had predicted 4th, so the first job was finding out what the pilot could not see. See DECISIONS.md D-034…D-038.
- [x] **Root cause**: the aces were averaging 63% of their own top speed and taking 26 wall damage a race — they were braking for corners the grip would have taken flat, and driving the centerline, which is both longer and curvier than the line a driver takes. Probing (caution ×0.6 / ×0.4 / ×0.2 → +20% / +27% / +34% pace, wall damage unchanged at 26) proved there was no crash cliff, only unused grip
- [x] **Racing line** (`core/track/racingLine.ts`, 15 tests): relaxation inside the track corridor produces a wide-apex-wide line, guarded on every shipped venue by tests asserting it stays on the tarmac, is shorter, and is straighter than the centerline
- [x] **Cornering retuned** per talent grade on top of that line; **turbo became a decision** (`core/ai/turbo.ts`, 8 tests) — corner exit, chasing a gap, defending a bumper, with a reserve held otherwise
- [x] **Combat sharpened**: rival gun damage now scales with the purse (street 0.5 · pro 0.75 · death 1.0 — it was a flat 0.5, which made the top tier a shooting gallery); aces fire at the bullet's intercept point (`core/combat/aim.ts`, 8 tests) instead of where you were; rivals with the leader in range shoot the **leader**; death-tier mines 2 → 3 per rival, dropped only at a car that is actually closing, and rivals now steer around armed mines
- Measured on Serpent's Throat, aces: **avg 458 → 600 px/s**, max 665 → 747 (they finally reach their own top speed), wall damage **26 → 0**, race 82s → 65s. Street still opens easily (rookies 270 px/s, journeyman 373, starter car wins by 2 gates); pro is a four-car photo finish
- Verified: 212 unit tests, clean `tsc` + build, zero AI wall damage across Dust Bowl / Cinder Yards / Serpent's Throat
- Open: **AT drives it.** The scripted pilot demonstrably under-reports a human — it said "4th" for a race AT won by a lap — so the only instrument that works now is hands-on play

## Milestone 15 — Machinery, not multipliers ✅ (2026-07-09)
Death tier was still losing, and AT's mines "somehow never hit" the car in front. Both were bugs, not tuning. See DECISIONS.md D-039…D-041.
- [x] **The mine bug was real.** `armDelayMs` (900ms) made a dropped mine inert for *everyone*, so it was still asleep when the car chasing it drove over. The delay now protects only the dropper (`ownerSafeMs`); everyone else gets a 45ms fuse, derived from the geometry — the mine lands 55px off the tail, a pursuer on the bumper covers that in 58ms. Verified at 140/90/70px gaps: all hit, 19 damage and an 111px launch. The dropper eats 7 splash of their own blast at point-blank
- [x] **Rivals now fit upgrades from their ladder rank** (`rivalUpgrades`, #1 fully built → #20 stock). This was the structural asymmetry: rivals drove showroom cars while the player ran tier-3 tires, **+40% grip**. Probing had already shown the AI was at the grip limit, not the braking limit — cutting cornering caution from 0.16 to 0.05 moved them 80% → 84% of top and no further. They had no armor either, which is why they could be wrecked at will
- [x] **Pace multipliers shrank** to compensate: rank band 0.94–1.09 → **0.94–1.00**, rubber-band ceiling 1.10 → **1.06**. With real machinery a rank-1 ace plus the old band would have chased down a leading player at 955 px/s in a 758 px/s car — the exact cheat D-017 exists to forbid
- Measured, aces on Serpent's Throat: **avg 458 → 679 px/s** across M14+M15, top speed 745 → 798, and they now survive 179 damage instead of wrecking. A maxed Leviathan + weapons against all three aces is a same-lap photo finish (49 gates each, aces ~8% faster than the scripted pilot). Street is untouched: starter car still wins clean by 8 gates
- Rejected: "average = 95% of top speed". The ceiling is grip, not courage; 95% would mean taking hairpins flat. Real racing sits at 70–85%. The fix was a bigger top speed and more grip under it, not a bigger fraction
- Verified: 224 unit tests, clean `tsc` + build
- Open: **AT drives it.** The scripted pilot still under-reports a human by a wide margin

## Post-slice backlog (distinctive mechanics from research)
- Sign-up entrant slots filling in real time (flavor)
- Black-market stock rotation (items occasionally OUT OF STOCK, per research)
- Gamepad; desktop wrapper; Hall of Fame; more track themes/venues
