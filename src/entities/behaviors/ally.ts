import { ALLY, CORE } from '../../config.ts';
import { tryMeleeAttack } from '../../combat/weapons.ts';
import type { WorldContext } from '../context.ts';
import { applySteeringNoise } from '../movement.ts';
import { findNearest } from '../targeting.ts';
import type { Entity } from '../types.ts';

// Ally behavior as a small swappable state machine (state lives on
// e.ai.state) — deliberately dumb for the MVP; commanding allies later only
// needs to add new states/transitions here.
//
// Engagement range comes from `e.aggroRadius` (== ALLY.aggroRadius), named
// to match the enemy faction's `aggroRadius` so the concept reads the same
// on both sides. When nothing is within that range, allies idle via a
// biased Brownian motion (random-walk velocity with a small constant
// homeward bias) rather than the old hard "beeline home past a leash
// radius / idle in place otherwise" split — see DECISIONS.md round 5.
export function updateAlly(e: Entity, ctx: WorldContext): void {
  if (!e.ai) return;

  const engageRadius = e.aggroRadius ?? ALLY.aggroRadius;
  const target = findNearest(ctx, e, { kinds: ['enemy'], maxRadius: engageRadius });
  const speed = e.speedStat ?? ALLY.speed;

  if (target) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);
    const contactRange = e.radius + target.radius + 4;

    if (dist <= contactRange) {
      e.ai.state = 'attack';
      e.vx = 0;
      e.vy = 0;
      e.angle = Math.atan2(dy, dx);
      tryMeleeAttack(e, target);
    } else {
      e.ai.state = 'advance';
      const inv = 1 / (dist || 1);
      const noisy = applySteeringNoise(e, dx * inv, dy * inv, ctx.dt);
      e.vx = noisy.x * speed;
      e.vy = noisy.y * speed;
      e.angle = Math.atan2(noisy.y, noisy.x);
    }
    return;
  }

  // Nothing to fight in range: biased-random-walk idle. Each tick, nudge a
  // persistent idle velocity (e.ai.idleVx/idleVy) by a small random
  // acceleration, clamp it to idleMaxSpeed, and add a small constant
  // homeward acceleration toward CORE — much weaker than the random
  // component so it reads as "wandering, but drifting home over time"
  // rather than ever walking a straight line to base. Beyond
  // idleSoftBoundRadius the homeward bias scales up (a soft leash) instead
  // of snapping to a direct beeline.
  e.ai.state = 'idle';
  let ivx = e.ai.idleVx ?? 0;
  let ivy = e.ai.idleVy ?? 0;

  const randAngle = Math.random() * Math.PI * 2;
  const randAccel = Math.random() * ALLY.idleRandomAccel;
  ivx += Math.cos(randAngle) * randAccel * ctx.dt;
  ivy += Math.sin(randAngle) * randAccel * ctx.dt;

  const hdx = CORE.x - e.x;
  const hdy = CORE.y - e.y;
  const homeDist = Math.hypot(hdx, hdy) || 1;
  let biasAccel = ALLY.idleHomeBiasAccel;
  if (homeDist > ALLY.idleSoftBoundRadius) {
    biasAccel *= 1 + (homeDist - ALLY.idleSoftBoundRadius) * ALLY.idleHomeBiasBoostPerUnit;
  }
  ivx += (hdx / homeDist) * biasAccel * ctx.dt;
  ivy += (hdy / homeDist) * biasAccel * ctx.dt;

  const ispeed = Math.hypot(ivx, ivy);
  if (ispeed > ALLY.idleMaxSpeed) {
    const scale = ALLY.idleMaxSpeed / ispeed;
    ivx *= scale;
    ivy *= scale;
  }
  e.ai.idleVx = ivx;
  e.ai.idleVy = ivy;

  e.vx = ivx;
  e.vy = ivy;
  if (ispeed > 1) e.angle = Math.atan2(ivy, ivx);
}
