import { RECOIL, WEAPONS, type PlayerClassDef } from '../config.ts';
import type { WorldContext } from '../entities/context.ts';
import { createProjectile } from '../entities/factory.ts';
import type { Entity } from '../entities/types.ts';
import type { ShopLevels } from '../economy/shop.ts';
import {
  grenadeBlastRadius,
  grenadeDamage,
  maceDamage,
  maceSelfHealBonus,
  pistolDamage,
  pistolFireRate,
  rifleDamage,
  rifleMagazine,
} from '../economy/shop.ts';
import { applyDamage } from './damage.ts';
import { playSfx } from '../audio/sfx.ts';
import { pulseHaptic } from '../audio/haptics.ts';

// Phase 2 (full-game): generalized from {'rifle','pistol'} to include the
// macer's melee weapon and the bomber class's thrown grenade — see
// config.ts's WeaponDef.kind for how each dispatches inside
// updatePlayerWeapon below. rifle/pistol/mace all still fire on
// `triggerHeld` at their own fire rate exactly like the prototype; only
// grenade is meaningfully different (an arcing thrown AoE with a max range
// clamp instead of a hitscan-style projectile).
export type WeaponId = 'rifle' | 'pistol' | 'mace' | 'grenade';

export interface PlayerWeaponState {
  current: WeaponId;
  rifleAmmo: number;
  reloading: boolean;
  reloadTimer: number;
  fireCooldown: number; // shared, reset per weapon switch is fine since rates differ per weapon
  muzzleFlashTimer: number;
  // Deterministic recoil "kick" — snaps to 1 on every shot, then eases back
  // to 0 at a fixed exponential rate (RECOIL.decayPerSecond). No randomness:
  // every shot with a given weapon feels identical. recoilAngle/recoilCamera/
  // recoilBarrel capture the direction and per-weapon magnitudes at the
  // moment of firing so the decay afterward doesn't need the weapon def.
  recoil: number;
  recoilAngle: number;
  recoilCameraStrength: number;
  recoilBarrelStrength: number;
}

export function createPlayerWeaponState(levels: ShopLevels, startingWeapon: WeaponId = 'rifle'): PlayerWeaponState {
  return {
    current: startingWeapon,
    rifleAmmo: rifleMagazine(levels),
    reloading: false,
    reloadTimer: 0,
    fireCooldown: 0,
    muzzleFlashTimer: 0,
    recoil: 0,
    recoilAngle: 0,
    recoilCameraStrength: 0,
    recoilBarrelStrength: 0,
  };
}

export function switchWeapon(state: PlayerWeaponState, weapon: WeaponId): void {
  if (state.current === weapon) return;
  state.current = weapon;
  state.fireCooldown = 0;
}

export function startReload(state: PlayerWeaponState, levels: ShopLevels, reloadTimeMult = 1): void {
  if (state.current !== 'rifle') return;
  if (state.reloading) return;
  if (state.rifleAmmo >= rifleMagazine(levels)) return;
  state.reloading = true;
  // Phase 2: assault class's passive is a flat reload-time multiplier
  // (reloadTimeMult, default 1 for every other class) — see
  // config.ts::PLAYER_CLASSES.
  state.reloadTimer = (WEAPONS.rifle.reloadTime ?? 1.5) * reloadTimeMult;
  playSfx('reload');
}

export interface FireResult {
  fired: boolean;
}

export function updatePlayerWeapon(
  state: PlayerWeaponState,
  dt: number,
  levels: ShopLevels,
  player: Entity,
  aimAngle: number,
  triggerHeld: boolean,
  ctx: WorldContext,
  classDef: PlayerClassDef,
  aimTargetX: number,
  aimTargetY: number,
): FireResult {
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.muzzleFlashTimer = Math.max(0, state.muzzleFlashTimer - dt);
  // Exponential ease-back to neutral — same curve every shot.
  state.recoil *= Math.exp(-RECOIL.decayPerSecond * dt);
  if (state.recoil < 0.001) state.recoil = 0;

  if (state.reloading) {
    state.reloadTimer -= dt;
    if (state.reloadTimer <= 0) {
      state.reloading = false;
      state.rifleAmmo = rifleMagazine(levels);
    }
    return { fired: false };
  }

  if (state.current === 'rifle' && state.rifleAmmo <= 0) {
    startReload(state, levels, classDef.reloadTimeMult);
    return { fired: false };
  }

  if (!triggerHeld || state.fireCooldown > 0) return { fired: false };

  const def = WEAPONS[state.current];

  if (def.kind === 'melee') {
    fireMelee(state, player, aimAngle, def, classDef, levels, ctx);
    return { fired: true };
  }
  if (def.kind === 'thrown') {
    fireThrown(state, player, def, aimTargetX, aimTargetY, levels, ctx);
    return { fired: true };
  }
  return fireGun(state, levels, player, aimAngle, def, ctx);
}

