/** Short, phonetic, unambiguous words (no I/O/1/0 confusion) for shareable codes. */
const WORDS = [
  'TIGER', 'VIPER', 'RAVEN', 'COBRA', 'HAWK', 'WOLF', 'LYNX', 'PUMA',
  'DELTA', 'ECHO', 'NOVA', 'ONYX', 'RUST', 'ASH', 'EMBER', 'FLINT',
]

/** `WORD-NN`, e.g. `TIGER-42`. `rand` is a 0..1 source; caller supplies uniqueness retries. */
export function generateRoomCode(rand: () => number): string {
  const word = WORDS[Math.min(WORDS.length - 1, Math.floor(rand() * WORDS.length))]
  const n = Math.min(99, Math.floor(rand() * 100))
  return `${word}-${String(n).padStart(2, '0')}`
}

const CODE_RE = /^[A-Z]+-\d{2}$/

export function isValidRoomCode(code: string): boolean {
  return CODE_RE.test(code)
}

/** Uppercase, trim, and collapse a space separator into the canonical hyphen form. */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-')
}
