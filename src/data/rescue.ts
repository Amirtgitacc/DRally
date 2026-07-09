import type { RescueTuning } from '../core/vehicle/rescue'

/**
 * The safety net. Mine launches, bad shunts and wall wedges can all leave a car
 * beached on the scenery with nothing to push against; after this long it gets
 * placed back on the racing line.
 */
export const RESCUE: RescueTuning = {
  minSpeed: 32,
  stuckMs: 3000,
}
