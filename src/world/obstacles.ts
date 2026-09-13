import { OBSTACLES, WORLD } from '../config.ts';
import { Rng } from '../engine/rng.ts';
import { dist } from '../engine/vec.ts';
import {
  BASE_CLEAR_RECT,
  distToSegment,
  LANE_SEGMENTS,
  SPAWN_POINT_CLEAR_RADIUS,
  SPAWN_POINTS,
  SPAWNER_POSITIONS,
} from './map.ts';

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

function inSpawnPointClearZone(x: number, y: number): boolean {
  for (const p of SPAWN_POINTS) {
    if (dist(x, y, p.x, p.y) < SPAWN_POINT_CLEAR_RADIUS) return true;
  }
  for (const s of SPAWNER_POSITIONS) {
    if (dist(x, y, s.x, s.y) < 80) return true;
  }
  return false;
}

function inLaneClearZone(x: number, y: number): boolean {
  for (const lane of LANE_SEGMENTS) {
    if (distToSegment(x, y, lane.x1, lane.y1, lane.x2, lane.y2) < lane.width / 2) return true;
  }
  return false;
}

function validPlacement(x: number, y: number, radius: number): boolean {
  if (x - radius < 0 || x + radius > WORLD.width || y - radius < 0 || y + radius > WORLD.height) {
    return false;
  }
  if (inBaseClearZone(x, y)) return false;
  if (inSpawnPointClearZone(x, y)) return false;
  if (inLaneClearZone(x, y)) return false;
  return true;
}

interface Patch {
  x: number;
  y: number;
}

/** Picks patch centers away from the base and lane corridors, so forest reads as clumps off to the sides. */
function generatePatchCenters(rng: Rng, count: number): Patch[] {
  const patches: Patch[] = [];
  let attempts = 0;
  while (patches.length < count && attempts < count * 60) {
    attempts++;
    const x = rng.range(150, WORLD.width - 150);
    const y = rng.range(150, WORLD.height - 150);
    if (inBaseClearZone(x, y)) continue;
    if (inLaneClearZone(x, y)) continue;
    // Keep patch centers themselves off the lanes by a bit more than the
    // lane clear width, so a patch's spread doesn't immediately bleed back
    // onto the road.
    let tooCloseToLane = false;
    for (const lane of LANE_SEGMENTS) {
      if (distToSegment(x, y, lane.x1, lane.y1, lane.x2, lane.y2) < lane.width / 2 + 80) {
        tooCloseToLane = true;
        break;
      }
    }
    if (tooCloseToLane) continue;
    patches.push({ x, y });
  }
  return patches;
}

/** Samples a placement candidate: mostly from a random patch, sometimes uniform for a natural transition. */
function sampleCandidate(rng: Rng, patches: Patch[]): { x: number; y: number } {
  if (patches.length > 0 && rng.range(0, 1) > OBSTACLES.scatterFraction) {
    const patch = patches[rng.int(0, patches.length)];
    const angle = rng.range(0, Math.PI * 2);
    const r = Math.abs(rng.range(-OBSTACLES.patchRadius, OBSTACLES.patchRadius)); // bias toward patch center
    return { x: patch.x + Math.cos(angle) * r, y: patch.y + Math.sin(angle) * r };
  }
  return { x: rng.range(0, WORLD.width), y: rng.range(0, WORLD.height) };
}

export function generateObstacles(): Obstacle[] {
  const rng = new Rng(WORLD.seed);
  const obstacles: Obstacle[] = [];
  let id = 0;

  const patches = generatePatchCenters(rng, OBSTACLES.patchCount);

  let attempts = 0;
  while (obstacles.filter((o) => o.type === 'tree').length < OBSTACLES.treeCount && attempts < OBSTACLES.treeCount * 60) {
    attempts++;
    const { x, y } = sampleCandidate(rng, patches);
    if (!validPlacement(x, y, OBSTACLES.treeRadius)) continue;
    obstacles.push({ id: id++, type: 'tree', x, y, radius: OBSTACLES.treeRadius });
  }

  attempts = 0;
  while (obstacles.filter((o) => o.type === 'rock').length < OBSTACLES.rockCountMin && attempts < OBSTACLES.rockCountMin * 60) {
    attempts++;
    const { x, y } = sampleCandidate(rng, patches);
    const radius = rng.range(OBSTACLES.rockRadius[0], OBSTACLES.rockRadius[1]);
    if (!validPlacement(x, y, radius)) continue;
    const vertCount = rng.int(OBSTACLES.rockVertsRange[0], OBSTACLES.rockVertsRange[1] + 1);
    const vertOffsets: number[] = [];
    for (let i = 0; i < vertCount; i++) vertOffsets.push(rng.range(0.7, 1.15));
    obstacles.push({ id: id++, type: 'rock', x, y, radius, vertOffsets });
  }

  return obstacles;
}
