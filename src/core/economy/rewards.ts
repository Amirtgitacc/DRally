import { RACE_REWARDS, type PlacementReward, type RaceTier } from '../../data/economy'

/**
 * Reward for finishing a race.
 * @param placement 1-based finishing position
 * @param wrecked true if the car was destroyed — forfeits everything regardless of placement
 */
export function rewardFor(tier: RaceTier, placement: number, wrecked: boolean): PlacementReward {
  if (wrecked || placement < 1 || placement > 3) {
    return { cash: 0, points: 0 }
  }
  return RACE_REWARDS[tier][placement - 1]
}
