import { GAME_ACTIONS, type GameAction, type SerializedBindings } from './inputTypes'

export const DEFAULT_BINDINGS: SerializedBindings = {
  accelerate: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  steerLeft: ['ArrowLeft', 'KeyA'],
  steerRight: ['ArrowRight', 'KeyD'],
  fire: ['KeyX'],
  mine: ['KeyC'],
  turbo: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  pause: ['Escape'],
  mute: ['KeyM'],
}

export const ACTION_LABELS: Record<GameAction, string> = {
  accelerate: 'Accelerate',
  brake: 'Brake / reverse',
  steerLeft: 'Steer left',
  steerRight: 'Steer right',
  fire: 'Fire',
  mine: 'Drop mine',
  turbo: 'Turbo',
  handbrake: 'Handbrake',
  pause: 'Pause',
  mute: 'Mute',
}

export function normalizeBindings(value: unknown): SerializedBindings {
  const source = typeof value === 'object' && value !== null ? (value as Partial<SerializedBindings>) : {}
  return Object.fromEntries(
    GAME_ACTIONS.map((action) => {
      const codes = source[action]
      const valid = Array.isArray(codes)
        ? [...new Set(codes.filter((code): code is string => typeof code === 'string' && code.length > 0))].slice(0, 2)
        : []
      return [action, valid.length > 0 ? valid : [...DEFAULT_BINDINGS[action]]]
    }),
  ) as SerializedBindings
}

export function rebind(bindings: SerializedBindings, action: GameAction, code: string): SerializedBindings {
  if (!code) return normalizeBindings(bindings)
  return normalizeBindings({ ...bindings, [action]: [code] })
}

export function serializeBindings(bindings: SerializedBindings): string {
  return JSON.stringify(normalizeBindings(bindings))
}

export function deserializeBindings(raw: string): SerializedBindings | null {
  try {
    return normalizeBindings(JSON.parse(raw))
  } catch {
    return null
  }
}

export function readableCode(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Arrow', '')
    .replace('ShiftLeft', 'L Shift')
    .replace('ShiftRight', 'R Shift')
    .replace('Space', 'Space')
}
