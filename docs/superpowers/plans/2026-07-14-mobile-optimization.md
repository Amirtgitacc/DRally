# Mobile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a race fully playable by touch on a landscape phone/tablet — virtual joystick + FIRE/MINE/TURBO + pause — auto-enabled on touch devices, with landscape lock and native-keyboard name entry, without changing gameplay, economy, art, or the deterministic simulation.

**Architecture:** Touch is added as a third input source merged into `InputManager` exactly like the gamepad already is. A pure `joystickToActions` helper thresholds the joystick vector into the existing boolean steer/accelerate/brake actions, so the sim, AI, and seed reproducibility are untouched. On-screen controls are semi-transparent Phaser objects at fixed 1920×1080 coords (scale with FIT). Orientation and native keyboard are small DOM helpers outside Phaser.

**Tech Stack:** TypeScript (strict), Phaser 3.87, Vite, Vitest.

## Global Constraints

- `src/core/` stays Phaser-free and serializable; all work is in `src/game/`, `index.html`/`main.ts`, and `docs/`.
- No changes to gameplay rules, economy, tuning, AI, or art assets. Touch feeds only the existing boolean actions — no new action types, no analog values reach the simulation.
- Simulation-affecting randomness still comes only from the race offer seed.
- Desktop/keyboard/gamepad behavior must be byte-for-byte unchanged when no touch device is present.
- `InputManager` per-action merge is `keyboard OR gamepad OR touch`.
- FIT scaling stays (no reflow); 1920×1080 internal layout; readable at 1280×720.
- Race lifecycle: the touch pause button routes to the SAME pause path as `Esc` (opens `RacePause`, never jumps to a menu). Pausing freezes sim/AI/weapons/pickups/timers/clock. Weapons-off careers: FIRE/MINE touch buttons must not fire (the same weapons-off gate the keyboard path already respects).
- Every scene/component removes its pointer/DOM listeners on shutdown so repeated races don't stack handlers.
- Respect `reducedShake`/`reducedFlash` for any control-feedback animation.
- Verification per task: `npm run build` clean, `npm test` green, `git diff --check` clean, plus the browser/emulation smoke noted in the task.
- Commit after each task with the message shown.

---

### Task 1: `joystickToActions` pure helper (TDD) + `isTouchDevice`

The canonical thresholding logic (unit-tested) plus device detection. No Phaser, no rendering.

**Files:**
- Create: `src/game/input/joystickMap.ts`
- Create: `src/game/input/device.ts`
- Test: `tests/game/input/joystickMap.test.ts`

**Interfaces:**
- Produces: `joystickToActions(x: number, y: number, deadzone?: number): { accelerate: boolean; brake: boolean; steerLeft: boolean; steerRight: boolean }` — `x`/`y` in [-1,1], `y` negative = up = accelerate (same sign convention as the gamepad axis). Thresholds match the existing gamepad handling: steer at `|x| > 0.3`, accelerate at `y < -0.35`, brake at `y > 0.35`. Below `deadzone` magnitude (default 0.2), all false.
- Produces: `isTouchDevice(): boolean` — true on touch-capable devices.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/game/input/joystickMap.test.ts
import { describe, expect, it } from 'vitest'
import { joystickToActions } from '../../../src/game/input/joystickMap'

