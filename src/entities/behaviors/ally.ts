import { ALLY, CORE } from '../../config.ts';
import { tryMeleeAttack } from '../../combat/weapons.ts';
import type { WorldContext } from '../context.ts';
import { findNearest } from '../targeting.ts';
import type { Entity } from '../types.ts';

// Ally behavior as a small swappable state machine (state lives on
// e.ai.state) — deliberately dumb for the MVP; commanding allies later only
// needs to add new states/transitions here.
//
// Engagement range comes from `e.aggroRadius` (== ALLY.aggroRadius), named
// to match the enemy faction's `aggroRadius` so the concept reads the same
// on both sides. When nothing is within that range, allies used to beeline
// toward the globally-nearest enemy anywhere on the map (a suicide run away
// from base); instead they now leash to the base: walk back if they've
// wandered past ALLY.leashRadius from the core, or idle (a light wander
// within ALLY.idleWanderRadius) once they're already home.
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
      e.vx = dx * inv * speed;
      e.vy = dy * inv * speed;
      e.angle = Math.atan2(dy, dx);
    }
    return;
  }

  // Nothing to fight in range — leash to the base instead of hunting
  // map-wide. CORE is used as the "home" reference point (allies spawn from
  // spawners near it, or are player-summoned nearby).
  const hdx = CORE.x - e.x;
  const hdy = CORE.y - e.y;
  const homeDist = Math.hypot(hdx, hdy);

  if (homeDist > ALLY.leashRadius) {
    e.ai.state = 'returnToBase';
    const inv = 1 / (homeDist || 1);
    e.vx = hdx * inv * speed;
    e.vy = hdy * inv * speed;
    e.angle = Math.atan2(hdy, hdx);
    return;
  }

  // Home with nothing to do: idle, with a light wander so a cluster of
  // allies doesn't look like frozen statues. Re-picks a nearby wander point
  // every couple of seconds (facingRefreshTimer doubles as that timer here,
  // same field the kiter enemy uses for its own re-pick cadence).
  e.ai.state = 'idle';
  e.ai.facingRefreshTimer -= ctx.dt;
  if (e.ai.facingRefreshTimer <= 0 || e.ai.wanderX === undefined) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * ALLY.idleWanderRadius;
    e.ai.wanderX = e.x + Math.cos(angle) * r;
    e.ai.wanderY = e.y + Math.sin(angle) * r;
    e.ai.facingRefreshTimer = 2 + Math.random() * 2;
  }
  const wx = e.ai.wanderX ?? e.x;
  const wy = e.ai.wanderY ?? e.y;
  const wdx = wx - e.x;
  const wdy = wy - e.y;
  const wdist = Math.hypot(wdx, wdy);
  if (wdist > 6) {
    const inv = 1 / wdist;
    // Slow amble, not a full-speed run, while idling.
    e.vx = wdx * inv * speed * 0.25;
    e.vy = wdy * inv * speed * 0.25;
    e.angle = Math.atan2(wdy, wdx);
  } else {
    e.vx = 0;
    e.vy = 0;
  }
}
