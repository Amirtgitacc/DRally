import { describe, it, expect, beforeEach } from 'vitest'
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
} from '../../src/game/textures/loadedAssets'
import {
  ALL_TEXTURES,
  CORE_TEXTURES,
  DEFERRED_TEXTURES,
  isDeferred,
  isReady,
  whenReady,
  startDeferredLoad,
  __resetDeferredLoadForTests,
  type DeferredLoaderHost,
} from '../../src/game/textures/deferredLoad'

const ALL_11_ARRAYS = [
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

describe('texture split: CORE vs DEFERRED', () => {
  it('ALL_TEXTURES matches the concatenation of all 11 registries', () => {
    expect(ALL_TEXTURES.map((t) => t.key).sort()).toEqual(ALL_11_ARRAYS.map((t) => t.key).sort())
  })

  it('CORE union DEFERRED equals every registered key exactly once', () => {
    const core = CORE_TEXTURES.map((t) => t.key)
    const deferred = DEFERRED_TEXTURES.map((t) => t.key)
    const union = new Set([...core, ...deferred])
    expect(union.size).toBe(core.length + deferred.length) // no overlap
    expect(union.size).toBe(ALL_11_ARRAYS.length) // no gaps
    for (const t of ALL_11_ARRAYS) expect(union.has(t.key)).toBe(true)
  })

  it('has no duplicate keys within CORE or within DEFERRED', () => {
    expect(new Set(CORE_TEXTURES.map((t) => t.key)).size).toBe(CORE_TEXTURES.length)
    expect(new Set(DEFERRED_TEXTURES.map((t) => t.key)).size).toBe(DEFERRED_TEXTURES.length)
  })

  it('isDeferred agrees with DEFERRED_TEXTURES membership for every key', () => {
    const deferredKeys = new Set(DEFERRED_TEXTURES.map((t) => t.key))
    for (const t of ALL_11_ARRAYS) {
      expect(isDeferred(t.key)).toBe(deferredKeys.has(t.key))
    }
  })

  it('keeps race-path and multiplayer-reachable registries entirely in CORE', () => {
    const coreKeys = new Set(CORE_TEXTURES.map((t) => t.key))
    for (const t of [
      ...LOADED_TEXTURES,
      ...LOADED_FX_TEXTURES,
      ...LOADED_TOP_TEXTURES,
      ...LOADED_TOP_VARIANT_TEXTURES,
      ...LOADED_MP_ONLY_TEXTURES,
      ...LOADED_ENVIRONMENT_TEXTURES,
      ...LOADED_POSTER_VARIANT_TEXTURES,
      // Base posters are shown unguarded by Lobby/Multiplayer for the
      // default 'base' livery (posterTextureFor(carId, 'base')).
      ...LOADED_POSTER_TEXTURES,
    ]) {
      expect(coreKeys.has(t.key), `${t.key} must stay CORE`).toBe(true)
    }
  })

  it('keeps the menu, multiplayer and lobby screen backgrounds in CORE, defers the rest', () => {
    const coreKeys = new Set(CORE_TEXTURES.map((t) => t.key))
    expect(coreKeys.has('bg-menu')).toBe(true)
    expect(coreKeys.has('bg-mp')).toBe(true)
    expect(coreKeys.has('bg-lobby')).toBe(true)
    const alwaysCore = new Set(['bg-menu', 'bg-mp', 'bg-lobby'])
    for (const t of LOADED_SCREEN_TEXTURES) {
      if (!alwaysCore.has(t.key)) expect(isDeferred(t.key), `${t.key} should be deferred`).toBe(true)
    }
  })

  it('defers hero renders and venue poster art', () => {
    for (const t of [...LOADED_HERO_TEXTURES, ...LOADED_TRACK_POSTER_TEXTURES]) {
      expect(isDeferred(t.key), `${t.key} should be deferred`).toBe(true)
    }
  })
})

/** Minimal fake Phaser LoaderPlugin/TextureManager pair satisfying DeferredLoaderHost. */
function fakeHost(preloadedKeys: string[] = []) {
  const preloaded = new Set(preloadedKeys)
  const queued: { key: string; url: string }[] = []
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const host: DeferredLoaderHost = {
    load: {
      image(key: string, url: string) {
        queued.push({ key, url })
      },
      on(event: string, cb: (...args: never[]) => void) {
        ;(listeners[event] ??= []).push(cb as (...args: unknown[]) => void)
      },
      start() {
        // simulate every queued file completing successfully, one event each
        for (const q of queued) {
          for (const cb of listeners['filecomplete'] ?? []) cb(q.key, 'image', undefined)
        }
      },
    },
    textures: {
      exists(key: string) {
        return preloaded.has(key)
      },
    },
  }
  return { host, queued, listeners, preloaded }
}

describe('deferredLoad runtime', () => {
  beforeEach(() => {
    __resetDeferredLoadForTests()
  })

  it('isReady/whenReady: fires immediately when keys are already ready', () => {
    let called = false
    // nothing loaded yet -> not ready
    expect(isReady(['car-hero-jackal'])).toBe(false)
    whenReady([], () => {
      called = true
    })
    expect(called).toBe(true) // empty key list is trivially ready
  })

  it('whenReady queues until startDeferredLoad completes the file', () => {
    const { host } = fakeHost()
    let fired = false
    whenReady(['car-hero-jackal'], () => {
      fired = true
    })
    expect(fired).toBe(false)
    startDeferredLoad(host)
    expect(fired).toBe(true)
    expect(isReady(['car-hero-jackal'])).toBe(true)
  })

  it('skips queuing a load for textures the scene already has', () => {
    const { host, queued } = fakeHost(DEFERRED_TEXTURES.map((t) => t.key))
    startDeferredLoad(host)
    expect(queued).toHaveLength(0)
    expect(isReady(DEFERRED_TEXTURES.map((t) => t.key))).toBe(true)
  })

  it('never runs twice (module-level guard)', () => {
    const { host: hostA, queued: queuedA } = fakeHost()
    const { host: hostB, queued: queuedB } = fakeHost()
    startDeferredLoad(hostA)
    startDeferredLoad(hostB)
    expect(queuedA.length).toBe(DEFERRED_TEXTURES.length)
    expect(queuedB.length).toBe(0)
  })

  it('tolerates loaderror without throwing and without marking the key ready', () => {
    const { host, listeners } = fakeHost()
    expect(() => {
      startDeferredLoad(host)
      for (const cb of listeners['loaderror'] ?? []) cb({ key: 'car-hero-jackal', src: 'x' })
    }).not.toThrow()
  })
})
