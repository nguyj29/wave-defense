import { RECOIL, WEAPONS } from '../config.ts';
import type { WorldContext } from '../entities/context.ts';
import { createProjectile } from '../entities/factory.ts';
import type { Entity } from '../entities/types.ts';
import type { ShopLevels } from '../economy/shop.ts';
import { pistolDamage, pistolFireRate, rifleDamage, rifleMagazine } from '../economy/shop.ts';
import { playSfx } from '../audio/sfx.ts';

export type WeaponId = 'rifle' | 'pistol';

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

export function createPlayerWeaponState(levels: ShopLevels): PlayerWeaponState {
  return {
    current: 'rifle',
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

export function startReload(state: PlayerWeaponState, levels: ShopLevels): void {
  if (state.current !== 'rifle') return;
  if (state.reloading) return;
  if (state.rifleAmmo >= rifleMagazine(levels)) return;
  state.reloading = true;
  state.reloadTimer = WEAPONS.rifle.reloadTime ?? 1.5;
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
    startReload(state, levels);
    return { fired: false };
  }

  if (!triggerHeld || state.fireCooldown > 0) return { fired: false };

  const def = WEAPONS[state.current];
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