function fireGun(
  state: PlayerWeaponState,
  levels: ShopLevels,
  player: Entity,
  aimAngle: number,
  def: (typeof WEAPONS)['rifle'],
  ctx: WorldContext,
): FireResult {
  const damage = state.current === 'rifle' ? rifleDamage(levels) : pistolDamage(levels);
  const fireRate = state.current === 'rifle' ? def.fireRateBase : pistolFireRate(levels);
  const spread = ((Math.random() - 0.5) * def.spreadDeg * Math.PI) / 180;
  const angle = aimAngle + spread;

  const proj = createProjectile(
    player.x + Math.cos(aimAngle) * (player.radius + 6),
    player.y + Math.sin(aimAngle) * (player.radius + 6),
    angle,
    def.bulletSpeed,
    damage,
    'player',
    player.id,
    def.range,
    { piercesTrees: true, blockedByRocks: true, color: '#ffe066', radius: 4 },
  );
  ctx.spawnProjectile(proj);
  playSfx(state.current === 'rifle' ? 'rifleShot' : 'pistolShot');
  if (state.current === 'rifle') pulseHaptic('shoot'); // "very light pulse" — rifle only, per the brief

  state.fireCooldown = 1 / fireRate;
  state.muzzleFlashTimer = 0.06;
  // Deterministic recoil kick, scaled per-weapon — snaps to full strength
  // and eases back via the decay above, identically on every shot.
  state.recoil = 1;
  state.recoilAngle = aimAngle;
  state.recoilCameraStrength = def.recoilCamera;
  state.recoilBarrelStrength = def.recoilBarrel;
  if (state.current === 'rifle') {
    state.rifleAmmo--;
    if (state.rifleAmmo <= 0) startReload(state, levels);
  }
  return { fired: true };
}

// Macer's melee sweep (Phase 2): a cone of `def.meleeArcDeg` degrees out to
// `def.range` in front of the player, hitting every enemy inside it — not a
// single-target hitscan, so it reads as a proper "swing" against a cluster.
function fireMelee(
  state: PlayerWeaponState,
  player: Entity,
  aimAngle: number,
  def: (typeof WEAPONS)['mace'],
  classDef: PlayerClassDef,
  levels: ShopLevels,
  ctx: WorldContext,
): void {
  const halfArc = ((def.meleeArcDeg ?? 90) * Math.PI) / 180 / 2;
  const candidates = ctx.grid.queryRadius(player.x, player.y, def.range);
  const damage = maceDamage(levels); // Phase 4: shop-upgradeable, see economy/shop.ts
  let hitAny = false;
  for (const t of candidates) {
    if (t === player || t.dead || !t.health || t.faction === player.faction) continue;
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > def.range + t.radius) continue;
    let diff = Math.abs(Math.atan2(dy, dx) - aimAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > halfArc) continue;
    applyDamage(t, damage);
    hitAny = true;
  }
  if (hitAny) {
    // Macer's passive: a little self-heal on every connecting swing,
    // further upgradeable via the Class-tab shop item (Phase 4).
    const heal = classDef.meleeSelfHealPerHit + maceSelfHealBonus(levels);
    if (heal > 0 && player.health) {
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + heal);
    }
    playSfx('allyHit'); // reuse the existing "thwack" tone — a dedicated mace SFX is a nice-to-have, not load-bearing
  }
  state.fireCooldown = 1 / def.fireRateBase;
  state.recoil = 1;
  state.recoilAngle = aimAngle;
  state.recoilCameraStrength = def.recoilCamera;
  state.recoilBarrelStrength = def.recoilBarrel;
}

// Bomber class's grenade throw (Phase 2): reuses the exact same
// Game.fireballs/burning-ground pipeline built for the Phase 1 fire mage
// (see entities/context.ts::FireballSpawn) — a thrown AoE with a fixed
// target point is the same shape whether the thrower is an enemy or the
// player. burnDuration 0 means no ground effect is actually left behind
// (grenades explode once, no fire mage fire-and-forget zone).
function fireThrown(
  state: PlayerWeaponState,
  player: Entity,
  def: (typeof WEAPONS)['grenade'],
  aimTargetX: number,
  aimTargetY: number,
  levels: ShopLevels,
  ctx: WorldContext,
): void {
  const dx = aimTargetX - player.x;
  const dy = aimTargetY - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  const clamped = Math.min(dist, def.range);
  const targetX = player.x + (dx / dist) * clamped;
  const targetY = player.y + (dy / dist) * clamped;
  ctx.spawnFireball({
    x: player.x,
    y: player.y,
    targetX,
    targetY,
    speed: def.bulletSpeed,
    damage: grenadeDamage(levels), // Phase 4: shop-upgradeable
    impactRadius: grenadeBlastRadius(levels), // Phase 4: shop-upgradeable
    burnDuration: 0,
    burnDps: 0,
    burnRadius: 0,
    enemyFalloff: def.enemyFalloff ?? 0.2,
    ownerFaction: 'player',
    ownerId: player.id,
  });
  playSfx('fireballLaunch');
  state.fireCooldown = 1 / def.fireRateBase;
  state.recoil = 1;
  state.recoilAngle = Math.atan2(dy, dx);
  state.recoilCameraStrength = def.recoilCamera;
  state.recoilBarrelStrength = def.recoilBarrel;
}
