import { ENEMY_SPAWN_CORNERS } from '../world/map.ts';
import { SPAWN_DIRECTOR, type WaveDef } from '../config.ts';

export type SpawnKind = 'grunt' | 'archer' | 'boss';

export interface SpawnRequest {
  kind: SpawnKind;
  x: number;
  y: number;
}

/**
 * Adaptive spawn-rate director for one wave. Tracks a smoothed kill rate and
 * lets it (not raw kill events) move the spawn rate between a baseline and a
 * max, with asymmetric ramp lag and hysteresis so the rate doesn't flap.
 * F7's debug readout mirrors this object's public fields directly.
 */
export class SpawnDirector {
  private wave: WaveDef;
  private killTimestamps: number[] = [];
  private smoothedKillRate = 0;
  private normalizedTarget = 0; // last accepted normalized target (post-hysteresis)
  currentRate = SPAWN_DIRECTOR.baseRate;
  private spawnAccumulator = 0;
  private cornerIndex = 0;

  spawnedGrunts = 0;
  spawnedArchers = 0;
  bossSpawned = false;
  bossWarningActive = false;
  private bossWarningTimer = 0;
  bossReadyToSpawn = false;
  private elapsed = 0;

  constructor(wave: WaveDef) {
    this.wave = wave;
  }

  get budgetSpent(): number {
    return this.spawnedGrunts + this.spawnedArchers + (this.bossSpawned ? 1 : 0);
  }
  get budgetTotal(): number {
    return this.wave.grunts + this.wave.archers + this.wave.boss;
  }
  get isBudgetExhausted(): boolean {
    return this.spawnedGrunts >= this.wave.grunts && this.spawnedArchers >= this.wave.archers && (this.wave.boss === 0 || this.bossSpawned);
  }

  registerKill(): void {
    this.killTimestamps.push(this.elapsed);
  }

  private updateSmoothedKillRate(): void {
    const windowStart = this.elapsed - SPAWN_DIRECTOR.killWindowSec;
    while (this.killTimestamps.length > 0 && this.killTimestamps[0] < windowStart) {
      this.killTimestamps.shift();
    }
    const raw = this.killTimestamps.length / SPAWN_DIRECTOR.killWindowSec;
    // Light smoothing (EMA) on top of the rolling window itself.
    this.smoothedKillRate += (raw - this.smoothedKillRate) * 0.15;
  }

  /** Returns spawn requests to actually create this tick (0 or more). */
  update(dt: number, aliveCount: number): SpawnRequest[] {
    this.elapsed += dt;
    this.updateSmoothedKillRate();

    const normalized = Math.max(0, Math.min(1, this.smoothedKillRate / SPAWN_DIRECTOR.killRateAtMax));
    if (Math.abs(normalized - this.normalizedTarget) > SPAWN_DIRECTOR.hysteresis) {
      this.normalizedTarget = normalized;
    }
    const targetRate = SPAWN_DIRECTOR.baseRate + (SPAWN_DIRECTOR.maxRate - SPAWN_DIRECTOR.baseRate) * this.normalizedTarget;

    const rampSec = targetRate > this.currentRate ? SPAWN_DIRECTOR.rampUpSec : SPAWN_DIRECTOR.rampDownSec;
    const maxDelta = ((SPAWN_DIRECTOR.maxRate - SPAWN_DIRECTOR.baseRate) / rampSec) * dt;
    const diff = targetRate - this.currentRate;
    this.currentRate += Math.abs(diff) < maxDelta ? diff : Math.sign(diff) * maxDelta;

    const requests: SpawnRequest[] = [];

    // Boss telegraph/spawn timing, independent of the accumulator above.
    if (this.wave.boss > 0 && !this.bossSpawned && !this.bossWarningActive) {
      const spawnedSoFar = this.spawnedGrunts + this.spawnedArchers;
      const nonBossBudget = this.wave.grunts + this.wave.archers;
      const budgetTrigger = nonBossBudget > 0 && spawnedSoFar / nonBossBudget >= SPAWN_DIRECTOR.bossBudgetFraction;
      const timeTrigger = this.elapsed >= SPAWN_DIRECTOR.bossLatestSec;
      if (budgetTrigger || timeTrigger) {
        this.bossWarningActive = true;
        this.bossWarningTimer = 5;
      }
    }
    if (this.bossWarningActive && !this.bossSpawned) {
      this.bossWarningTimer -= dt;
      if (this.bossWarningTimer <= 0) {
        this.bossReadyToSpawn = true;
      }
    }
    if (this.bossReadyToSpawn && !this.bossSpawned) {
      const corner = this.nextCorner();
      requests.push({ kind: 'boss', x: corner.x, y: corner.y });
      this.bossSpawned = true;
      this.bossWarningActive = false;
      this.bossReadyToSpawn = false;
    }

    if (aliveCount < SPAWN_DIRECTOR.aliveCap) {
      this.spawnAccumulator += this.currentRate * dt;
      while (this.spawnAccumulator >= 1 && aliveCount + requests.length < SPAWN_DIRECTOR.aliveCap) {
        const kind = this.pickNextKind();
        if (!kind) break;
        this.spawnAccumulator -= 1;
        const corner = this.nextCorner();
        requests.push({ kind, x: corner.x, y: corner.y });
        if (kind === 'grunt') this.spawnedGrunts++;
        else if (kind === 'archer') this.spawnedArchers++;
      }
    }

    return requests;
  }

  private pickNextKind(): 'grunt' | 'archer' | null {
    const gruntsLeft = this.wave.grunts - this.spawnedGrunts;
    const archersLeft = this.wave.archers - this.spawnedArchers;
    if (gruntsLeft <= 0 && archersLeft <= 0) return null;
    if (gruntsLeft <= 0) return 'archer';
    if (archersLeft <= 0) return 'grunt';
    // Roughly interleave proportional to remaining budgets.
    return gruntsLeft / (gruntsLeft + archersLeft) > Math.random() ? 'grunt' : 'archer';
  }

  /** Debug (F8): force the boss to spawn immediately, bypassing the telegraph. */
  forceSpawnBoss(): SpawnRequest | null {
    if (this.bossSpawned) return null;
    this.bossSpawned = true;
    this.bossWarningActive = false;
    this.bossReadyToSpawn = false;
    const corner = this.nextCorner();
    return { kind: 'boss', x: corner.x, y: corner.y };
  }

  private nextCorner(): { x: number; y: number } {
    const c = ENEMY_SPAWN_CORNERS[this.cornerIndex % ENEMY_SPAWN_CORNERS.length];
    this.cornerIndex++;
    return c;
  }

  debugSnapshot() {
    return {
      smoothedKillRate: this.smoothedKillRate,
      currentRate: this.currentRate,
      normalizedTarget: this.normalizedTarget,
      budgetSpent: this.budgetSpent,
      budgetTotal: this.budgetTotal,
      bossWarningActive: this.bossWarningActive,
      elapsed: this.elapsed,
    };
  }
}
