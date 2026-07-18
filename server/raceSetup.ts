// server/raceSetup.ts
// Career-independent race setup: turns lobby players into CarSetup[] + the
// RaceCarInfo[] roster the client renderer uses. Humans get a stock loadout;
// AI grid-fill opponents get a rival-style setup from the same tuning helpers
// single-player uses (no career/difficulty on the server — pace factor 1.0).
import type { LobbyPlayer, RaceCarInfo } from '../src/core/net/protocol'
import type { CarSetup } from '../src/core/race/raceState'
import type { TrackDef } from '../src/data/tracks/testCircuit'
import { carById, pickSeededVariant, STARTER_CAR } from '../src/data/cars'
import { mpCarById } from '../src/data/mpCars'
import { sanitizeVariantId } from '../src/core/net/roomState'
import { ROSTER } from '../src/data/roster'
import { rivalChassisId, rivalUpgrades, rivalStrength } from '../src/core/progression/ladder'
import { styleForGrade, talentOf, RUBBER_BAND } from '../src/data/drivers'
import {
  talentTuning, talentPace, talentAimSpread, talentMineCount, talentMineCooldown, talentRubberBand,
} from '../src/core/ai/talent'
import { effectiveCarSpec } from '../src/core/vehicle/carSpec'
import { GUN, MINES, AI_MINES } from '../src/data/weapons'
import { createSeededRandom } from '../src/core/race/random'

export const MP_LIVERY_PALETTE = [0xff7a1a, 0x3aa0ff, 0x36d17a, 0xd94fd0]

/** Stock mine loadout: the garage pack size (MINES.count), not a career purchase. */
const STOCK_MINES = MINES.count

export function buildNetworkRace(
  players: LobbyPlayer[],
  weaponsEnabled: boolean,
  track: TrackDef,
  /** Race offer seed — the only source of randomness here (never Math.random).
   *  Drives AI grid-fill livery assignment; same seed ⇒ same AI variants. */
  seed: number,
): { setups: CarSetup[]; roster: RaceCarInfo[] } {
  const setups: CarSetup[] = []
  const roster: RaceCarInfo[] = []
  const random = createSeededRandom(seed)
  players.forEach((player, i) => {
    const color = MP_LIVERY_PALETTE[i % MP_LIVERY_PALETTE.length]
    if (player.isAi) {
      const driverId = player.id.slice(3) // strip "ai:"
      const rank = ROSTER.findIndex((d) => d.id === driverId) + 1
      const talent = talentOf(driverId)
      const style = styleForGrade(talent.grade)
      const chassis = carById(rivalChassisId(rank))
      const upgrades = rivalUpgrades(rank)
      const variantId = pickSeededVariant(chassis.variants, random).key
      setups.push({
        id: player.id,
        isPlayer: false,
        mass: chassis.mass,
        damage: 0,
        ammo: weaponsEnabled ? GUN.ammoMax : 0,
        mines: weaponsEnabled ? talentMineCount(AI_MINES.count[track.tier], talent) : 0,
        armorTier: upgrades.armor,
        ai: {
          lineIdx: 0,
          lookAheadSamples: style.lookAheadSamples,
          speedScale: talentPace(rivalStrength(rank), talent), // no difficulty scale in MP
          tuning: talentTuning(style.tuning, talent),
          spec: effectiveCarSpec(chassis, upgrades),
          grade: talent.grade,
          aimSpread: talentAimSpread(GUN.aiSpread, talent),
          mineCooldownMs: talentMineCooldown(AI_MINES.cooldownMs, talent),
          rubberBandGain: talentRubberBand(RUBBER_BAND.gainPerGate, talent),
        },
      })
      roster.push({ id: player.id, name: player.name, color, chassisId: chassis.id, variantId, isAi: true })
    } else {
      // mpCarById covers the MP-only guest cars (e.g. Anahita) that carById
      // would throw on; fall back to the stock starter chassis defensively —
      // isValidCarId already gated this at create/join time.
      const car = mpCarById(player.carId) ?? carById(STARTER_CAR.id)
      const variantId = sanitizeVariantId(player.carId, player.variantId)
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
      roster.push({ id: player.id, name: player.name, color, chassisId: player.carId, variantId, isAi: false })
    }
  })
  return { setups, roster }
}
