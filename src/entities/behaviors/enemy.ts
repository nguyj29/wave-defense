import { ENEMIES } from '../../config.ts';
import { tryMeleeAttack, tryRangedAttack } from '../../combat/weapons.ts';
import type { WorldContext } from '../context.ts';
import { findNearest } from '../targeting.ts';
import type { Entity } from '../types.ts';

// Shared faction rule enforcement point: enemies path toward the core, but
// divert to attack a player/ally that enters their aggro radius, then
// resume. Which concrete behavior runs is picked by archetype config
// (ENEMIES[archetype].behavior), so a new archetype needs only a config
// entry plus (if genuinely novel) a new case here — the enemy base
// creation code in factory.ts never has to change.
export function updateEnemy(e: Entity, ctx: WorldContext, core: Entity): void {
  const def = ENEMIES[e.archetype as keyof typeof ENEMIES];
  if (!def) return;
  if (def.behavior === 'kiter') updateKiter(e, ctx, core);
  else updateMelee(e, ctx, core);
}

function moveToward(e: Entity, tx: number, ty: number, speed: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed;
  e.angle = Math.atan2(dy, dx);
}

function updateMelee(e: Entity, ctx: WorldContext, core: Entity): void {
  if (!e.ai) return;
  const speed = e.speedStat ?? 80;
  const target = findNearest(ctx, e, { kinds: ['player', 'ally'], maxRadius: e.aggroRadius ?? 150 });
  const attackTarget = target ?? core;
  const dx = attackTarget.x - e.x;
  const dy = attackTarget.y - e.y;
  const dist = Math.hypot(dx, dy);
  const contactRange = e.radius + attackTarget.radius + 4;

  if (dist <= contactRange) {
    e.ai.state = 'attack';
    e.vx = 0;
    e.vy = 0;
    e.angle = Math.atan2(dy, dx);
    tryMeleeAttack(e, attackTarget);
    return;
  }

  if (target) {
    e.ai.state = 'chase';
    moveToward(e, target.x, target.y, speed);
  } else {
    e.ai.state = 'toCore';
    const dir = ctx.pathfinder.getDirection(e.x, e.y);
    e.vx = dir.x * speed;
    e.vy = dir.y * speed;
    if (dir.x !== 0 || dir.y !== 0) e.angle = Math.atan2(dir.y, dir.x);
  }
}

function updateKiter(e: Entity, ctx: WorldContext, core: Entity): void {
  if (!e.ai || !e.ranged) return;
  const speed = e.speedStat ?? 80;
  const kiteDistance = e.ranged.kiteDistance ?? 350;
  const target = findNearest(ctx, e, { kinds: ['player', 'ally'], maxRadius: e.aggroRadius ?? 450 });
  const attackTarget = target ?? core;
  const dx = attackTarget.x - e.x;
  const dy = attackTarget.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  const withinFiringRange = dist <= e.ranged.range;
  if (withinFiringRange) {
    tryRangedAttack(e, attackTarget.x, attackTarget.y, ctx);
  }

  if (!target) {
    // Nothing to kite from — approach the core like any other enemy, but
    // stop and snipe once in range instead of walking into it (archers
    // have no melee attack).
    if (withinFiringRange) {
      e.ai.state = 'strafe';
      e.vx = 0;
      e.vy = 0;
      e.angle = Math.atan2(dy, dx);
    } else {
      e.ai.state = 'toCore';
      const dir = ctx.pathfinder.getDirection(e.x, e.y);
      e.vx = dir.x * speed;
      e.vy = dir.y * speed;
      if (dir.x !== 0 || dir.y !== 0) e.angle = Math.atan2(dir.y, dir.x);
    }
    return;
  }

  // Maintain ~kiteDistance from the current target: back away when closer,
  // advance when further, strafe sideways in the comfortable band
  // (including while its own weapon reloads).
  const tolerance = 30;
  e.angle = Math.atan2(dy, dx);
  if (dist < kiteDistance - tolerance) {
    e.ai.state = 'kite';
    e.vx = (-dx / dist) * speed;
    e.vy = (-dy / dist) * speed;
  } else if (dist > kiteDistance + tolerance) {
    e.ai.state = 'chase';
    e.vx = (dx / dist) * speed;
    e.vy = (dy / dist) * speed;
  } else {
    e.ai.state = 'strafe';
    const perpX = -dy / dist;
    const perpY = dx / dist;
    e.vx = perpX * speed * e.ai.strafeDir;
    e.vy = perpY * speed * e.ai.strafeDir;
    e.ai.facingRefreshTimer -= ctx.dt;
    if (e.ai.facingRefreshTimer <= 0) {
      e.ai.strafeDir *= -1;
      e.ai.facingRefreshTimer = 1.5 + Math.random() * 1.5;
    }
  }
}
