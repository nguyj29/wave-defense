import type { WorldContext } from '../entities/context.ts';
import { createProjectile } from '../entities/factory.ts';
import type { Entity } from '../entities/types.ts';
import { applyDamage } from './damage.ts';
import { playSfx } from '../audio/sfx.ts';

/** Ticks every attack cooldown down by dt. Call once per fixed tick before behaviors act. */
export function tickCooldowns(entities: Entity[], dt: number): void {
  for (const e of entities) {
    if (e.melee && e.melee.cooldown > 0) e.melee.cooldown -= dt;
    if (e.ranged && e.ranged.cooldown > 0) e.ranged.cooldown -= dt;
  }
}

/** Fires a melee hit if off cooldown. Faction-agnostic — caller decides who may target whom. */
export function tryMeleeAttack(attacker: Entity, target: Entity): boolean {
  if (!attacker.melee || attacker.melee.cooldown > 0) return false;
  applyDamage(target, attacker.melee.damage);
  if (attacker.kind === 'ally') playSfx('allyHit');
  attacker.melee.cooldown = 1 / attacker.melee.rate;
  return true;
}

/** Fires a ranged projectile at a point if off cooldown (used by archers etc). */
export function tryRangedAttack(attacker: Entity, targetX: number, targetY: number, ctx: WorldContext): boolean {
  if (!attacker.ranged || attacker.ranged.cooldown > 0) return false;
  const angle = Math.atan2(targetY - attacker.y, targetX - attacker.x);
  const proj = createProjectile(
    attacker.x + Math.cos(angle) * (attacker.radius + 4),
    attacker.y + Math.sin(angle) * (attacker.radius + 4),
    angle,
    attacker.ranged.projectileSpeed,
    attacker.ranged.damage,
    attacker.faction,
    attacker.id,
    attacker.ranged.range,
    { piercesTrees: true, blockedByRocks: true, color: '#c39bd3', radius: 4 },
  );
  ctx.spawnProjectile(proj);
  attacker.ranged.cooldown = 1 / attacker.ranged.rate;
  return true;
}