describe('joystickToActions', () => {
  it('returns no actions inside the deadzone', () => {
    expect(joystickToActions(0, 0)).toEqual({ accelerate: false, brake: false, steerLeft: false, steerRight: false })
    expect(joystickToActions(0.1, -0.1)).toEqual({ accelerate: false, brake: false, steerLeft: false, steerRight: false })
  })

  it('maps full up to accelerate only', () => {
    expect(joystickToActions(0, -1)).toEqual({ accelerate: true, brake: false, steerLeft: false, steerRight: false })
  })

  it('maps full down to brake only', () => {
    expect(joystickToActions(0, 1)).toEqual({ accelerate: false, brake: true, steerLeft: false, steerRight: false })
  })

  it('maps left and right past the steer threshold', () => {
    expect(joystickToActions(-1, 0).steerLeft).toBe(true)
    expect(joystickToActions(-1, 0).steerRight).toBe(false)
    expect(joystickToActions(1, 0).steerRight).toBe(true)
  })

  it('maps a diagonal to steer + accelerate together', () => {
    const r = joystickToActions(0.8, -0.8)
    expect(r.accelerate).toBe(true)
    expect(r.steerRight).toBe(true)
    expect(r.brake).toBe(false)
    expect(r.steerLeft).toBe(false)
  })

  it('treats out-of-range magnitudes like the extreme', () => {
    expect(joystickToActions(0, -2).accelerate).toBe(true)
    expect(joystickToActions(2, 0).steerRight).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/input/joystickMap.test.ts`
Expected: FAIL — cannot find module `joystickMap`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/game/input/joystickMap.ts
export interface DriveActions {
  accelerate: boolean
  brake: boolean
  steerLeft: boolean
  steerRight: boolean
}

/**
 * Map a joystick vector to the boolean drive actions the sim consumes.
 * y is negative-up (matching the gamepad axis). Thresholds mirror the gamepad
 * handling already in InputManager, so touch, pad, and keyboard feel identical.
 */
export function joystickToActions(x: number, y: number, deadzone = 0.2): DriveActions {
  const inDeadzone = Math.hypot(x, y) < deadzone
  if (inDeadzone) return { accelerate: false, brake: false, steerLeft: false, steerRight: false }
  return {
    accelerate: y < -0.35,
    brake: y > 0.35,
    steerLeft: x < -0.3,
    steerRight: x > 0.3,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/input/joystickMap.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `device.ts`**

```typescript
// src/game/input/device.ts
/** True on touch-capable devices — drives auto-enabling the on-screen controls. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  return coarse || touchPoints
}
```

- [ ] **Step 6: Build + commit**

Run: `npm run build`
Expected: PASS.

```bash
git add src/game/input/joystickMap.ts src/game/input/device.ts tests/game/input/joystickMap.test.ts
git commit -m "feat(input): joystickToActions thresholding helper + isTouchDevice"
```

---

### Task 2: `InputManager` virtual touch source

Add a touch axis + touch button state to `InputManager`, merged into the per-action loop alongside keyboard and gamepad. No rendering yet.

**Files:**
- Modify: `src/game/input/inputManager.ts`
- Test: `tests/game/input/inputManager.test.ts` (add cases)

**Interfaces:**
- Consumes: `joystickToActions` (Task 1).
- Produces (new methods on `InputManager`):
  - `setTouchAxis(x: number, y: number): void`
  - `setTouchButton(action: GameAction, down: boolean): void`
  - `clearTouch(): void`
- Produces (behavior): in `update()`, each action's `down` is `keyboard OR gamepad OR touch`. Touch drive actions come from `joystickToActions(touchAxisX, touchAxisY)`; other touch actions (fire/mine/turbo/etc.) come from the touch button set.

- [ ] **Step 1: Write the failing test (add to the existing describe block)**

```typescript
// tests/game/input/inputManager.test.ts — add these two cases inside describe('InputManager', ...)
import { joystickToActions } from '../../../src/game/input/joystickMap' // add near top if referenced; otherwise omit

it('ORs a touch joystick axis into drive actions without a keyboard', () => {
  const keyboard = new FakeKeyboard()
  const input = new InputManager({ input: { keyboard } } as unknown as Phaser.Scene)

  input.setTouchAxis(0, -1) // full up
  input.update()
  expect(input.down('accelerate')).toBe(true)
  expect(input.down('brake')).toBe(false)

  input.setTouchAxis(-1, 0) // full left
  input.update()
  expect(input.down('steerLeft')).toBe(true)
  expect(input.down('accelerate')).toBe(false)

  input.clearTouch()
  input.update()
  expect(input.down('steerLeft')).toBe(false)
})

it('ORs touch buttons and does not disturb keyboard merges', () => {
  const keyboard = new FakeKeyboard()
  const input = new InputManager({ input: { keyboard } } as unknown as Phaser.Scene)

  input.setTouchButton('fire', true)
  keyboard.emit('keydown', { code: 'KeyW', repeat: false, preventDefault: vi.fn() })
  input.update()
  expect(input.down('fire')).toBe(true)
  expect(input.down('accelerate')).toBe(true) // keyboard still works

  input.setTouchButton('fire', false)
  input.update()
  expect(input.down('fire')).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/game/input/inputManager.test.ts`
Expected: FAIL — `setTouchAxis`/`setTouchButton`/`clearTouch` not a function.

- [ ] **Step 3: Implement the virtual source in `inputManager.ts`**

Add fields near the other private state (after `private pressedActions = ...`):

```typescript
  private touchAxisX = 0
  private touchAxisY = 0
  private touchButtons = new Set<GameAction>()
```

Add the import at the top:

```typescript
import { joystickToActions } from './joystickMap'
```

Add the public methods (near `down`/`justDown`):

```typescript
  setTouchAxis(x: number, y: number): void {
    this.touchAxisX = x
    this.touchAxisY = y
  }

  setTouchButton(action: GameAction, down: boolean): void {
    if (down) this.touchButtons.add(action)
    else this.touchButtons.delete(action)
  }

  clearTouch(): void {
    this.touchAxisX = 0
    this.touchAxisY = 0
    this.touchButtons.clear()
  }
```

In `update()`, inside the `for (const [action, codes] ...)` loop, after the gamepad `down ||= ...` lines and before `this.current.set(action, down)`, add the touch merge:

```typescript
      // touch source: joystick for drive actions, button set for the rest
      if (action === 'accelerate') down ||= drive.accelerate
      else if (action === 'brake') down ||= drive.brake
      else if (action === 'steerLeft') down ||= drive.steerLeft
      else if (action === 'steerRight') down ||= drive.steerRight
      else down ||= this.touchButtons.has(action)
```

And compute `drive` once, just before the `for` loop begins (next to where `axisX`/`axisY` are read):

```typescript
    const drive = joystickToActions(this.touchAxisX, this.touchAxisY)
```

Also add `clearTouch()` to the existing `reset()` body so blur/pause clears touch too:

```typescript
  reset() {
    this.heldCodes.clear()
    this.pressedCodes.clear()
    this.current.clear()
    this.pressedActions.clear()
    this.clearTouch()
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/input/inputManager.test.ts`
Expected: PASS (existing 3 + 2 new).

- [ ] **Step 5: Full suite + build + commit**

Run: `npm test && npm run build`
Expected: all green, build clean.

```bash
git add src/game/input/inputManager.ts tests/game/input/inputManager.test.ts
git commit -m "feat(input): virtual touch source merged into InputManager"
```

---

### Task 3: `TouchControls` — joystick + FIRE/MINE/TURBO + pause, wired into the race

Render the on-screen controls, translate pointer events into the touch axis/button state, and feed `InputManager`. Instantiate from `RaceScene` only on touch devices.

**Files:**
- Create: `src/game/input/touchControls.ts`
- Modify: `src/game/scenes/RaceScene.ts` (instantiate on touch; destroy on shutdown)

**Interfaces:**
- Consumes: `InputManager.setTouchAxis/setTouchButton/clearTouch` (Task 2), `isTouchDevice` (Task 1).
- Produces: `class TouchControls { constructor(scene: Phaser.Scene, input: InputManager, onPause: () => void); destroy(): void }`.

- [ ] **Step 1: Write `TouchControls`**

```typescript
// src/game/input/touchControls.ts
import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/game'
import { C } from '../ui/theme'
import type { InputManager } from './inputManager'

const JOY_CX = 300
const JOY_CY = GAME_HEIGHT - 300
const JOY_RADIUS = 160
const BTN_X = GAME_WIDTH - 220
const DEPTH = 1000

/**
 * Semi-transparent on-screen controls for touch play. Left: a virtual joystick
 * feeding the drive axis. Right: FIRE / MINE / TURBO. Plus a pause button.
 * All feed InputManager's touch source; the sim never sees touch directly.
 */
export class TouchControls {
  private readonly objects: Phaser.GameObjects.GameObject[] = []
  private readonly thumb: Phaser.GameObjects.Arc
  private joyPointerId: number | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputManager,
    onPause: () => void,
  ) {
    // joystick base + thumb
    const base = scene.add.circle(JOY_CX, JOY_CY, JOY_RADIUS, C.surfaceHud, 0.35).setStrokeStyle(3, C.oxide, 0.5)
    this.thumb = scene.add.circle(JOY_CX, JOY_CY, 60, C.oxide, 0.5)
    const joyZone = scene.add.zone(JOY_CX, JOY_CY, JOY_RADIUS * 2.4, JOY_RADIUS * 2.4).setInteractive()
    joyZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onJoyMove(p))
    joyZone.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) this.onJoyMove(p) })
    joyZone.on('pointerup', (p: Phaser.Input.Pointer) => this.onJoyRelease(p))
    joyZone.on('pointerout', (p: Phaser.Input.Pointer) => this.onJoyRelease(p))
    this.objects.push(base, this.thumb, joyZone)

    // right cluster: FIRE / MINE / TURBO (hold to press)
    this.button('FIRE', BTN_X, GAME_HEIGHT - 420, C.danger, 'fire')
    this.button('MINE', BTN_X, GAME_HEIGHT - 280, C.warn, 'mine')
    this.button('TURBO', BTN_X, GAME_HEIGHT - 140, C.turbo, 'turbo')

    // pause, top-left
    const pause = scene.add.circle(70, 70, 44, C.surfaceHud, 0.5).setStrokeStyle(2, C.oxide, 0.6).setInteractive()
    const pauseIcon = scene.add.text(70, 70, '॥', { fontSize: '40px', color: '#e8e8f0' }).setOrigin(0.5)
    pause.on('pointerup', onPause)
    this.objects.push(pause, pauseIcon)

    this.objects.forEach((o) => (o as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH))
    this.thumb.setDepth(DEPTH)
  }

  private button(label: string, x: number, y: number, color: number, action: Parameters<InputManager['setTouchButton']>[0]) {
    const r = this.scene.add.circle(x, y, 62, color, 0.28).setStrokeStyle(3, color, 0.7).setInteractive()
    const t = this.scene.add.text(x, y, label, { fontSize: '22px', color: '#e8e8f0' }).setOrigin(0.5)
    r.on('pointerdown', () => { this.input.setTouchButton(action, true); r.setFillStyle(color, 0.6) })
    const release = () => { this.input.setTouchButton(action, false); r.setFillStyle(color, 0.28) }
    r.on('pointerup', release)
    r.on('pointerout', release)
    r.setDepth(DEPTH)
    t.setDepth(DEPTH)
    this.objects.push(r, t)
  }

  private onJoyMove(p: Phaser.Input.Pointer) {
    this.joyPointerId = p.id
    const dx = Phaser.Math.Clamp((p.worldX - JOY_CX) / JOY_RADIUS, -1, 1)
    const dy = Phaser.Math.Clamp((p.worldY - JOY_CY) / JOY_RADIUS, -1, 1)
    this.input.setTouchAxis(dx, dy)
    this.thumb.setPosition(JOY_CX + dx * JOY_RADIUS, JOY_CY + dy * JOY_RADIUS)
  }

  private onJoyRelease(p: Phaser.Input.Pointer) {
    if (this.joyPointerId !== null && p.id !== this.joyPointerId) return
    this.joyPointerId = null
    this.input.setTouchAxis(0, 0)
    this.thumb.setPosition(JOY_CX, JOY_CY)
  }

  destroy() {
    this.input.clearTouch()
    this.objects.forEach((o) => o.destroy())
  }
}
```

Note on coordinates: `p.worldX/worldY` follow the race camera. If the race camera scrolls (it follows the player), replace `worldX/worldY` with the pointer's screen position mapped to the fixed 1920×1080 space — use `p.x`/`p.y` if the controls live on an unscrolled camera, or add the controls to a separate UI camera. Verify in Step 3's browser smoke that the joystick tracks the thumb correctly; if it drifts with the race camera, put the control objects on `scene.cameras.add(...)`-managed UI camera or use `scrollFactor(0)` on the objects and screen-space pointer coords.

- [ ] **Step 2: Instantiate from `RaceScene` on touch, destroy on shutdown**

In `RaceScene.ts`, import:

```typescript
import { TouchControls } from '../input/touchControls'
import { isTouchDevice } from '../input/device'
```

Add a field: `private touchControls?: TouchControls`.

After `this.inputManager = new InputManager(this)` (around line 2249) and after the pause keydown handler is set up, add:

```typescript
    if (isTouchDevice()) {
      this.touchControls = new TouchControls(this, this.inputManager, () => this.<openPauseMethod>())
    }
