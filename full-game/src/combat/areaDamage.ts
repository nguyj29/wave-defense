// ============================================================================
// areaDamage.ts — shared faction-aware AoE damage utility (full-game Phase
// 1). Bomber detonation and fire-mage burning ground are mechanically the
// same shape: full damage to the opposing faction, a reduced fraction to the
// SAME faction as the source (deliberate friendly fire — a bomber's blast
// can chain into other bombers, and burning ground denies space to other
// enemies too, not just the player/allies). Extracted here once rather than
// duplicated in two archetypes' behavior code. See DECISIONS.md.
// ============================================================================
import { applyDamage, applyDotDamage } from './damage.ts';
import type { Entity, Faction } from '../entities/types.ts';

/**
 * One-shot AoE (bomber detonation, fireball impact): every live entity with
 * health within `radius` of (x, y) takes `fullDamage` if its faction differs
 * from `sourceFaction`, or `fullDamage * enemyFalloff` if it shares
 * `sourceFaction` (e.g. another enemy catching a bomber's blast). Goes
 * through the normal applyDamage path, so hit-flash/SFX/bomber-fuse-ignition
 * all fire exactly as they would for any other discrete hit — this is what
 * makes bomber chain-detonation work (a lit-or-unlit bomber caught in
 * another's blast takes real damage through the same code path a bullet
 * would use).
 */
export function applyAreaDamage(
  entities: Entity[],
  x: number,
  y: number,
  radius: number,
  fullDamage: number,
  enemyFalloff: number,
  sourceFaction: Faction,
  excludeId?: number,
): void {
  const r2 = radius * radius;
  for (const t of entities) {
    if (t.dead || !t.health || t.id === excludeId) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    if (dx * dx + dy * dy > r2) continue;
    const amount = t.faction === sourceFaction ? fullDamage * enemyFalloff : fullDamage;
    if (amount > 0) applyDamage(t, amount);
  }
}

/**
 * Continuous per-tick variant (fire mage's burning ground): same
 * faction-aware falloff, applied as `dpsFull * dt` (or the falloff fraction
 * of it) every tick a unit stands inside the effect. Uses applyDotDamage so
 * standing in fire doesn't replay the hit-flash/SFX every frame.
 */
export function applyAreaDotDamage(
  entities: Entity[],
  x: number,
  y: number,
  radius: number,
  dpsFull: number,
  enemyFalloff: number,
  sourceFaction: Faction,
  dt: number,
): void {
  const r2 = radius * radius;
  for (const t of entities) {
    if (t.dead || !t.health) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    if (dx * dx + dy * dy > r2) continue;
    const dps = t.faction === sourceFaction ? dpsFull * enemyFalloff : dpsFull;
    if (dps > 0) applyDotDamage(t, dps * dt);
  }
}
