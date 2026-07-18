# Top-down car variant prompts

These prompts create two visually distinct variants for every vehicle currently in `public/assets/cars/top/`. Each existing image is a **chassis identity reference**. Preserve its overall footprint, body proportions, roof openings, weapon location, and recognizable armor silhouette while changing color blocking, panel construction, wear pattern, and small secondary details.

## Shared production constraints

- Exact 90-degree orthographic top-down camera with no perspective or visible horizon.
- Vehicle centered horizontally, nose pointing directly right, full silhouette visible, 10% clear padding on all sides.
- Realistic game sprite render with crisp readable shapes at small size and controlled surface detail.
- Perfectly flat solid `#00FF00` chroma-key background. One uniform color only: no floor, shadows, gradients, texture, reflections, smoke, dust, debris, glow spill, or lighting variation outside the vehicle.
- Crisp separated edges. Do not use `#00FF00`, bright green paint, or green lighting anywhere on the vehicle.
- No cast shadow, contact shadow, text, logos, brand marks, flags, political or religious symbols, watermark, border, UI, scenery, people, or extra objects.
- Keep exactly one complete vehicle. No cropped parts, duplicate wheels, detached weapons, or malformed geometry.

## Jackal A — Ivory Courier

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Jackal chassis. Preserve its compact narrow sedan footprint, squared cabin, roof weapon position, improvised perimeter armor, and front/rear proportions. Redesign it as an agile courier build with dirty ivory body panels, a wide deep-crimson center stripe, black wheel arches, asymmetric riveted door plates, a compact rectangular roof gun shield, and thin copper wear along exposed edges.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, tactile battered metal, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to the vehicle, high readability, no glow spill.
Constraints: same recognizable Jackal chassis; compact armor; exactly four correctly placed wheels; no bright green anywhere on vehicle; background must remain pure #00FF00 with no shadow, floor, gradient, texture, or reflection.
Avoid: text, numbers, logos, scenery, smoke, dust, debris, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Jackal B — Azure Scrap Runner

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Jackal chassis. Preserve its compact narrow sedan footprint, squared cabin, roof weapon position, improvised perimeter armor, and front/rear proportions. Redesign it as a scrappy street runner with oxidized turquoise-blue main panels, bone-white roof, matte charcoal hood, mismatched bronze repair plates, a narrow exposed roof-mounted autocannon, diagonal black hazard blocks on the rear quarter, and visibly lighter armor than the other cars.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, handmade repairs, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to the vehicle, high readability, no glow spill.
Constraints: same recognizable Jackal chassis; visibly different from Ivory Courier; exactly four correctly placed wheels; no bright green anywhere on vehicle; background pure #00FF00 with no shadow, floor, gradient, texture, or reflection.
Avoid: text, numbers, logos, scenery, smoke, dust, debris, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Vandal A — Saffron Street Brawler

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Vandal chassis. Preserve its boxy compact sedan footprint, long rectangular hood and trunk, roof weapon centered over the cabin, perimeter spikes, and squared proportions. Redesign it with saturated saffron-orange paint, a broad matte-black longitudinal stripe, raw steel front spike bar, blackened roof panel, twin short roof guns, patchwork rear fenders, and small turquoise ceramic-color accents confined to thin geometric pinstripes.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, reckless street-built finish, crisp at sprite scale.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to the vehicle, no external shadow or glow.
Constraints: same recognizable Vandal chassis; orange/black graphic identity; exactly four wheels; no green vehicle color; pure #00FF00 background without shadow, floor, gradient, texture, reflection, or spill.
Avoid: taxi words, text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Vandal B — Cobalt Copper Outlaw

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Vandal chassis. Preserve its boxy compact sedan footprint, long rectangular hood and trunk, central roof weapon, perimeter spikes, and squared proportions. Redesign it with dark cobalt-blue paint, hammered copper hood and trunk plates, cream-colored doors, a single heavy low-profile roof cannon in a circular base, sawtooth side armor, exposed red primer scratches, and a bold copper cross-band over the cabin.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, brutal handmade metalwork, crisp at sprite scale.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, no external shadow or glow.
Constraints: same recognizable Vandal chassis; clearly different from Saffron Street Brawler; exactly four wheels; no green vehicle color; pure #00FF00 background without shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Marauder A — Oxide Gunmetal Bruiser

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Marauder chassis. Preserve its broad muscular sedan footprint, long hood, compact cabin, central roof gun, heavy bumper armor, and planted width. Redesign it with dark gunmetal bodywork, burnt-orange hood armor, black roof, thick riveted shoulder plates, a short heavy roof cannon inside a squared armored cradle, layered wedge armor at the nose, and pale steel abrasion on outer edges.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, heavyweight functional armor, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, strong material readability.
Constraints: same recognizable Marauder chassis; broad and heavier than Jackal/Vandal; exactly four wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, dust, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Marauder B — Desert Lapis Enforcer

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Marauder chassis. Preserve its broad muscular sedan footprint, long hood, compact cabin, central roof gun, heavy bumper armor, and planted width. Redesign it with sand-beige body panels, a deep lapis-blue armored roof and hood stripe, dark brown wheel housings, brass-toned rivet lines arranged in restrained geometric bands, a twin-barrel roof weapon, split angular front plow, and dust-worn black side rails.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, desert-worn armored engineering, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, strong material readability.
Constraints: same recognizable Marauder chassis; clearly different from Oxide Gunmetal Bruiser; exactly four wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, dust clouds, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Harrier A — Bone Cobalt Interceptor

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Harrier chassis. Preserve its wide lifted fastback footprint, tapered nose, large wheels, circular roof weapon opening, twin rear exhaust treatment, and off-road proportions. Redesign it with dirty bone-white panels, cobalt-blue front and rear armor blocks, exposed black suspension wells, a circular rotary cannon mount, paired steel exhaust stacks, thin amber warning slashes, and lightweight vented hood armor.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, high-speed off-road engineering, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, no external shadow or glow.
Constraints: same recognizable Harrier chassis; visually tall, wide, and fast; exactly four large wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Harrier B — Black Saffron Pursuit

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Harrier chassis. Preserve its wide lifted fastback footprint, tapered nose, large wheels, circular roof weapon opening, twin rear exhaust treatment, and off-road proportions. Redesign it with satin charcoal-black bodywork, saffron-yellow roof and hood panels, weathered silver skid armor, an elongated low-profile railgun through the circular roof mount, asymmetric side intake plating, twin heat-blued rear stacks, and pale blue pinstriped geometric accents.
Input images: Image 1 is a chassis identity reference only; preserve the car identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, sleek pursuit-machine finish, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, no external shadow or glow.
Constraints: same recognizable Harrier chassis; clearly different from Bone Cobalt Interceptor; exactly four large wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Basilisk A — Cobalt Salt Raider

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Basilisk chassis. Preserve its boxy armored pickup footprint, short cabin, open rear weapon bed, long rectangular hood, rear-mounted gun, and spiked front width. Redesign it with deep cobalt-blue cab and fenders, salt-white hood and bed plates, tar-black central armor, a triple-barrel rear gun, bright raw-steel front teeth, weathered copper side exhaust, and cracked white salt abrasion around lower edges.
Input images: Image 1 is a chassis identity reference only; preserve the pickup identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, battered desert pickup, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, no external shadow or glow.
Constraints: same recognizable Basilisk pickup chassis; open bed remains readable; exactly four wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, salt ground, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Basilisk B — Violet Brass Ravager

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Basilisk chassis. Preserve its boxy armored pickup footprint, short cabin, open rear weapon bed, long rectangular hood, rear-mounted gun, and spiked front width. Redesign it with dark desaturated violet bodywork, antique-brass hood armor, black bed, cream roof, a single oversized rear-bed cannon in a reinforced square cradle, serrated side rails, oxblood repair panels, and brass geometric linework kept broad enough to read at sprite scale.
Input images: Image 1 is a chassis identity reference only; preserve the pickup identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, menacing premium scavenger engineering, crisp silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, no external shadow or glow.
Constraints: same recognizable Basilisk pickup chassis; clearly different from Cobalt Salt Raider; open bed readable; exactly four wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Leviathan A — Obsidian Crimson Fortress

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Leviathan chassis. Preserve its massive long armored SUV footprint, wide cabin, central circular turret, roof cargo zones, heavy side armor, and blunt front/rear proportions. Redesign it with obsidian-black main armor, deep crimson roof bands, dark bronze turret ring, layered wedge plates over the hood, a heavy short-barrel cannon, red-edged side spikes, and tightly strapped charcoal cargo modules at the rear.
Input images: Image 1 is a chassis identity reference only; preserve the SUV identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, fortress-like mass, crisp silhouette at sprite scale.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, strong dark-surface readability, no glow spill.
Constraints: same recognizable Leviathan SUV chassis; largest and heaviest visual mass; exactly four wheels; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Leviathan B — Desert Teal Bulwark

