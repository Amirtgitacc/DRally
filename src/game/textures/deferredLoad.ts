/**
 * Splits the 131 authored WebP textures registered in `loadedAssets.ts` into
 * CORE (loaded eagerly by BootScene, before Menu shows) and DEFERRED (streamed
 * in the background once Menu is reached, via `startDeferredLoad`).
 *
 * CORE must cover: everything MenuScene renders directly, the entire race
 * path (surfaces/decals/furniture/FX/car sprites/env set-pieces — all
 * safety-critical, "race must never start with missing textures"), every
 * multiplayer-reachable texture (LobbyScene/MultiplayerScene are out of scope
 * for load-guards, so whatever they might need must already be present —
 * including the base `car-poster-<id>` posters they show for the default
 * 'base' livery), and the menu/multiplayer/lobby screen backgrounds.
 * Everything else — hero renders, venue posters, and the remaining
 * scene-local screen backgrounds — is DEFERRED: heavy, provably scene-local
 * art with a not-yet-loaded guard in its consumer scene.
 *
 * See tests/game/deferredLoad.test.ts for the CORE ∪ DEFERRED === all-131
 * invariant this module must keep.
 */

import {
  LOADED_TEXTURES,
  LOADED_FX_TEXTURES,
  LOADED_HERO_TEXTURES,
  LOADED_TOP_TEXTURES,
  LOADED_SCREEN_TEXTURES,
  LOADED_TOP_VARIANT_TEXTURES,
  LOADED_MP_ONLY_TEXTURES,
  LOADED_POSTER_TEXTURES,
  LOADED_POSTER_VARIANT_TEXTURES,
  LOADED_TRACK_POSTER_TEXTURES,
  LOADED_ENVIRONMENT_TEXTURES,
  type LoadedTexture,
} from './loadedAssets'

export const ALL_TEXTURES: LoadedTexture[] = [
  ...LOADED_TEXTURES,
  ...LOADED_FX_TEXTURES,
  ...LOADED_HERO_TEXTURES,
  ...LOADED_TOP_TEXTURES,
  ...LOADED_SCREEN_TEXTURES,
  ...LOADED_TOP_VARIANT_TEXTURES,
  ...LOADED_MP_ONLY_TEXTURES,
  ...LOADED_POSTER_TEXTURES,
  ...LOADED_POSTER_VARIANT_TEXTURES,
  ...LOADED_TRACK_POSTER_TEXTURES,
  ...LOADED_ENVIRONMENT_TEXTURES,
]

/** Screen backgrounds needed the moment Menu (or Lobby/Multiplayer) can show. */
const CORE_SCREEN_KEYS = new Set(['bg-menu', 'bg-mp', 'bg-lobby'])

/** Whole categories, or the subset of a mixed category, that are safe to
 *  stream in after Menu appears: scene-local, non-race, non-multiplayer art
 *  with a consumer scene that tolerates arriving late. */
const DEFERRED_KEYS: ReadonlySet<string> = new Set<string>([
  ...LOADED_HERO_TEXTURES.map((t) => t.key),
  // NOTE: LOADED_POSTER_TEXTURES (base `car-poster-<id>`) must stay CORE.
  // LobbyScene and MultiplayerScene render them unguarded whenever a player's
  // livery is 'base' — the default, and what roomState resets to on every
  // chassis change — via posterTextureFor(carId, 'base').
  ...LOADED_TRACK_POSTER_TEXTURES.map((t) => t.key),
  ...LOADED_SCREEN_TEXTURES.filter((t) => !CORE_SCREEN_KEYS.has(t.key)).map((t) => t.key),
])

export function isDeferred(key: string): boolean {
  return DEFERRED_KEYS.has(key)
}

export const DEFERRED_TEXTURES: LoadedTexture[] = ALL_TEXTURES.filter((t) => isDeferred(t.key))
export const CORE_TEXTURES: LoadedTexture[] = ALL_TEXTURES.filter((t) => !isDeferred(t.key))

/** The slice of Phaser's LoaderPlugin + TextureManager this module needs —
 *  narrowed so runtime logic here is testable without a real Phaser.Scene. */
export interface DeferredLoaderHost {
  load: {
    image(key: string, url: string): unknown
    on(event: string, cb: (...args: never[]) => void): unknown
    start(): unknown
  }
  textures: {
    exists(key: string): boolean
  }
}

let launched = false
const readyKeys = new Set<string>()
interface Waiter {
  keys: string[]
  cb: () => void
}
let waiters: Waiter[] = []

function markReady(key: string) {
  if (readyKeys.has(key)) return
  readyKeys.add(key)
  const [settled, pending] = [[] as Waiter[], [] as Waiter[]]
  for (const w of waiters) (w.keys.every((k) => readyKeys.has(k)) ? settled : pending).push(w)
  waiters = pending
  for (const w of settled) w.cb()
}

/** True once every key has finished loading (or was already present). */
export function isReady(keys: string[]): boolean {
  return keys.every((k) => readyKeys.has(k))
}

/** Calls back once every key in `keys` is ready. Fires synchronously if
 *  already satisfied (including the trivial empty-array case). A key whose
 *  file fails to load (`loaderror`) never becomes ready, so the callback
 *  simply never fires for it — the caller's placeholder stays up rather than
 *  swapping to a broken texture. */
export function whenReady(keys: string[], cb: () => void): void {
  if (isReady(keys)) {
    cb()
    return
  }
  waiters.push({ keys, cb })
}

/**
 * Kicks off the single background load of every DEFERRED texture using the
 * given host's loader. The host's loader must OUTLIVE all scene navigation:
 * Phaser aborts a scene-owned loader on that scene's SHUTDOWN, so ordinary
 * scenes must never pass themselves here — they go through
 * `ensureDeferredLoadStarted()` (deferredLoadScene.ts), which runs this on a
 * persistent invisible worker scene. Guarded at module scope so it never
 * queues the same files twice. Never blocks input: `loader.image` +
 * `loader.start()` runs outside `preload()`, so gameplay continues while
 * files stream in.
 */
export function startDeferredLoad(host: DeferredLoaderHost): void {
  if (launched) return
  launched = true

  let queuedAny = false
  for (const t of DEFERRED_TEXTURES) {
    if (host.textures.exists(t.key)) {
      markReady(t.key)
      continue
    }
    host.load.image(t.key, t.url)
    queuedAny = true
  }

  host.load.on('filecomplete', (key: string, type: string) => {
    if (type === 'image') markReady(key)
  })
  host.load.on('loaderror', (file: { key: string; src?: string }) => {
    console.warn(`[DeferredLoad] failed to load asset "${file.key}" (${file.src ?? '?'}) — continuing without it.`)
  })

  if (queuedAny) host.load.start()
}

/** Test-only: clears module state so specs don't leak into one another. */
export function __resetDeferredLoadForTests(): void {
  launched = false
  readyKeys.clear()
  waiters = []
}
