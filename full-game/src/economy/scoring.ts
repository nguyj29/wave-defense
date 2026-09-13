import { ENEMIES, type WaveDef } from '../config.ts';

// ============================================================================
// scoring.ts — the per-wave/run grading system (folded into Phase 3, once
// waves and bosses exist to score against — see DECISIONS.md for why this
// placement was chosen over a separate phase). Pure functions only: nothing
// here touches Game/entities directly, so it's trivially unit-testable and
// headless-sandbox-friendly (a harness can call computeWaveScore/
// computeRunGrade directly with plain data, no canvas/DOM required) — the
// actual per-tick bookkeeping that produces WaveScoreInputs lives in
// game.ts, which owns the run state this module scores.
// ============================================================================

/** One wave's 1000-point score, broken into 5 components of 200 each. */
export interface WaveScoreBreakdown {
  wave: number;
  integrity: number; // core HP preserved
  tempo: number; // cleared at/under the wave's "par" duration
  survival: number; // player HP preserved
  commandEconomy: number; // allies kept alive + coins earned, vs. a par
  mastery: number; // fraction of spawned enemies actually killed (nothing leaked/timed out)
  total: number; // sum of the 5 components, 0..1000
}

export interface WaveScoreInputs {
  wave: number;
  coreHpFrac: number; // 0..1, core HP at wave end
  playerHpFrac: number; // 0..1, player HP at wave end (0 if dead)
  clearTimeSec: number; // actual wall-clock (simulated) time the wave took, spawn-start to last-kill/cutoff
  parTimeSec: number; // the wave's authored durationSec — the "par" to beat
  enemiesSpawned: number; // actual count spawned this wave (may be < the wave's budget if it ended early, e.g. debug skip)
  enemiesKilled: number; // count actually killed by wave end
  coinsEarnedThisWave: number;
  coinsParThisWave: number; // expected income for this wave's enemy roster (see game.ts::waveCoinsPar)
  alliesAliveAtEnd: number;
  alliesPar: number; // a reasonable "should have this many allies alive" reference (see game.ts)
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes one wave's score. Each component is independently clamped to
 * [0, its max] — a wave that goes badly on one axis (e.g. the core took a
 * beating) doesn't zero out the others, so the breakdown always reads as 5
 * genuinely separate signals rather than one pass/fail number wearing 5
 * hats.
 */
export function computeWaveScore(inp: WaveScoreInputs): WaveScoreBreakdown {
  const integrity = clamp01(inp.coreHpFrac) * 200;
  // Finishing at or under par is full marks; every extra multiple of par
  // over the actual time linearly loses credit down to 0 at 2x par (a wave
  // that took twice as long as designed earns no Tempo credit at all,
  // rather than an asymptotic curve that never quite reaches 0).
  const overPar = Math.max(0, inp.clearTimeSec - inp.parTimeSec) / Math.max(1, inp.parTimeSec);
  const tempo = clamp01(1 - overPar) * 200;
  const survival = clamp01(inp.playerHpFrac) * 200;
  const allyRatio = inp.alliesPar > 0 ? clamp01(inp.alliesAliveAtEnd / inp.alliesPar) : 1;
  const coinRatio = inp.coinsParThisWave > 0 ? clamp01(inp.coinsEarnedThisWave / inp.coinsParThisWave) : 1;
  const commandEconomy = allyRatio * 100 + coinRatio * 100;
  const mastery = inp.enemiesSpawned > 0 ? clamp01(inp.enemiesKilled / inp.enemiesSpawned) * 200 : 200;
  const total = integrity + tempo + survival + commandEconomy + mastery;
  return { wave: inp.wave, integrity, tempo, survival, commandEconomy, mastery, total };
}

/**
 * A wave's expected coin income, for the Command/Economy component's coin
 * ratio: sum, over every archetype the wave's budget includes, of
 * (count * that archetype's midpoint coin value), plus the boss's flat
 * value if present. This is the un-scaled generation-0 midpoint — it
 * deliberately does NOT account for the generation multiplier actually
 * applied to spawned enemies' coin drops (see config.ts::generationScale's
 * `coin` field), so a late-wave "par" is somewhat conservative relative to
 * actual generation-scaled payouts. That's a judgment call (see
 * DECISIONS.md): computing the true expected value would need this
 * function to know the wave's generation-mix roll distribution too, which
 * felt like more coupling than a rough par deserves.
 */
export function waveCoinsPar(wave: WaveDef): number {
  const mid = (id: keyof typeof ENEMIES) => (ENEMIES[id].coinsMin + ENEMIES[id].coinsMax) / 2;
  let total =
    wave.grunts * mid('grunt') +
    wave.archers * mid('archer') +
    wave.rushers * mid('rusher') +
    wave.bombers * mid('bomber') +
    wave.healers * mid('healer') +
    wave.fireMages * mid('fireMage');
  if (wave.boss > 0) total += wave.boss * mid(wave.bossArchetype);
  return total;
}

export type RunGradeLetter = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
const GRADE_ORDER: RunGradeLetter[] = ['F', 'D', 'C', 'B', 'A', 'S', 'SS']; // worst -> best

export interface RunGradeResult {
  letter: RunGradeLetter;
  weightedAveragePct: number; // 0..100, the raw numeric average before any gate
  gated: boolean; // true if a hard gate changed the letter from what the raw percentage alone would give
}

function letterForPct(pct: number): RunGradeLetter {
  if (pct >= 97) return 'SS';
  if (pct >= 90) return 'S';
  if (pct >= 80) return 'A';
  if (pct >= 65) return 'B';
  if (pct >= 45) return 'C';
  if (pct >= 25) return 'D';
  return 'F';
}

/** Downgrades `letter` to `cap` if it's currently better than `cap`; leaves it alone (or worse) otherwise. */
function capAt(letter: RunGradeLetter, cap: RunGradeLetter): RunGradeLetter {
  return GRADE_ORDER.indexOf(letter) > GRADE_ORDER.indexOf(cap) ? cap : letter;
}

/**
 * Run grade: a weighted average of every completed wave's score, weight =
 * `1 + wave/25` (a wave-20 clear counts for more than a wave-2 clear,
 * proportional to how far into the 25-wave curve it is), normalized to a
 * 0-100 percentage, then mapped to a letter with two hard gates:
 *   - A run that ended in defeat (`defeated`) can score at most a C letter
 *     grade, regardless of its numeric percentage — dying is a hard cap,
 *     not just a bad Survival component on one wave.
 *   - SS requires a "flawless" mastery record (every scored wave's Mastery
 *     component at least 199/200 — essentially zero leaked kills across the
 *     whole run) even if the raw percentage alone would qualify; failing
 *     that gate caps the letter at S instead.
 * Both gates are judgment calls (the brief specified "hard gates on
 * SS/S/defeat-caps-at-C" without pinning down the exact SS/S condition) —
 * see DECISIONS.md.
 */
export function computeRunGrade(history: WaveScoreBreakdown[], defeated: boolean): RunGradeResult {
  if (history.length === 0) return { letter: 'F', weightedAveragePct: 0, gated: false };
  let weightedSum = 0;
  let weightTotal = 0;
  for (const w of history) {
    const weight = 1 + w.wave / 25;
    weightedSum += w.total * weight;
    weightTotal += weight;
  }
  const pct = (weightedSum / weightTotal) / 10; // total is 0..1000, so /10 -> 0..100
  let letter = letterForPct(pct);
  let gated = false;

  if (defeated) {
    const beforeCap = letter;
    letter = capAt(letter, 'C');
    if (letter !== beforeCap) gated = true;
  } else if (letter === 'SS' && !history.every((w) => w.mastery >= 199)) {
    letter = 'S';
    gated = true;
  }

  return { letter, weightedAveragePct: pct, gated };
}
