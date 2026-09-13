import { ALLY, BASE, CORE, GEM, SHOP_ITEMS, SUMMON, WAVES, WAVE_DESIGN_BASELINE_DURATION_SEC, WEAPONS, type ShopItemDef } from '../config.ts';

export type ShopItemId =
  | 'rifleDamage'
  | 'rifleMagazine'
  | 'pistolDamage'
  | 'pistolFireRate'
  | 'summonCount'
  | 'summonRecharge'
  | 'summonCap'
  | 'summonHp'
  | 'coreHp'
  | 'spawnerOutput'
  | 'spawnerCapacity'
  | 'allyStrength'
  | 'gemChance';

export type ShopLevels = Record<ShopItemId, number>;

export function createInitialShopLevels(): ShopLevels {
  return {
    rifleDamage: 0,
    rifleMagazine: 0,
    pistolDamage: 0,
    pistolFireRate: 0,
    summonCount: 0,
    summonRecharge: 0,
    summonCap: 0,
    summonHp: 0,
    coreHp: 0,
    spawnerOutput: 0,
    spawnerCapacity: 0,
    allyStrength: 0,
    gemChance: 0,
  };
}

export function getItemDef(id: ShopItemId): ShopItemDef {
  const def = SHOP_ITEMS.find((i) => i.id === id);
  if (!def) throw new Error(`Unknown shop item ${id}`);
  return def;
}

/**
 * Testing convenience (NOT part of the final calibrated economy — see
 * DECISIONS.md): the shop price curve was calibrated assuming
 * `WAVE_DESIGN_BASELINE_DURATION_SEC` (180s) waves' worth of coin income per
 * wave. If `WAVES.durationSec` is shortened for faster dev iteration, the
 * player earns proportionally less per wave than the curve assumes, so
 * prices scale down by the same ratio (straight linear ratio of *average*
 * actual duration to the baseline — waves don't currently differ in
 * duration, but averaging is robust if they ever do). Reverting
 * `durationSec` back to 180 for every wave restores factor 1.0 (unscaled,
 * original calibrated prices) automatically.
 */
export function waveDurationScaleFactor(): number {
  const avg = WAVES.reduce((sum, w) => sum + w.durationSec, 0) / WAVES.length;
  return avg / WAVE_DESIGN_BASELINE_DURATION_SEC;
}

/** price(L) = round(base * L^exponent * waveDurationScaleFactor()) — the cost of buying level L (the (L)th purchase). */
export function priceForLevel(def: ShopItemDef, level: number): number {
  return Math.round(def.base * Math.pow(level, def.exponent) * waveDurationScaleFactor());
}

/** Cost to go from the current level to the next. */
export function nextPrice(id: ShopItemId, levels: ShopLevels): number {
  return priceForLevel(getItemDef(id), levels[id] + 1);
}

// --- Derived gameplay stats -------------------------------------------------

export function rifleDamage(levels: ShopLevels): number {
  return WEAPONS.rifle.damageBase + levels.rifleDamage * WEAPONS.rifle.damagePerLevel;
}
export function rifleMagazine(levels: ShopLevels): number {
  return Math.round((WEAPONS.rifle.magazineBase ?? 30) + levels.rifleMagazine * (WEAPONS.rifle.magazinePerLevel ?? 0));
}
export function pistolDamage(levels: ShopLevels): number {
  return WEAPONS.pistol.damageBase + levels.pistolDamage * WEAPONS.pistol.damagePerLevel;
}
export function pistolFireRate(levels: ShopLevels): number {
  return WEAPONS.pistol.fireRateBase + levels.pistolFireRate * WEAPONS.pistol.fireRatePerLevel;
}
export function summonCount(levels: ShopLevels): number {
  return Math.round(SUMMON.countBase + levels.summonCount * SUMMON.countPerLevel);
}
/** Reciprocal rule: rate grows linearly, cooldown = 1/rate. */
export function summonCooldownRate(levels: ShopLevels): number {
  return SUMMON.cooldownRateBase + levels.summonRecharge * SUMMON.cooldownRatePerLevel;
}
export function summonCooldownSeconds(levels: ShopLevels): number {
  return 1 / summonCooldownRate(levels);
}
export function summonMaxAlive(levels: ShopLevels): number {
  return Math.round(SUMMON.maxAliveBase + levels.summonCap * SUMMON.maxAlivePerLevel);
}
export function summonAllyHp(levels: ShopLevels): number {
  return SUMMON.allyHpBase + levels.summonHp * SUMMON.allyHpPerLevel;
}
export function coreMaxHp(levels: ShopLevels): number {
  return CORE.maxHp + levels.coreHp * CORE.hpPerLevel;
}
export function spawnerRate(levels: ShopLevels): number {
  return BASE.spawnerOutputBase + levels.spawnerOutput * BASE.spawnerOutputPerLevel;
}
export function spawnerIntervalSeconds(levels: ShopLevels): number {
  return 1 / spawnerRate(levels);
}
export function spawnerCapacity(levels: ShopLevels): number {
  return Math.round(BASE.spawnerCapacityBase + levels.spawnerCapacity * BASE.spawnerCapacityPerLevel);
}
export function allyStrengthBonusHp(levels: ShopLevels): number {
  return levels.allyStrength * BASE.allyStrengthHpPerLevel;
}
export function allyStrengthBonusDamage(levels: ShopLevels): number {
  return levels.allyStrength * BASE.allyStrengthDmgPerLevel;
}
export function spawnerAllyHp(levels: ShopLevels): number {
  return ALLY.hpBase + allyStrengthBonusHp(levels);
}
export function spawnerAllyDamage(levels: ShopLevels): number {
  return ALLY.meleeDamage + allyStrengthBonusDamage(levels);
}
/**
 * Effective gem-drop chance for an enemy, given shop levels: the base rate
 * (5% normal / 20% boss, from GEM.dropChanceBase/dropChanceBoss) plus a flat
 * additive per-level bonus (GEM.chancePerLevel), clamped to [0, 1].
 */
export function effectiveGemChance(levels: ShopLevels, isBoss: boolean): number {
  const base = isBoss ? GEM.dropChanceBoss : GEM.dropChanceBase;
  return Math.max(0, Math.min(1, base + levels.gemChance * GEM.chancePerLevel));
}