```

Replace `<openPauseMethod>` with the exact method the pause keydown handler already calls to open `RacePause` (the one wrapping `this.scene.launch('RacePause', …)` + `this.scene.pause()` near line 2271). Do NOT duplicate the pause logic — call the same method.

In the scene's `shutdown` cleanup (where `this.input.keyboard?.off('keydown', onKey)` is), add:

```typescript
      this.touchControls?.destroy()
      this.touchControls = undefined
```

- [ ] **Step 3: Build + browser smoke (device emulation)**

Run: `npm run build && npm test`
Expected: green (no unit tests for rendering; existing suite unaffected).

Then `npm run dev`, open with device emulation (Chrome DevTools device toolbar, a landscape phone). Start a race and confirm:
- Controls appear (they should NOT appear on a normal desktop pointer session).
- Joystick thumb follows the finger; pushing up drives, down brakes/reverses, tilt steers. The thumb tracks the touch point (fix camera-space mapping per Step 1's note if it drifts).
- FIRE and TURBO act while held; MINE drops on press.
- In a **weapons-off** career, FIRE/MINE do nothing (RaceScene already gates mine/fire on `weaponsEnabled` — confirm the touch buttons inherit that gate; they should, since they feed the same actions the gate reads).
- The pause button opens `RacePause` and resuming restores the race cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/game/input/touchControls.ts src/game/scenes/RaceScene.ts
git commit -m "feat(mobile): on-screen joystick + fire/mine/turbo + pause for touch"
```

