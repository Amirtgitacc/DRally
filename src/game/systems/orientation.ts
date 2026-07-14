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