```text
Use case: stylized-concept
Asset type: top-down combat-racing vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Leviathan chassis. Preserve its massive long armored SUV footprint, wide cabin, central circular turret, roof cargo zones, heavy side armor, and blunt front/rear proportions. Redesign it with dusty sand-colored armor, dark blue-teal roof plates that are clearly blue rather than green, matte black wheel housings, a broad steel turret ring with twin cannons, brass corner reinforcements, turquoise-blue geometric bands across cargo cases, and a split heavy front ram.
Input images: Image 1 is a chassis identity reference only; preserve the SUV identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, desert-expedition fortress, crisp silhouette at sprite scale.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, strong surface readability, no glow spill.
Constraints: same recognizable Leviathan SUV chassis; clearly different from Obsidian Crimson Fortress; exactly four wheels; no bright green or chroma green anywhere on vehicle; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Sovereign A — Oxblood Black Champion

```text
Use case: stylized-concept
Asset type: top-down combat-racing champion vehicle sprite source
Primary request: Recreate the car in Image 1 as a distinctive alternate version of the same Sovereign chassis. Preserve its exceptionally long low armored footprint, pointed front, broad rear shoulders, central circular turret, dense roof plating, spikes, and elite engineered character. Redesign it with blackened precision armor, oxblood-red outer blades, tarnished gold seam lines, a low circular twin-cannon turret, symmetrical layered nose armor, and narrow ivory heat shields near the rear.
Input images: Image 1 is a chassis identity reference only; preserve the champion identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, elite endgame machine, crisp authoritative silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, high contrast on black panels, no glow spill.
Constraints: same recognizable Sovereign chassis; longest, lowest, and most advanced appearance; exactly four wheels integrated under armor; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: crown, throne, text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```

## Sovereign B — Ivory Lapis Imperator

```text
Use case: stylized-concept
Asset type: top-down combat-racing champion vehicle sprite source
Primary request: Recreate the car in Image 1 as a second distinctive version of the same Sovereign chassis. Preserve its exceptionally long low armored footprint, pointed front, broad rear shoulders, central circular turret, dense roof plating, spikes, and elite engineered character. Redesign it with scorched ivory armor plates, deep lapis-blue central spine, black understructure, antique-gold turret ring, one long precision cannon, crimson intake slashes, and restrained broad geometric panel divisions inspired by Persian metal inlay without literal symbols.
Input images: Image 1 is a chassis identity reference only; preserve the champion identity while changing paint and armor design.
Style/medium: realistic industrial combat-racing game asset, elite ceremonial engineering made battle-worn, crisp authoritative silhouette.
Composition/framing: exact 90-degree orthographic top-down; nose points directly right; vehicle centered; entire silhouette visible with 10% padding; no perspective.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key field, completely uniform.
Lighting/mood: neutral controlled overhead studio light restricted to vehicle, high material readability, no glow spill.
Constraints: same recognizable Sovereign chassis; clearly different from Oxblood Black Champion; exactly four wheels integrated under armor; no green vehicle color; background pure #00FF00 with no shadow, floor, gradient, texture, reflection, or spill.
Avoid: crown, throne, text, numbers, logos, scenery, smoke, people, flags, watermark, border, duplicate parts, cropped silhouette.
```
