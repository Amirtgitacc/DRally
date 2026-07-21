/**
 * The one place colours, type sizes and spacing are defined.
 *
 * Phaser wants two forms of the same colour: Graphics/Rectangle take a number
 * (0xf2a33c), Text styles take a string ('#f2a33c'). Every token is stored as a
 * number and passed through `hex()` at the text call site.
 */

export const C = {
  /** brand amber — titles, selection, focus rings */
  amber: 0xf2a33c,
  amberDim: 0xd07a35,
  /** champion state only */
  gold: 0xc9a227,
  /** oxide-orange — new lead accent (titles, actions, focus) */
  oxide: 0xe07a3c,
  oxideDim: 0xb45e2c,
  /** funds and gains; aligns with the existing gold */
  brass: 0xc9a227,
  /** secondary data text / stat values */
  concrete: 0x8a8478,
  /** riveted-plate surface gradient */
  surfacePlate: 0x191712,
  surfacePlate2: 0x141210,
  /** warm plate border (replaces the cool `border` where plates are used) */
  line: 0x332e26,

  textPrimary: 0xe8e8f0,
  /** slightly dimmed body copy — info/description blocks */
  textBody: 0xc8c8d4,
  textSecondary: 0x9aa0ac,
  textMuted: 0x70707e,
  textDisabled: 0x55555f,

  /** translucent plate behind the HUD */
  surfaceHud: 0x0a0a10,
  surfaceSunken: 0x0c0c14,
  surfacePanel: 0x16161c,
  surfaceTile: 0x14141c,
  surfaceTileActive: 0x1c1c26,
  /** unfilled portion of a stat bar */
  surfaceTrack: 0x2a2a33,

  border: 0x3a3a46,
  shadow: 0x000000,

  /* --- mobile button / plate bevel language (see ui/mobile.ts) --- */
  /** notched button body gradient (top -> bottom) */
  buttonFace: 0x1b1813,
  buttonFace2: 0x110f0b,
  /** button body when selected/lifted */
  buttonFaceSel: 0x241d13,
  /** bright top-edge bevel hairline */
  bevelLight: 0x4a453c,
  /** riveted corner stud */
  rivet: 0x2c2822,
  rivetHi: 0x544d40,
  /** oxide focus glow colour (same hue as oxide, named for intent) */
  oxideGlow: 0xe07a3c,

  danger: 0xd23c2f,
  warn: 0xd0b435,
  ok: 0x3fd07f,
  /** cash, best lap — anything that reads as a gain */
  money: 0x7fe0a8,
  ammo: 0xffd75e,
  turbo: 0x4fc3f7,

  tierStreet: 0x3fd07f,
  tierPro: 0x4f8fd0,
  tierDeath: 0xd23c2f,
} as const

export type ColorToken = keyof typeof C

/** Risk tier presentation, shared by SignUp and Venues. */
export const TIER_COLOR = {
  street: C.tierStreet,
  pro: C.tierPro,
  death: C.tierDeath,
} as const

export const TIER_LABEL = { street: 'STREET', pro: 'PRO', death: 'DEATH' } as const

/** 0xf2a33c -> '#f2a33c', for Phaser.Types.GameObjects.Text.TextStyle */
export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

/**
 * Was 21 ad-hoc sizes across the scenes. Collapsed to 14 rungs.
 * `readout` and `speed` are HUD numerics and deliberately sit off the text ramp.
 */
export const TYPE = {
  display: 120,
  hero: 84,
  readout: 64,
  title: 56,
  speed: 42,
  heading: 40,
  subtitle: 30,
  /** result screens and end-of-career copy, where lines need to land */
  bodyLg: 26,
  /** anything the player acts on: tile labels, ENTER prompts, ladder rows */
  action: 24,
  body: 22,
  bodySm: 20,
  caption: 18,
  /** stat-bar row labels (SPEED / ACCEL / GRIP) */
  label: 17,
  micro: 13,
} as const

export type TypeToken = keyof typeof TYPE

/**
 * Both faces are bundled via @fontsource and awaited in `main.ts` before the
 * game boots — Phaser measures glyph widths at Text construction, so a font
 * that arrives late leaves every label mis-positioned for the session.
 *
 * Display: condensed, heavy, reads as motorsport signage. Titles and headings.
 * Mono: everything tabular — stats, times, cash, standings. Digits must not
 * jitter as they count.
 */
export const FONT_DISPLAY = 'Oswald, "Arial Narrow", sans-serif'
export const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace'

/** Default for body copy. */
export const FONT = FONT_MONO

export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const

export const RADIUS = { sm: 4, md: 10 } as const

/** Stroke thickness scales with type size; these are the values already in use. */
export const STROKE = { text: 4, heading: 6, title: 8, hero: 10 } as const
