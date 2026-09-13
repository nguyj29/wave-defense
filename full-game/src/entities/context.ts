import type { SpatialGrid } from '../engine/grid.ts';
import type { Faction } from './types.ts';
import type { Pathfinder } from '../world/flowfield.ts';
import type { Obstacle } from '../world/obstacles.ts';
import type { Entity } from './types.ts';

// Full-game Phase 1: a fire mage's arcing fireball is tracked outside the
// normal projectile-entity pipeline (see Game.fireballs in game.ts) because
// it lobs at a fixed target point and detonates an AoE + spawns a burning
// ground effect on arrival, rather than stopping on the first unit it
// touches like a bullet/arrow. All fields here are already fully scaled
// (generation/difficulty/endless) by the caller — see
// entities/behaviors/fireMage.ts and game.ts::spawnEnemyFromRequest.
export interface FireballSpawn {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  impactRadius: number;
  burnDuration: number;
  burnDps: number;
  burnRadius: number;
  enemyFalloff: number;
  ownerFaction: Faction;
}

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
  spawnFireball: (fb: FireballSpawn) => void;
  // Live player position (round 6): lets a behavior bias toward the player
  // without needing the full Entity or a grid lookup — see
  // entities/behaviors/ally.ts's player-summoned idle-drift target.
  playerX: number;
  playerY: number;
}

export function findEntity(ctx: WorldContext, id: number): Entity | undefined {
  return ctx.entities.find((e) => e.id === id);
}
