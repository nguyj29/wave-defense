import { GEM, SHOP_ITEMS, WAVES } from '../config.ts';
import { priceForLevel, waveDurationScaleFactor } from './shop.ts';

// Dev-mode readout: for each shop item, cumulative coins spent vs total
// "power" gained across levels 1-30, and the fitted exponent x in P ∝ C^x
// (target band 0.5-1.0 per the design brief). Power is modeled as growing
// linearly with level (true for every stat here since each level adds a
// fixed amount) — the constant of proportionality doesn't affect the fitted
// exponent, only the absolute power numbers, which we don't need.
export interface ItemCurveRow {
  id: string;
  cumulativeCost30: number;
  fittedExponent: number;
}

function fitExponent(costs: number[], powers: number[]): number {
  // Least-squares fit of log(power) = x*log(cost) + b.
  const n = costs.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.log(costs[i]);
    const y = Math.log(powers[i]);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) return NaN;
  return (n * sumXY - sumX * sumY) / denom;
}

export function computePriceCurveReadout(maxLevel = 30): ItemCurveRow[] {
  const rows: ItemCurveRow[] = [];
  for (const item of SHOP_ITEMS) {
    const costs: number[] = [];
    const powers: number[] = [];
    let cumulative = 0;
    for (let level = 1; level <= maxLevel; level++) {
      cumulative += priceForLevel(item, level);
      costs.push(cumulative);
      powers.push(level); // linear power unit
    }
    rows.push({ id: item.id, cumulativeCost30: cumulative, fittedExponent: fitExponent(costs, powers) });
  }
  return rows;
}

// Gem-chance payoff verification: simulates the ~70%-budget expected drop
// schedule from the original spec (25/36/52/69/109 non-gem-drop-eligible
// kills' worth of coin income, reused here as a rough kills-per-wave proxy)
// and tracks when the cumulative expected gem income from a purchased level
// pays back its cost. Gems are a flat GEM.coinValue each, at
// GEM.chancePerLevel additional probability per level, so expected bonus
// coins per wave = kills * chancePerLevel * coinValue.
const EXPECTED_KILLS_PER_WAVE = [25, 36, 52, 69, 109];

export interface PayoffRow {
  level: number;
  cost: number;
  boughtAfterWave: number;
  cumulativeBonusByWave: number[]; // expected bonus coins accumulated by end of each wave
  payoffWaveEstimate: string;
}

export function computeGemChancePayoff(): PayoffRow[] {
  const item = SHOP_ITEMS.find((i) => i.id === 'gemChance')!;
  const rows: PayoffRow[] = [];
  for (const level of [1, 2]) {
    const cost = priceForLevel(item, level);
    const boughtAfterWave = level; // level 1 bought after wave 1, level 2 after wave 2
    const cumulative: number[] = [];
    let running = 0;
    let payoffWave = -1;
    let payoffFraction = 0;
    for (let w = 0; w < WAVES.length; w++) {
      const waveNum = w + 1;
      const bonusThisWave = waveNum > boughtAfterWave ? EXPECTED_KILLS_PER_WAVE[w] * GEM.chancePerLevel * GEM.coinValue : 0;
      const before = running;
      running += bonusThisWave;
      cumulative.push(running);
      if (payoffWave === -1 && before < cost && running >= cost && bonusThisWave > 0) {
        payoffWave = waveNum;
        payoffFraction = (cost - before) / bonusThisWave;
      }
    }
    rows.push({
      level,
      cost,
      boughtAfterWave,
      cumulativeBonusByWave: cumulative,
      payoffWaveEstimate:
        payoffWave === -1
          ? 'does not pay off within 5 waves'
          : `wave ${payoffWave} (~${Math.round(payoffFraction * 100)}% through)`,
    });
  }
  return rows;
}

export function printDevReadout(): void {
  console.log(`=== Shop price-curve readout (levels 1-30) — waveDurationScaleFactor = ${waveDurationScaleFactor().toFixed(3)} ===`);
  console.table(
    computePriceCurveReadout().map((r) => ({
      item: r.id,
      cumulativeCostL30: r.cumulativeCost30,
      fittedExponentX: r.fittedExponent.toFixed(3),
    })),
  );
  console.log('=== Gem-chance payoff verification (prices reflect current waveDurationScaleFactor) ===');
  console.table(
    computeGemChancePayoff().map((r) => ({
      level: r.level,
      cost: r.cost,
      boughtAfterWave: r.boughtAfterWave,
      cumulativeBonusByWave: r.cumulativeBonusByWave.map((n) => n.toFixed(1)).join(' / '),
      payoff: r.payoffWaveEstimate,
    })),
  );
}
