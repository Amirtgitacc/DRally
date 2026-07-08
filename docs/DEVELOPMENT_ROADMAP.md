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

## Post-slice backlog (distinctive mechanics from research)
- Three concurrent risk-tier races per round; entrant slots filling in real time
- Full 20-driver persistent ranking ladder + final boss duel
- Black market: ram plating, overcharged turbo, sabotage, loanshark
- 6-car chassis ladder; more tracks/themes; gamepad; desktop wrapper; Hall of Fame