---

### Task 4: Landscape lock + rotate-device prompt

A small DOM helper (outside Phaser) that attempts to lock landscape and shows a rotate overlay in portrait on touch devices.

**Files:**
- Create: `src/game/systems/orientation.ts`
- Modify: `src/main.ts` (init it after boot)
- Modify: `index.html` (rotate-overlay markup + styles)

**Interfaces:**
- Produces: `initOrientation(): void` — sets up the lock attempt + portrait overlay toggling.

- [ ] **Step 1: Add the overlay markup + styles to `index.html`**

Inside `<style>`, add:

```css
      #rotate { display: none; position: fixed; inset: 0; z-index: 10; background: #0b0b10;
        color: #e8e8f0; font-family: system-ui, sans-serif; align-items: center; justify-content: center;
        text-align: center; flex-direction: column; gap: 16px; }
      #rotate.show { display: flex; }
      #rotate .icon { font-size: 64px; }
```

Inside `<body>`, after the `#game` div:

```html
    <div id="rotate" aria-hidden="true">
      <div class="icon">⟳</div>
      <div>Rotate your device to landscape to play.</div>
    </div>
```

- [ ] **Step 2: Write `orientation.ts`**

```typescript
// src/game/systems/orientation.ts
import { isTouchDevice } from '../input/device'

/**
 * Best-effort landscape lock plus a rotate prompt. The lock call often needs
 * fullscreen and a user gesture and may reject — the overlay is the reliable
 * fallback. Desktop is unaffected (isTouchDevice() is false).
 */
export function initOrientation(): void {
  if (!isTouchDevice() || typeof window === 'undefined') return
  const overlay = document.getElementById('rotate')
  const portrait = window.matchMedia('(orientation: portrait)')

  const apply = () => {
    const isPortrait = portrait.matches
    overlay?.classList.toggle('show', isPortrait)
    overlay?.setAttribute('aria-hidden', String(!isPortrait))
  }

  const lock = (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock
  if (typeof lock === 'function') lock.call(screen.orientation, 'landscape').catch(() => {})

  portrait.addEventListener('change', apply)
  apply()
}
```

