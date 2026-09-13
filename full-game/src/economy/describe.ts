import type { ShopItemId, ShopLevels } from './shop.ts';
import * as shop from './shop.ts';

function withLevel(levels: ShopLevels, id: ShopItemId, level: number): ShopLevels {
  return { ...levels, [id]: level };
}

/** Human-readable "current -> next" value strings for the shop row UI. */
export function describeItem(id: ShopItemId, levels: ShopLevels): { current: string; next: string } {
  const cur = levels[id];
  const nxt = withLevel(levels, id, cur + 1);
  switch (id) {
    case 'rifleDamage':
      return { current: `${shop.rifleDamage(levels).toFixed(0)} dmg`, next: `${shop.rifleDamage(nxt).toFixed(0)} dmg` };
    case 'rifleMagazine':
      return { current: `${shop.rifleMagazine(levels)} rounds`, next: `${shop.rifleMagazine(nxt)} rounds` };
    case 'pistolDamage':
      return { current: `${shop.pistolDamage(levels).toFixed(0)} dmg`, next: `${shop.pistolDamage(nxt).toFixed(0)} dmg` };
    case 'pistolFireRate':
      return { current: `${shop.pistolFireRate(levels).toFixed(2)}/s`, next: `${shop.pistolFireRate(nxt).toFixed(2)}/s` };
    case 'summonCount':
      return { current: `${shop.summonCount(levels)} allies`, next: `${shop.summonCount(nxt)} allies` };
    case 'summonRecharge':
      return { current: `${shop.summonCooldownSeconds(levels).toFixed(1)}s cd`, next: `${shop.summonCooldownSeconds(nxt).toFixed(1)}s cd` };
    case 'summonCap':
      return { current: `${shop.summonMaxAlive(levels)} max`, next: `${shop.summonMaxAlive(nxt)} max` };
    case 'summonHp':
      return { current: `${shop.summonAllyHp(levels).toFixed(0)} hp`, next: `${shop.summonAllyHp(nxt).toFixed(0)} hp` };
    case 'coreHp':
      return { current: `${shop.coreMaxHp(levels).toFixed(0)} hp`, next: `${shop.coreMaxHp(nxt).toFixed(0)} hp` };
    case 'spawnerOutput':
      return { current: `${shop.spawnerIntervalSeconds(levels).toFixed(1)}s/spawn`, next: `${shop.spawnerIntervalSeconds(nxt).toFixed(1)}s/spawn` };
    case 'spawnerCapacity':
      return { current: `${shop.spawnerCapacity(levels)} allies`, next: `${shop.spawnerCapacity(nxt)} allies` };
    case 'allyStrength':
      return {
        current: `+${shop.allyStrengthBonusHp(levels).toFixed(0)}hp/+${shop.allyStrengthBonusDamage(levels).toFixed(0)}dmg`,
        next: `+${shop.allyStrengthBonusHp(nxt).toFixed(0)}hp/+${shop.allyStrengthBonusDamage(nxt).toFixed(0)}dmg`,
      };
    case 'gemChance':
      return {
        current: `${Math.round(shop.effectiveGemChance(levels, false) * 100)}% gem`,
        next: `${Math.round(shop.effectiveGemChance(nxt, false) * 100)}% gem`,
      };
    // Phase 4 additions ----------------------------------------------------
    case 'unlockArcherAlly':
      return shop.isAllyTypeUnlocked(levels, 'archer') ? { current: 'Unlocked', next: 'Unlocked' } : { current: 'Locked', next: 'Unlocked' };
    case 'unlockGuardianAlly':
      return shop.isAllyTypeUnlocked(levels, 'guardian') ? { current: 'Unlocked', next: 'Unlocked' } : { current: 'Locked', next: 'Unlocked' };
    case 'doorHp':
      return { current: `${shop.doorMaxHp(levels).toFixed(0)} hp`, next: `${shop.doorMaxHp(nxt).toFixed(0)} hp` };
    case 'maceDamage':
      return { current: `${shop.maceDamage(levels).toFixed(0)} dmg`, next: `${shop.maceDamage(nxt).toFixed(0)} dmg` };
    case 'maceSelfHeal':
      return { current: `+${shop.maceSelfHealBonus(levels).toFixed(1)}hp/hit`, next: `+${shop.maceSelfHealBonus(nxt).toFixed(1)}hp/hit` };
    case 'grenadeDamage':
      return { current: `${shop.grenadeDamage(levels).toFixed(0)} dmg`, next: `${shop.grenadeDamage(nxt).toFixed(0)} dmg` };
    case 'grenadeBlastRadius':
      return { current: `${shop.grenadeBlastRadius(levels).toFixed(0)}u`, next: `${shop.grenadeBlastRadius(nxt).toFixed(0)}u` };
  }
}
