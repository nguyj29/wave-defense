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
  // Reduced again for the bottom-middle-base map redesign (see DECISIONS.md):
  // lanes now keep obstacle-free roads to the base, so overall density needed
  // to drop further to still read as "open" rather than just "road + thicket".
  treeCount: 46,
  treeRadius: 18,
  rockCountMin: 16, // still enough cover near lanes for archer-kiting
  rockRadius: [24, 40] as [number, number],
  rockVertsRange: [6, 9] as [number, number],
  // Forest is placed in a handful of irregular patches off to the sides of
  // the lanes rather than uniformly across the map (see DECISIONS.md) —
  // patchCount/patchRadius control how clumped it reads.
  patchCount: 6,
  patchRadius: 420,
  // Fraction of obstacles placed via pure uniform scatter (not clumped into
  // a patch) so the map doesn't look unnaturally polka-dotted.
  scatterFraction: 0.15,
};

export const CORE = {
  // Bottom-middle of the 3200x3200 world (see DECISIONS.md for the map
  // redesign rationale) — same edge margin (220) the corner base used.
  x: WORLD.width / 2,
  y: WORLD.height - 220,
  radius: 60,
  maxHp: 1000,
  hpPerLevel: 150,
  color: '#3b6fe0', // strong medium blue — reads clearly against forest green
};

export const BASE = {
  // A wall "pen" around the base: one wall running east-west north of the
  // core (three gaps, one per active spawn lane) plus two side walls running
  // south from its ends down to the world edge, closing off flanking. See
  // world/map.ts for the derived geometry and DECISIONS.md for why.
  wallThickness: 24,
  gapWidth: 120,
  // The north wall sits this far "in front of" (north of) the core.
  wallSetback: 260,
  // The north wall spans CORE.x -/+ wallHalfSpan; side walls drop straight
  // down from its two ends to the world's south edge.
  wallHalfSpan: 750,
  // Gap centers, as offsets from CORE.x — one per active spawn point
  // (top-left / top-middle / top-right), in that order.
  gapOffsets: [-400, 0, 400] as number[],
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
  marker: { x: CORE.x + 160, y: CORE.y - 70, radius: 20 },
  interactRadius: 100,
};

// Concrete lane corridors connecting each active spawn point to the base's
// nearest wall gap: kept obstacle-free and drawn as a distinct road strip.
// See world/map.ts (LANES) and DECISIONS.md.
export const LANES = {
  width: 180,
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
  // Recoil "game feel" (see RECOIL below for the shared decay rate): world
  // units of camera kick and of visual barrel pullback per shot, scaled by
  // weapon so the rifle kicks noticeably more than the pistol.
  recoilCamera: number;
  recoilBarrel: number;
}

export const WEAPONS: Record<'rifle' | 'pistol', WeaponDef> = {
  rifle: {
    key: '1',
    name: 'Assault Rifle',
    damageBase: 8,
    damagePerLevel: 2,
    fireRateBase: 10,
    fireRatePerLevel: 0,
    // Raised from 600 so the rifle comfortably outranges one full 1x-zoom
    // screen width (CAMERA.baseViewWidth = 1600) as the long-range option —
    // see DECISIONS.md.
    range: 1800,
    spreadDeg: 3,
    bulletSpeed: 900,
    magazineBase: 30,
    magazinePerLevel: 10,
    reloadTime: 1.5,
    recoilCamera: 14,
    recoilBarrel: 10,
  },
  pistol: {
    key: '2',
    name: 'Pistol',
    damageBase: 12,
    damagePerLevel: 4,
    fireRateBase: 3,
    fireRatePerLevel: 0.5,
    // Kept short relative to the rifle so it stays the clear close-range/
    // backup weapon (see DECISIONS.md).
    range: 500,
    spreadDeg: 0,
    bulletSpeed: 900,
    infiniteAmmo: true,
    recoilCamera: 6,
    recoilBarrel: 5,
  },
};

// Shared recoil decay: after a shot kicks the camera/barrel to full strength,
// it eases back to neutral at this rate (exponential decay, so the same
// every time — deterministic "game feel" polish, not screen-wide jitter).
export const RECOIL = {
  decayPerSecond: 16,
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
  // Engagement/detection range — named to match ENEMIES[x].aggroRadius so
  // the concept is consistent across factions (see entities/types.ts,
  // Entity.aggroRadius, which both factions now populate).
  aggroRadius: 700,
  // "Home" leash: when no enemy is within aggroRadius, an ally within this
  // distance of the base (CORE) idles there instead of chasing; beyond it,
  // the ally walks back toward the base instead of continuing whatever it
  // was doing. Replaces the old unbounded map-wide chase fallback — see
  // DECISIONS.md and entities/behaviors/ally.ts.
  leashRadius: 500,
  // Radius of the light idle wander around the ally's position once it's
  // home with nothing to fight, so idling allies don't look like frozen
  // statues.
  idleWanderRadius: 60,
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
  // Roughly 2.3x'd both base and max (see DECISIONS.md) — "much higher"
  // spawn density was the explicit ask, and the spatial-grid collision
  // system has headroom well past this at the ~300-entity budget.
  baseRate: 0.35, // spawns/s
  maxRate: 1.8, // spawns/s
  killRateAtMax: 1.2, // kills/s that saturates the rate
  killWindowSec: 10, // rolling window for smoothed kill rate
  rampUpSec: 3,
  rampDownSec: 8,
  aliveCap: 90,
  hysteresis: 0.05, // deadband on normalized kill rate before rate is allowed to move further
  bossBudgetFraction: 0.6, // spawn boss after 60% of budget spawned...
  bossLatestSec: 120, // ...or at 2:00 mark, whichever first
  // Clumped spawning (see DECISIONS.md): spawns discharge from one active
  // spawn point at a time in a burst of clumpSizeMin..clumpSizeMax units,
  // then that spawn point rotates and a pauseMin..pauseMax second gap opens
  // before the next clump starts accumulating. Both ranges are linearly
  // interpolated by the same normalized kill-rate pressure (0..1) that
  // drives currentRate — higher pressure means bigger clumps *and* shorter
  // pauses, so the "cycling clumps" read gets more intense exactly when the
  // adaptive rate would otherwise just spawn faster in a smooth trickle.
  clumpSizeMin: 3,
  clumpSizeMax: 6,
  pauseSecMin: 1, // pause length at max pressure (normalized target == 1)
  pauseSecMax: 3, // pause length at min pressure (normalized target == 0)
};

// ---------------------------------------------------------------------------
// Projectile flight physics — shared by every projectile (bullets & arrows),
// so a shot loses momentum smoothly at max range instead of popping out of
// existence. See combat/projectiles.ts.
// ---------------------------------------------------------------------------
export const PROJECTILE_PHYSICS = {
  // Deceleration begins this fraction of the way through maxRange (i.e. over
  // the final 20% of the shot's travel) and eases the speed down to 0 by the
  // time traveled reaches maxRange.
  decelFractionOfRange: 0.2,
  // Once "stopped", the projectile sits in place and fades out over this
  // many seconds before being removed.
  stopFadeDuration: 0.35,
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
