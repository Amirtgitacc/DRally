export const GAME_ACTIONS = [
  'accelerate',
  'brake',
  'steerLeft',
  'steerRight',
  'fire',
  'mine',
  'turbo',
  'handbrake',
  'pause',
  'mute',
] as const

export type GameAction = (typeof GAME_ACTIONS)[number]
export type SerializedBindings = Record<GameAction, string[]>

export interface ActionState {
  down: boolean
  justDown: boolean
}