- [ ] **Step 3: Call it from `main.ts`**

In `src/main.ts`, import and call after the game boots (end of `boot()`):

```typescript
import { initOrientation } from './game/systems/orientation'
// ... after `if (DEBUG) ...` inside boot():
initOrientation()
```

- [ ] **Step 4: Build + browser smoke**

Run: `npm run build`
Expected: PASS.

`npm run dev` with device emulation: in portrait the rotate overlay covers the screen; rotating to landscape hides it and the game is playable. On desktop (no touch) the overlay never shows.

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/orientation.ts src/main.ts index.html
git commit -m "feat(mobile): landscape lock + rotate-device prompt"
```

---

### Task 5: Native-keyboard driver-name entry

Let a touch player raise the OS keyboard to type their name, via a hidden HTML input, in `NewCareerScene`.

**Files:**
- Create: `src/game/ui/nativeInput.ts`
- Modify: `src/game/scenes/NewCareerScene.ts`

**Interfaces:**
- Produces: `openNativeText(opts: { value: string; maxLength: number; onChange: (v: string) => void; onDone: () => void }): () => void` — appends a focused hidden `<input>` that raises the OS keyboard; returns a cleanup function that removes it.

- [ ] **Step 1: Write `nativeInput.ts`**

```typescript
// src/game/ui/nativeInput.ts
/**
 * Raise the OS keyboard for a single text value via a transient hidden input.
 * Used where a Phaser scene needs typed text on a touch device. Returns a
 * disposer that removes the element and its listeners.
 */
