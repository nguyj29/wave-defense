import { distSq } from '../engine/vec.ts';
import type { WorldContext } from './context.ts';
import type { Entity, EntityKind } from './types.ts';

export function findNearest(
  ctx: WorldContext,
  from: Entity,
  opts: { kinds: EntityKind[]; maxRadius: number },
): Entity | undefined {
  const candidates = ctx.grid.queryRadius(from.x, from.y, opts.maxRadius);
  let best: Entity | undefined;
  let bestDistSq = opts.maxRadius * opts.maxRadius;
  for (const c of candidates) {
    if (c === from || c.dead || !opts.kinds.includes(c.kind)) continue;
    const d = distSq(from.x, from.y, c.x, c.y);
    if (d <= bestDistSq) {
      bestDistSq = d;
      best = c;
    }
  }
  return best;
}

/** Unrestricted-radius scan for "nearest X overall" fallback behavior. */
export function findNearestUnbounded(ctx: WorldContext, from: Entity, kinds: EntityKind[]): Entity | undefined {
  let best: Entity | undefined;
  let bestDistSq = Infinity;
  for (const c of ctx.entities) {
    if (c === from || c.dead || !kinds.includes(c.kind)) continue;
    const d = distSq(from.x, from.y, c.x, c.y);
    if (d < bestDistSq) {
      bestDistSq = d;
      best = c;
    }
  }
  return best;
}
