import { BASE, CORE, WORLD } from '../config.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The base sits in the bottom-left corner. Two wall segments (with the world
// boundary) form an L that fences it off, each interrupted by a ~120-unit
// gap that acts as the intended choke point.
const wallHorizontalY = CORE.y - 260; // ~2720
const wallVerticalX = CORE.x + 260; // ~480
const gapHorizontalStart = 260;
const gapVerticalStart = CORE.y - 130;

export const WALL_SEGMENTS: Rect[] = [
  // Horizontal wall (two segments split by the gap), fencing the north side.
  {
    x: 0,
    y: wallHorizontalY - BASE.wallThickness / 2,
    w: gapHorizontalStart,
    h: BASE.wallThickness,
  },
  {
    x: gapHorizontalStart + BASE.gapWidth,
    y: wallHorizontalY - BASE.wallThickness / 2,
    w: BASE.wallLen - (gapHorizontalStart + BASE.gapWidth),
    h: BASE.wallThickness,
  },
  // Vertical wall (two segments split by the gap), fencing the east side.
  {
    x: wallVerticalX - BASE.wallThickness / 2,
    y: wallHorizontalY,
    w: BASE.wallThickness,
    h: gapVerticalStart - wallHorizontalY,
  },
  {
    x: wallVerticalX - BASE.wallThickness / 2,
    y: gapVerticalStart + BASE.gapWidth,
    w: BASE.wallThickness,
    h: WORLD.height - (gapVerticalStart + BASE.gapWidth),
  },
];

export const SPAWNER_POSITIONS: { x: number; y: number }[] = [
  { x: 150, y: WORLD.height - 380 },
  { x: 400, y: WORLD.height - 620 },
];

// The three far corners enemies stream from (the base occupies the fourth).
export const ENEMY_SPAWN_CORNERS: { x: number; y: number }[] = [
  { x: 80, y: 80 }, // top-left
  { x: WORLD.width - 80, y: 80 }, // top-right
  { x: WORLD.width - 80, y: WORLD.height - 80 }, // bottom-right
];

// Rectangle used to keep the base interior clear of obstacle placement.
export const BASE_CLEAR_RECT: Rect = {
  x: 0,
  y: wallHorizontalY - 40,
  w: wallVerticalX + 40,
  h: WORLD.height - (wallHorizontalY - 40),
};

export const CORNER_CLEAR_RADIUS = 160;
