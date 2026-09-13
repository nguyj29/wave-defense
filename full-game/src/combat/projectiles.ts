import type { SpatialGrid } from '../engine/grid.ts';
import { PROJECTILE_PHYSICS, WORLD } from '../config.ts';
import type { Entity } from '../entities/types.ts';
import type { Obstacle } from '../world/obstacles.ts';
import { applyDamage, circlesOverlap } from './damage.ts';

export interface ProjectileHitEvent {
  projectile: Entity;
  target: Entity;
}

// Smoothstep easing: 0 at t=0, 1 at t=1, flat tangent at both ends — used to
// ease the projectile's speed down to zero rather than cutting it abruptly.
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Advances all projectiles and resolves collisions. Bullets/arrows pass
 * over trees but are stopped by rocks (a reversible art/gameplay choice —
 * see DECISIONS.md), and hit the first opposing-faction entity they touch.
 *
 * Rather than instantly vanishing at maxRange, a projectile decelerates
 * smoothly to a stop over the final `decelFractionOfRange` of its travel,
 * then sits briefly and fades out (PROJECTILE_PHYSICS.stopFadeDuration)
 * before being removed. Hit detection and rock-blocking still run every
 * frame while decelerating, so a slowing shot can still land a hit right up
 * until it stops.
 */
export function updateProjectiles(
  projectiles: Entity[],
  obstacleGrid: SpatialGrid<Obstacle>,
  unitGrid: SpatialGrid<Entity>,
  dt: number,
  onHit: (e: ProjectileHitEvent) => void,
): void {
  for (const p of projectiles) {
    if (p.dead || !p.projectile) continue;
    const proj = p.projectile;

    if (proj.stopped) {
      // Sitting in place, fading out — no more movement or collision.
      proj.stopTimer -= dt;
      p.alpha = Math.max(0, proj.stopTimer / PROJECTILE_PHYSICS.stopFadeDuration);
      if (proj.stopTimer <= 0) p.dead = true;
      continue;
    }

    p.prevX = p.x;
    p.prevY = p.y;

    // Ease speed down to 0 over the final fraction of maxRange, based on
    // distance traveled so far (deterministic, not time-based, so faster/
    // slower bullets both decelerate over the same portion of their range).
    const decelStart = proj.maxRange * (1 - PROJECTILE_PHYSICS.decelFractionOfRange);
    let speedFactor = 1;
    if (proj.traveled >= decelStart) {
      const span = proj.maxRange - decelStart || 1;
      const t = Math.min(1, (proj.traveled - decelStart) / span);
      speedFactor = 1 - smoothStep(t);
    }

    const fullSpeed = Math.hypot(proj.speedX, proj.speedY) || 1;
    const dirX = proj.speedX / fullSpeed;
    const dirY = proj.speedY / fullSpeed;
    const currentSpeed = fullSpeed * speedFactor;
    p.vx = dirX * currentSpeed;
    p.vy = dirY * currentSpeed;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    proj.traveled += Math.hypot(p.vx * dt, p.vy * dt);

    if (p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) {
      p.dead = true;
      continue;
    }

    if (proj.blockedByRocks) {
      const nearbyObstacles = obstacleGrid.queryRadius(p.x, p.y, p.radius + 45);
      let blocked = false;
      for (const o of nearbyObstacles) {
        if (o.type !== 'rock') continue;
        if (circlesOverlap(p.x, p.y, p.radius, o.x, o.y, o.radius)) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        p.dead = true;
        continue;
      }
    }

    const nearbyUnits = unitGrid.queryRadius(p.x, p.y, p.radius + 50);
    let hit = false;
    for (const target of nearbyUnits) {
      if (target.dead || target === p) continue;
      if (target.kind === 'projectile' || target.kind === 'coin') continue;
      if (target.faction === proj.ownerFaction) continue; // no friendly fire in this MVP faction set
      if (target.id === proj.ownerId) continue;
      if (circlesOverlap(p.x, p.y, p.radius, target.x, target.y, target.radius)) {
        applyDamage(target, proj.damage);
        onHit({ projectile: p, target });
        p.dead = true;
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // Reached (or effectively reached) max range without hitting anything:
    // stop and start the fade rather than popping out of existence.
    if (proj.traveled >= proj.maxRange || currentSpeed <= fullSpeed * 0.02) {
      proj.stopped = true;
      proj.stopTimer = PROJECTILE_PHYSICS.stopFadeDuration;
      p.vx = 0;
      p.vy = 0;
    }
  }
}
