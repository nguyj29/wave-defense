import { ENEMIES } from '../../config.ts';
import { tryMeleeAttack, tryRangedAttack } from '../../combat/weapons.ts';
import type { WorldContext } from '../context.ts';
import { applySteeringNoise } from '../movement.ts';
import { findNearest } from '../targeting.ts';
import type { Entity } from '../types.ts';
import { updateFireMage } from './fireMage.ts';
import { updateHealer } from './healer.ts';

// Shared faction rule enforcement point: enemies path toward the core, but
// divert to attack a player/ally that enters their aggro radius, then
// resume. Which concrete behavior runs is picked by archetype config
// (ENEMIES[archetype].behavior), so a new archetype needs only a config
// entry plus (if genuinely novel) a new case here — the enemy base
// creation code in factory.ts never has to change.
//
// Phase 1 additions: rusher and bomber are BOTH 'melee' behavior — rusher's
// entire "beeline the core, ignore almost everything" read comes purely from
// its tiny aggroRadius config value (see config.ts), and bomber has no melee
// component attached (meleeDamage: 0) so it approaches and simply stands at
// contact range doing nothing, since its real "attack" (fuse/detonation) is
// driven centrally every tick in game.ts, independent of AI behavior — see
// DECISIONS.md.
export function updateEnemy(e: Entity, ctx: WorldContext, core: Entity): void {
  const def = ENEMIES[e.archetype as keyof typeof ENEMIES];
  if (!def) return;
  if (def.behavior === 'kiter') updateKiter(e, ctx, core);
  else if (def.behavior === 'healer') updateHealer(e, ctx, core);
  else if (def.behavior === 'fireMage') updateFireMage(e, ctx, core);
  else updateMelee(e, ctx, core);
}

// `noisy`: chase/toCore movement gets a small steering-noise perturbation
// (see entities/movement.ts) so converging units fan out a bit; callers
// that need exact heading (none currently pass false here, but kept
// explicit) can opt out.
function moveToward(e: Entity, tx: number, ty: number, speed: number, dt: number, noisy = true): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  let ux = dx / d;
  let uy = dy / d;
  if (noisy) {
    const n = applySteeringNoise(e, ux, uy, dt);
    ux = n.x;
    uy = n.y;
  }
  e.vx = ux * speed;
  e.vy = uy * speed;
  e.angle = Math.atan2(uy, ux);
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
    moveToward(e, target.x, target.y, speed, ctx.dt);
  } else {
    e.ai.state = 'toCore';
    const dir = ctx.pathfinder.getDirection(e.x, e.y);
    const noisy = applySteeringNoise(e, dir.x, dir.y, ctx.dt);
    e.vx = noisy.x * speed;
    e.vy = noisy.y * speed;
    if (noisy.x !== 0 || noisy.y !== 0) e.angle = Math.atan2(noisy.y, noisy.x);
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
      const noisy = applySteeringNoise(e, dir.x, dir.y, ctx.dt);
      e.vx = noisy.x * speed;
      e.vy = noisy.y * speed;
      if (noisy.x !== 0 || noisy.y !== 0) e.angle = Math.atan2(noisy.y, noisy.x);
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
