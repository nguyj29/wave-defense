import { PLAYER } from '../config.ts';
import type { Entity } from '../entities/types.ts';
import { playSfx } from '../audio/sfx.ts';

// Debug-only global toggle (F5). Kept as a tiny module-level flag rather than
// threading a "debug" object through every combat call site.
export let godMode = false;
export function setGodMode(on: boolean): void {
  godMode = on;
}

// Faction-agnostic damage application: every entity with a Health component
// goes through this one path, whether the hit came from a player bullet, an
// enemy claw, or (later) a bomber's own-side AoE. Nothing here special-cases
// "enemy attacks are always hostile to the player" — a caller decides who
// may hit whom (see combat/projectiles.ts and the melee-attack loop), this
// function only mutates health and marks death.
export function applyDamage(target: Entity, amount: number): void {
  if (!target.health || target.dead) return;
  if (target.kind === 'player') {
    if (godMode) return;
    if (target.iframeTimer && target.iframeTimer > 0) return;
    target.iframeTimer = PLAYER.iframeDuration;
  }
  target.health.hp -= amount;
  target.hitFlashTimer = 0.12;
  if (target.regen) target.regen.timeSinceDamage = 0;
  if (target.health.hp <= 0) {
    target.health.hp = 0;
    target.dead = true;
  }
  playDamageSfx(target);
}

/** Faction-agnostic damage-sound dispatch, driven by the target's kind/archetype. */
function playDamageSfx(target: Entity): void {
  if (target.kind === 'enemy') {
    if (target.dead) {
      if (target.isBoss) playSfx('enemyDeathBoss');
      else if (target.archetype === 'archer') playSfx('enemyDeathArcher');
      else playSfx('enemyDeathGrunt');
    } else {
      playSfx('enemyHit');
    }
  } else if (target.kind === 'player') {
    playSfx('playerHurt');
  } else if (target.kind === 'core') {
    playSfx('coreHurt');
  }
}

export function updateRegen(e: Entity, dt: number): void {
  if (!e.regen || !e.health || e.dead) return;
  e.regen.timeSinceDamage += dt;
  if (e.regen.alwaysOn || e.regen.timeSinceDamage >= e.regen.delay) {
    e.health.hp = Math.min(e.health.maxHp, e.health.hp + e.regen.rate * dt);
  }
}

/** Two circles overlap. */
export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}
