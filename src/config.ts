// ============================================================================
// config.ts — every tunable number in the game lives here. No magic numbers
// in behavior/render code; if you're tempted to write a literal in a system
// file, it probably belongs in this file instead.
// ============================================================================

export const WORLD = {
  // Bumped from 3200x3200 for the eventual 25-wave game (see DECISIONS.md
  // round 5 for the sizing/perf tradeoff) — a clear ~2.25x area increase.
  width: 4800,
  height: 4800,
  seed: 1337, // seeded RNG so obstacle layout is reproducible while tuning
  // Bumped from 32 alongside the world-size increase so the Dijkstra
  // flow-field recompute's cell count (and thus its one-time cost at level
  // load) doesn't grow by the full area ratio — see DECISIONS.md for
  // measured recompute times before/after.
  cellSize: 40,
};

export const OBSTACLES = {
  // Round 7: recalculated for the grid-of-roads map (see DECISIONS.md). The
  // road grid (ROAD_GRID) removes noticeably less open area than the old
  // maze lane system did (a thin lattice of 160-wide strips vs. several
  // wide 180-wide corridors sprawling diagonally-ish across the map), so
  // there's more usable block-interior area than before — counts bumped up
  // from 104/36 accordingly so the green blocks still read as "scattered
  // forest" rather than emptier than the old map.
  treeCount: 150,
  treeRadius: 18,
  rockCountMin: 54, // still enough cover in the blocks for archer-kiting
  rockRadius: [24, 40] as [number, number],
  rockVertsRange: [6, 9] as [number, number],
  // Forest is placed in patches sized to fit comfortably inside one grid
  // block's interior (block interior is roughly
  // ROAD_GRID.spacing - ROAD_GRID.width = 640 units across) rather than the
  // old wide multi-block patches, so a patch doesn't spill across a road
  // into the next block (obstacles landing on the road are simply rejected
  // by validPlacement, but an oversized patch would waste a lot of
  // placement attempts on rejected candidates). patchCount raised so patches
  // are spread across more of the 36 blocks.
  patchCount: 26,
  patchRadius: 260,
  // Fraction of obstacles placed via pure uniform scatter (not clumped into
  // a patch) — raised slightly from 0.15 since the grid's many separate
  // block interiors already provide natural visual separation, so a bit
  // more scatter still reads as "forest," not polka-dotted.
  scatterFraction: 0.2,
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
  // Round 9: the core can be knocked to 0 HP twice and refill (with a brief
  // banner) before the 3rd loss is a real game over — see DECISIONS.md and
  // game.ts's coreLives handling.
  lives: 3,
};

