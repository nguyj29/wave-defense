import { BASE, CORE, ROAD_GRID, WORLD } from '../config.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// -----------------------------------------------------------------------
// Base wall "pen": one north wall (three gaps, one per active spawn lane)
// plus two side walls that run from the north wall's ends down to the
// world's south edge, closing off flanking. The base itself sits flush
// against the south edge, so the south side needs no wall of its own.
// See DECISIONS.md for why this shape replaced the old corner-L.
// -----------------------------------------------------------------------
const wallY = CORE.y - BASE.wallSetback; // north wall's y position
const wallLeftX = CORE.x - BASE.wallHalfSpan;
const wallRightX = CORE.x + BASE.wallHalfSpan;

interface Span {
  x0: number;
  x1: number;
}

function gapSpans(): Span[] {
  return BASE.gapOffsets
    .map((off) => CORE.x + off)
    .sort((a, b) => a - b)
    .map((cx) => ({ x0: cx - BASE.gapWidth / 2, x1: cx + BASE.gapWidth / 2 }));
}

function wallSegmentsFromGaps(): Rect[] {
  const gaps = gapSpans();
  const segments: Rect[] = [];
  let cursor = wallLeftX;
  for (const gap of gaps) {
    if (gap.x0 > cursor) {
      segments.push({ x: cursor, y: wallY - BASE.wallThickness / 2, w: gap.x0 - cursor, h: BASE.wallThickness });
    }
    cursor = gap.x1;
  }
  if (wallRightX > cursor) {
    segments.push({ x: cursor, y: wallY - BASE.wallThickness / 2, w: wallRightX - cursor, h: BASE.wallThickness });
  }
  return segments;
}

// Phase 5: one destructible door rect per wall gap, exactly filling the gap
// span the wall segments leave open (same y/thickness as the wall itself).
// While alive a door blocks movement exactly like a wall segment (see
// entities/movement.ts's doors param); once its HP reaches 0 it stops
// blocking, so the gap behaves exactly as it always has. See
// game.ts::updateDoors for the damage/HP-tracking side of this (map.ts only
// owns geometry, not HP, matching this file's existing "pure layout" role).
export const DOOR_RECTS: Rect[] = gapSpans().map((gap) => ({
  x: gap.x0,
  y: wallY - BASE.wallThickness / 2,
  w: gap.x1 - gap.x0,
  h: BASE.wallThickness,
}));

export const WALL_SEGMENTS: Rect[] = [
  ...wallSegmentsFromGaps(),
  // Side walls: from the north wall down to the world's south edge.
  { x: wallLeftX - BASE.wallThickness / 2, y: wallY, w: BASE.wallThickness, h: WORLD.height - wallY },
  { x: wallRightX - BASE.wallThickness / 2, y: wallY, w: BASE.wallThickness, h: WORLD.height - wallY },
];

// Round 9: offsets deliberately left unchanged — same absolute-vs-
// proportional call as CORE's edge margin (config.ts) and BASE.wallThickness/
// gapWidth (also never scaled by round 5's 1.5x world-size increase either):
// a fixed distance from the core, not a fraction of the world. Still
// comfortably inside the (now-smaller) wall pen after the halving
// (wallSetback shrank to 195, so a 140-unit y-offset still sits well north
// of the core and south of the wall).
export const SPAWNER_POSITIONS: { x: number; y: number }[] = [
  { x: CORE.x - 220, y: CORE.y - 140 },
  { x: CORE.x + 220, y: CORE.y - 140 },
];

// -----------------------------------------------------------------------
// Named spawn points, data-driven. Only unlockWave <= current wave number
// are active; for this 5-wave prototype that's just the three "top" points.
// mid-left/mid-right are explicit placeholders for the planned 25-wave game
// (unlockWave: 15 is a documented placeholder, not a tuned value — see
// DECISIONS.md) so unlocking them later is a data edit only.
// -----------------------------------------------------------------------
export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  unlockWave: number;
}

// Round 7: spawn points now sit ON the road grid (see ROAD_LINES below)
// rather than at a fixed edge margin, so movement in/out of a spawn point
// reads as "coming down a road" — see DECISIONS.md. The first/last grid
// lines in each axis are used as the outer "edge" positions; top-middle
// already coincides with CORE.x (both equal WORLD.width/2 with
// ROAD_GRID.spacing=800), so it needed no adjustment at all.
const firstGridLine = ROAD_GRID.spacing;
const lastGridLine = Math.floor((WORLD.width - 1) / ROAD_GRID.spacing) * ROAD_GRID.spacing;
const secondToLastGridLine = lastGridLine - ROAD_GRID.spacing;

export const SPAWN_POINTS: SpawnPoint[] = [
  { id: 'top-left', x: firstGridLine, y: firstGridLine, unlockWave: 1 },
  { id: 'top-middle', x: CORE.x, y: firstGridLine, unlockWave: 1 },
  { id: 'top-right', x: lastGridLine, y: firstGridLine, unlockWave: 1 },
  { id: 'mid-left', x: firstGridLine, y: secondToLastGridLine, unlockWave: 15 },
  { id: 'mid-right', x: lastGridLine, y: secondToLastGridLine, unlockWave: 15 },
];

export function activeSpawnPoints(waveNumber: number): SpawnPoint[] {
  const active = SPAWN_POINTS.filter((p) => p.unlockWave <= waveNumber);
  return active.length > 0 ? active : SPAWN_POINTS.slice(0, 1);
}

// Rectangle used to keep the base pen's interior clear of obstacle placement.
export const BASE_CLEAR_RECT: Rect = {
  x: wallLeftX - 40,
  y: wallY - 40,
  w: wallRightX - wallLeftX + 80,
  h: WORLD.height - (wallY - 40),
};

// Scaled 0.5x alongside round 9's world-size halving (was scaled 1.5x the
// other way, 160->240, in round 5 when the world grew 3200->4800) — this is
// a proportional "how much clear space around a spawn point" radius, not an
// absolute gameplay constant, so it tracks the world-size scale factor.
export const SPAWN_POINT_CLEAR_RADIUS = 120;

// -----------------------------------------------------------------------
// Round 7: a uniform, map-wide grid of roads replaces the old maze-style
// per-spawn-point lane system entirely. Roads are purely visual/obstacle-
// exclusion features — the flow field treats them as ordinary open ground
// (it only reads WALL_SEGMENTS + the obstacle list), so no pathfinding
// change was needed to "funnel" through them; they're connective tissue
// across the open map, while the base wall/gap choke points (above) remain
// the actual funnel mechanic right at the base perimeter. See
// config.ts::ROAD_GRID and DECISIONS.md round 7 for the spacing/width
// rationale.
// -----------------------------------------------------------------------
function gridLines(): number[] {
  const lines: number[] = [];
  for (let v = ROAD_GRID.spacing; v < WORLD.width; v += ROAD_GRID.spacing) lines.push(v);
  return lines;
}

// Same line set serves both axes since the world is square (2400x2400).
export const ROAD_LINES: { vertical: number[]; horizontal: number[] } = {
  vertical: gridLines(),
  horizontal: gridLines(),
};

/** True if (x,y) falls within ROAD_GRID.width of any grid road line (used to keep obstacles off the roads). */
export function onRoadGrid(x: number, y: number): boolean {
  const half = ROAD_GRID.width / 2;
  for (const lx of ROAD_LINES.vertical) if (Math.abs(x - lx) < half) return true;
  for (const ly of ROAD_LINES.horizontal) if (Math.abs(y - ly) < half) return true;
  return false;
}
