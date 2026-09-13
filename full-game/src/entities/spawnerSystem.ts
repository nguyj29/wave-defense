import { BASE } from '../config.ts';
import { createAlly } from './factory.ts';
import type { Entity } from './types.ts';

export interface AllySpawner {
  id: number;
  x: number;
  y: number;
  timer: number;
}

export function createSpawners(): AllySpawner[] {
  return [];
}

/** Spawns from the given spawners into `entities` in place, respecting per-spawner capacity. */
export function updateSpawners(
  spawners: AllySpawner[],
  entities: Entity[],
  dt: number,
  intervalSeconds: number,
  capacity: number,
  allyHp: number,
  allyDamage: number,
): void {
  for (const s of spawners) {
    const aliveCount = entities.filter((e) => e.kind === 'ally' && e.spawnerId === s.id && !e.dead).length;
    if (aliveCount >= capacity) {
      s.timer = Math.min(s.timer, intervalSeconds); // don't let the timer bank indefinitely while full
      continue;
    }
    s.timer += dt;
    if (s.timer >= intervalSeconds) {
      s.timer -= intervalSeconds;
      const angle = Math.random() * Math.PI * 2;
      const ally = createAlly(s.x + Math.cos(angle) * (BASE.spawnerRadius + 20), s.y + Math.sin(angle) * (BASE.spawnerRadius + 20), {
        hp: allyHp,
        regenRate: 1,
        speed: 200,
        meleeDamage: allyDamage,
        meleeRate: 1,
        summonedByPlayer: false,
        spawnerId: s.id,
      });
      entities.push(ally);
    }
  }
}
