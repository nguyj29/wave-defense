import { OBSTACLES, WORLD } from '../config.ts';
import { Rng } from '../engine/rng.ts';
import { dist } from '../engine/vec.ts';
import { BASE_CLEAR_RECT, CORNER_CLEAR_RADIUS, ENEMY_SPAWN_CORNERS, SPAWNER_POSITIONS } from './map.ts';

export type ObstacleType = 'tree' | 'rock';

export interface Obstacle {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  radius: number;
  // Rock render shape: irregular polygon as radius offsets per angle step,
  // generated once so the concave/irregular silhouette is stable.
  vertOffsets?: number[];
}

function inBaseClearZone(x: number, y: number): boolean {
  const r = BASE_CLEAR_RECT;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function inCornerClearZone(x: number, y: number): boolean {
  for (const c of ENEMY_SPAWN_CORNERS) {
    if (dist(x, y, c.x, c.y) < CORNER_CLEAR_RADIUS) return true;
  }
  for (const s of SPAWNER_POSITIONS) {
    if (dist(x, y, s.x, s.y) < 80) return true;
  }
  return false;
}

function validPlacement(x: number, y: number, radius: number): boolean {
  if (x - radius < 0 || x + radius > WORLD.width || y - radius < 0 || y + radius > WORLD.height) {
    return false;
  }
  if (inBaseClearZone(x, y)) return false;
  if (inCornerClearZone(x, y)) return false;
  return true;
}

export function generateObstacles(): Obstacle[] {
  const rng = new Rng(WORLD.seed);
  const obstacles: Obstacle[] = [];
  let id = 0;

  let attempts = 0;
  while (obstacles.filter((o) => o.type === 'tree').length < OBSTACLES.treeCount && attempts < OBSTACLES.treeCount * 40) {
    attempts++;
    const x = rng.range(0, WORLD.width);
    const y = rng.range(0, WORLD.height);
    if (!validPlacement(x, y, OBSTACLES.treeRadius)) continue;
    obstacles.push({ id: id++, type: 'tree', x, y, radius: OBSTACLES.treeRadius });
  }

  attempts = 0;
  while (obstacles.filter((o) => o.type === 'rock').length < OBSTACLES.rockCountMin && attempts < OBSTACLES.rockCountMin * 40) {
    attempts++;
    const x = rng.range(0, WORLD.width);
    const y = rng.range(0, WORLD.height);
    const radius = rng.range(OBSTACLES.rockRadius[0], OBSTACLES.rockRadius[1]);
    if (!validPlacement(x, y, radius)) continue;
    const vertCount = rng.int(OBSTACLES.rockVertsRange[0], OBSTACLES.rockVertsRange[1] + 1);
    const vertOffsets: number[] = [];
    for (let i = 0; i < vertCount; i++) vertOffsets.push(rng.range(0.7, 1.15));
    obstacles.push({ id: id++, type: 'rock', x, y, radius, vertOffsets });
  }

  return obstacles;
}