export function openNativeText(opts: {
  value: string
  maxLength: number
  onChange: (v: string) => void
  onDone: () => void
}): () => void {
  const el = document.createElement('input')
  el.type = 'text'
  el.value = opts.value
  el.maxLength = opts.maxLength
  el.autocapitalize = 'characters'
  el.style.position = 'fixed'
  el.style.opacity = '0'
  el.style.left = '50%'
  el.style.top = '10%'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.zIndex = '20'
  document.body.appendChild(el)

  const sanitize = (v: string) => v.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, opts.maxLength)
  const onInput = () => { el.value = sanitize(el.value); opts.onChange(el.value) }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') el.blur() }
  const onBlur = () => opts.onDone()
  el.addEventListener('input', onInput)
  el.addEventListener('keydown', onKey)
  el.addEventListener('blur', onBlur)

  // focus must run in the tap handler's gesture to open the keyboard
  el.focus()

  return () => {
    el.removeEventListener('input', onInput)
    el.removeEventListener('keydown', onKey)
    el.removeEventListener('blur', onBlur)
    el.remove()
  }
}
```

- [ ] **Step 2: Wire it into `NewCareerScene` on touch**

Import at the top:

```typescript
import { openNativeText } from '../ui/nativeInput'
import { isTouchDevice } from '../input/device'
```

Add a field: `private disposeNativeInput?: () => void`.

The name row is index 0 (`this.selected === 0`). In the tap-activation path (the `wireTiles` `onActivate` from Project 1) and/or the row's activate handling, when the tapped/selected row is the name row AND `isTouchDevice()`, open the native input instead of relying on physical keys:

```typescript
    if (isTouchDevice() && i === 0) {
      this.disposeNativeInput?.()
      this.disposeNativeInput = openNativeText({
        value: this.name,
        maxLength: 18,
        onChange: (v) => { this.name = v; this.refresh() },
        onDone: () => { this.disposeNativeInput?.(); this.disposeNativeInput = undefined },
      })
      return
    }
