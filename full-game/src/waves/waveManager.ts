import { EARLY_CALL, getWaveDef, WAVES, type WaveDef } from '../config.ts';

// Round 8: 'allWavesComplete' no longer terminates the run — endless mode
// continues wave 6, 7, 8... forever via the normal running/intermission
// cycle (see getWaveDef()/ENDLESS in config.ts). The union member is kept
// only as the (now theoretically unreachable) type for any lingering
// external checks; advanceToNextWave() never sets it anymore. Death
// (player/core HP 0) is the only real game-over condition now.
export type WavePhase = 'running' | 'intermission' | 'allWavesComplete';

/**
 * Owns wave/intermission timers and phase transitions only — it knows
 * nothing about entities or spawning. game.ts drives a SpawnDirector during
 * the 'running' phase and asks this class when the phase should change.
 */
export class WaveManager {
  waveIndex = 0; // 0-based; wave number is waveIndex + 1, unbounded past WAVES.length (endless mode)
  phase: WavePhase = 'running';
  timeRemaining = WAVES[0].durationSec;
  /** Coin multiplier bonus (0..0.25) earned by skipping the last intermission, applied to the wave about to start. */
  pendingEarlyCallBonus = 0;
  /** True exactly once, the tick wave 5's clear transitions the run into endless mode — game.ts uses this to show a one-time "Endless Mode" banner. */
  justEnteredEndless = false;

  get currentWave(): WaveDef {
    return getWaveDef(this.waveIndex + 1);
  }

  /**
   * Advance timers. Returns true if the phase changed this tick (caller
   * should react).
   *
   * `aliveEnemies` (round 6): while `phase === 'running'`, `timeRemaining`
   * now governs only how long SpawnDirector may keep producing new spawn
   * requests (see SpawnDirector's own `elapsed >= wave.durationSec` gate) —
   * it no longer unilaterally ends the wave. Once it hits 0 the running
   * phase instead waits for `aliveEnemies === 0` before transitioning to
   * intermission, so "kill everything before moving on" is enforced here
   * rather than by a fixed clock. Ignored during 'intermission' (that
   * countdown still ends the phase on its own, unaffected by this change).
   */
  update(dt: number, aliveEnemies = 0): boolean {
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      if (this.phase === 'running') {
        if (aliveEnemies > 0) return false; // spawning has stopped; still clearing the field
        this.phase = 'intermission';
        this.timeRemaining = this.currentWave.intermissionSec;
        return true;
      } else {
        this.advanceToNextWave(0);
        return true;
      }
    }
    return false;
  }

  /**
   * Debug-only unconditional phase advance (F4 "skip wave"), bypassing the
   * aliveEnemies gate above entirely — a dev shortcut should not itself get
   * stuck waiting for a battlefield to clear.
   */
  debugForceAdvance(): boolean {
    if (this.phase === 'running') {
      this.phase = 'intermission';
      this.timeRemaining = this.currentWave.intermissionSec;
      return true;
    }
    this.advanceToNextWave(0);
    return true;
  }

  /** Player pressed Space during intermission. Returns the coin bonus earned (0..0.25). */
  skipIntermission(): number {
    if (this.phase !== 'intermission') return 0;
    const secondsSkipped = this.timeRemaining;
    const bonus = Math.min(secondsSkipped * EARLY_CALL.bonusPerSecond, EARLY_CALL.maxBonus);
    this.advanceToNextWave(bonus);
    return bonus;
  }

  currentEarlyCallBonusPreview(): number {
    if (this.phase !== 'intermission') return 0;
    return Math.min(this.timeRemaining * EARLY_CALL.bonusPerSecond, EARLY_CALL.maxBonus);
  }

  private advanceToNextWave(bonus: number): void {
    this.pendingEarlyCallBonus = bonus;
    // Round 8: was `waveIndex >= WAVES.length - 1 -> phase = 'allWavesComplete'`
    // (ending the run). Now the run just keeps going: wave 5 clearing simply
    // advances to wave 6 like any other transition. `justEnteredEndless`
    // fires exactly once, on the transition off the last static wave (5 ->
    // 6), for a one-time celebratory banner in game.ts — it is NOT a
    // terminal state.
    if (this.waveIndex === WAVES.length - 1) this.justEnteredEndless = true;
    this.waveIndex++;
    this.phase = 'running';
    this.timeRemaining = this.currentWave.durationSec;
  }

  reset(): void {
    this.waveIndex = 0;
    this.phase = 'running';
    this.timeRemaining = WAVES[0].durationSec;
    this.pendingEarlyCallBonus = 0;
    this.justEnteredEndless = false;
  }
}
