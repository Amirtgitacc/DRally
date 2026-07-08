/** Format milliseconds as m:ss.cc for race/lap times. */
export function formatTime(ms: number): string {
  const clamped = Math.max(0, ms)
  const minutes = Math.floor(clamped / 60000)
  const seconds = Math.floor((clamped % 60000) / 1000)
  const centis = Math.floor((clamped % 1000) / 10)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}
