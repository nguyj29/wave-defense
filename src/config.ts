// ============================================================================
// config.ts — every tunable number in the game lives here. No magic numbers
// in behavior/render code; if you're tempted to write a literal in a system
// file, it probably belongs in this file instead.
// ============================================================================

export const WORLD = {
  width: 3200,
  height: 3200,
  seed: 1337, // seeded RNG so obstacle layout is reproducible while tuning
  cellSize: 32, // flow-field / spatial grid cell size
};

export const OBSTACLES = {
  treeCount: 120,
  treeRadius: 18,
  rockCountMin: 40, // "roughly 40" rocks
  rockRadius: [24, 40] as [number, number],
  rockVertsRange: [6, 9] as [number, number],
};

export const CORE = {
  x: 220,
  y: WORLD.height - 220,
  radius: 60,
  maxHp: 1000,
  hpPerLevel: 150,
};

export const BASE = {
  // Two rectangular walls forming an L around the core corner, each with a
  // gap ~120 units wide that funnels units through a choke point.
  wallThickness: 24,
  gapWidth: 120,
  // Horizontal wall runs along y = wallY, from x=0 to x=wallLen, with a gap.
  wallLen: 620,
  spawnerRadius: 24,
  spawnerCount: 2,
  spawnerOutputBase: 0.1, // spawns/s == 1 per 10s
  spawnerOutputPerLevel: 0.2,
  spawnerCapacityBase: 4,
  spawnerCapacityPerLevel: 1,
  allyStrengthHpPerLevel: 5,
  allyStrengthDmgPerLevel: 2,
};

export const SHOP = {
  marker: { x: CORE.x + 140, y: CORE.y - 40, radius: 20 },
  interactRadius: 100,
};

export const PLAYER = {
  radius: 14,
  maxHp: 100,
  regenRate: 3, // hp/s
  regenDelay: 4, // seconds after last damage before regen starts
  speed: 200,
  accelTime: 0.1, // seconds to reach top speed
  iframeDuration: 0.3,
  barrelLength: 22,
};

export const CAMERA = {
  lerpPerSecond: 10,
  zoomMin: 0.5,
  zoomMax: 2.0,
  zoomDefault: 1.0,
  zoomStep: 0.001, // per wheel-delta unit, tuned in input handling
  baseViewWidth: 1600,
  baseViewHeight: 900,
};

// ---------------------------------------------------------------------------
// Weapons — fully data-driven. Adding a weapon = adding an entry here plus a
// key binding; no base-class changes required.
// ---------------------------------------------------------------------------
export interface WeaponDef {
  key: string;
  name: string;
  damageBase: number;
  damagePerLevel: number;
  fireRateBase: number; // shots/s
  fireRatePerLevel: number;
  range: number;
  spreadDeg: number;
  bulletSpeed: number;
  magazineBase?: number;
  magazinePerLevel?: number;
  reloadTime?: number;
  infiniteAmmo?: boolean;
}

export const WEAPONS: Record<'rifle' | 'pistol', WeaponDef> = {
  rifle: {
    key: '1',
    name: 'Assault Rifle',
    damageBase: 8,
    damagePerLevel: 2,
    fireRateBase: 10,
    fireRatePerLevel: 0,
    range: 600,
    spreadDeg: 3,
    bulletSpeed: 900,
    magazineBase: 30,
    magazinePerLevel: 10,
    reloadTime: 1.5,
  },
  pistol: {
    key: '2',
    name: 'Pistol',
    damageBase: 12,
    damagePerLevel: 4,
    fireRateBase: 3,
    fireRatePerLevel: 0.5,
    range: 500,
    spreadDeg: 0,
    bulletSpeed: 900,
    infiniteAmmo: true,
  },
};

export const SUMMON = {
  key: '3',
  countBase: 3,
  countPerLevel: 1,
  cooldownRateBase: 0.05, // casts/s == 20s cooldown, reciprocal rule
  cooldownRatePerLevel: 0.0075,
  maxAliveBase: 6,
  maxAlivePerLevel: 2,
  allyHpBase: 70,
  allyHpPerLevel: 15,
  allyRegenRate: 2, // always-on
  summonRadiusScatter: 40,
};

// ---------------------------------------------------------------------------
// Allies (spawner-made baseline stats; player-summoned override hp/regen)
// ---------------------------------------------------------------------------
export const ALLY = {
  radius: 12,
  speed: 200,
  hpBase: 50,
  meleeDamage: 10,
  meleeRate: 1, // hits/s
  regenRate: 1, // always-on
  seekRadius: 700,
  color: '#3fa9f5',
};

// ---------------------------------------------------------------------------
// Enemy archetypes — data-driven. New archetype = config entry + behavior key.
// ---------------------------------------------------------------------------
export interface EnemyDef {
  key: string;
  shape: 'circle' | 'triangle' | 'hexagon';
  color: string;
  radius: number;
  hp: number;
  speed: number;
  meleeDamage: number;
  meleeRate: number;
  aggroRadius: number;
  coinsMin: number;
  coinsMax: number;
  behavior: 'melee' | 'kiter' | 'melee'; // behavior key, see entities/behaviors/enemy.ts
  ranged?: {
    damage: number;
    rate: number; // shots/s
    projectileSpeed: number;
    range: number;
    kiteDistance: number;
  };
  isBoss?: boolean;
}

