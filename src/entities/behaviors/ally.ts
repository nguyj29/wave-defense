import { ALLY } from '../../config.ts';
import { tryMeleeAttack } from '../../combat/weapons.ts';
import type { WorldContext } from '../context.ts';
import { findNearest, findNearestUnbounded } from '../targeting.ts';
import type { Entity } from '../types.ts';

// Ally behavior as a small swappable state machine (state lives on
// e.ai.state) — deliberately dumb for the MVP; commanding allies later only
// needs to add new states/transitions here.
export function updateAlly(e: Entity, ctx: WorldContext): void {
  if (!e.ai) return;

  let target: Entity | undefined = findNearest(ctx, e, { kinds: ['enemy'], maxRadius: ALLY.seekRadius });
  if (!target) target = findNearestUnbounded(ctx, e, ['enemy']);

  if (!target) {
    e.ai.state = 'seekEnemy';
    e.vx = 0;
    e.vy = 0;
    return;
  }

  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const dist = Math.hypot(dx, dy);
  const contactRange = e.radius + target.radius + 4;
  const speed = e.speedStat ?? ALLY.speed;

  if (dist <= contactRange) {
    e.ai.state = 'attack';
    e.vx = 0;
    e.vy = 0;
    e.angle = Math.atan2(dy, dx);
    tryMeleeAttack(e, target);
  } else {
    e.ai.state = 'advance';
    const inv = 1 / (dist || 1);
    e.vx = dx * inv * speed;
    e.vy = dy * inv * speed;
    e.angle = Math.atan2(dy, dx);
  }
}
