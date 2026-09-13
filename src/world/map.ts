import { BASE, CORE, LANE_MAZE, LANES, WORLD } from '../config.ts';

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

export const WALL_SEGMENTS: Rect[] = [
  ...wallSegmentsFromGaps(),
  // Side walls: from the north wall down to the world's south edge.
  { x: wallLeftX - BASE.wallThickness / 2, y: wallY, w: BASE.wallThickness, h: WORLD.height - wallY },
  { x: wallRightX - BASE.wallThickness / 2, y: wallY, w: BASE.wallThickness, h: WORLD.height - wallY },
];

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

// Corner/edge margin, scaled 1.5x alongside the world-size increase (see
// DECISIONS.md round 5) from the original 80.
const SPAWN_EDGE_MARGIN = 120;

export const SPAWN_POINTS: SpawnPoint[] = [
  { id: 'top-left', x: SPAWN_EDGE_MARGIN, y: SPAWN_EDGE_MARGIN, unlockWave: 1 },
  { id: 'top-middle', x: CORE.x, y: SPAWN_EDGE_MARGIN, unlockWave: 1 },
  { id: 'top-right', x: WORLD.width - SPAWN_EDGE_MARGIN, y: SPAWN_EDGE_MARGIN, unlockWave: 1 },
  { id: 'mid-left', x: SPAWN_EDGE_MARGIN, y: CORE.y, unlockWave: 15 },
  { id: 'mid-right', x: WORLD.width - SPAWN_EDGE_MARGIN, y: CORE.y, unlockWave: 15 },
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

// Scaled 1.5x alongside the world-size increase from the original 160.
export const SPAWN_POINT_CLEAR_RADIUS = 240;

// -----------------------------------------------------------------------
// Concrete lane corridors: each of the 3 active (wave-1) spawn points gets a
// short chain of strictly axis-aligned (Manhattan) segments to the wall-gap
// it's aimed at (same left-to-right order as BASE.gapOffsets), kept clear of
// obstacles and drawn as a distinct road strip — no diagonal roads, and a
// couple of turns so it reads a bit maze-like rather than a single L-shape.
// Each spawn point maps to an ARRAY of segments (a "lane path"); mid-left/
// mid-right have no lane yet since they aren't reachable in this prototype
// (see DECISIONS.md) — adding their lanes is a data-only follow-up once
// they unlock. See DECISIONS.md round 5 for the maze-shape rationale.
// -----------------------------------------------------------------------
export interface Lane {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

const wave1GapCenters = BASE.gapOffsets.map((off) => CORE.x + off).sort((a, b) => a - b);
const wave1Points = SPAWN_POINTS.filter((p) => p.unlockWave === 1).sort((a, b) => a.x - b.x);

/**
 * Builds a Manhattan (axis-aligned-only) path of lane segments from a spawn
 * point (px,py) down to a wall gap center (gx, wallY): drop straight down
 * partway, jog sideways onto the gap's x, drop again, then a short final
 * jog+drop so even the straight-down middle lane gets one deliberate offset
 * kink rather than reading as a single unbroken line. Pure function of the
 * two endpoints + LANE_MAZE fractions, so re-tuning the maze shape is a
 * config edit only.
 */
function buildLanePath(px: number, py: number, gx: number, gy: number, jogSign: number): Lane[] {
  const totalDrop = gy - py;
  const y1 = py + totalDrop * LANE_MAZE.firstTurnFraction;
  const y2 = py + totalDrop * LANE_MAZE.secondTurnFraction;
  // Midpoint x between spawn and gap, plus a deliberate sideways jog, gives
  // the "maze" a waypoint distinct from either endpoint — so even a spawn
  // point whose x already matches its gap (top-middle) still gets a couple
  // of turns instead of one unbroken straight line.
  const midX = px + (gx - px) * 0.5 + jogSign * LANE_MAZE.sidewaysJog;

  const segments: Lane[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    // Skip degenerate zero-length segments (e.g. the middle spawn point,
    // which already shares an x with its gap for some legs).
    if (Math.abs(x1 - x2) < 0.01 && Math.abs(y1 - y2) < 0.01) return;
    segments.push({ x1, y1, x2, y2, width: LANES.width });
  };

  // Leg 1: straight down from the spawn point to the first turn row.
  push(px, py, px, y1);
  // Leg 2: jog sideways onto the midpoint x.
  push(px, y1, midX, y1);
  // Leg 3: straight down to the second turn row.
  push(midX, y1, midX, y2);
  // Leg 4: jog sideways onto the gap's exact x.
  push(midX, y2, gx, y2);
  // Leg 5: straight down into the gap.
  push(gx, y2, gx, gy);

  return segments.length > 0 ? segments : [{ x1: px, y1: py, x2: gx, y2: gy, width: LANES.width }];
}

export const LANE_PATHS: Lane[][] = wave1Points.map((p, i) => {
  const gx = wave1GapCenters[Math.min(i, wave1GapCenters.length - 1)];
  // Alternate jog direction per lane (left lane jogs left, right jogs
  // right, middle jogs left) purely so the three lanes' zig-zags don't all
  // lean the same way.
  const jogSign = i === 1 ? -1 : i === 0 ? -1 : 1;
  return buildLanePath(p.x, p.y, gx, wallY, jogSign);
});

// Flat list of every segment across every lane path — the shape most
// consumers (obstacle exclusion, rendering) actually want to iterate.
export const LANE_SEGMENTS: Lane[] = LANE_PATHS.flat();

/** Shortest distance from (x,y) to the segment (x1,y1)-(x2,y2). */
export function distToSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((x - x1) * dx + (y - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}