export const BASE = {
  // A wall "pen" around the base: one wall running east-west north of the
  // core (three gaps, one per active spawn lane) plus two side walls running
  // south from its ends down to the world edge, closing off flanking. See
  // world/map.ts for the derived geometry and DECISIONS.md for why.
  wallThickness: 24,
  gapWidth: 120,
  // The north wall sits this far "in front of" (north of) the core. Scaled
  // 1.5x alongside the world-size increase (see DECISIONS.md round 5).
  wallSetback: 390,
  // The north wall spans CORE.x -/+ wallHalfSpan; side walls drop straight
  // down from its two ends to the world's south edge. Scaled 1.5x.
  wallHalfSpan: 1125,
  // Gap centers, as offsets from CORE.x — one per active spawn point
  // (top-left / top-middle / top-right), in that order. Scaled 1.5x.
  gapOffsets: [-600, 0, 600] as number[],
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

// Round 7: the maze-style per-spawn-point lane system (LANE_SEGMENTS /
// LANE_MAZE / buildLanePath) is REPLACED entirely by a uniform, map-wide
// grid of roads — evenly spaced horizontal/vertical concrete strips, like
// city blocks, with forest filling each block's interior. See world/map.ts
// (ROAD_LINES) and DECISIONS.md round 7 for the spacing/width rationale.
//
// spacing=800 on the 4800x4800 world places grid lines at 800/1600/2400/
// 3200/4000 in both axes — 5 lines each way, 36 blocks total — and, not by
// coincidence, 2400 is both a grid line AND CORE.x (WORLD.width/2), so the
// base's spawn lane naturally lines up with the road grid with no special-
// casing. width=160 (kept close to the old LANES.width=180 "concrete strip"
// footprint, trimmed slightly since there are now many more road strips
// crossing the whole map rather than a few point-to-point corridors).
export const ROAD_GRID = {
  spacing: 800,
  width: 160,
};

export const PLAYER = {
  // Round 7: bumped from 14 — the player and archer were both reading small
  // next to grunt (14) and boss (45); see DECISIONS.md for the exact
  // before/after numbers and why nothing else needed a code change (every
  // consumer — collision, barrel-line length, muzzle offsets — already
  // reads `e.radius`/`PLAYER.radius` live rather than hardcoding 14).
  radius: 20,
  maxHp: 100,
  regenRate: 3, // hp/s
  regenDelay: 4, // seconds after last damage before regen starts
  speed: 200,
  accelTime: 0.1, // seconds to reach top speed
  iframeDuration: 0.3,
  barrelLength: 22,
  // Round 9: player death no longer ends the run — see DECISIONS.md and
  // game.ts's playerRespawnTimer handling.
  respawnDelaySec: 10,
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
    // Reduced to ~1/3 of the original 14/10 (see DECISIONS.md round 5): the
    // rifle's rapid fire rate (10 shots/s) compounds recoil far faster than
    // the pistol's, so it gets the larger reduction of the two to keep
    // sustained fire from feeling like uncontrollable screen-shake.
    recoilCamera: 4.7,
    recoilBarrel: 3.3,
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
    // Reduced to 1/2 of the original 6/5 (see DECISIONS.md round 5): the
    // pistol fires single, slower shots (3/s base), so compounding is much
    // less of an issue than the rifle's — a milder cut keeps its kick still
    // felt without needing the rifle's steeper reduction.
    recoilCamera: 3,
    recoilBarrel: 2.5,
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
  // Idle behavior (no enemy in range): biased Brownian motion instead of a
  // hard leash-radius beeline/idle split — see DECISIONS.md round 5 and
  // entities/behaviors/ally.ts. Each tick the idle velocity gets a small
  // random nudge, is clamped to idleMaxSpeed, and has a small constant
  // homeward bias added so allies net-drift toward CORE over time without
  // ever computing a direct "walk to base" vector.
  idleMaxSpeed: 70, // clamp on the wander velocity's magnitude, units/s
  idleRandomAccel: 260, // units/s^2 of random-direction accel applied to idle velocity each tick
  idleHomeBiasAccel: 14, // units/s^2 of constant accel toward CORE while inside idleSoftBoundRadius
  // Soft outer bound: beyond this distance from CORE, the homeward bias
  // strength scales up (see idleHomeBiasBoostPerUnit) instead of snapping to
  // a hard "return to base" mode, so an ally that has wandered far still
  // reads as biased-wandering-home rather than beelining.
  idleSoftBoundRadius: 900,
  idleHomeBiasBoostPerUnit: 0.05, // extra bias-accel multiplier per unit of distance past idleSoftBoundRadius
  color: '#3fa9f5',
};

// ---------------------------------------------------------------------------
// Shared movement steering noise: a small, slowly-drifting per-entity angle
// offset applied to "move directly toward a distant target/core" vectors
// (enemy chase/toCore, ally advance) so multiple units converging on the
// same point fan out a little instead of forming a single-file line. See
// entities/movement.ts::applySteeringNoise and DECISIONS.md round 5.
// ---------------------------------------------------------------------------
export const STEER_NOISE = {
  maxAngleDeg: 16, // clamp on the noise angle offset, degrees
  changeRatePerSecond: 0.6, // how fast the smoothed random walk on the angle can move, radians/s at full swing
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
    // Round 7: bumped from 13, alongside the player radius bump — see
    // DECISIONS.md. Same reasoning: every consumer reads e.radius live, so
    // this is a pure data change.
    radius: 19,
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

// `durationSec` is designed/calibrated at 180 (see
// WAVE_DESIGN_BASELINE_DURATION_SEC below, and DECISIONS.md) — the shop
// price curve assumes 3-minute waves' worth of coin income per wave.
//
// *** TEMPORARY TESTING VALUE ***: durationSec is currently shortened to 60
// for faster dev iteration (so a full 5-wave run doesn't take 20 minutes).
// Flip every `durationSec: 60` below back to `180` to restore the designed
// pacing — shop prices auto-scale off WAVES via
// `economy/shop.ts::waveDurationScaleFactor()`, so no other change is needed
// when you do. See DECISIONS.md for the scaling rationale.
export const WAVES: WaveDef[] = [
  { wave: 1, grunts: 24, archers: 0, boss: 0, durationSec: 60, intermissionSec: 60 },
  { wave: 2, grunts: 34, archers: 0, boss: 0, durationSec: 60, intermissionSec: 60 },
  { wave: 3, grunts: 30, archers: 12, boss: 0, durationSec: 60, intermissionSec: 60 },
  { wave: 4, grunts: 36, archers: 18, boss: 0, durationSec: 60, intermissionSec: 60 },
  { wave: 5, grunts: 40, archers: 24, boss: 1, durationSec: 60, intermissionSec: 60 },
];

// ---------------------------------------------------------------------------
// Endless mode (round 8): waves past WAVES.length (5) don't exist as static
// data — they're synthesized from wave 5's shape by `getWaveDef()` below,
// scaled by `endlessFactor()`. See DECISIONS.md for the exact formula and
// worked examples at waves 10/15/20.
// ---------------------------------------------------------------------------
export const ENDLESS = {
  // Per-wave-past-5 compounding growth rate applied to enemy HP/damage/spawn
  // rate (via endlessFactor). Picked from the middle of the requested
  // 1.08-1.15 band: noticeably harder each wave without spiking absurdly —
  // see DECISIONS.md for waves 10/15/20 worked examples at Normal and Hell.
  growthRate: 1.12,
  // Wave-6+ enemy budget (grunts/archers) grows linearly off wave 5's counts
  // so total spawned enemies keeps rough pace with the shrinking-relative
  // pressure of a flat budget against an ever-rising spawn rate, capped so a
  // very deep endless run doesn't spawn an unbounded number of entities per
  // wave. Boss count is left at wave 5's (1) — the boss's own HP/damage
  // already scale via endlessFactor, a second simultaneous boss is a
  // separate, unrequested design decision.
  budgetGrowthPerWavePastFive: 0.08,
  maxBudgetScale: 3.0,
};

/**
 * Escalating multiplier applied to enemy HP/damage/spawn-rate for endless
 * waves (waveNumber > WAVES.length): `growthRate ^ (waveNumber - 5)`, 1.0 at
 * or before wave 5. Composed multiplicatively with per-difficulty
 * enemyHpMult/enemyDmgMult/spawnRateMult (see spawnEnemyFromRequest in
 * game.ts and SpawnDirector's spawnRateMult), so Hell + a deep endless wave
 * compounds — intentional, see DECISIONS.md.
 */
export function endlessFactor(waveNumber: number): number {
  if (waveNumber <= WAVES.length) return 1.0;
  return Math.pow(ENDLESS.growthRate, waveNumber - WAVES.length);
}

/**
 * Returns the WaveDef for any 1-based wave number, including past
 * WAVES.length: for wave 6+, synthesizes a WaveDef from WAVES' final entry
 * (wave 5) with grunts/archers scaled up by a capped linear factor (boss
 * count and durationSec/intermissionSec left as wave 5's). WAVES itself
 * stays a fixed 5-element array — extending/tuning it is still a pure data
 * edit, per the existing architecture.
 */
export function getWaveDef(waveNumber: number): WaveDef {
  if (waveNumber <= WAVES.length) return WAVES[waveNumber - 1];
  const base = WAVES[WAVES.length - 1];
  const budgetScale = Math.min(
    ENDLESS.maxBudgetScale,
    1 + ENDLESS.budgetGrowthPerWavePastFive * (waveNumber - WAVES.length),
  );
  return {
    wave: waveNumber,
    grunts: Math.round(base.grunts * budgetScale),
    archers: Math.round(base.archers * budgetScale),
    boss: base.boss,
    durationSec: base.durationSec,
    intermissionSec: base.intermissionSec,
  };
}

// The wave duration the shop's price curve was originally calibrated
// against (see DECISIONS.md's coin-yield/gem-chance payoff sections). Used
// by `economy/shop.ts::waveDurationScaleFactor()` to auto-scale prices
// whenever WAVES.durationSec is changed for testing (see the comment above).
export const WAVE_DESIGN_BASELINE_DURATION_SEC = 180;

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
  magnetRadius: 40, // gems only (round 6): manual walk-up, magnet begins at the same radius as pickup
  // Raised from 400 (round 6): coins now home in on the player unconditionally,
  // from anywhere on the map (see game.ts's coin loop) — at the old speed, a
  // coin dropped far away (e.g. an ally kill on the far side of the map)
  // would take many seconds to visibly arrive, reading as sluggish rather
  // than "snappy magnet." 650 covers the map's ~4800-unit span in a much
  // more satisfying ~7s worst case while still leaving pickup feeling like a
  // deliberate glide-in rather than an instant teleport.
  magnetSpeed: 650,
};

// ---------------------------------------------------------------------------
// Gem drops: a rare, flat-value alternative to a coin drop (see DECISIONS.md
// for why the flat coinValue is NOT scaled by coinYieldMultiplier/early-call
// bonuses — gems are a separate "rare drop" mechanic, not part of the base
// economy curve). Picked up identically to coins (same magnet/pickup radius).
// ---------------------------------------------------------------------------
export const GEM = {
  dropChanceBase: 0.05, // 5% base chance any non-boss enemy drops a gem instead of a coin
  dropChanceBoss: 0.2, // 20% for bosses
  coinValue: 10, // flat coin-equivalent value on pickup
  chancePerLevel: 0.05, // +5 percentage points per Gem Chance shop level, additive on top of the base rates
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
  // Gem Chance replaced the old Coin Yield item (see DECISIONS.md) — same
  // "big commitment, pays off over several waves" design intent, so it kept
  // the steeper exponent 1.0 (not the standard 0.75) rather than the
  // standard curve, since a rising gem chance is a compounding-ish income
  // multiplier much like coin yield was.
  { id: 'gemChance', tab: 'base', label: 'Gem Chance', base: 20, exponent: 1.0 },
];

// Base-tab TODO (not built in this MVP — see DECISIONS.md):
//   - ally type unlocks
//   - wall / door HP upgrades
//   - opt-in risk-for-reward difficulty modifier (separate settable value)

export const DEBUG = {
  spawnCycleTypes: ['grunt', 'archer', 'boss'] as const,
};

// ---------------------------------------------------------------------------
// Difficulty selector (round 6): chosen on the start screen before a run,
// stored on Game and applied at reset()/onWaveTransition() time. `normal` is
// exactly 1.0 across the board so it reproduces the exact balance every prior
// round was tuned against — see DECISIONS.md for the full reasoning behind
// each tier's numbers. Colors are the exact hues the brief specified
// (green/yellow/orange/red/near-black); `textColor` is chosen per-swatch so
// the label stays legible against that particular background.
// ---------------------------------------------------------------------------
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'veryHard' | 'hell';

export interface DifficultyDef {
  label: string;
  color: string;
  textColor: string;
  enemyHpMult: number;
  enemyDmgMult: number;
  spawnRateMult: number; // scales SPAWN_DIRECTOR.baseRate/maxRate/aliveCap uniformly
  rewardMult: number; // scales coin + gem payout
  // Round 7: the wave number (1-based, into WAVES) on which archers first
  // appear for this difficulty tier. Normal (3) reproduces WAVES' own
  // baseline exactly. Harder tiers introduce archers earlier — see
  // getWaveForDifficulty() below for how this is actually applied (it pulls
  // a fraction of an early wave's existing grunt budget into archers rather
  // than adding extra enemies on top, so an earlier intro reads as "harder
  // composition" without diluting/inflating the wave's total headcount) —
  // and DECISIONS.md round 7 for the exact per-tier numbers and reasoning.
  archerIntroWave: number;
}

// Fraction of a wave's total (grunts+archers) budget that becomes archers
// when a difficulty tier introduces them earlier than WAVES' own baseline.
// Kept modest (vs. wave 3's baseline ~29% archer share) so an early-Hell
// wave 1 stays grunt-dominant rather than getting swarmed by kiting archers
// before the player has any shop upgrades — see DECISIONS.md round 7.
const DIFFICULTY_ARCHER_INTRO_SHARE = 0.25;

/**
 * Returns the actual per-wave enemy composition to spawn for a given
 * difficulty: identical to `base` (a WAVES[] entry) unless this difficulty's
 * `archerIntroWave` is earlier than `base.wave` would otherwise have
 * archers, in which case a `DIFFICULTY_ARCHER_INTRO_SHARE` fraction of that
 * wave's existing grunt+archer budget is converted to archers. Pure
 * function of (base, difficulty) — no per-difficulty conditionals live in
 * spawnDirector/behavior code, and extending WAVES to 25 entries needs no
 * change here. See DECISIONS.md round 7.
 */
export function getWaveForDifficulty(base: WaveDef, difficultyId: DifficultyId): WaveDef {
  const diff = DIFFICULTY[difficultyId];
  if (base.archers > 0 || base.wave < diff.archerIntroWave) return base;
  const total = base.grunts + base.archers;
  const archers = Math.round(total * DIFFICULTY_ARCHER_INTRO_SHARE);
  return { ...base, grunts: total - archers, archers };
}

export const DIFFICULTY: Record<DifficultyId, DifficultyDef> = {
  easy: {
    label: 'Easy',
    color: '#3fae4a',
    textColor: '#0a1a0a',
    enemyHpMult: 0.7,
    enemyDmgMult: 0.6,
    spawnRateMult: 0.75,
    rewardMult: 0.9,
    archerIntroWave: 3, // same as Normal's baseline — Easy doesn't need pushing later still
  },
  normal: {
    label: 'Normal',
    color: '#e0c341',
    textColor: '#241d02',
    enemyHpMult: 1.0,
    enemyDmgMult: 1.0,
    spawnRateMult: 1.0,
    rewardMult: 1.0,
    archerIntroWave: 3, // WAVES' own baseline — unchanged from before round 7
  },
  hard: {
    label: 'Hard',
    color: '#e07a1f',
    textColor: '#241200',
    enemyHpMult: 1.3,
    enemyDmgMult: 1.3,
    spawnRateMult: 1.2,
    rewardMult: 1.15,
    archerIntroWave: 2, // one wave earlier than Normal
  },
  veryHard: {
    label: 'Very Hard',
    color: '#c62828',
    textColor: '#ffffff',
    enemyHpMult: 1.7,
    enemyDmgMult: 1.6,
    spawnRateMult: 1.45,
    rewardMult: 1.35,
    archerIntroWave: 1, // archers from the very first wave
  },
  hell: {
    // Near-black rather than pure #000 so it still reads as "a color" (not a
    // rendering hole) even before the selection/legibility border is drawn.
    label: 'Hell',
    color: '#100d0d',
    textColor: '#e8b4b4',
    enemyHpMult: 2.5,
    enemyDmgMult: 2.2,
    spawnRateMult: 1.8,
    rewardMult: 1.6,
    archerIntroWave: 1, // archers from the very first wave, same as Very Hard
  },
};
