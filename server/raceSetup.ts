// server/raceSetup.ts
// Career-independent race setup: turns lobby players into a stock CarSetup[]
// (no career/save data — every human starts a networked race with the same
// baseline loadout) plus the RaceCarInfo[] roster the client renderer uses.
import type { LobbyPlayer, RaceCarInfo } from '../src/core/net/protocol'
import type { CarSetup } from '../src/core/race/raceState'
import { carById } from '../src/data/cars'
import { GUN, MINES } from '../src/data/weapons'

export const MP_LIVERY_PALETTE = [0xff7a1a, 0x3aa0ff, 0x36d17a, 0xd94fd0]

/** Stock mine loadout: the garage pack size (MINES.count), not a career purchase. */
const STOCK_MINES = MINES.count

export function buildNetworkRace(
  players: LobbyPlayer[],
  weaponsEnabled: boolean,
): { setups: CarSetup[]; roster: RaceCarInfo[] } {
  const setups: CarSetup[] = []
  const roster: RaceCarInfo[] = []
  players.forEach((player, i) => {
    const car = carById(player.carId)
    setups.push({
      id: player.id,
      isPlayer: true,
      mass: car.mass,
      damage: 0,
      ammo: weaponsEnabled ? GUN.ammoMax : 0,
      mines: weaponsEnabled ? STOCK_MINES : 0,
      armorTier: 0,
      ai: null,
    })
    roster.push({
      id: player.id,
      name: player.name,
      color: MP_LIVERY_PALETTE[i % MP_LIVERY_PALETTE.length],
      chassisId: player.carId,
      isAi: false,
    })
  })
  return { setups, roster }
}
