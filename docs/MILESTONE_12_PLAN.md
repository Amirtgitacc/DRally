# Milestone 12 Plan — "Feel & Clarity" (approved 2026-07-09)

Goal: make combat *felt*, make everything *readable and measurable*, and make winning *earned*.
Scope approved by AT. Difficulty target: **Challenging** — in a same-tier car, clean driving
alone gets 2nd–4th; adding weapons puts you in the fight for 1st; a better car makes you the
favourite but not a lock.

Architecture rules still apply: pure logic in `src/core` (no Phaser imports), tuning/content in
`src/data`, Phaser layer in `src/game`. All content original — never copy from the 1996 game.

---

## Workstream 1 — Combat feel & physics

| Event | Today | After M12 |
|---|---|---|
| Bullet hits a car | number goes down | impact spark + victim flashes white; small velocity kick per hit; when the *player* is hit: camera shake + red edge-flash |
| Mine detonation | shove + spin | victim **launches airborne ~0.8s**: no steering/traction while in the air, sprite scales up over a drop shadow, lands with bounce + dust ring + shake |
| Car-vs-car crash | impulse + spin | crunch shake scaled to impact, metal spark burst at contact point, brief slow-mo flash above an impact threshold |
| Turbo | flame tint | flame cone particles + heat glow, speed streaks at screen edges, slight camera pull-back + shake ramp; overcharged turbo = same but red/more violent |

Implementation notes:
- **Airborne is core state, not a visual.** Add to the car sim state: `z`, `vz`, `airborneUntil`
  (or equivalent). While `z > 0`: steering and traction inputs are ignored, velocity carries.
  Tuning numbers (launch impulse, gravity, duration ≈ 0.8s) live in `src/data/weapons.ts`
  (`MINE_BLAST`). Unit-test in core: mine hit ⇒ airborne ⇒ steering ignored ⇒ lands.
- Rendering (scale-up over drop shadow, landing dust/bounce) lives in `src/game/scenes/RaceScene.ts`.
- **Mine visibility:** redesign the mine texture — larger dark disc, blinking amber arm-light,
  faint danger ring once armed. Must read clearly on all 6 track ground themes at night
  (verify with screenshots on each theme).

## Workstream 2 — AI skill tiers + difficulty

- Each of the 20 named roster drivers in `src/data/drivers.ts` gets a **permanent talent grade**:
  `4 aces (★★★★) · 6 veterans (★★★) · 6 journeymen (★★) · 4 rookies (★)`.
- Grade scales: pace, cornering bravery (minCornerSpeed / corneringCaution), aim spread,
  mine aggression, rubber-band strength.
- **Chassis still comes from current ladder rank** (unchanged from M11) — an ace in a mid car is
  scary, a rookie in a good car is beatable.
- Ladder/ranking screen shows the stars next to each driver name.
- Grades are data (deterministic per driver), so old saves keep working — grade is looked up by
  driver id, not stored in the save.
- Tune in-browser until the Challenging bar holds (see Phase D).

## Workstream 3 — UI clarity

1. **CAR DEALER scene** (opened from the garage): ◄ ► arrows through all 6 catalog cars, big
   sprite, stat bars with a marker showing your current car's value on each bar, price +
   trade-in, Enter to buy, Esc back. Unaffordable cars still browsable.
2. **VENUES gallery scene** (from the main menu): ◄ ► through all 6 tracks, full-size track-map
   drawing (reuse/extend `drawTrackPreview` from SignUpScene), name, tier, length. Esc back.
3. **Bigger sign-up previews:** enlarge the track map on each sign-up card so the layout is
   readable at the decision moment.
4. **Measurable upgrades everywhere:** every garage upgrade and black-market item states its
   exact effect before purchase, e.g. `TIRES Lv2→Lv3 · GRIP +12%`, `ENGINE Lv1→Lv2 · TOP SPEED +8%`,
   `RAM PLATING · RAM DAMAGE DEALT ×2.2, TAKEN ×0.5`. Percentages are **computed from the real
   data tables** (a small pure helper in core, unit-tested) — never hand-written strings that can
   drift from the data. Stat bars animate to the new value after purchase.

## Phases (run in order, verify each before the next)

```
Phase A  data + core: driver talent grades, airborne state, upgrade-% helpers   → unit tests
Phase B  combat feel: bullet/mine/crash/turbo effects, mine texture             → browser check
Phase C  UI: dealer scene, venues gallery, bigger sign-up preview, ladder ★,
         measurable upgrade labels                                              → browser check
Phase D  difficulty tuning loop: scripted + hands-on races until the
         Challenging targets hold                                               → full playthrough
```

Verification per phase: `npm test && npm run build`, then drive the real game in the browser
(dev server port 5199, `?debug=1` hooks: `__getRace()`, `__setDrive()`, `__setCarState()`,
`__applyDamage(id,n)`, `__restartRace()`, `__gates`, `__pickups()`). If browser testing writes to
the career save, clear localStorage afterwards. Do not commit unless AT asks. Update
`docs/DEVELOPMENT_ROADMAP.md` and `docs/DECISIONS.md` when the milestone lands.

## Out of scope (stays in backlog)

New tracks/cars, gamepad, Hall of Fame, sign-up slot-filling flavor, market stock rotation,
art asset pipeline decision.

---

## Paste-ready prompt for the new session

> Continue building Deathrally (~/Projects/Deathrally). Execute **Milestone 12 — "Feel & Clarity"**
> exactly as specified in `docs/MILESTONE_12_PLAN.md` (already approved — don't re-ask scope).
> Read that file first, then run Phases A→D in order, verifying each phase with
> `npm test && npm run build` plus scripted browser playthroughs (dev server
> `npm run dev -- --port 5199`, `?debug=1` debug hooks) before moving on. Hard rules: pure logic
> in src/core (no Phaser imports), tuning in src/data, Phaser in src/game; all content original,
> never copy anything from the 1996 game; do not commit unless I ask; clear any test career from
> localStorage when done; update the roadmap and decision log after the milestone.
