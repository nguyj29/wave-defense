// A pragmatic component style: every game object is one Entity with a
// required core (id/kind/faction/transform) plus small optional component
// objects (health, regen, ai, ...). Faction-agnostic systems (combat,
// movement, collision) operate only on the components they need, so a
// bullet fired by an enemy and one fired by the player share the exact same
// damage/collision path.

import type { BossAbilityDef } from '../config.ts';

export type Faction = 'player' | 'enemy';
export type EntityKind = 'player' | 'ally' | 'enemy' | 'projectile' | 'coin' | 'core';
// chevron/diamond/concaveQuad/squatSquare added for Phase 1's new archetypes
// (rusher/healer/fire-mage/bomber) — see render/renderer.ts &
// render/rendererDetailed.ts for the custom polygon paths.
export type Shape = 'circle' | 'triangle' | 'hexagon' | 'square' | 'chevron' | 'diamond' | 'concaveQuad' | 'squatSquare';

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

// --- Phase 1 archetype-specific attack/behavior components ------------------
// Bomber: fuse lights on first survived hit (see combat/damage.ts), then
// detonates in `combat/areaDamage.ts`-driven AoE regardless of whether the
// bomber itself has since died — see fuseLit/fuseTimer/fuseDetonated on
// Entity below and DECISIONS.md for the full state-machine writeup.
export interface BomberAttack {
  fuseSec: number;
  detonationDamage: number;
  detonationRadius: number;
  enemyFalloff: number; // 0..1, fraction of detonationDamage dealt to other enemies (chain-detonation friendly fire)
}

// Healer: heals every enemy (never itself) within healRadius for healRate hp/s.
export interface HealerAttack {
  healRadius: number;
  healRate: number;
}

// Fire mage: lobs an arcing fireball (tracked outside the normal projectile
// entity pipeline — see Game.fireballs in game.ts) that deals `damage` on
// impact in `impactRadius`, then leaves burning ground for `burnDuration`
// dealing `burnDps` in `burnRadius` (both impact and burn use the
// faction-aware `enemyFalloff` split — see combat/areaDamage.ts).
export interface FireMageAttack {
  range: number;
  projectileSpeed: number;
  rate: number; // casts/s
  cooldown: number;
  damage: number;
  impactRadius: number;
  burnDuration: number;
  burnDps: number;
  burnRadius: number;
  enemyFalloff: number;
}

// Phase 3: a boss's runtime ability state — `def` is the (already
// generation/difficulty/endless-scaled, see game.ts::spawnEnemyFromRequest)
// config, `cooldownRemaining` counts down for repeating abilities
// (slam/summonAdds/burnPulse), `triggered` latches once for the one-shot
// 'enrageAtLowHp'. See game.ts::updateBossAbilities.
export interface RuntimeBossAbility {
  def: BossAbilityDef;
  cooldownRemaining: number;
  triggered: boolean;
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
  generation?: number; // 0 (violet) .. 6 (red) — enemies only, see config.ts GENERATION
  bomber?: BomberAttack;
  healer?: HealerAttack;
  fireMage?: FireMageAttack;
  fuseLit?: boolean; // bomber only: true once it has survived a hit and started counting down
  fuseTimer?: number; // bomber only: seconds remaining until detonation, once lit
  fuseDetonated?: boolean; // bomber only: true once detonation has actually fired (guards double-detonation & keeps the corpse alive in the entity list until it does)
  healingTargetIds?: number[]; // healer only: ids currently being healed this tick, for the tether-line render (entities/behaviors/healer.ts)
  bossAbilities?: RuntimeBossAbility[]; // bosses only (Phase 3) — see game.ts::updateBossAbilities
  // Phase 5 sprite-descriptor readiness: a stable per-archetype key (set in
  // entities/factory.ts, e.g. the archetype/ally-type id) that
  // render/spriteRegistry.ts looks up. No sprite is registered for any key
  // today — see that module's doc comment — so this currently has zero
  // effect on rendering; it exists so real sprite assets are a registry
  // entry away, not a renderer rewrite.
  spriteKey?: string;
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
