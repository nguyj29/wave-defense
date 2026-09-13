import { ALLY, CORE, ENEMIES, PLAYER, type EnemyArchetypeId, type EnemyDef } from '../config.ts';
import type { Entity, Faction } from './types.ts';
import { allocEntityId } from './types.ts';

function base(kind: Entity['kind'], faction: Faction, x: number, y: number): Entity {
  return {
    id: allocEntityId(),
    kind,
    faction,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 10,
    color: '#fff',
    shape: 'circle',
    dead: false,
  };
}

export function createPlayer(x: number, y: number, maxHp: number): Entity {
  const e = base('player', 'player', x, y);
  e.radius = PLAYER.radius;
  e.color = '#e0e0e0';
  e.shape = 'circle';
  e.health = { hp: maxHp, maxHp };
  e.regen = { rate: PLAYER.regenRate, alwaysOn: false, delay: PLAYER.regenDelay, timeSinceDamage: 999 };
  e.iframeTimer = 0;
  return e;
}

export interface AllySpec {
  hp: number;
  regenRate: number;
  speed: number;
  meleeDamage: number;
  meleeRate: number;
  summonedByPlayer: boolean;
  spawnerId?: number;
}

export function createAlly(x: number, y: number, spec: AllySpec): Entity {
  const e = base('ally', 'player', x, y);
  e.radius = ALLY.radius;
  e.color = ALLY.color;
  e.shape = 'triangle';
  e.health = { hp: spec.hp, maxHp: spec.hp };
  e.regen = { rate: spec.regenRate, alwaysOn: true, delay: 0, timeSinceDamage: 0 };
  e.melee = { damage: spec.meleeDamage, rate: spec.meleeRate, cooldown: 0, range: 0 };
  e.ai = { state: 'idle', targetId: null, strafeDir: 1, facingRefreshTimer: 0 };
  e.summonedByPlayer = spec.summonedByPlayer;
  e.spawnerId = spec.spawnerId;
  e.speedStat = spec.speed;
  e.aggroRadius = ALLY.aggroRadius;
  return e;
}

export function createEnemy(
  archetype: EnemyArchetypeId,
  x: number,
  y: number,
  defOverride?: Partial<EnemyDef>,
  generation?: number,
): Entity {
  const def = { ...ENEMIES[archetype], ...defOverride };
  const e = base('enemy', 'enemy', x, y);
  e.radius = def.radius;
  e.color = def.color;
  e.shape = def.shape;
  e.health = { hp: def.hp, maxHp: def.hp };
  // Enemies never get a Regen component — this is the enforcement point for
  // "no enemy ever regenerates, faction-wide." (Healer's heal-application
  // code separately excludes itself as a heal target — see
  // entities/behaviors/healer.ts — so the rule holds even for the one
  // archetype that hands out HP.)
  e.archetype = archetype;
  e.isBoss = def.isBoss ?? false;
  e.generation = generation;
  e.ai = { state: 'toCore', targetId: null, strafeDir: 1, facingRefreshTimer: 0 };
  if (def.meleeDamage > 0) {
    e.melee = { damage: def.meleeDamage, rate: def.meleeRate, cooldown: 0, range: 0 };
  }
  if (def.ranged) {
    e.ranged = {
      damage: def.ranged.damage,
      rate: def.ranged.rate,
      cooldown: 0,
      projectileSpeed: def.ranged.projectileSpeed,
      range: def.ranged.range,
      kiteDistance: def.ranged.kiteDistance,
    };
  }
  if (def.bomber) {
    e.bomber = { ...def.bomber };
  }
  if (def.healer) {
    e.healer = { ...def.healer };
  }
  if (def.fireMage) {
    e.fireMage = { ...def.fireMage, cooldown: 0 };
  }
  e.coinValue = Math.round((def.coinsMin + def.coinsMax) / 2);
  e.speedStat = def.speed;
  e.aggroRadius = def.aggroRadius;
  e.coinsMin = def.coinsMin;
  e.coinsMax = def.coinsMax;
  return e;
}

export function createProjectile(
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  ownerFaction: Faction,
  ownerId: number,
  maxRange: number,
  opts: { piercesTrees?: boolean; blockedByRocks?: boolean; color?: string; radius?: number } = {},
): Entity {
  const e = base('projectile', ownerFaction, x, y);
  e.radius = opts.radius ?? 4;
  e.color = opts.color ?? (ownerFaction === 'player' ? '#ffe066' : '#ff5555');
  e.shape = 'circle';
  e.angle = angle;
  e.vx = Math.cos(angle) * speed;
  e.vy = Math.sin(angle) * speed;
  e.projectile = {
    damage,
    ownerFaction,
    ownerId,
    speedX: e.vx,
    speedY: e.vy,
    traveled: 0,
    maxRange,
    piercesTrees: opts.piercesTrees ?? true,
    blockedByRocks: opts.blockedByRocks ?? true,
    stopped: false,
    stopTimer: 0,
  };
  return e;
}

export function createCore(x: number, y: number, radius: number, maxHp: number): Entity {
  const e = base('core', 'player', x, y);
  e.radius = radius;
  e.color = CORE.color;
  e.shape = 'hexagon';
  e.health = { hp: maxHp, maxHp };
  // No regen component — the core does not heal.
  return e;
}

export function createCoin(x: number, y: number, value: number, isGem = false): Entity {
  const e = base('coin', 'player', x, y);
  e.radius = isGem ? 7 : 6;
  e.color = isGem ? '#5fe0ff' : '#ffd700'; // cyan gem vs gold coin — distinct against the ground
  // Gems keep kind: 'coin' (same magnet/pickup code path in game.ts) but
  // render as a diamond via the isGem flag + drawGem() renderer helper.
  e.shape = 'circle';
  e.coinValue = value;
  e.isGem = isGem;
  return e;
}
