import { BASE, CORE, LANES, WORLD } from '../config.ts';

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

export const SPAWN_POINTS: SpawnPoint[] = [
  { id: 'top-left', x: 80, y: 80, unlockWave: 1 },
  { id: 'top-middle', x: CORE.x, y: 80, unlockWave: 1 },
  { id: 'top-right', x: WORLD.width - 80, y: 80, unlockWave: 1 },
  { id: 'mid-left', x: 80, y: CORE.y, unlockWave: 15 },
  { id: 'mid-right', x: WORLD.width - 80, y: CORE.y, unlockWave: 15 },
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

export const SPAWN_POINT_CLEAR_RADIUS = 160;

// -----------------------------------------------------------------------
// Concrete lane corridors: each of the 3 active (wave-1) spawn points gets
// a straight lane to the wall-gap it's aimed at (same left-to-right order as
// BASE.gapOffsets), kept clear of obstacles and drawn as a distinct road
// strip. mid-left/mid-right have no lane yet since they aren't reachable in
// this prototype (see DECISIONS.md) — adding their lanes is a data-only
// follow-up once they unlock.
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

export const LANE_SEGMENTS: Lane[] = wave1Points.map((p, i) => ({
  x1: p.x,
  y1: p.y,
  x2: wave1GapCenters[Math.min(i, wave1GapCenters.length - 1)],
  y2: wallY,
  width: LANES.width,
}));

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
