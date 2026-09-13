import { applySteeringNoise } from '../movement.ts';
import { findNearest } from '../targeting.ts';
import type { WorldContext } from '../context.ts';
import type { Entity } from '../types.ts';

// Healer AI (full-game Phase 1): anchors behind the horde, heals nearby
// enemies (never itself — enforced by the `o.id !== e.id` filter below, on
// top of the faction-wide "no enemy ever regenerates" rule already enforced
// by enemies never getting a Regen component at all), flees when it looks
// personally targeted.
//
// Positioning heuristic (a judgment call — see DECISIONS.md): rather than a
// literal "stay N units behind the horde relative to the player" vector
// (which gets weird/jittery when the horde surrounds the player, or there is
// no clear "front"), the healer seeks a point near the centroid of nearby
// same-faction enemies, nudged further away from the player by a fixed
// offset. That reads as "hanging back among its own side" without needing
// to reason about horde facing/shape at all, and degrades gracefully (falls
// back to CORE) when no other enemies are nearby yet.
const NEARBY_ENEMY_RADIUS = 400;
const AWAY_FROM_PLAYER_OFFSET = 150;
const ARRIVE_TOLERANCE = 40;
// A player/ally this close counts as "personally targeting me" even without
// a fresher discrete-hit signal — see FLEE trigger below.
const FLEE_PROXIMITY_RADIUS_FALLBACK = 220;

export function updateHealer(e: Entity, ctx: WorldContext, core: Entity): void {
  if (!e.ai || !e.healer) return;
  const speed = e.speedStat ?? 85;

  // --- Threat detection: recently hit, OR a player/ally close enough to be
  // treated as actively attacking it. ---
  const recentlyHit = (e.hitFlashTimer ?? 0) > 0;
  const proximityRadius = e.aggroRadius ?? FLEE_PROXIMITY_RADIUS_FALLBACK;
  const nearestThreat = findNearest(ctx, e, { kinds: ['player', 'ally'], maxRadius: proximityRadius });
  const threatened = recentlyHit || !!nearestThreat;

  if (threatened) {
    e.ai.state = 'chase'; // reusing the shared EnemyBehaviorState vocabulary loosely — this is "flee", the only enemy state that ever moves AWAY from a threat
    const threatX = nearestThreat?.x ?? ctx.playerX;
    const threatY = nearestThreat?.y ?? ctx.playerY;
    const dx = e.x - threatX;
    const dy = e.y - threatY;
    const d = Math.hypot(dx, dy) || 1;
    const noisy = applySteeringNoise(e, dx / d, dy / d, ctx.dt);
    e.vx = noisy.x * speed;
    e.vy = noisy.y * speed;
    e.angle = Math.atan2(-noisy.y, -noisy.x); // face the threat while backing away, reads clearer than facing the flee direction
  } else {
    const nearbyEnemies = ctx.grid.queryRadius(e.x, e.y, NEARBY_ENEMY_RADIUS).filter((o) => o.kind === 'enemy' && o !== e && !o.dead);
    let anchorX = core.x;
    let anchorY = core.y;
    if (nearbyEnemies.length > 0) {
      let cx = 0;
      let cy = 0;
      for (const o of nearbyEnemies) {
        cx += o.x;
        cy += o.y;
      }
      cx /= nearbyEnemies.length;
      cy /= nearbyEnemies.length;
      const awayX = cx - ctx.playerX;
      const awayY = cy - ctx.playerY;
      const awayD = Math.hypot(awayX, awayY) || 1;
      anchorX = cx + (awayX / awayD) * AWAY_FROM_PLAYER_OFFSET;
      anchorY = cy + (awayY / awayD) * AWAY_FROM_PLAYER_OFFSET;
    }
    const dx = anchorX - e.x;
    const dy = anchorY - e.y;
    const d = Math.hypot(dx, dy);
    if (d > ARRIVE_TOLERANCE) {
      e.ai.state = 'chase';
      const noisy = applySteeringNoise(e, dx / d, dy / d, ctx.dt);
      e.vx = noisy.x * speed;
      e.vy = noisy.y * speed;
      e.angle = Math.atan2(noisy.y, noisy.x);
    } else {
      e.ai.state = 'strafe';
      e.vx = 0;
      e.vy = 0;
    }
  }

  // --- Healing: always active regardless of movement state, self excluded. ---
  const healRadius = e.healer.healRadius;
  const candidates = ctx.grid.queryRadius(e.x, e.y, healRadius);
  const healingIds: number[] = [];
  for (const t of candidates) {
    if (t.id === e.id || t.kind !== 'enemy' || t.dead || !t.health) continue;
    if (t.health.hp >= t.health.maxHp) continue;
    t.health.hp = Math.min(t.health.maxHp, t.health.hp + e.healer.healRate * ctx.dt);
    healingIds.push(t.id);
  }
  e.healingTargetIds = healingIds;
}
