import { activeSpawnPoints, type SpawnPoint } from '../world/map.ts';
import { CORE, SPAWN_DIRECTOR, type EnemyArchetypeId, type WaveDef } from '../config.ts';

// Phase 3: a boss spawn request's `kind` is whatever `wave.bossArchetype`
// names (one of the 5 boss archetypes in config.ts::ENEMIES) — SpawnKind is
// simply every enemy archetype id.
export type SpawnKind = EnemyArchetypeId;

export interface SpawnRequest {
  kind: SpawnKind;
  x: number;
  y: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Adaptive spawn-rate director for one wave. Tracks a smoothed kill rate and
 * lets it (not raw kill events) move the spawn rate between a baseline and a
 * max, with asymmetric ramp lag and hysteresis so the rate doesn't flap.
 *
 * Spawns are discharged in clumps rather than a steady trickle: budget
 * accumulates (at `currentRate`, same as before) toward a per-clump target
 * count, all from one currently-selected spawn point; once that clump is
 * done, the spawn point rotates and a brief pause opens before the next
 * clump starts accumulating. Clump size and pause length are both driven by
 * the same normalized kill-rate pressure that drives currentRate — see
 * SPAWN_DIRECTOR.clumpSizeMin/Max and pauseSecMin/Max in config.ts.
 *
 * F7's debug readout mirrors this object's public fields directly.
 */
export class SpawnDirector {
  private wave: WaveDef;
  private killTimestamps: number[] = [];
  private smoothedKillRate = 0;
  private normalizedTarget = 0; // last accepted normalized target (post-hysteresis)
  currentRate: number;
  private spawnAccumulator = 0;
  // Difficulty scaling (round 6): uniformly scales baseRate/maxRate/aliveCap
  // for this wave's director. 1.0 on Normal reproduces prior balance exactly.
  // Post-launch: this now also composes the live tuning panel's
  // spawnRateMult (see game.ts::effectiveSpawnRateMult) — mutable via
  // setSpawnRateMult() so a panel edit takes effect immediately, no wave
  // restart needed.
  private spawnRateMult: number;
  // Post-launch tuning panel: an independent extra multiplier on the alive
  // cap only (does NOT affect base/max spawn rate) — see
  // config.ts::TuningOverride.aliveCapMult.
  private aliveCapMult = 1;

  private spawnPoints: SpawnPoint[];
  private spawnPointIndex = 0;
  private clumpTarget: number;
  private clumpSpawnedInClump = 0;
  private pauseTimer = 0;

  spawnedGrunts = 0;
  spawnedArchers = 0;
  spawnedRushers = 0;
  spawnedBombers = 0;
  spawnedHealers = 0;
  spawnedFireMages = 0;
  bossSpawned = false;
  bossWarningActive = false;
  private bossWarningTimer = 0;
  bossReadyToSpawn = false;
  private elapsed = 0;

  constructor(wave: WaveDef, spawnRateMult = 1) {
    this.wave = wave;
    this.spawnRateMult = spawnRateMult;
    this.currentRate = SPAWN_DIRECTOR.baseRate * spawnRateMult;
    this.spawnPoints = activeSpawnPoints(wave.wave);
    this.clumpTarget = SPAWN_DIRECTOR.clumpSizeMin;
  }

  /** Difficulty-scaled alive cap for this director (see spawnRateMult/aliveCapMult). */
  get effectiveAliveCap(): number {
    return Math.round(SPAWN_DIRECTOR.aliveCap * this.spawnRateMult * this.aliveCapMult);
  }

  /** Post-launch tuning panel: live-update the composed difficulty*endless*tuning spawn-rate multiplier. */
  setSpawnRateMult(mult: number): void {
    this.spawnRateMult = mult;
  }

  /** Post-launch tuning panel: live-update the alive-cap-only extra multiplier. */
  setAliveCapMult(mult: number): void {
    this.aliveCapMult = mult;
  }

  /**
   * Phase 5: this wave's current normalized kill-rate pressure (0..1,
   * post-hysteresis — the same value that drives currentRate/clump
   * size/pause length internally), exposed publicly so game.ts can wire
   * the adaptive music intensity layer to it — see
   * audio/music.ts::setMusicIntensity.
   */
  get pressureLevel(): number {
    return this.normalizedTarget;
  }

