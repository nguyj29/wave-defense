import type { SpatialGrid } from '../engine/grid.ts';
import { WORLD } from '../config.ts';
import type { Entity } from '../entities/types.ts';
import type { Obstacle } from '../world/obstacles.ts';
import { applyDamage, circlesOverlap } from './damage.ts';

export interface ProjectileHitEvent {
  projectile: Entity;
  target: Entity;
}

/**
 * Advances all projectiles and resolves collisions. Bullets/arrows pass
 * over trees but are stopped by rocks (a reversible art/gameplay choice —
 * see DECISIONS.md), and hit the first opposing-faction entity they touch.
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
    p.prevX = p.x;
    p.prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.projectile.traveled += Math.hypot(p.vx * dt, p.vy * dt);

    if (
      p.projectile.traveled >= p.projectile.maxRange ||
      p.x < 0 ||
      p.x > WORLD.width ||
      p.y < 0 ||
      p.y > WORLD.height
    ) {
      p.dead = true;
      continue;
    }

    if (p.projectile.blockedByRocks) {
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
    for (const target of nearbyUnits) {
      if (target.dead || target === p) continue;
      if (target.kind === 'projectile' || target.kind === 'coin') continue;
      if (target.faction === p.projectile.ownerFaction) continue; // no friendly fire in this MVP faction set
      if (target.id === p.projectile.ownerId) continue;
      if (circlesOverlap(p.x, p.y, p.radius, target.x, target.y, target.radius)) {
        applyDamage(target, p.projectile.damage);
        onHit({ projectile: p, target });
        p.dead = true;
        break;
      }
    }
  }
}
