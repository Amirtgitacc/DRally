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

/**
 * On touch devices, request fullscreen on first user tap, then attempt to lock
 * landscape orientation. Fullscreen is required by most browsers to allow
 * orientation lock. After the request, if the user exits fullscreen, re-arm
 * for the next tap. If neither API exists (e.g., iPhone), remove both listeners
 * after the first attempt to avoid repeated no-op calls per tap.
 */
export function initFullscreenOnGesture(): void {
  if (!isTouchDevice() || typeof document === 'undefined') return

  let isArmed = true

  // Helper to get the lock function with proper typing, avoiding cast repetition
  const getOrientationLock = () => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock

  const attemptFullscreenAndLock = async () => {
    // Request fullscreen if not already fullscreen
    if (!document.fullscreenElement && typeof document.documentElement?.requestFullscreen === 'function') {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      } catch {
        // Fullscreen request denied; re-arm for retry and skip orientation lock (requires fullscreen)
        isArmed = true
        return
      }
    }

    // Attempt orientation lock (requires fullscreen on most browsers)
    const orientationLock = getOrientationLock()
    if (typeof orientationLock === 'function') {
      try {
        await orientationLock.call(screen.orientation, 'landscape')
      } catch {
        // Orientation lock failed; re-arm for retry
        isArmed = true
      }
    }
  }

  const onPointerUp = () => {
    if (!isArmed) return
    isArmed = false

    attemptFullscreenAndLock().catch(() => {})

    // If no APIs exist, clean up all listeners permanently
    if (
      typeof document.documentElement?.requestFullscreen !== 'function' &&
      typeof getOrientationLock() !== 'function'
    ) {
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }

  const onFullscreenChange = () => {
    // If user exits fullscreen, re-arm the gesture listener
    if (!document.fullscreenElement) {
      isArmed = true
    }
  }

  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('fullscreenchange', onFullscreenChange)
}