  /**
   * True once this wave's durationSec has elapsed — from here on, update()
   * refuses to produce any new non-boss-telegraph-committed spawn request.
   * The wave itself does NOT end here (see game.ts/WaveManager): it only
   * stops new enemies from appearing. See DECISIONS.md round 6.
   */
  get spawningStopped(): boolean {
    return this.elapsed >= this.wave.durationSec;
  }

  get budgetSpent(): number {
    return (
      this.spawnedGrunts +
      this.spawnedArchers +
      this.spawnedRushers +
      this.spawnedBombers +
      this.spawnedHealers +
      this.spawnedFireMages +
      (this.bossSpawned ? 1 : 0)
    );
  }
  get budgetTotal(): number {
    return this.wave.grunts + this.wave.archers + this.wave.rushers + this.wave.bombers + this.wave.healers + this.wave.fireMages + this.wave.boss;
  }
  get isBudgetExhausted(): boolean {
    return (
      this.spawnedGrunts >= this.wave.grunts &&
      this.spawnedArchers >= this.wave.archers &&
      this.spawnedRushers >= this.wave.rushers &&
      this.spawnedBombers >= this.wave.bombers &&
      this.spawnedHealers >= this.wave.healers &&
      this.spawnedFireMages >= this.wave.fireMages &&
      (this.wave.boss === 0 || this.bossSpawned)
    );
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

    const baseRate = SPAWN_DIRECTOR.baseRate * this.spawnRateMult;
    const maxRate = SPAWN_DIRECTOR.maxRate * this.spawnRateMult;
    const aliveCap = this.effectiveAliveCap;

    const normalized = Math.max(0, Math.min(1, this.smoothedKillRate / SPAWN_DIRECTOR.killRateAtMax));
    if (Math.abs(normalized - this.normalizedTarget) > SPAWN_DIRECTOR.hysteresis) {
      this.normalizedTarget = normalized;
    }
    const targetRate = baseRate + (maxRate - baseRate) * this.normalizedTarget;

    const rampSec = targetRate > this.currentRate ? SPAWN_DIRECTOR.rampUpSec : SPAWN_DIRECTOR.rampDownSec;
    const maxDelta = ((maxRate - baseRate) / rampSec) * dt;
    const diff = targetRate - this.currentRate;
    this.currentRate += Math.abs(diff) < maxDelta ? diff : Math.sign(diff) * maxDelta;

    const requests: SpawnRequest[] = [];

    // Once the wave's durationSec has elapsed, new spawns stop entirely
    // (round 6 — the timer now only governs spawning, not the wave-end
    // transition; see WaveManager/game.ts for the aliveEnemies-gated end).
    // A boss telegraph already in progress is allowed to complete/spawn
    // even past the cutoff — it was already committed to.
    const spawningAllowed = !this.spawningStopped;

    // Boss telegraph/spawn timing, independent of the clump/pause cycle.
    if (spawningAllowed && this.wave.boss > 0 && !this.bossSpawned && !this.bossWarningActive) {
      const spawnedSoFar =
        this.spawnedGrunts + this.spawnedArchers + this.spawnedRushers + this.spawnedBombers + this.spawnedHealers + this.spawnedFireMages;
      const nonBossBudget =
        this.wave.grunts + this.wave.archers + this.wave.rushers + this.wave.bombers + this.wave.healers + this.wave.fireMages;
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
      const sp = this.currentSpawnPoint();
      requests.push({ kind: this.wave.bossArchetype, x: sp.x, y: sp.y });
      this.bossSpawned = true;
      this.bossWarningActive = false;
      this.bossReadyToSpawn = false;
    }

    if (spawningAllowed && aliveCount < aliveCap) {
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
      } else {
        this.spawnAccumulator += this.currentRate * dt;
        while (this.spawnAccumulator >= 1 && aliveCount + requests.length < aliveCap) {
          const kind = this.pickNextKind();
          if (!kind) break;
          this.spawnAccumulator -= 1;
          const sp = this.currentSpawnPoint();
          requests.push({ kind, x: sp.x, y: sp.y });
          if (kind === 'grunt') this.spawnedGrunts++;
          else if (kind === 'archer') this.spawnedArchers++;
          else if (kind === 'rusher') this.spawnedRushers++;
          else if (kind === 'bomber') this.spawnedBombers++;
          else if (kind === 'healer') this.spawnedHealers++;
          else if (kind === 'fireMage') this.spawnedFireMages++;
          this.clumpSpawnedInClump++;
          if (this.clumpSpawnedInClump >= this.clumpTarget) {
            this.advanceToNextClump();
            break; // stop discharging this tick — the pause takes over
          }
        }
      }
    }

