import type { SpatialGrid } from '../engine/grid.ts';
import { STEER_NOISE, WORLD } from '../config.ts';
import { clamp } from '../engine/vec.ts';
import { WALL_SEGMENTS } from '../world/map.ts';
import type { Obstacle } from '../world/obstacles.ts';
import type { Entity } from './types.ts';

// Shared steering-noise utility: gives an entity a persistent, slowly
// drifting angle offset (a smoothed random walk, re-targeted periodically
// and eased toward continuously — cheap, no real Perlin noise needed) and
// rotates a "move directly toward X" vector by it. Used for enemy chase/
// toCore and ally advance so units converging on one point/direction fan
// out a little instead of forming a single-file line — see config.ts
// STEER_NOISE and DECISIONS.md round 5. NOT used for archer kite-distance
// math or contact-range resolution, so combat precision is untouched.
const maxAngle = (STEER_NOISE.maxAngleDeg * Math.PI) / 180;

/**
 * Advances entity `e`'s persistent steering-noise angle by one tick and
 * returns { dx, dy } — the input unit vector (dx,dy) rotated by that noise
 * angle. Call once per tick per entity that wants noisy "move toward"
 * heading; pass the already-normalized (or any) direction vector.
 */
export function applySteeringNoise(e: Entity, dx: number, dy: number, dt: number): { x: number; y: number } {
  if (e.steerNoiseTarget === undefined || Math.random() < dt * 0.3) {
    // Occasionally re-roll the target angle the smoothed walk eases toward,
    // so the wander direction itself drifts over time instead of just
    // orbiting a fixed offset.
    e.steerNoiseTarget = (Math.random() * 2 - 1) * maxAngle;
  }
  const current = e.steerNoiseAngle ?? 0;
  const target = e.steerNoiseTarget;
  const maxStep = STEER_NOISE.changeRatePerSecond * dt;
  let diff = target - current;
  if (diff > maxStep) diff = maxStep;
  else if (diff < -maxStep) diff = -maxStep;
  const angle = current + diff;
  e.steerNoiseAngle = angle;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

// Integrates movement for player/ally/enemy entities, then layers local
// avoidance on top of whatever behavior code set as the desired velocity:
// soft same-faction separation (a gentle push so units don't perfectly
// stack) plus hard circle-vs-obstacle / circle-vs-wall resolution.
export function integrateAndResolve(
  movers: Entity[],
  obstacles: Obstacle[],
  obstacleGrid: SpatialGrid<Obstacle>,
  unitGrid: SpatialGrid<Entity>,
  dt: number,
): void {
  for (const e of movers) {
    e.prevX = e.x;
    e.prevY = e.y;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // Soft separation: same-faction units push apart proportional to overlap,
  // applied as a fractional positional correction so it reads as a gentle
  // force rather than a hard wall between allies/enemies.
  const SEPARATION_FACTOR = 0.4;
  for (const e of movers) {
    const nearby = unitGrid.queryRadius(e.x, e.y, e.radius + 40);
    for (const other of nearby) {
      if (other === e || other.faction !== e.faction || other.kind === 'core') continue;
      const dx = e.x - other.x;
      const dy = e.y - other.y;
      const distSq = dx * dx + dy * dy;
      const minDist = e.radius + other.radius;
      if (distSq > 0.0001 && distSq < minDist * minDist) {
        const d = Math.sqrt(distSq);
        const overlap = (minDist - d) / d;
        const push = overlap * SEPARATION_FACTOR * 0.5;
        e.x += dx * push;
        e.y += dy * push;
      }
    }
  }

  // Hard resolution against static obstacles (trees & rocks).
  for (const e of movers) {
    const nearby = obstacleGrid.queryRadius(e.x, e.y, e.radius + 48);
    for (const o of nearby) {
      resolveCircleVsCircle(e, o.x, o.y, o.radius);
    }
  }

  // Hard resolution against base walls.
  for (const e of movers) {
    for (const w of WALL_SEGMENTS) {
      resolveCircleVsRect(e, w.x, w.y, w.w, w.h);
    }
  }

  // World bounds.
  for (const e of movers) {
    e.x = clamp(e.x, e.radius, WORLD.width - e.radius);
    e.y = clamp(e.y, e.radius, WORLD.height - e.radius);
  }
}

function resolveCircleVsCircle(e: Entity, ox: number, oy: number, oradius: number): void {
  const dx = e.x - ox;
  const dy = e.y - oy;
  const distSq = dx * dx + dy * dy;
  const minDist = e.radius + oradius;
  if (distSq < minDist * minDist) {
    const d = Math.sqrt(distSq) || 0.001;
    const push = (minDist - d) / d;
    e.x += dx * push;
    e.y += dy * push;
  }
}

function resolveCircleVsRect(e: Entity, rx: number, ry: number, rw: number, rh: number): void {
  const closestX = clamp(e.x, rx, rx + rw);
  const closestY = clamp(e.y, ry, ry + rh);
  const dx = e.x - closestX;
  const dy = e.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq < e.radius * e.radius) {
    const d = Math.sqrt(distSq);
    if (d < 1e-4) {
      // Center is inside the rect: push out along the shortest axis.
      const left = e.x - rx;
      const right = rx + rw - e.x;
      const top = e.y - ry;
      const bottom = ry + rh - e.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) e.x = rx - e.radius;
      else if (min === right) e.x = rx + rw + e.radius;
      else if (min === top) e.y = ry - e.radius;
      else e.y = ry + rh + e.radius;
    } else {
      const push = (e.radius - d) / d;
      e.x += dx * push;
      e.y += dy * push;
    }
  }
}
