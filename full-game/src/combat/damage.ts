import { PLAYER } from '../config.ts';
import type { Entity } from '../entities/types.ts';
import { playSfx, type SfxName } from '../audio/sfx.ts';
import { pulseHaptic } from '../audio/haptics.ts';

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
  } else {
    // Bomber fuse lights on the first hit it SURVIVES (see
    // maybeIgniteBomberFuse) — a one-shot kill on an unlit bomber never
    // detonates at all, matching "killing it before the fuse expires
    // prevents detonation entirely."
    maybeIgniteBomberFuse(target);
  }
  playDamageSfx(target);
}

/**
 * Lighter damage path for continuous/ambient sources (fire mage's burning
 * ground) — same health mutation and death/bomber-fuse rules as
 * applyDamage, but skips the discrete-hit feedback (hitFlashTimer reset,
 * regen-timer reset, per-hit SFX) that would otherwise spam every single
 * fixed tick a unit stands in the fire. See combat/areaDamage.ts.
 */
export function applyDotDamage(target: Entity, amount: number): void {
  if (!target.health || target.dead) return;
  if (target.kind === 'player' && godMode) return;
  target.health.hp -= amount;
  if (target.health.hp <= 0) {
    target.health.hp = 0;
    target.dead = true;
    playDamageSfx(target);
  } else {
    maybeIgniteBomberFuse(target);
  }
}

/**
 * Bomber fuse ignition: the first hit a bomber survives lights its fuse
 * (fuseSec on its BomberAttack component, snapshotted into fuseTimer),
 * regardless of damage source — a rifle bullet, an ally's melee hit, or
 * another bomber's own detonation splash all count, which is what makes
 * bomber chain-detonation work. See combat/areaDamage.ts + game.ts's
 * per-tick fuse/detonation driver.
 */
function maybeIgniteBomberFuse(target: Entity): void {
  if (target.archetype === 'bomber' && target.bomber && !target.fuseLit) {
    target.fuseLit = true;
    target.fuseTimer = target.bomber.fuseSec;
    playSfx('bomberFuse');
  }
}

/** Faction-agnostic damage-sound (+ best-effort haptics) dispatch, driven by the target's kind/archetype. */
// Phase 5: extended per-archetype death SFX — every Phase 1-3 archetype now
// has its own death cue (see audio/sfx.ts's SFX_DEFS additions) instead of
// the 6 new archetypes all falling back to the generic grunt "thud".
const DEATH_SFX_BY_ARCHETYPE: Partial<Record<string, SfxName>> = {
  archer: 'enemyDeathArcher',
  rusher: 'enemyDeathRusher',
  bomber: 'enemyDeathBomberCorpse', // the bomber's OWN death, distinct from its detonation SFX ('bomberDetonate') — this plays even if it dies WITHOUT ever detonating
  healer: 'enemyDeathHealer',
  fireMage: 'enemyDeathFireMage',
};

function playDamageSfx(target: Entity): void {
  if (target.kind === 'enemy') {
    if (target.dead) {
      if (target.isBoss) playSfx('enemyDeathBoss');
      else playSfx(DEATH_SFX_BY_ARCHETYPE[target.archetype ?? ''] ?? 'enemyDeathGrunt');
      pulseHaptic('kill');
    } else {
      playSfx('enemyHit');
    }
  } else if (target.kind === 'player') {
    playSfx('playerHurt');
    pulseHaptic('damage');
  } else if (target.kind === 'core') {
    playSfx('coreHurt');
    pulseHaptic('coreDamage');
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