```

Use the scene's actual refresh method name (the one that repaints `this.nameText`/rows — `refresh()` per the file). Ensure `maxLength` matches the existing 18-char cap. On `shutdown`, dispose:

```typescript
    this.events.once('shutdown', () => { this.disposeNativeInput?.(); this.disposeNativeInput = undefined })
```

(Add this alongside the existing shutdown handler; do not remove the keyboard `off`.)

Keep the existing physical-keyboard typing path intact for desktop — this is additive, touch-only.

- [ ] **Step 3: Build + browser smoke**

Run: `npm run build && npm test`
Expected: green.

`npm run dev` device emulation: on New Career, tapping the DRIVER NAME row raises the OS keyboard; typed text (sanitized, ≤18 chars) appears in the name field; dismissing commits it; START CAREER then works. On desktop, typing still edits the name as before and no hidden input interferes.

- [ ] **Step 4: Commit**

```bash
git add src/game/ui/nativeInput.ts src/game/scenes/NewCareerScene.ts
git commit -m "feat(mobile): native-keyboard driver-name entry on touch"
```

---

### Task 6: Full verification + device-emulation smoke + desktop regression

**Files:** none expected (verification; fix stragglers inline if found).

- [ ] **Step 1: Full automated verification**

Run: `npm test && npm run build && git diff --check`
Expected: tests green, build clean, no whitespace errors.

- [ ] **Step 2: Device-emulation smoke (landscape phone)**

Walk: New Career (tap name → native keyboard → commit) → Garage (tap upgrade) → SignUp → PrepareRace → Race. In the race confirm: joystick drives (gas/brake/steer), FIRE/MINE/TURBO act, weapons-off disables FIRE/MINE, pause button opens RacePause and resumes cleanly, abandon commits a DNF. Rotate to portrait mid-flow → rotate overlay shows; back to landscape → hidden.

- [ ] **Step 3: Desktop regression (no touch device)**

With a normal desktop pointer (no touch): confirm the race shows NO on-screen controls, keyboard driving/fire/mine/turbo/handbrake/pause all behave exactly as before, no rotate overlay, and name entry is unchanged. Verify `isTouchDevice()` returns false here.

- [ ] **Step 4: Listener-stacking check**

Enter and exit a race 3× (race → pause → abandon → back, repeat). Confirm a single joystick push still yields one action and controls don't multiply — i.e. `TouchControls.destroy()` and the native-input disposer fire on shutdown.

- [ ] **Step 5: Commit (if any stragglers fixed)**

```bash
git add -A
git commit -m "polish(mobile): verification sweep + straggler fixes"
```

---

## Self-Review

**Spec coverage:**
- Virtual joystick (steer/gas/brake) → Task 1 (`joystickToActions`) + Task 3 (rendering).
- FIRE/MINE/TURBO + pause → Task 3.
- Touch merged into InputManager, sim untouched → Task 2.
- Auto-enable on touch devices → Task 1 (`isTouchDevice`) used in Tasks 3–5.
- Landscape lock + rotate prompt → Task 4.
- Native-keyboard name entry → Task 5.
- Weapons-off gating, pause routing, listener teardown, desktop regression → Task 3 smoke + Task 6.

**Placeholder scan:** The two `<openPauseMethod>` / `refresh()` identifiers in Tasks 3 and 5 require the implementer to use the scene's real method name — the surrounding code is complete; only the existing identifier is substituted, and each is described precisely (the method the pause key handler calls; the method that repaints the name/rows). Not a placeholder.

**Type consistency:** `joystickToActions`, `setTouchAxis`/`setTouchButton`/`clearTouch`, `isTouchDevice`, `TouchControls`, `openNativeText`, `initOrientation` are used with the same names/signatures across tasks.

**Known risk flagged for implementation:** Task 3's pointer-to-joystick coordinate mapping depends on whether the control objects sit on the scrolling race camera. The task calls this out explicitly and requires the browser smoke to confirm the thumb tracks the finger, with the fix (UI camera / `scrollFactor(0)` + screen-space coords) named inline.
