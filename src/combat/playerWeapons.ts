import { WEAPONS } from '../config.ts';
import type { WorldContext } from '../entities/context.ts';
import { createProjectile } from '../entities/factory.ts';
import type { Entity } from '../entities/types.ts';
import type { ShopLevels } from '../economy/shop.ts';
import { pistolDamage, pistolFireRate, rifleDamage, rifleMagazine } from '../economy/shop.ts';

export type WeaponId = 'rifle' | 'pistol';

export interface PlayerWeaponState {
  current: WeaponId;
  rifleAmmo: number;
  reloading: boolean;
  reloadTimer: number;
  fireCooldown: number; // shared, reset per weapon switch is fine since rates differ per weapon
  muzzleFlashTimer: number;
  screenShake: number;
}

export function createPlayerWeaponState(levels: ShopLevels): PlayerWeaponState {
  return {
    current: 'rifle',
    rifleAmmo: rifleMagazine(levels),
    reloading: false,
    reloadTimer: 0,
    fireCooldown: 0,
    muzzleFlashTimer: 0,
    screenShake: 0,
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
  state.screenShake = Math.max(0, state.screenShake - dt * 4);

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

  state.fireCooldown = 1 / fireRate;
  state.muzzleFlashTimer = 0.06;
  if (state.current === 'rifle') {
    state.rifleAmmo--;
    state.screenShake = 1;
    if (state.rifleAmmo <= 0) startReload(state, levels);
  }
  return { fired: true };
}
