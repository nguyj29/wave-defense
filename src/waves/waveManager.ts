import { EARLY_CALL, WAVES, type WaveDef } from '../config.ts';

export type WavePhase = 'running' | 'intermission' | 'allWavesComplete';

/**
 * Owns wave/intermission timers and phase transitions only — it knows
 * nothing about entities or spawning. game.ts drives a SpawnDirector during
 * the 'running' phase and asks this class when the phase should change.
 */
export class WaveManager {
  waveIndex = 0; // 0-based into WAVES
  phase: WavePhase = 'running';
  timeRemaining = WAVES[0].durationSec;
  /** Coin multiplier bonus (0..0.25) earned by skipping the last intermission, applied to the wave about to start. */
  pendingEarlyCallBonus = 0;

  get currentWave(): WaveDef {
    return WAVES[this.waveIndex];
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
    if (this.phase === 'allWavesComplete') return false;
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
    if (this.phase === 'allWavesComplete') return false;
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
    if (this.waveIndex >= WAVES.length - 1) {
      this.phase = 'allWavesComplete';
      return;
    }
    this.waveIndex++;
    this.phase = 'running';
    this.timeRemaining = this.currentWave.durationSec;
  }

  reset(): void {
    this.waveIndex = 0;
    this.phase = 'running';
    this.timeRemaining = WAVES[0].durationSec;
    this.pendingEarlyCallBonus = 0;
  }
}
