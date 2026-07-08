# Deathrally (working title)

An original modern top-down combat racing game — a spiritual successor to a 1996 classic, built with TypeScript + Phaser 3. All planning docs live in [`docs/`](docs/PROJECT_OVERVIEW.md).

## Setup

```bash
npm install
```

## Run (dev)

```bash
npm run dev
# open http://localhost:5199
```

Add `?debug=1` to the URL to enable debug overlays (as they land).

## Test & build

```bash
npm test        # unit tests (Vitest)
npm run build   # typecheck + production build to dist/
npm run preview # serve the production build locally
```

## Controls (current)

| Key | Action |
|---|---|
| Enter | Confirm / start (menus) |
| Arrows / WASD | Accelerate, brake/reverse, steer |
| X | Fire machine gun |
| C | Drop mine (buy in garage first) |
| Shift | Turbo boost |
| Space | Handbrake (drift) |
| M | Mute audio |
| Esc | Back to menu |

## Publishing (itch.io)

```bash
npm run build          # outputs a self-contained dist/
cd dist && zip -r ../deathrally-web.zip . && cd ..
```

Upload `deathrally-web.zip` on itch.io as an HTML5 game ("This file will be played in the browser"), viewport 1280×720 or larger. The build uses relative paths, so it runs from any subdirectory.

## Project layout

See [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md). Short version: `src/core` = pure game logic (unit-tested, no Phaser), `src/data` = tuning/content configs, `src/game` = Phaser scenes/entities/systems.

## Reference material

`manual-death rally.pdf` and the screenshots in the project root are research references only — no original assets, names, or layouts are copied. See `docs/PROJECT_OVERVIEW.md` for the policy.
