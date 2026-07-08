// Pure damage model — no Phaser imports. Damage runs 0..100; 100 = wrecked.

export interface DamageResult {
  damage: number
  wrecked: boolean
}

export interface ImpactSpec {
  /** relative speed below which an impact is harmless, px/s */
  threshold: number
  /** damage per px/s over the threshold */
  scale: number
  /** damage cap per single impact */
  max: number
}

/** Apply incoming damage. `resistance` < 1 models armor (M6 upgrades). */
export function applyDamage(damage: number, amount: number, resistance = 1): DamageResult {
  const next = Math.min(100, Math.max(0, damage + Math.max(0, amount) * resistance))
  return { damage: next, wrecked: next >= 100 }
}

export function repairDamage(damage: number, amount: number): number {
  return Math.max(0, damage - Math.max(0, amount))
}

/** Damage from a collision at the given relative speed. */
export function impactDamage(relSpeed: number, spec: ImpactSpec): number {
  return Math.min(spec.max, Math.max(0, (relSpeed - spec.threshold) * spec.scale))
}
