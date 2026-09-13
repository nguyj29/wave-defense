import type { SpatialGrid } from '../engine/grid.ts';
import type { Pathfinder } from '../world/flowfield.ts';
import type { Obstacle } from '../world/obstacles.ts';
import type { Entity } from './types.ts';

// Shared read/mutate context handed to every per-entity behavior update.
// Behaviors query the grid/pathfinder and enqueue projectiles; they never
// reach into game.ts directly, which keeps AI modules unit-testable and
// swappable in isolation.
export interface WorldContext {
  dt: number;
  entities: Entity[]; // all live entities this tick (player, allies, enemies, core, ...)
  grid: SpatialGrid<Entity>;
  obstacles: Obstacle[];
  pathfinder: Pathfinder;
  spawnProjectile: (e: Entity) => void;
}

export function findEntity(ctx: WorldContext, id: number): Entity | undefined {
  return ctx.entities.find((e) => e.id === id);
}
