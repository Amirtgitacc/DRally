/**
 * Why a dedicated scene: Phaser's LoaderPlugin is scene-owned and hard-aborts
 * when its scene shuts down — `LoaderPlugin.shutdown()` (wired to the scene's
 * SHUTDOWN event) calls `reset()`, whose doc warns "If the Loader is currently
 * downloading files, or has files in its queue, they will be aborted", and
 * `removeAllListeners()` drops the filecomplete handlers. MenuScene navigates
 * away via `scene.start(...)` — on first launch it redirects to Profile in the
 * same create() call — which would kill an in-flight deferred load and strand
 * every consumer on its 'LOADING ART' placeholder forever (the module-level
 * `launched` guard would prevent a retry).
 *
 * This invisible worker scene is added and started exactly once, renders
 * nothing, and is never stopped, so its loader survives all scene navigation.
 * The textures it loads land in the game-global TextureManager, where every
 * consumer scene can see them.
 */

import Phaser from 'phaser'
import { startDeferredLoad } from './deferredLoad'

export const DEFERRED_LOAD_SCENE_KEY = 'DeferredLoadWorker'

class DeferredLoadWorkerScene extends Phaser.Scene {
  constructor() {
    super(DEFERRED_LOAD_SCENE_KEY)
  }

  create() {
    startDeferredLoad(this)
  }
}

/** Idempotent: adds + starts the worker exactly once per game instance. */
export function ensureDeferredLoadStarted(from: Phaser.Scene): void {
  if (from.scene.get(DEFERRED_LOAD_SCENE_KEY)) return
  from.scene.add(DEFERRED_LOAD_SCENE_KEY, DeferredLoadWorkerScene, true)
}
