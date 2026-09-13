// A pragmatic component style: every game object is one Entity with a
// required core (id/kind/faction/transform) plus small optional component
// objects (health, regen, ai, ...). Faction-agnostic systems (combat,
// movement, collision) operate only on the components they need, so a
// bullet fired by an enemy and one fired by the player share the exact same
// damage/collision path.

export type Faction = 'player' | 'enemy';
export type EntityKind = 'player' | 'ally' | 'enemy' | 'projectile' | 'coin' | 'core';
export type Shape = 'circle' | 'triangle' | 'hexagon' | 'square';

export interface Health {
  hp: number;
  maxHp: number;
}

// Regen is one component shared by player, allies and (never-attached-for)
// enemies. `alwaysOn: false` + delay implements the player's out-of-combat
// regen; `alwaysOn: true` implements ally regen. Enemies simply never get
// this component, which is how "no enemy ever regenerates" is enforced.
export interface Regen {
  rate: number; // hp/s
  alwaysOn: boolean;
  delay: number; // seconds after last damage before regen may start (ignored if alwaysOn)
  timeSinceDamage: number;
}

export interface MeleeAttack {
  damage: number;
  rate: number; // hits/s
  cooldown: number; // seconds remaining
  range: number; // contact range (radius sum used if 0)
}

export interface RangedAttack {
  damage: number;
  rate: number; // shots/s
  cooldown: number;
  projectileSpeed: number;
  range: number;
  kiteDistance?: number;
}

export type AllyBehaviorState = 'advance' | 'attack' | 'idle';
export type EnemyBehaviorState = 'toCore' | 'chase' | 'attack' | 'kite' | 'strafe';

export interface AiState {
  state: string;
  targetId: number | null;
  strafeDir: number; // +-1, used by kiters
  facingRefreshTimer: number;
  // Idle biased-Brownian-motion velocity (allies only, 'idle' state) —
  // persists across ticks so the random walk is continuous rather than
  // re-rolled every frame. See entities/behaviors/ally.ts.
  idleVx?: number;
  idleVy?: number;
}

export interface ProjectileData {
  damage: number;
  ownerFaction: Faction;
  ownerId: number;
  speedX: number; // full (un-decelerated) launch velocity — direction + magnitude reference
  speedY: number;
  traveled: number;
  maxRange: number;
  piercesTrees: boolean; // true for bullets & arrows: pass over trees
  blockedByRocks: boolean;
  stopped: boolean; // true once decelerated to a halt; now just fading out in place
  stopTimer: number; // seconds remaining in the post-stop fade
}

export interface Entity {
  id: number;
  kind: EntityKind;
  faction: Faction;
  x: number;
  y: number;
  prevX: number; // for render interpolation
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  color: string;
  shape: Shape;
  dead: boolean;

  health?: Health;
  regen?: Regen;
  melee?: MeleeAttack;
  ranged?: RangedAttack;
  ai?: AiState;
  projectile?: ProjectileData;
  archetype?: string; // e.g. 'grunt' | 'archer' | 'boss' — for enemies/allies
  isBoss?: boolean;
  summonedByPlayer?: boolean;
  spawnerId?: number;
  coinValue?: number;
  isGem?: boolean; // kind: 'coin' entities only — distinct visual + pickup SFX, same magnet/pickup path
  iframeTimer?: number; // player-only: remaining invulnerability
  damageFlashTimer?: number; // render: brief hit flash
  hitFlashTimer?: number;
  speedStat?: number; // movement top speed, units/s
  aggroRadius?: number; // engagement/detection range: enemies divert to attack, allies divert to chase, within this range
  coinsMin?: number;
  coinsMax?: number;
  alpha?: number; // render-only opacity multiplier (e.g. a projectile fading out after it stops)
  barrelPullback?: number; // player-only: current recoil pullback of the aim-direction barrel line, in world units
  // Round 9: player-only, set fresh every render frame from Game.activeSlot/
  // playerWeaponState.current — which held-item silhouette (renderer.ts's
  // drawPlayerHeldItem) to draw at the end of the barrel/in-hand. Follows the
  // same "transient per-frame render field on Entity" pattern as
  // barrelPullback above rather than threading an extra param through both
  // render paths' generic drawEntity(Detailed) signatures.
  heldItem?: 'rifle' | 'pistol' | 'wand';
  // Shared steering-noise state (see entities/movement.ts::applySteeringNoise):
  // a persistent, slowly-drifting angle offset applied to "move directly
  // toward a distant target/core" vectors so converging units fan out a
  // little instead of single-filing. steerNoiseAngle is the current offset
  // (radians); steerNoiseTarget is the smoothed-random-walk target it eases
  // toward each tick.
  steerNoiseAngle?: number;
  steerNoiseTarget?: number;
}

let nextId = 1;
export function allocEntityId(): number {
  return nextId++;
}
export function resetEntityIdCounter(): void {
  nextId = 1;
}
