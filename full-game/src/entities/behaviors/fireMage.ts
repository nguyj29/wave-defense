import type { WorldContext } from '../context.ts';
import { applySteeringNoise } from '../movement.ts';
import { findNearest } from '../targeting.ts';
import type { Entity } from '../types.ts';
import { playSfx } from '../../audio/sfx.ts';

// Fire mage: kites at range exactly like the archer (see
// entities/behaviors/enemy.ts::updateKiter, which this deliberately mirrors
// rather than importing/parameterizing — the two have diverged just enough
// in what they call on attack that sharing one function would need a
// callback parameter for one call site; kept as a sibling function instead,
// consistent with the codebase's "small dedicated behavior function per
// archetype family" style), but its attack lobs an arcing fireball (tracked
// in Game.fireballs, see entities/context.ts::FireballSpawn) instead of
// firing a normal projectile.
const KITE_DISTANCE = 350;
const KITE_TOLERANCE = 30;

export function updateFireMage(e: Entity, ctx: WorldContext, core: Entity): void {
  if (!e.ai || !e.fireMage) return;
  const speed = e.speedStat ?? 75;
  const target = findNearest(ctx, e, { kinds: ['player', 'ally'], maxRadius: e.aggroRadius ?? 450 });
  const attackTarget = target ?? core;
  const dx = attackTarget.x - e.x;
  const dy = attackTarget.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  const withinFiringRange = dist <= e.fireMage.range;
  if (withinFiringRange) tryFireballAttack(e, attackTarget.x, attackTarget.y, ctx);

  if (!target) {
    if (withinFiringRange) {
      e.ai.state = 'strafe';
      e.vx = 0;
      e.vy = 0;
      e.angle = Math.atan2(dy, dx);
    } else {
      e.ai.state = 'toCore';
      const dir = ctx.pathfinder.getDirection(e.x, e.y);
      const noisy = applySteeringNoise(e, dir.x, dir.y, ctx.dt);
      e.vx = noisy.x * speed;
      e.vy = noisy.y * speed;
      if (noisy.x !== 0 || noisy.y !== 0) e.angle = Math.atan2(noisy.y, noisy.x);
    }
    return;
  }

  e.angle = Math.atan2(dy, dx);
  if (dist < KITE_DISTANCE - KITE_TOLERANCE) {
    e.ai.state = 'kite';
    e.vx = (-dx / dist) * speed;
    e.vy = (-dy / dist) * speed;
  } else if (dist > KITE_DISTANCE + KITE_TOLERANCE) {
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

function tryFireballAttack(attacker: Entity, targetX: number, targetY: number, ctx: WorldContext): void {
  const fm = attacker.fireMage;
  if (!fm || fm.cooldown > 0) return;
  ctx.spawnFireball({
    x: attacker.x,
    y: attacker.y,
    targetX,
    targetY,
    speed: fm.projectileSpeed,
    damage: fm.damage,
    impactRadius: fm.impactRadius,
    burnDuration: fm.burnDuration,
    burnDps: fm.burnDps,
    burnRadius: fm.burnRadius,
    enemyFalloff: fm.enemyFalloff,
    ownerFaction: attacker.faction,
  });
  playSfx('fireballLaunch');
  fm.cooldown = 1 / fm.rate;
}
