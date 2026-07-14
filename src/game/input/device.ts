/** True on touch-capable devices — drives auto-enabling the on-screen controls. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  return coarse || touchPoints
}