    return requests;
  }

  /** Rotates to the next spawn point and opens a brief pause before the next clump accumulates. */
  private advanceToNextClump(): void {
    this.spawnPointIndex = (this.spawnPointIndex + 1) % this.spawnPoints.length;
    this.clumpSpawnedInClump = 0;
    this.clumpTarget = Math.round(lerp(SPAWN_DIRECTOR.clumpSizeMin, SPAWN_DIRECTOR.clumpSizeMax, this.normalizedTarget));
    this.pauseTimer = lerp(SPAWN_DIRECTOR.pauseSecMax, SPAWN_DIRECTOR.pauseSecMin, this.normalizedTarget);
    // Drop any banked accumulator so the clump right after the pause doesn't
    // fire as one extra-large instant burst on top of its own clumpTarget.
    this.spawnAccumulator = 0;
  }

  /**
   * Picks the next non-boss archetype to spawn, weighted by each
   * archetype's remaining budget in this wave (so e.g. wave 9's 8 bombers
   * interleave with its ~40 grunts roughly proportionally, rather than all
   * dumping out at once). Generalizes the prototype's 2-archetype
   * grunt/archer interleave to any number of archetypes a WaveDef defines a
   * nonzero budget for — extending WaveDef with a new archetype field needs
   * no change here.
   */
  private pickNextKind(): 'grunt' | 'archer' | 'rusher' | 'bomber' | 'healer' | 'fireMage' | null {
    type NonBossKind = 'grunt' | 'archer' | 'rusher' | 'bomber' | 'healer' | 'fireMage';
    const all: { kind: NonBossKind; left: number }[] = [
      { kind: 'grunt', left: this.wave.grunts - this.spawnedGrunts },
      { kind: 'archer', left: this.wave.archers - this.spawnedArchers },
      { kind: 'rusher', left: this.wave.rushers - this.spawnedRushers },
      { kind: 'bomber', left: this.wave.bombers - this.spawnedBombers },
      { kind: 'healer', left: this.wave.healers - this.spawnedHealers },
      { kind: 'fireMage', left: this.wave.fireMages - this.spawnedFireMages },
    ];
    const remaining = all.filter((r) => r.left > 0);
    if (remaining.length === 0) return null;
    const total = remaining.reduce((sum, r) => sum + r.left, 0);
    let roll = Math.random() * total;
    for (const r of remaining) {
      if (roll < r.left) return r.kind;
      roll -= r.left;
    }
    return remaining[remaining.length - 1].kind;
  }

  /** Debug (F8): force the boss to spawn immediately, bypassing the telegraph. */
  forceSpawnBoss(): SpawnRequest | null {
    if (this.bossSpawned) return null;
    this.bossSpawned = true;
    this.bossWarningActive = false;
    this.bossReadyToSpawn = false;
    const sp = this.currentSpawnPoint();
    return { kind: this.wave.bossArchetype, x: sp.x, y: sp.y };
  }

  private currentSpawnPoint(): { x: number; y: number } {
    if (this.spawnPoints.length === 0) return { x: CORE.x, y: 0 };
    return this.spawnPoints[this.spawnPointIndex % this.spawnPoints.length];
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
      activeSpawnPointId: this.spawnPoints[this.spawnPointIndex % Math.max(1, this.spawnPoints.length)]?.id ?? '',
      clumpProgress: this.clumpSpawnedInClump,
      clumpTarget: this.clumpTarget,
      pauseTimer: Math.max(0, this.pauseTimer),
      spawningStopped: this.spawningStopped,
      effectiveAliveCap: this.effectiveAliveCap,
    };
  }
}
