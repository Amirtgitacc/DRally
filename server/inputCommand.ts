// server/inputCommand.ts
// Validate + clamp an inbound `input` command before it reaches the sim.
import type { PlayerCommand } from '../src/core/race/stepRace'

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/**
 * Shape-checks, then clamps, an inbound `input` command. A malformed frame
 * (e.g. `{}`) or any NON-FINITE numeric field (NaN/Infinity) is REJECTED
 * (returns null): `stepRace` reads `cmd.input.*` unconditionally, and a NaN in
 * throttle/brake/steer would propagate into heading/x/y and corrupt the whole
 * room's shared state forever with nothing to throw and recover on.
 *
 * Finite-but-out-of-range analog values are CLAMPED rather than rejected
 * (throttle/brake to [0,1], steer to [-1,1]) so a slightly-off client is
 * tolerated instead of dropped.
 */
export function sanitizeCommand(x: unknown): PlayerCommand | null {
  if (x === null || typeof x !== 'object') return null
  const c = x as Record<string, unknown>
  if (typeof c.fire !== 'boolean' || typeof c.turbo !== 'boolean' || typeof c.dropMine !== 'boolean') return null
  const input = c.input
  if (input === null || typeof input !== 'object') return null
  const i = input as Record<string, unknown>
  if (typeof i.throttle !== 'number' || typeof i.brake !== 'number' || typeof i.steer !== 'number') return null
  if (typeof i.handbrake !== 'boolean') return null
  if (!Number.isFinite(i.throttle) || !Number.isFinite(i.brake) || !Number.isFinite(i.steer)) return null
  return {
    input: {
      throttle: clamp(i.throttle, 0, 1),
      brake: clamp(i.brake, 0, 1),
      steer: clamp(i.steer, -1, 1),
      handbrake: i.handbrake,
    },
    fire: c.fire,
    turbo: c.turbo,
    dropMine: c.dropMine,
  }
}