export const ENEMIES: Record<'grunt' | 'archer' | 'boss', EnemyDef> = {
  grunt: {
    key: 'grunt',
    shape: 'circle',
    color: '#8f00ff', // violet
    radius: 14,
    hp: 30,
    speed: 90,
    meleeDamage: 8,
    meleeRate: 1,
    aggroRadius: 150,
    coinsMin: 1,
    coinsMax: 2,
    behavior: 'melee',
  },
  archer: {
    key: 'archer',
    shape: 'triangle',
    color: '#4b0082', // indigo
    radius: 13,
    hp: 24,
    speed: 80,
    meleeDamage: 0,
    meleeRate: 0,
    aggroRadius: 450,
    coinsMin: 2,
    coinsMax: 3,
    behavior: 'kiter',
    ranged: {
      damage: 10,
      rate: 0.5, // one shot per 2s
      projectileSpeed: 500,
      range: 450,
      kiteDistance: 350,
    },
  },
  boss: {
    key: 'boss',
    shape: 'hexagon',
    color: '#8b0000', // dark red
    radius: 45,
    hp: 1200,
    speed: 70,
    meleeDamage: 25,
    meleeRate: 1,
    aggroRadius: 250,
    coinsMin: 25,
    coinsMax: 25,
    behavior: 'melee',
    isBoss: true,
  },
};

// ---------------------------------------------------------------------------
// Waves — pure data. Extending to 25 waves means editing this array only.
// ---------------------------------------------------------------------------
export interface WaveDef {
  wave: number;
  grunts: number;
  archers: number;
  boss: number;
  durationSec: number;
  intermissionSec: number;
}

export const WAVES: WaveDef[] = [
  { wave: 1, grunts: 24, archers: 0, boss: 0, durationSec: 180, intermissionSec: 60 },
  { wave: 2, grunts: 34, archers: 0, boss: 0, durationSec: 180, intermissionSec: 60 },
  { wave: 3, grunts: 30, archers: 12, boss: 0, durationSec: 180, intermissionSec: 60 },
  { wave: 4, grunts: 36, archers: 18, boss: 0, durationSec: 180, intermissionSec: 60 },
  { wave: 5, grunts: 40, archers: 24, boss: 1, durationSec: 180, intermissionSec: 60 },
];

export const SPAWN_DIRECTOR = {
  baseRate: 0.15, // spawns/s
  maxRate: 0.7, // spawns/s
  killRateAtMax: 1.2, // kills/s that saturates the rate
  killWindowSec: 10, // rolling window for smoothed kill rate
  rampUpSec: 3,
  rampDownSec: 8,
  aliveCap: 45,
  hysteresis: 0.05, // deadband on normalized kill rate before rate is allowed to move further
  bossBudgetFraction: 0.6, // spawn boss after 60% of budget spawned...
  bossLatestSec: 120, // ...or at 2:00 mark, whichever first
};

export const EARLY_CALL = {
  bonusPerSecond: 0.004, // +0.4% per second skipped
  maxBonus: 0.25, // capped at +25%
};

export const COINS = {
  pickupRadius: 40,
  magnetRadius: 40, // magnet begins at the same radius as pickup per spec
  magnetSpeed: 400,
};

// ---------------------------------------------------------------------------
// Shop pricing: price(L) = round(base * L^exponent). Reciprocal rule for all
// cooldown/interval/duration stats: store as a rate, add linearly, invert.
// ---------------------------------------------------------------------------
export interface ShopItemDef {
  id: string;
  tab: 'weapons' | 'base';
  label: string;
  base: number;
  exponent: number;
}

export const SHOP_ITEMS: ShopItemDef[] = [
  { id: 'rifleDamage', tab: 'weapons', label: 'Rifle Damage', base: 20, exponent: 0.75 },
  { id: 'rifleMagazine', tab: 'weapons', label: 'Rifle Magazine', base: 18, exponent: 0.75 },
  { id: 'pistolDamage', tab: 'weapons', label: 'Pistol Damage', base: 16, exponent: 0.75 },
  { id: 'pistolFireRate', tab: 'weapons', label: 'Pistol Fire Rate', base: 22, exponent: 0.75 },
  { id: 'summonCount', tab: 'weapons', label: 'Summon Count', base: 30, exponent: 0.75 },
  { id: 'summonRecharge', tab: 'weapons', label: 'Summon Recharge', base: 24, exponent: 0.75 },
  { id: 'summonCap', tab: 'weapons', label: 'Summon Cap', base: 26, exponent: 0.75 },
  { id: 'summonHp', tab: 'weapons', label: 'Summoned Ally HP', base: 18, exponent: 0.75 },
  { id: 'coreHp', tab: 'base', label: 'Core HP', base: 25, exponent: 0.75 },
  { id: 'spawnerOutput', tab: 'base', label: 'Spawner Output', base: 24, exponent: 0.75 },
  { id: 'spawnerCapacity', tab: 'base', label: 'Spawner Capacity', base: 22, exponent: 0.75 },
  { id: 'allyStrength', tab: 'base', label: 'Ally Strength', base: 20, exponent: 0.75 },
  // Coin yield uses exponent 1.0 (not 0.75) and is purely additive per the
  // spec's payoff calibration — see DECISIONS.md for the arithmetic.
  { id: 'coinYield', tab: 'base', label: 'Coin Yield', base: 20, exponent: 1.0 },
];

export const COIN_YIELD_PER_LEVEL = 0.25; // +25% of BASE drop, additive (never compounding)

// Base-tab TODO (not built in this MVP — see DECISIONS.md):
//   - ally type unlocks
//   - wall / door HP upgrades
//   - opt-in risk-for-reward difficulty modifier (separate settable value)

export const DEBUG = {
  spawnCycleTypes: ['grunt', 'archer', 'boss'] as const,
};
