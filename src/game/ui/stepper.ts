/**
 * Decides what a tap on a Settings row should do, given only the row's
 * geometry and where the tap landed. Pure so the left/right split (and its
 * boundary) can be unit-tested without a Phaser scene.
 *
 * Rows come in three kinds:
 *  - 'adjustable' rows (volume sliders, touch opacity) reuse the same
 *    left-decrements / right-increments split as keyboard ←/→.
 *  - 'toggle' rows (mute, reduced shake, …) and 'action' rows (reset,
 *    back) activate on a tap anywhere in the row.
 */
export type SettingsRowKind = 'adjustable' | 'toggle' | 'action'
export type SettingsTapAction = 'decrement' | 'increment' | 'activate'

/**
 * @param rowWidth width of the row in canvas units.
 * @param tapX tap position local to the row, 0 = left edge, rowWidth = right edge.
 *   The exact midpoint counts as the right (increment) zone.
 */
export function resolveSettingsTap(rowKind: SettingsRowKind, rowWidth: number, tapX: number): SettingsTapAction {
  if (rowKind !== 'adjustable') return 'activate'
  return tapX < rowWidth / 2 ? 'decrement' : 'increment'
}
