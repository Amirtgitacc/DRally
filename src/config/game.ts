export const GAME_WIDTH = 1920
export const GAME_HEIGHT = 1080

const params = new URLSearchParams(window.location.search)

export const DEBUG = params.has('debug')
/** Paint the checkpoint gates across the track. Noisy — opt in separately. */
export const SHOW_GATES = params.has('gates')
