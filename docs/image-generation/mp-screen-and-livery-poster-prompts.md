# Multiplayer screen templates & per-livery poster prompts

GPT Image prompts for the multiplayer quick-race screen, the room/lobby screen,
and one poster per livery variant (replacing the single shared poster per car).

**Sizes:** screens = landscape **1536×1024** · posters = portrait **1024×1536**

Notes from the repo:

- Existing posters (`public/assets/cars/posters/`) are portrait 2:3, **no text**
  (title text is drawn by the UI). New posters must match.
- Every livery already has a top-down sprite in `public/assets/cars/top/variants/`.
  For livery posters use GPT Image **edit mode**: attach the car's factory poster
  plus its variant top sprite and ask for a repaint — same composition per car,
  colors match in-game.
- The 206 Anahita has a hero image but no poster; it needs one from scratch.

---

## 1 · Multiplayer Quick Race screen template (text-to-image)

Layout zones the image must leave clear:

```
┌───────────────────────────────────────────────┐
│ TITLE ZONE (dark, low detail)        [BACK]   │
│                                  ┌──────────┐ │
│   ┌─────────────────────┐        │  EMPTY   │ │
│   │   MENU COLUMN       │        │  POSTER  │ │
│   │   (near-black,      │        │  FRAME   │ │
│   │    keep clear)      │        │  (2:3)   │ │
│   └─────────────────────┘        └──────────┘ │
│ KEY-GUIDE STRIP (very dark, clean)            │
└───────────────────────────────────────────────┘
```

> Widescreen 16:9 background for a combat-racing game menu, photoreal cinematic,
> industrial night. Interior of a grim vehicle staging bay in a ruined
> Middle-Eastern industrial district: oil-stained concrete, chain hoists, stacked
> wrecked cars far in the shadows, thin smoke, faint rain. Lighting is near-black
> with restrained amber sodium work-lamps; deep shadow everywhere except two
> zones. On the RIGHT third of the frame, a large empty vertical poster frame
> (2:3 portrait ratio) bolted to the wall — riveted steel frame, subtly lit by a
> single amber spotlight from above, the inside of the frame left as plain dark
> matte surface (a game poster will be placed there). The CENTER-LEFT half of the
> image is a clean, very dark, low-detail area of wall and floor in deep shadow,
> suitable for overlaying menu text. Top edge and bottom edge fade to pure black
> bands. No cars in the foreground, no people, no text, no logos, no watermark.
> Muted palette: near-black, charcoal, burnt orange accents.

## 2 · Room / Lobby screen template (text-to-image)

Reserves zones for the planned lobby UI rework (roster grid with car images and
driver names, room-code copy plate, modern key-guide bar — those are code
changes, the template just leaves them room).

> Widescreen 16:9 background for a combat-racing game lobby screen, photoreal
> cinematic, industrial night. A dispatcher's briefing room overlooking a dark
> racing yard: in the CENTER, a large blank steel notice-board panel mounted on
> the wall — flat, matte, near-black, framed in riveted metal with four amber
> corner bolts, occupying the middle 60% of the frame, completely empty (a
> roster grid will be overlaid there). Above it, a narrow horizontal steel strip
> along the very top edge, darker than everything else, clean and uncluttered (a
> key-guide bar will be overlaid). Faint background detail only at the far
> edges: wire-glass window with rain, distant floodlights, hanging cables.
> Lighting: one soft amber overhead lamp on the board, everything else falls to
> black. Very low contrast, no busy texture in the center. No cars, no people,
> no text, no logos, no watermark. Palette: near-black, charcoal, single amber
> accent.

## 3 · 206 Anahita factory poster (text-to-image, portrait 1024×1536)

> Vertical 2:3 combat-racing car poster, photoreal cinematic, matching a gritty
> night-bazaar series. Night scene in a ruined Middle-Eastern bazaar alley:
> tiled pointed archways, shuttered steel shopfronts, hanging cables, amber
> sodium-vapor light, smoke and sparks, wet reflective asphalt, a
> black-and-amber striped concrete barrier in the foreground. The car: a small
> early-2000s French-style compact hatchback (Peugeot 206 silhouette), armored
> for combat racing — light azure-blue body with ivory accent panels, riveted
> steel patches, roof-mounted machine gun, spiked ram bar, grille mesh over
> windows, rust streaks and grime, painted race number on the hood. 3/4 front
> view, low dramatic angle, burnt-orange rim light. No text, no logos, no
> watermark.

## 4 · Livery posters (edit mode — 12 prompts)

For each row: attach the car's factory poster
(`public/assets/cars/posters/<id>.webp`) as **image 1** and the variant
top-down sprite (`public/assets/cars/top/variants/<id>-a|b.webp`) as
**image 2**, then use the shared prompt with the row's color line:

> Repaint ONLY the car's paintwork and markings in image 1 to this livery:
> **[COLOR LINE]** — match the color scheme shown in the top-down reference
> (image 2). Keep the composition, background, camera angle, lighting, armor,
> weapons, damage, and race number exactly the same. No text, no logos, no
> watermark.

| # | Attach (image 1 / image 2) | Livery | [COLOR LINE] |
|---|---|---|---|
| 4.1 | jackal / jackal-a | Cielo — Ivory Courier | ivory bone-white body with faded red courier stripes down the hood and sides |
| 4.2 | jackal / jackal-b | Cielo — Azure Scrap Runner | deep azure-blue body with raw bare-metal scrap patches |
| 4.3 | vandal / vandal-a | Peykan — Saffron Street Brawler | saffron yellow-orange body with black brawler stripes |
| 4.4 | vandal / vandal-b | Peykan — Cobalt Copper Outlaw | cobalt-blue body with weathered copper accent panels |
| 4.5 | marauder / marauder-a | Pride — Oxide Gunmetal Bruiser | rust-oxide red-brown body with gunmetal grey armor panels |
| 4.6 | marauder / marauder-b | Pride — Desert Lapis Enforcer | desert sand-tan body with lapis-blue enforcer markings |
| 4.7 | harrier / harrier-a | 405 — Bone Cobalt Interceptor | bone-white body with cobalt-blue interceptor stripes |
| 4.8 | harrier / harrier-b | 405 — Black Saffron Pursuit | matte black body with saffron-orange pursuit markings |
| 4.9 | basilisk / basilisk-a | Vanet — Cobalt Salt Raider | cobalt-blue body with salt-white weathered panels |
| 4.10 | basilisk / basilisk-b | Vanet — Violet Brass Ravager | deep violet body with tarnished brass trim |
| 4.11 | leviathan / leviathan-a | Patrol — Obsidian Crimson Fortress | obsidian-black body with crimson fortress markings |
| 4.12 | leviathan / leviathan-b | Patrol — Desert Teal Bulwark | desert-tan body with teal bulwark panels |

Sanity-check each repaint against its top sprite before wiring in.

Finished images go under `public/assets/` (screens → `screens/`, posters →
`cars/posters/`); paths get wired up together with the lobby UI rework.
