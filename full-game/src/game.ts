import { Camera } from './camera.ts';
import {
  ALLY,
  COINS,
  CORE,
  DEBUG,
  DIFFICULTY,
  DOOR,
  ENEMIES,
  endlessFactor,
  GEM,
  generationScale,
  getWaveForDifficulty,
  pickSpawnGeneration,
  PLAYER,
  PLAYER_CLASSES,
  RISK_MODIFIER,
  SHOP,
  SUMMON,
  TUNING_KNOBS,
  WAVES,
  WEAPONS,
  WORLD,
  isTuningOverrideEmpty,
  type DifficultyId,
  type EnemyDef,
  type PlayerClassId,
  type TuningKnobId,
  type TuningOverride,
} from './config.ts';
import { setGodMode, updateRegen } from './combat/damage.ts';
import { applyAreaDamage, applyAreaDotDamage } from './combat/areaDamage.ts';
import {
  createPlayerWeaponState,
  startReload,
  switchWeapon,
  updatePlayerWeapon,
  type PlayerWeaponState,
  type WeaponId,
} from './combat/playerWeapons.ts';
import { updateProjectiles } from './combat/projectiles.ts';
import { tickCooldowns } from './combat/weapons.ts';
import { updateAlly } from './entities/behaviors/ally.ts';
import { updateEnemy } from './entities/behaviors/enemy.ts';
import type { FireballSpawn, WorldContext } from './entities/context.ts';
import { createAlly, createCoin, createCore, createEnemy, createPlayer } from './entities/factory.ts';
import { integrateAndResolve } from './entities/movement.ts';
import { updateSpawners, type AllySpawner } from './entities/spawnerSystem.ts';
import type { Entity } from './entities/types.ts';
import { resetEntityIdCounter } from './entities/types.ts';
import {
  coreMaxHp,
  createInitialShopLevels,
  doorMaxHp,
  effectiveGemChance,
  isMaxed,
  rifleMagazine,
  spawnerAllyDamage,
  unlockedAllyTypes,
  spawnerAllyHp,
  spawnerCapacity,
  spawnerIntervalSeconds,
  summonAllyHp,
  summonCooldownSeconds,
  summonCount,
  summonMaxAlive,
  type ShopItemId,
  type ShopLevels,
} from './economy/shop.ts';
import { printDevReadout } from './economy/devReadout.ts';
import { computeRunGrade, computeWaveScore, waveCoinsPar, type RunGradeResult, type WaveScoreBreakdown } from './economy/scoring.ts';
import { FIXED_DT, GameLoop } from './engine/loop.ts';
import { SpatialGrid } from './engine/grid.ts';
import { Input } from './input.ts';
import { drawDebugOverlay, drawSpawnReadout, type DebugData, type SpawnReadoutData } from './ui/debugOverlay.ts';
import { drawHud, type HudData } from './ui/hud.ts';
import { drawBossWarningBanner, drawMinimap } from './ui/minimap.ts';
import { ShopPanel } from './ui/shopPanel.ts';
import { TuningPanel } from './ui/tuningPanel.ts';
import { drawStartScreen, hitTestStartScreen } from './ui/startScreen.ts';
import { loadTuning, saveTuning, clearTuning } from './persistence/tuningStore.ts';
import {
  drawBomberFuse,
  drawCollisionRadii,
  drawDoors,
  drawEntity,
  drawFireball,
  drawFlowFieldDebug,
  drawGroundFire,
  drawHealerTethers,
  drawObstacles,
  drawShopMarker,
  drawSpawners,
  drawWalls,
  drawWorldBackground,
  drawWorldBounds,
} from './render/renderer.ts';
import { drawEntityDetailed, drawObstaclesDetailed, drawWallsDetailed } from './render/rendererDetailed.ts';
import { applyGenerationHue, warmHexColor } from './render/colorUtils.ts';
import { playSfx } from './audio/sfx.ts';
import { isMusicMuted, setMusicIntensity, toggleMusicMute } from './audio/music.ts';
import { FlowField, type Pathfinder } from './world/flowfield.ts';
import { DOOR_RECTS, SPAWNER_POSITIONS } from './world/map.ts';
import { generateObstacles, type Obstacle } from './world/obstacles.ts';
import { SpawnDirector, type SpawnKind } from './waves/spawnDirector.ts';
import { WaveManager } from './waves/waveManager.ts';

// Round 8: 'victory' removed — there is no run-ending win state anymore
// (endless mode continues past wave 5 forever); death is the only way a run
// ends now.
export type GamePhase = 'start' | 'playing' | 'shop' | 'gameover';

interface DebugState {
  overlay: boolean;
  collisionRadii: boolean;
  flowField: boolean;
  spawnReadout: boolean;
  godMode: boolean;
  spawnCycleIndex: number;
}

// F10 toggles between the two render styles for comparison (see
// render/renderer.ts vs render/rendererDetailed.ts, and DECISIONS.md for why
// 'detailed' is the default).
type RenderStyle = 'flat' | 'detailed';

// Full-game Phase 1: a fire mage's fireball in flight and the burning-ground
// effect it leaves behind are both tracked as lightweight parallel arrays on
// Game rather than as full ECS entities — see entities/context.ts's
// FireballSpawn doc comment for why (they don't fit the shared
// bullet-collision pipeline's "stop on first hit" assumption, since they lob
// to a point and detonate an AoE + spawn a persistent zone on arrival).
interface Fireball extends FireballSpawn {
  traveled: number;
  dead: boolean;
}
// Phase 5: a destructible door filling one base-wall gap — see
// world/map.ts::DOOR_RECTS for the fixed geometry and
// entities/movement.ts::DoorCollider for the (subset) shape movement
// blocking actually reads.
interface Door {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}
interface GroundEffect {
  x: number;
  y: number;
  radius: number;
  dps: number;
  enemyFalloff: number;
  ownerFaction: Entity['faction'];
  timer: number;
  maxTimer: number;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return current;
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera = new Camera();
  input: Input;
  loop: GameLoop;

  obstacles: Obstacle[] = [];
  obstacleGrid = new SpatialGrid<Obstacle>(96);
  unitGrid = new SpatialGrid<Entity>(64);
  pathfinder: Pathfinder = new FlowField(WORLD.cellSize);

  entities: Entity[] = [];
  player!: Entity;
  core!: Entity;
  spawners: AllySpawner[] = [];
  // Fire mage projectiles/burning-ground zones — see the Fireball/GroundEffect interfaces above.
  fireballs: Fireball[] = [];
  groundEffects: GroundEffect[] = [];
  doors: Door[] = []; // Phase 5

  shopLevels: ShopLevels = createInitialShopLevels();
  coins = 0;
  playerWeaponState!: PlayerWeaponState;
  activeSlot: 1 | 2 | 3 = 1;
  summonCooldownRemaining = 0;
  currentWaveCoinBonus = 0;

  waveManager = new WaveManager();
  // Placeholder default, immediately overwritten by reset() (called from the
  // constructor) once `difficulty` has its real field-initializer value —
  // class field initializers run top-to-bottom, so `this.difficulty` isn't
  // safely readable yet at this point.
  spawnDirector = new SpawnDirector(this.waveManager.currentWave);

  phase: GamePhase = 'start';
  gameOverInfo: { waveReached: number; coins: number } | null = null;
  shopPanel = new ShopPanel();
  // Round 6: chosen on the start screen, persists across reset() (so a
  // restart-after-death shows the same selection rather than reverting to
  // Normal — see DECISIONS.md for why restart returns to the selector
  // screen rather than instantly replaying, which lets the player change it
  // there too if they want).
  difficulty: DifficultyId = 'normal';
  // Phase 2 (full-game): player class, chosen on the start screen alongside
  // difficulty, persists across resets the same way.
  playerClass: PlayerClassId = 'assault';
  // Phase 4: opt-in risk-for-reward modifier, toggled on the start screen
  // (key T), off by default, persists across resets like difficulty/class.
  riskMode = false;

  // Post-launch: live in-game tuning panel (B to toggle, Shift+B to export —
  // see handleTuningKeys()/ui/tuningPanel.ts). tuningOverride is loaded from
  // localStorage per-difficulty in reset() and is otherwise live game state:
  // every panel edit updates it immediately (affecting the spawn director
  // and all newly-spawned enemies from that point on — see DECISIONS.md for
  // why already-spawned enemies are NOT retroactively rescaled) and is
  // persisted (debounced) via tuningSaveTimer below.
  tuningOverride: TuningOverride = {};
  tuningPanel = new TuningPanel();
  tuningPanelOpen = false;
  private tuningDirty = false;
  private tuningSaveTimer = 0;
  private static readonly TUNING_SAVE_DEBOUNCE_SEC = 0.35;
  tuningExportMessage: string | null = null;
  private tuningExportMessageTimer = 0;

  debug: DebugState = {
    overlay: false,
    collisionRadii: false,
    flowField: false,
    spawnReadout: false,
    godMode: false,
    spawnCycleIndex: 0,
  };
  renderStyle: RenderStyle = 'detailed';
  private rateHistory: number[] = [];
  private fps = 60;
  private frameTimes: number[] = [];
  private lastUpdateMs = 0;
  private lastRenderMs = 0;
  private deathHandled = new Set<number>();
  private lastMusicIntensity = 0;
  // Round 8: transient "Wave 5 Complete — Endless Mode" banner, shown once
  // when WaveManager.justEnteredEndless fires. Counts down to 0; the HUD
  // only draws it while > 0.
  endlessBannerTimer = 0;

  // Phase 3 scoring — see economy/scoring.ts for the pure-function math;
  // these are the per-run/per-wave accumulators only game.ts needs to own
  // (it's the only place with access to core/player HP, kill events, coin
  // drops, and wave timing all at once).
  scoreHistory: WaveScoreBreakdown[] = [];
  runDefeated = false;
  private waveElapsedSec = 0;
  private waveKillCount = 0;
  private waveCoinsEarned = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.input = new Input(canvas);
    this.loop = new GameLoop(
      (dt) => this.fixedUpdate(dt),
      (alpha) => this.render(alpha),
    );
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.reset();
    // reset() leaves phase at 'playing'; the very first load should show the
    // difficulty-select start screen instead (see handleStartScreenInput()).
    this.phase = 'start';
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.screenWidth = window.innerWidth;
    this.camera.screenHeight = window.innerHeight;
  }

  // -------------------------------------------------------------------
  // Reset — one call, no state leaking between runs.
  // -------------------------------------------------------------------
  reset(): void {
    resetEntityIdCounter();
    this.deathHandled.clear();

    this.obstacles = generateObstacles();
    this.obstacleGrid = new SpatialGrid<Obstacle>(96);
    this.obstacleGrid.build(this.obstacles);
    (this.pathfinder as FlowField).recompute(this.obstacles);

    this.entities = [];
    this.fireballs = [];
    this.groundEffects = [];
    this.shopLevels = createInitialShopLevels();
    // Phase 5: one door per wall gap, HP from the (Phase 4) doorHp shop
    // item — re-created here (not just HP-reset) since a purchased doorHp
    // level bought mid-run should still take effect on the run's CURRENT
    // doors too, and reset() already re-creates every other shop-scaled
    // structure (core, spawners) from scratch the same way.
    this.doors = DOOR_RECTS.map((r) => ({ ...r, hp: doorMaxHp(this.shopLevels), maxHp: doorMaxHp(this.shopLevels), alive: true }));
    this.coins = 0;
    this.currentWaveCoinBonus = 0;
    this.summonCooldownRemaining = 0;
    this.activeSlot = 1;

    // Phase 2 (full-game): class stat multipliers applied at spawn time —
    // see config.ts::PLAYER_CLASSES. speedMult is read live off PLAYER.speed
    // every tick in simulate() (see the movement block below) rather than
    // baked into a stored value, so it can never drift out of sync with a
    // shop upgrade to base speed (there isn't one today, but this is the
    // same "read from config live" pattern the rest of the file follows).
    const classDef = PLAYER_CLASSES[this.playerClass];
    this.player = createPlayer(CORE.x + 60, CORE.y - 60, Math.round(PLAYER.maxHp * classDef.hpMult));
    this.entities.push(this.player);

    this.core = createCore(CORE.x, CORE.y, CORE.radius, coreMaxHp(this.shopLevels));
    this.entities.push(this.core);

    this.spawners = SPAWNER_POSITIONS.map((pos, i) => ({ id: i, x: pos.x, y: pos.y, timer: 0 }));

    this.playerWeaponState = createPlayerWeaponState(this.shopLevels, this.classSlot1Weapon());

    // Post-launch: (re)load this difficulty's saved tuning override on every
    // run start — this is the "auto-load on difficulty selection/game
    // start" requirement (see DECISIONS.md). Any panel edits mid-run from
    // the PREVIOUS run don't leak in since this always re-reads from
    // localStorage rather than keeping the in-memory value across resets.
    this.tuningOverride = loadTuning(this.difficulty);
    this.tuningDirty = false;
    this.tuningSaveTimer = 0;
    this.tuningPanelOpen = false;
    this.tuningExportMessage = null;
    this.tuningExportMessageTimer = 0;

    this.waveManager = new WaveManager();
    this.spawnDirector = new SpawnDirector(getWaveForDifficulty(this.waveManager.currentWave, this.difficulty), this.effectiveSpawnRateMult());
    this.applyTuningToSpawnDirector();
    this.rateHistory = [];

    this.camera.snapTo(this.player.x, this.player.y);
    this.camera.zoom = 1.0;
    this.gameOverInfo = null;
    this.endlessBannerTimer = 0;
    this.scoreHistory = [];
    this.runDefeated = false;
    this.waveElapsedSec = 0;
    this.waveKillCount = 0;
    this.waveCoinsEarned = 0;
    this.debug.godMode = false;
    setGodMode(false);
    this.phase = 'playing';
  }

  start(): void {
    this.loop.start();
  }

  // -------------------------------------------------------------------
  // Fixed-timestep simulation
  // -------------------------------------------------------------------
  private fixedUpdate(dt: number): void {
    const t0 = performance.now();
    this.handleDebugKeys();
    this.handleTuningKeys();

    if (this.phase === 'start') {
      this.handleStartScreenInput();
      this.input.endTick();
      this.lastUpdateMs = performance.now() - t0;
      return;
    }

    if (this.phase === 'shop') {
      this.handleShopInput();
      this.input.endTick();
      this.lastUpdateMs = performance.now() - t0;
      return;
    }

    if (this.phase === 'playing') {
      this.simulate(dt);
      if (this.input.wasPressed('KeyE') && this.distToShopMarker() <= SHOP.interactRadius) {
        this.phase = 'shop';
        playSfx('shopOpen');
      }
    }

    if (this.phase === 'gameover' && this.input.wasPressed('KeyR')) {
      // Round 6: return to the difficulty selector rather than immediately
      // replaying, so the player can change difficulty before their next
      // run (their previous choice is still preselected — see `difficulty`).
      this.phase = 'start';
    }

    this.input.endTick();
    this.lastUpdateMs = performance.now() - t0;
  }

  private distToShopMarker(): number {
    const dx = this.player.x - SHOP.marker.x;
    const dy = this.player.y - SHOP.marker.y;
    return Math.hypot(dx, dy);
  }

  private static readonly DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'veryHard', 'hell'];

  private handleStartScreenInput(): void {
    const input = this.input;
    const order = Game.DIFFICULTY_ORDER;
    const idx = order.indexOf(this.difficulty);

    if (input.wasPressed('Digit1')) this.difficulty = 'easy';
    if (input.wasPressed('Digit2')) this.difficulty = 'normal';
    if (input.wasPressed('Digit3')) this.difficulty = 'hard';
    if (input.wasPressed('Digit4')) this.difficulty = 'veryHard';
    if (input.wasPressed('Digit5')) this.difficulty = 'hell';
    if (input.wasPressed('ArrowLeft')) this.difficulty = order[(idx - 1 + order.length) % order.length];
    if (input.wasPressed('ArrowRight')) this.difficulty = order[(idx + 1) % order.length];

    // Phase 2 (full-game): class selection, QWER (mnemonic: Q=assault first
    // letter isn't literal, just a convenient unused row of 4 keys next to
    // the 1-5 difficulty row).
    if (input.wasPressed('KeyQ')) this.playerClass = 'assault';
    if (input.wasPressed('KeyW')) this.playerClass = 'bomber';
    if (input.wasPressed('KeyE')) this.playerClass = 'macer';
    if (input.wasPressed('KeyR')) this.playerClass = 'summoner';
    if (input.wasPressed('KeyT')) this.riskMode = !this.riskMode;

    if (input.wasMousePressed()) {
      const hit = hitTestStartScreen(input.mouseX, input.mouseY, this.camera.screenWidth, this.camera.screenHeight);
      if (hit?.type === 'difficulty') this.difficulty = hit.id;
      else if (hit?.type === 'class') this.playerClass = hit.id;
      else if (hit?.type === 'start') this.reset();
    }

    if (input.wasPressed('Enter') || input.wasPressed('Space')) this.reset();
  }

  private handleShopInput(): void {
    this.shopPanel.tickPressFlash(FIXED_DT);
    if (this.input.wasPressed('KeyE') || this.input.wasPressed('Escape')) {
      this.phase = 'playing';
      return;
    }
    if (this.input.wasMousePressed()) {
      this.shopPanel.handleClick(
        this.input.mouseX,
        this.input.mouseY,
        this.camera.screenWidth,
        this.camera.screenHeight,
        this.coins,
        this.shopLevels,
        (id, cost) => this.buyItem(id, cost),
      );
    }
  }

  private buyItem(id: ShopItemId, cost: number): void {
    if (this.coins < cost) return;
    if (isMaxed(id, this.shopLevels)) return; // Phase 4: one-time unlocks (ally types) can't be bought past level 1
    this.coins -= cost;
    this.shopLevels[id]++;
    if (id === 'coreHp') {
      const newMax = coreMaxHp(this.shopLevels);
      const delta = newMax - this.core.health!.maxHp;
      this.core.health!.maxHp = newMax;
      this.core.health!.hp += delta;
    }
    if (id === 'doorHp') {
      // Phase 5: same live-bump pattern as coreHp above — otherwise a
      // doorHp purchase would only take effect on the NEXT run (reset()
      // rebuilds doors from shopLevels, which itself resets to 0 every
      // run), never the current one.
      const newMax = doorMaxHp(this.shopLevels);
      for (const d of this.doors) {
        if (!d.alive) continue;
        const delta = newMax - d.maxHp;
        d.maxHp = newMax;
        d.hp += delta;
      }
    }
    playSfx('shopPurchase');
  }

  private simulate(dt: number): void {
    const wm = this.waveManager;
    const input = this.input;

    // --- Player control -------------------------------------------------
    const classDef = PLAYER_CLASSES[this.playerClass];
    const playerSpeed = PLAYER.speed * classDef.speedMult;
    const axis = input.moveAxis();
    const targetVx = axis.x * playerSpeed;
    const targetVy = axis.y * playerSpeed;
    const accel = playerSpeed / PLAYER.accelTime;
    this.player.vx = approach(this.player.vx, targetVx, accel * dt);
    this.player.vy = approach(this.player.vy, targetVy, accel * dt);

    const mouseWorld = this.camera.screenToWorld(input.mouseX, input.mouseY);
    this.player.angle = Math.atan2(mouseWorld.y - this.player.y, mouseWorld.x - this.player.x);

    // Phase 2: slot 1 is always the class's signature weapon (rifle/
    // grenade/mace/pistol — see classSlot1Weapon()); slot 2 is the shared
    // pistol backup for every class except summoner, which has no slot 2
    // (pressing Digit2 as summoner is a harmless no-op — switchWeapon is
    // already idempotent when the target equals the current weapon).
    if (input.wasPressed('Digit1')) {
      this.activeSlot = 1;
      switchWeapon(this.playerWeaponState, this.classSlot1Weapon());
    }
    if (input.wasPressed('Digit2') && this.classSlot2Weapon()) {
      this.activeSlot = 2;
      switchWeapon(this.playerWeaponState, this.classSlot2Weapon()!);
    }
    if (input.wasPressed('Digit3')) this.activeSlot = 3;
    if (input.wasPressed('KeyR')) startReload(this.playerWeaponState, this.shopLevels, classDef.reloadTimeMult);
    if (input.wasPressed('KeyM')) toggleMusicMute();

    this.player.iframeTimer = Math.max(0, (this.player.iframeTimer ?? 0) - dt);

    // Camera zoom: F6 held repurposes wheel for debug spawn-type cycling instead.
    const wheel = input.consumeWheel();
    if (input.isDown('F6')) {
      if (wheel !== 0) {
        const dir = wheel > 0 ? 1 : -1;
        this.debug.spawnCycleIndex =
          (this.debug.spawnCycleIndex + dir + DEBUG.spawnCycleTypes.length) % DEBUG.spawnCycleTypes.length;
      }
    } else {
      this.camera.applyZoom(wheel);
    }

    // --- Build the world context used by all behaviors ------------------
    const liveUnits = this.entities.filter((e) => !e.dead && e.kind !== 'projectile' && e.kind !== 'coin');
    this.unitGrid.build(liveUnits);
    const ctx: WorldContext = {
      dt,
      entities: liveUnits,
      grid: this.unitGrid,
      obstacles: this.obstacles,
      pathfinder: this.pathfinder,
      spawnProjectile: (p) => this.entities.push(p),
      spawnFireball: (fb) => this.fireballs.push({ ...fb, traveled: 0, dead: false }),
      playerX: this.player.x,
      playerY: this.player.y,
    };

    tickCooldowns(this.entities, dt);

    // Weapon fire (rifle/pistol) or summon cast.
    this.summonCooldownRemaining = Math.max(0, this.summonCooldownRemaining - dt);
    if (this.activeSlot === 3) {
      if (input.wasMousePressed()) this.trySummon(mouseWorld.x, mouseWorld.y);
    } else {
      updatePlayerWeapon(
        this.playerWeaponState,
        dt,
        this.shopLevels,
        this.player,
        this.player.angle,
        input.mouseDown,
        ctx,
        classDef,
        mouseWorld.x,
        mouseWorld.y,
      );
    }

    // Regen (player out-of-combat, allies always-on) for every entity that has it.
    for (const e of this.entities) updateRegen(e, dt);

    // AI behaviors.
    for (const e of liveUnits) {
      if (e.kind === 'ally') updateAlly(e, ctx);
      else if (e.kind === 'enemy') updateEnemy(e, ctx, this.core);
    }

    // Projectiles.
    const projectiles = this.entities.filter((e) => e.kind === 'projectile' && !e.dead);
    updateProjectiles(projectiles, this.obstacleGrid, this.unitGrid, dt, () => {});

    // Phase 5: a live door blocks bullets/arrows the same way it blocks
    // movement — checked as a small separate pass rather than teaching the
    // shared bullet-collision pipeline (combat/projectiles.ts) about doors,
    // since doors aren't Entities (see the Door interface's doc comment).
    for (const p of projectiles) {
      if (p.dead || !p.projectile || p.projectile.stopped) continue;
      for (const d of this.doors) {
        if (!d.alive) continue;
        if (p.x >= d.x - p.radius && p.x <= d.x + d.w + p.radius && p.y >= d.y - p.radius && p.y <= d.y + d.h + p.radius) {
          this.damageDoor(d, p.projectile.damage);
          p.dead = true;
          break;
        }
      }
    }

    // Fire mage fireballs: fly to their (fixed) target point, then detonate
    // an AoE impact + spawn a burning-ground zone there (see Fireball/
    // GroundEffect and entities/context.ts::FireballSpawn).
    for (const fb of this.fireballs) {
      const dx = fb.targetX - fb.x;
      const dy = fb.targetY - fb.y;
      const d = Math.hypot(dx, dy);
      const step = fb.speed * dt;
      if (d <= step) {
        applyAreaDamage(this.entities, fb.targetX, fb.targetY, fb.impactRadius, fb.damage, fb.enemyFalloff, fb.ownerFaction, fb.ownerId);
        this.groundEffects.push({
          x: fb.targetX,
          y: fb.targetY,
          radius: fb.burnRadius,
          dps: fb.burnDps,
          enemyFalloff: fb.enemyFalloff,
          ownerFaction: fb.ownerFaction,
          timer: fb.burnDuration,
          maxTimer: fb.burnDuration,
        });
        playSfx('fireballImpact');
        fb.dead = true;
      } else {
        fb.x += (dx / d) * step;
        fb.y += (dy / d) * step;
      }
    }
    this.fireballs = this.fireballs.filter((fb) => !fb.dead);

    // Burning ground: continuous per-tick faction-aware DoT (see
    // combat/areaDamage.ts::applyAreaDotDamage — same falloff rule as bomber
    // detonation, extracted into that shared utility).
    for (const ge of this.groundEffects) {
      applyAreaDotDamage(this.entities, ge.x, ge.y, ge.radius, ge.dps, ge.enemyFalloff, ge.ownerFaction, dt);
      ge.timer -= dt;
    }
    this.groundEffects = this.groundEffects.filter((ge) => ge.timer > 0);

    // Bomber fuse/detonation: driven centrally (not in the AI behavior pass
    // above) because it must keep ticking even on a bomber that has already
    // died from unrelated damage — "once lit, it detonates regardless." Runs
    // over ALL entities (not just liveUnits) so a dead-but-still-fused
    // bomber's countdown isn't silently dropped; the cull filter at the
    // bottom of this method keeps such a bomber in `entities` until it
    // actually detonates (fuseDetonated).
    for (const e of this.entities) {
      if (e.archetype !== 'bomber' || !e.fuseLit || e.fuseDetonated || !e.bomber) continue;
      e.fuseTimer = (e.fuseTimer ?? e.bomber.fuseSec) - dt;
      if (e.fuseTimer <= 0) {
        e.fuseDetonated = true;
        e.dead = true;
        applyAreaDamage(this.entities, e.x, e.y, e.bomber.detonationRadius, e.bomber.detonationDamage, e.bomber.enemyFalloff, 'enemy', e.id);
        playSfx('bomberDetonate');
      }
    }

    // Boss special abilities (Phase 3) — same "drive it centrally, outside
    // AI behavior code" pattern as the bomber's fuse above. Only ticks for
    // live bosses (unlike the bomber fuse, no ability needs to keep running
    // after its boss has died).
    for (const e of this.entities) {
      if (!e.isBoss || e.dead || !e.bossAbilities) continue;
      this.updateBossAbilities(e, dt);
    }

    // Phase 5: doors take contact damage from any enemy touching them
    // (each contacting enemy contributes DOOR.enemyContactDps) — see
    // updateDoors(). Run before movement integration so a door that's
    // about to break this tick still blocked movement THIS tick (matches
    // how the bomber/boss special-ability ordering already works: state
    // changes land before the movement pass that reacts to them next
    // frame).
    this.updateDoors(dt, liveUnits);

    // Movement integration + collision resolution (player/ally/enemy only).
    const movers = liveUnits.filter((e) => e.kind !== 'core');
    integrateAndResolve(movers, this.obstacles, this.obstacleGrid, this.unitGrid, dt, this.doors);

    // Spawners.
    updateSpawners(
      this.spawners,
      this.entities,
      dt,
      spawnerIntervalSeconds(this.shopLevels),
      spawnerCapacity(this.shopLevels),
      spawnerAllyHp(this.shopLevels),
      spawnerAllyDamage(this.shopLevels),
      unlockedAllyTypes(this.shopLevels),
    );

    // Enemy deaths -> coins/gems + kill tracking (each entity processed exactly once).
    const rewardMult = DIFFICULTY[this.difficulty].rewardMult * (this.riskMode ? RISK_MODIFIER.rewardMult : 1);
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.dead && e.coinsMin !== undefined && !this.deathHandled.has(e.id)) {
        this.deathHandled.add(e.id);
        this.spawnDirector.registerKill();
        this.waveKillCount++; // Phase 3 scoring: Mastery component — see onWaveEnd()
        const gemChance = effectiveGemChance(this.shopLevels, !!e.isBoss);
        if (Math.random() < gemChance) {
          // Gems are a flat, rare-drop bonus — deliberately NOT scaled by
          // coinYield-style multipliers or the early-call bonus (see
          // DECISIONS.md): they're a separate mechanic from the base
          // per-kill coin curve, not part of it. Difficulty's rewardMult
          // still applies (round 6) — higher-difficulty runs pay out more
          // across the board to compensate the added risk.
          const value = Math.round(GEM.coinValue * rewardMult);
          this.entities.push(createCoin(e.x, e.y, value, true));
          this.waveCoinsEarned += value; // Phase 3 scoring: Command/Economy component
        } else {
          const base = e.coinsMin + Math.random() * ((e.coinsMax ?? e.coinsMin) - e.coinsMin);
          const value = Math.round(base * (1 + this.currentWaveCoinBonus) * rewardMult);
          this.entities.push(createCoin(e.x, e.y, value));
          this.waveCoinsEarned += value;
        }
      }
    }

    // Coin/gem magnet + pickup. Round 6: coins now unconditionally home in
    // on the player from the moment they drop, regardless of distance (no
    // more magnetRadius gate) — allies killing enemies far from the player
    // still send that coin flying across the map. Gems (c.isGem) are
    // deliberately excluded from this and keep the old manual walk-up
    // behavior (magnet only inside COINS.magnetRadius, same as pickupRadius
    // today) exactly as before.
    for (const c of this.entities) {
      if (c.kind !== 'coin' || c.dead) continue;
      const dx = this.player.x - c.x;
      const dy = this.player.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d <= COINS.pickupRadius) {
        this.coins += c.coinValue ?? 0;
        c.dead = true;
        playSfx(c.isGem ? 'gemPickup' : 'coinPickup', 0.6);
      } else if (!c.isGem || d <= COINS.magnetRadius) {
        const inv = 1 / (d || 1);
        c.x += dx * inv * COINS.magnetSpeed * dt;
        c.y += dy * inv * COINS.magnetSpeed * dt;
      }
    }

    // Timers: hit-flash decay.
    for (const e of this.entities) {
      if (e.hitFlashTimer && e.hitFlashTimer > 0) e.hitFlashTimer -= dt;
    }

    // Player / core death checks.
    if (this.player.dead || this.core.dead) {
      this.gameOverInfo = { waveReached: wm.waveIndex + 1, coins: this.coins };
      this.phase = 'gameover';
      // Phase 3 scoring: score the partial wave the run died on (best-effort
      // with whatever was tracked so far) and mark the run as defeated —
      // computeRunGrade's hard "defeat caps at C" gate reads runDefeated.
      if (wm.phase === 'running') this.onWaveEnd();
      this.runDefeated = true;
    }

    // --- Wave / spawn direction -----------------------------------------
    // Round 6: the wave timer now only governs how long SpawnDirector may
    // keep producing new spawn requests (it internally refuses once its own
    // elapsed time passes the wave's durationSec — see spawnDirector.ts).
    // The running -> intermission transition no longer happens purely
    // because the timer hit 0; WaveManager.update() below is instead gated
    // on aliveEnemies === 0 too, so a wave with stragglers left keeps
    // running (spawning stopped, existing enemies still fightable) until
    // the last one dies. The old budget-exhaustion early-timeout is gone —
    // the timer itself is the spawn cutoff now, so it's redundant.
    const aliveEnemies = this.entities.filter((e) => e.kind === 'enemy' && !e.dead).length;
    if (wm.phase === 'running') {
      // Phase 3 scoring: Tempo component's actual-clear-time input — only
      // accumulates while a wave is actively running (paused during
      // intermission automatically, since this block doesn't execute then).
      this.waveElapsedSec += dt;
      const requests = this.spawnDirector.update(dt, aliveEnemies);
      for (const req of requests) this.spawnEnemyFromRequest(req.kind, req.x, req.y);

      // Phase 5: adaptive music intensity now rides the SpawnDirector's own
      // normalized kill-rate pressure continuously (see
      // SpawnDirector.pressureLevel/audio/music.ts::setMusicIntensity),
      // rather than a plain boss-present boolean — a wave that's just
      // running hot (lots of kills, spawn rate near max) gets the intense
      // layer bleeding in too, not only an actual boss fight. An active
      // boss (or its warning telegraph) still forces full intensity
      // regardless of the moment-to-moment spawn pressure. A small deadband
      // avoids rescheduling the gain ramp every single tick.
      const bossActive = this.spawnDirector.bossWarningActive || this.entities.some((e) => e.kind === 'enemy' && e.isBoss && !e.dead);
      const targetIntensity = bossActive ? 1 : this.spawnDirector.pressureLevel;
      if (Math.abs(targetIntensity - this.lastMusicIntensity) > 0.03) {
        this.lastMusicIntensity = targetIntensity;
        setMusicIntensity(targetIntensity);
      }
    }

    if (input.wasPressed('Space') && wm.phase === 'intermission') {
      const bonus = wm.skipIntermission();
      this.onWaveTransition(bonus);
    }

    const changed = wm.update(dt, aliveEnemies);
    // Phase 3 scoring: score the wave that just finished at the moment it
    // transitions OUT of 'running' (into intermission) — this is the one
    // place waveIndex still refers to the wave that just ended (it only
    // increments later, when intermission's own countdown elapses).
    if (changed && wm.phase === 'intermission') this.onWaveEnd();
    if (changed && wm.phase === 'running') this.onWaveTransition(wm.pendingEarlyCallBonus);

    // Round 8: endless-mode banner countdown (see endlessBannerTimer/
    // WaveManager.justEnteredEndless above).
    if (this.endlessBannerTimer > 0) this.endlessBannerTimer -= dt;

    // Spawn-rate debug graph history.
    this.rateHistory.push(this.spawnDirector.currentRate);
    if (this.rateHistory.length > 120) this.rateHistory.shift();

    // Cull dead non-core entities so arrays don't grow unbounded. A bomber
    // that has died but whose fuse is still counting down (lit, not yet
    // detonated) is deliberately kept alive in this array — see the
    // fuse/detonation driver above — so its countdown can finish and it can
    // actually detonate before being removed.
    this.entities = this.entities.filter((e) => !e.dead || e.kind === 'core' || (e.archetype === 'bomber' && !!e.fuseLit && !e.fuseDetonated));
  }

  private onWaveTransition(bonus: number): void {
    this.spawnDirector = new SpawnDirector(getWaveForDifficulty(this.waveManager.currentWave, this.difficulty), this.effectiveSpawnRateMult());
    this.applyTuningToSpawnDirector();
    this.currentWaveCoinBonus = bonus;
    if (this.waveManager.justEnteredEndless) {
      this.waveManager.justEnteredEndless = false;
      this.endlessBannerTimer = 3.5;
    }
  }

  /**
   * Phase 3 scoring: computes and records the score for the wave that just
   * finished (still `this.waveManager.currentWave` at the moment this is
   * called — see the two call sites' comments). Resets the per-wave
   * accumulators for the next wave. Logs the full breakdown to the console
   * (tagged `[SCORE]`) so a headless/sandbox harness driving this game via
   * injected JS (no canvas rendering) can read every component separately
   * without screen-scraping — the same data is also kept in
   * `this.scoreHistory` for `window.game.scoreHistory` inspection.
   */
  private onWaveEnd(): void {
    const wave = this.waveManager.currentWave;
    const enemiesSpawned = this.spawnDirector.budgetSpent;
    const coinsPar = waveCoinsPar(wave);
    const alliesPar = spawnerCapacity(this.shopLevels) * this.spawners.length;
    const alliesAliveAtEnd = this.entities.filter((e) => e.kind === 'ally' && !e.dead).length;
    const breakdown = computeWaveScore({
      wave: wave.wave,
      coreHpFrac: this.core.health ? this.core.health.hp / this.core.health.maxHp : 0,
      playerHpFrac: this.player.health ? this.player.health.hp / this.player.health.maxHp : 0,
      clearTimeSec: this.waveElapsedSec,
      parTimeSec: wave.durationSec,
      enemiesSpawned,
      enemiesKilled: this.waveKillCount,
      coinsEarnedThisWave: this.waveCoinsEarned,
      coinsParThisWave: coinsPar,
      alliesAliveAtEnd,
      alliesPar,
    });
    this.scoreHistory.push(breakdown);
    // eslint-disable-next-line no-console -- intentional: this IS the headless-sandbox-facing log line, see doc comment above
    console.log(`[SCORE] wave ${breakdown.wave}`, {
      integrity: Math.round(breakdown.integrity),
      tempo: Math.round(breakdown.tempo),
      survival: Math.round(breakdown.survival),
      commandEconomy: Math.round(breakdown.commandEconomy),
      mastery: Math.round(breakdown.mastery),
      total: Math.round(breakdown.total),
    });
    this.waveElapsedSec = 0;
    this.waveKillCount = 0;
    this.waveCoinsEarned = 0;
  }

  /** Phase 3 scoring: current run grade from every wave scored so far — see economy/scoring.ts. */
  currentRunGrade(): RunGradeResult {
    return computeRunGrade(this.scoreHistory, this.runDefeated);
  }

  /**
   * Difficulty spawnRateMult composed with the endless-wave escalation
   * factor (round 8) AND the live tuning panel's own spawnRateMult knob
   * (post-launch) — see DECISIONS.md for the exact multiplicative formula.
   */
  private effectiveSpawnRateMult(): number {
    return DIFFICULTY[this.difficulty].spawnRateMult * endlessFactor(this.waveManager.waveIndex + 1) * (this.tuningOverride.spawnRateMult ?? 1);
  }

  /** Pushes the current tuningOverride's spawn-rate/alive-cap knobs onto the live SpawnDirector. */
  private applyTuningToSpawnDirector(): void {
    this.spawnDirector.setSpawnRateMult(this.effectiveSpawnRateMult());
    this.spawnDirector.setAliveCapMult(this.tuningOverride.aliveCapMult ?? 1);
  }

  // -------------------------------------------------------------------
  // Post-launch: live tuning panel (B toggle, Shift+B export) — see
  // ui/tuningPanel.ts and persistence/tuningStore.ts. See DECISIONS.md for
  // the exact keybind, composition formula, and export JSON shape.
  // -------------------------------------------------------------------

  /** Sets (or, if value is null, clears back to default) one tuning knob, applies it live, and schedules a debounced save. */
  setTuningKnob(id: TuningKnobId, value: number | null): void {
    if (value === null) delete this.tuningOverride[id];
    else this.tuningOverride[id] = value;
    this.applyTuningToSpawnDirector();
    this.tuningDirty = true;
    this.tuningSaveTimer = Game.TUNING_SAVE_DEBOUNCE_SEC;
  }

  /** The panel's reset action: clears every knob for the current difficulty, live and in storage. */
  resetTuning(): void {
    this.tuningOverride = {};
    this.applyTuningToSpawnDirector();
    clearTuning(this.difficulty);
    this.tuningDirty = false;
    this.tuningSaveTimer = 0;
  }

  private flushTuningSave(): void {
    if (!this.tuningDirty) return;
    saveTuning(this.difficulty, this.tuningOverride);
    this.tuningDirty = false;
  }

  /**
   * Shift+B: exports the current difficulty's full saved tuning override as
   * a self-describing JSON blob — console.log'd (always works) and, best
   * effort, copied to the clipboard (may be blocked/unavailable, wrapped in
   * try/catch). See DECISIONS.md for the exact JSON shape and why.
   */
  private exportTuning(): void {
    const payload = {
      difficulty: this.difficulty,
      exportedAt: new Date().toISOString(),
      override: { ...this.tuningOverride },
    };
    const json = JSON.stringify(payload, null, 2);
    // eslint-disable-next-line no-console -- intentional: this IS the console-facing export, always works regardless of clipboard permissions
    console.log(`[Wave Defense Tuning Export — difficulty: ${this.difficulty}]\n${json}`);
    try {
      if (!navigator.clipboard) throw new Error('clipboard API unavailable');
      navigator.clipboard.writeText(json).then(
        () => {
          this.tuningExportMessage = 'Tuning copied to clipboard — paste it to Claude to update defaults';
          this.tuningExportMessageTimer = 4;
        },
        () => {
          this.tuningExportMessage = 'Clipboard blocked — copy the JSON from the browser console instead';
          this.tuningExportMessageTimer = 4;
        },
      );
    } catch {
      this.tuningExportMessage = 'Clipboard unavailable — copy the JSON from the browser console instead';
      this.tuningExportMessageTimer = 4;
    }
    playSfx('uiClick', 0.6);
  }

  private handleTuningKeys(): void {
    const input = this.input;
    if (this.tuningExportMessageTimer > 0) {
      this.tuningExportMessageTimer -= FIXED_DT;
      if (this.tuningExportMessageTimer <= 0) this.tuningExportMessage = null;
    }
    if (this.tuningDirty) {
      this.tuningSaveTimer -= FIXED_DT;
      if (this.tuningSaveTimer <= 0) this.flushTuningSave();
    }

    // Only usable once a run exists (playing or the in-run shop) — the
    // panel edits a difficulty's LIVE spawn director/spawn-time scaling,
    // neither of which exists on the start/gameover screens.
    const usable = this.phase === 'playing' || this.phase === 'shop';
    if (!usable) return;

    const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    if (input.wasPressed('KeyB')) {
      if (shift) {
        this.exportTuning();
      } else {
        this.tuningPanelOpen = !this.tuningPanelOpen;
        if (!this.tuningPanelOpen) this.flushTuningSave(); // flush immediately on close rather than waiting out the debounce
      }
    }
    if (!this.tuningPanelOpen) return;

    const wheel = input.consumeWheel();
    if (wheel !== 0) this.tuningPanel.moveSelection(wheel > 0 ? 1 : -1);

    if (input.wasPressed('ArrowLeft')) this.tuningPanel.adjustSelected(-1, shift, this.tuningOverride, (id, v) => this.setTuningKnob(id, v));
    if (input.wasPressed('ArrowRight')) this.tuningPanel.adjustSelected(1, shift, this.tuningOverride, (id, v) => this.setTuningKnob(id, v));
    if ((input.wasPressed('Enter') || input.wasPressed('Space')) && this.tuningPanel.selectedIndex === TUNING_KNOBS.length) {
      this.resetTuning();
    }

    if (input.mouseDown) {
      this.tuningPanel.handleDrag(input.mouseX, input.mouseY, this.camera.screenWidth, this.camera.screenHeight, this.tuningOverride, (id, v) =>
        this.setTuningKnob(id, v),
      );
    }
    if (input.wasMousePressed()) {
      this.tuningPanel.handleClick(input.mouseX, input.mouseY, this.camera.screenWidth, this.camera.screenHeight, () => this.resetTuning());
    }
  }

  private trySummon(x: number, y: number): void {
    if (this.summonCooldownRemaining > 0) return;
    // Phase 2: summoner's passive (+50% count/cap, faster recharge) is a
    // flat multiplier applied here, on top of the shop-derived numbers —
    // economy/shop.ts stays entirely class-agnostic, and this is the one
    // place that composes "shop level" with "class passive" for summons.
    const classMult = PLAYER_CLASSES[this.playerClass].summonStatMult;
    const aliveSummoned = this.entities.filter((e) => e.kind === 'ally' && e.summonedByPlayer && !e.dead).length;
    const maxAlive = Math.round(summonMaxAlive(this.shopLevels) * classMult);
    if (aliveSummoned >= maxAlive) return;
    const count = Math.min(Math.round(summonCount(this.shopLevels) * classMult), maxAlive - aliveSummoned);
    const unlockedTypes = unlockedAllyTypes(this.shopLevels);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const scatter = SUMMON.summonRadiusScatter;
      const allyType = unlockedTypes[Math.floor(Math.random() * unlockedTypes.length)];
      const ally = createAlly(x + Math.cos(angle) * scatter, y + Math.sin(angle) * scatter, {
        hp: summonAllyHp(this.shopLevels),
        regenRate: SUMMON.allyRegenRate,
        speed: ALLY.speed,
        meleeDamage: ALLY.meleeDamage,
        meleeRate: ALLY.meleeRate,
        summonedByPlayer: true,
        allyType,
      });
      this.entities.push(ally);
    }
    this.summonCooldownRemaining = summonCooldownSeconds(this.shopLevels) / classMult;
    playSfx('allySummon');
  }

  // Phase 2: which WeaponId occupies slot 1/2 for the current class. Kept
  // as tiny pure functions (rather than a field snapshotted at reset — a
  // player's class doesn't change mid-run today, but this avoids yet
  // another piece of state to keep in sync if that ever changes).
  private classSlot1Weapon(): WeaponId {
    switch (this.playerClass) {
      case 'bomber':
        return 'grenade';
      case 'macer':
        return 'mace';
      case 'summoner':
        return 'pistol';
      default:
        return 'rifle';
    }
  }
  private classSlot2Weapon(): WeaponId | null {
    return this.playerClass === 'summoner' ? null : 'pistol';
  }

  private spawnEnemyFromRequest(kind: SpawnKind, x: number, y: number): void {
    // Round 6: difficulty scales enemy HP/damage at spawn time via
    // createEnemy's defOverride — Normal's 1.0 multipliers reproduce the
    // unscaled base ENEMIES stats exactly.
    // Round 8: composed multiplicatively with the endless-wave escalation
    // factor (1.0 at/before wave 5) — see DECISIONS.md.
    //
    // Full-game Phase 1: also composed multiplicatively with the
    // generation's own hpDmg/speed/coin multipliers (see config.ts
    // generationScale) — generation is picked per-spawn via
    // pickSpawnGeneration(), which handles both the wave->generation mapping
    // and (from wave 9 on) the 70/30 current-gen/one-gen-below mix. All
    // three scaling axes (generation, difficulty, endless) are composed here
    // in one place, in game.ts, so no other system needs to know about more
    // than one of them at a time.
    const diff = DIFFICULTY[this.difficulty];
    const waveNumber = this.waveManager.waveIndex + 1;
    const endless = endlessFactor(waveNumber);
    // Phase 4: the opt-in risk modifier composes multiplicatively on top of
    // whatever the main difficulty tier already contributes — see
    // config.ts::RISK_MODIFIER.
    const riskEnemyMult = this.riskMode ? RISK_MODIFIER.enemyMult : 1;
    // Post-launch: the live tuning panel's enemyHpMult/enemyDmgMult knobs are
    // an EXTRA multiplier layer on top of difficulty + risk mode — see
    // config.ts::TuningOverride and DECISIONS.md. Only newly-spawned enemies
    // from this point on are affected (a deliberate simplification over
    // retroactively rescaling already-alive enemies' current HP — see
    // DECISIONS.md).
    const enemyHpMult = diff.enemyHpMult * riskEnemyMult * (this.tuningOverride.enemyHpMult ?? 1);
    const enemyDmgMult = diff.enemyDmgMult * riskEnemyMult * (this.tuningOverride.enemyDmgMult ?? 1);
    const enemySpeedTuningMult = this.tuningOverride.enemySpeedMult ?? 1;
    // Phase 3: any of the 5 boss archetypes counts as "the boss" for
    // generation-offset purposes (generationForWave(wave, 1)), not just the
    // literal 'boss' key.
    const isBoss = ENEMIES[kind].isBoss ?? false;
    const generation = pickSpawnGeneration(waveNumber, isBoss);
    const gen = generationScale(generation);
    const def = ENEMIES[kind];
    const override: Partial<EnemyDef> = {
      hp: Math.round(def.hp * gen.hpDmg * enemyHpMult * endless),
      speed: def.speed * gen.speed * enemySpeedTuningMult,
      meleeDamage: Math.round(def.meleeDamage * gen.hpDmg * enemyDmgMult * endless),
      coinsMin: Math.max(1, Math.round(def.coinsMin * gen.coin)),
      coinsMax: Math.max(1, Math.round(def.coinsMax * gen.coin)),
    };
    if (def.ranged) {
      override.ranged = { ...def.ranged, damage: Math.round(def.ranged.damage * gen.hpDmg * enemyDmgMult * endless) };
    }
    if (def.bomber) {
      override.bomber = {
        ...def.bomber,
        detonationDamage: Math.round(def.bomber.detonationDamage * gen.hpDmg * enemyDmgMult * endless),
      };
    }
    if (def.healer) {
      // Healing "power" scales with generation the same way damage does —
      // not specified explicitly by the brief, a judgment call (see
      // DECISIONS.md) so a red-generation healer is a meaningfully bigger
      // problem than a violet one, not just a bigger HP bar.
      override.healer = { ...def.healer, healRate: def.healer.healRate * gen.hpDmg };
    }
    if (def.fireMage) {
      override.fireMage = {
        ...def.fireMage,
        damage: Math.round(def.fireMage.damage * gen.hpDmg * enemyDmgMult * endless),
        burnDps: def.fireMage.burnDps * gen.hpDmg * enemyDmgMult * endless,
      };
    }
    if (def.bossAbilities) {
      // Phase 3: scale each ability's own damage-shaped fields by the same
      // hpDmg*difficulty*endless factor as everything else — summonCount,
      // radii, durations and thresholds are left as authored (a bigger
      // generation boss shouldn't summon MORE adds, just hit harder).
      override.bossAbilities = def.bossAbilities.map((a) => ({
        ...a,
        damage: a.damage !== undefined ? Math.round(a.damage * gen.hpDmg * enemyDmgMult * endless) : undefined,
        burnDps: a.burnDps !== undefined ? a.burnDps * gen.hpDmg * enemyDmgMult * endless : undefined,
      }));
    }
    // Round 8: hue-shift the archetype's base color warmer, proportional to a
    // combined "power level" from BOTH difficulty and endless-wave scaling
    // (enemyHpMult is the primary driver — see DECISIONS.md for the exact
    // powerLevel->warmth curve and why hp is chosen over averaging every
    // multiplier). Normal difficulty at/before wave 5 has powerLevel === 1,
    // so warmth === 0 and the color is untouched.
    //
    // Full-game Phase 1: generation hue is applied FIRST (the primary
    // "generation" visual signal, walking violet->red per generation), then
    // the existing difficulty/endless warm-shift nudges it further toward
    // red on top of whatever generation already set — see DECISIONS.md for
    // why these two hue-shift mechanisms are allowed to compose rather than
    // one replacing the other.
    const powerLevel = diff.enemyHpMult * endless;
    const warmth = Math.max(0, 1 - 1 / powerLevel);
    override.color = warmHexColor(applyGenerationHue(def.color, generation), warmth);
    this.entities.push(createEnemy(kind, x, y, override, generation));
  }

  /**
   * Phase 3: ticks one boss's special abilities and fires any that are
   * ready. Each ability type is a small, self-contained effect; adding a
   * 6th boss with a novel ability means adding one more `case` here plus a
   * BossAbilityDef variant in config.ts — no other system needs to change.
   */
  private updateBossAbilities(boss: Entity, dt: number): void {
    for (const ability of boss.bossAbilities ?? []) {
      const def = ability.def;
      if (def.type === 'enrageAtLowHp') {
        if (ability.triggered || !boss.health) continue;
        const frac = boss.health.hp / boss.health.maxHp;
        if (frac > (def.hpThresholdFraction ?? 0.4)) continue;
        ability.triggered = true;
        boss.speedStat = (boss.speedStat ?? 0) * (def.speedMult ?? 1);
        if (boss.melee) boss.melee.damage *= def.dmgMult ?? 1;
        if (boss.ranged) boss.ranged.damage *= def.dmgMult ?? 1;
        playSfx('bomberFuse'); // reuse the rising-pitch tell as an "uh oh, it's enraging" cue
        continue;
      }

      ability.cooldownRemaining -= dt;
      if (ability.cooldownRemaining > 0) continue;
      ability.cooldownRemaining = def.cooldown;

      switch (def.type) {
        case 'slam':
          applyAreaDamage(this.entities, boss.x, boss.y, def.radius ?? 150, def.damage ?? 20, 0.35, 'enemy', boss.id);
          playSfx('bomberDetonate');
          break;
        case 'summonAdds': {
          const count = def.summonCount ?? 2;
          const archetype = def.summonArchetype ?? 'grunt';
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            this.spawnEnemyFromRequest(archetype, boss.x + Math.cos(angle) * (boss.radius + 30), boss.y + Math.sin(angle) * (boss.radius + 30));
          }
          playSfx('allySummon'); // distinct "something arrived" cue — reused, not boss-specific by design (see DECISIONS.md)
          break;
        }
        case 'burnPulse':
          this.groundEffects.push({
            x: boss.x,
            y: boss.y,
            radius: def.burnRadius ?? 150,
            dps: def.burnDps ?? 5,
            enemyFalloff: 0.35,
            ownerFaction: 'enemy',
            timer: def.burnDuration ?? 4,
            maxTimer: def.burnDuration ?? 4,
          });
          playSfx('fireballImpact');
          break;
      }
    }
  }

  /**
   * Phase 5: contact damage from any enemy touching a live door — one
   * pass, checked against a closest-point-on-rect distance (same shape as
   * entities/movement.ts::resolveCircleVsRect's own overlap test, just
   * read-only here). Multiple enemies at the same door each contribute
   * their own DOOR.enemyContactDps, so a crowd breaks it faster than a
   * straggler — the intended "the horde WILL get through eventually,
   * defend the chokepoint" tension.
   */
  private updateDoors(dt: number, liveUnits: Entity[]): void {
    for (const d of this.doors) {
      if (!d.alive) continue;
      let contactCount = 0;
      for (const e of liveUnits) {
        if (e.kind !== 'enemy') continue;
        const closestX = Math.max(d.x, Math.min(e.x, d.x + d.w));
        const closestY = Math.max(d.y, Math.min(e.y, d.y + d.h));
        const dx = e.x - closestX;
        const dy = e.y - closestY;
        if (dx * dx + dy * dy <= e.radius * e.radius) contactCount++;
      }
      if (contactCount > 0) this.damageDoor(d, DOOR.enemyContactDps * contactCount * dt);
    }
  }

  /** Applies damage to a door, breaking it (and playing the SFX) exactly once when its HP first reaches 0. */
  private damageDoor(door: Door, amount: number): void {
    if (!door.alive) return;
    door.hp -= amount;
    if (door.hp <= 0) {
      door.hp = 0;
      door.alive = false;
      playSfx('doorBreak');
    }
  }

  // -------------------------------------------------------------------
  // Debug keys
  // -------------------------------------------------------------------
  private handleDebugKeys(): void {
    const input = this.input;
    if (input.wasPressed('F1')) this.debug.overlay = !this.debug.overlay;
    if (input.wasPressed('F2')) this.debug.collisionRadii = !this.debug.collisionRadii;
    if (input.wasPressed('F3')) this.debug.flowField = !this.debug.flowField;
    if (input.wasPressed('F5')) {
      this.debug.godMode = !this.debug.godMode;
      setGodMode(this.debug.godMode);
    }
    if (input.wasPressed('F7')) this.debug.spawnReadout = !this.debug.spawnReadout;
    if (input.wasPressed('F9')) printDevReadout();
    if (input.wasPressed('F10')) this.renderStyle = this.renderStyle === 'flat' ? 'detailed' : 'flat';

    if (this.phase !== 'playing') return;

    if (input.wasPressed('F4')) {
      // Round 6: WaveManager.update() no longer force-ends 'running' on its
      // own (it's gated on aliveEnemies === 0 now) — use the dedicated debug
      // bypass so this dev shortcut still unconditionally skips the wave.
      const wasRunning = this.waveManager.phase === 'running';
      const changed = this.waveManager.debugForceAdvance();
      if (changed && wasRunning) this.onWaveEnd(); // Phase 3 scoring: score the skipped wave too, for a consistent debug flow
      if (changed && this.waveManager.phase === 'running') this.onWaveTransition(this.waveManager.pendingEarlyCallBonus);
    }
    if (input.wasPressed('F6')) {
      const kind = DEBUG.spawnCycleTypes[this.debug.spawnCycleIndex];
      const world = this.camera.screenToWorld(input.mouseX, input.mouseY);
      this.spawnEnemyFromRequest(kind, world.x, world.y);
    }
    if (input.wasPressed('F8')) {
      const req = this.spawnDirector.forceSpawnBoss();
      if (req) this.spawnEnemyFromRequest(req.kind, req.x, req.y);
    }
  }

  // -------------------------------------------------------------------
  // Rendering (interpolated between fixed ticks)
  // -------------------------------------------------------------------
  private render(alpha: number): void {
    const t0 = performance.now();
    const now = performance.now();
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    this.fps = this.frameTimes.length;

    const ctx = this.ctx;
    const w = this.camera.screenWidth;
    const h = this.camera.screenHeight;
    ctx.clearRect(0, 0, w, h);

    this.camera.update(this.phase === 'shop' ? 0 : FIXED_DT, this.player.x, this.player.y);

    // Player barrel visual recoil: pull the aim-direction line back toward
    // the player on fire, easing back out as playerWeaponState.recoil decays
    // (same deterministic curve driving the camera kick below).
    this.player.barrelPullback = this.playerWeaponState.recoil * this.playerWeaponState.recoilBarrelStrength;

    ctx.save();
    if (this.playerWeaponState.recoil > 0) {
      // Deterministic camera kick opposite the aim direction — snaps out on
      // fire, eases back to center. Replaces the old random full-screen
      // jitter (screenShake) entirely.
      const kick = this.playerWeaponState.recoil * this.playerWeaponState.recoilCameraStrength * this.camera.pixelScale;
      ctx.translate(-Math.cos(this.playerWeaponState.recoilAngle) * kick, -Math.sin(this.playerWeaponState.recoilAngle) * kick);
    }

    const detailed = this.renderStyle === 'detailed';

    drawWorldBackground(ctx, this.camera);
    if (detailed) drawObstaclesDetailed(ctx, this.camera, this.obstacles);
    else drawObstacles(ctx, this.camera, this.obstacles);
    if (detailed) drawWallsDetailed(ctx, this.camera);
    else drawWalls(ctx, this.camera);
    drawDoors(ctx, this.camera, this.doors);
    drawSpawners(ctx, this.camera, this.spawners);
    drawShopMarker(ctx, this.camera);

    for (const e of this.entities) {
      if (e.kind === 'coin' && !e.dead) {
        const p = this.camera.worldToScreen(e.x, e.y);
        if (e.isGem) {
          // Small diamond/rhombus so gems read as visually distinct from
          // the round gold coins at a glance (cyan vs gold).
          const r = 6 * this.camera.pixelScale;
          ctx.fillStyle = '#5fe0ff';
          ctx.strokeStyle = '#d0faff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - r);
          ctx.lineTo(p.x + r * 0.7, p.y);
          ctx.lineTo(p.x, p.y + r);
          ctx.lineTo(p.x - r * 0.7, p.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5 * this.camera.pixelScale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const e of this.entities) {
      // A dead-but-still-fused bomber (its detonation hasn't fired yet — see
      // simulate()'s cull filter) keeps rendering as a corpse so the fuse
      // visual below has something to sit on, instead of just vanishing and
      // then silently exploding.
      const stillFusing = e.archetype === 'bomber' && !!e.fuseLit && !e.fuseDetonated;
      if ((e.dead && !stillFusing) || e.kind === 'coin') continue;
      if (detailed) drawEntityDetailed(ctx, this.camera, e, alpha);
      else drawEntity(ctx, this.camera, e, alpha);
    }

    // Phase 1 archetype visuals: bomber fuse ring/flash, healer heal
    // tethers, in-flight fireballs, burning ground.
    for (const e of this.entities) {
      if (e.archetype === 'bomber' && e.fuseLit && !e.fuseDetonated && e.bomber) {
        const progress = 1 - Math.max(0, e.fuseTimer ?? 0) / e.bomber.fuseSec;
        drawBomberFuse(ctx, this.camera, e.x, e.y, e.radius, progress);
      }
    }
    drawHealerTethers(ctx, this.camera, this.entities);
    for (const ge of this.groundEffects) {
      drawGroundFire(ctx, this.camera, ge.x, ge.y, ge.radius, ge.timer / ge.maxTimer);
    }
    for (const fb of this.fireballs) {
      drawFireball(ctx, this.camera, fb.x, fb.y);
    }

    if (this.debug.flowField) drawFlowFieldDebug(ctx, this.camera, this.pathfinder as FlowField);
    if (this.debug.collisionRadii) drawCollisionRadii(ctx, this.camera, this.entities);

    drawWorldBounds(ctx, this.camera);
    ctx.restore();

    const boss = this.entities.find((e) => e.kind === 'enemy' && e.isBoss && !e.dead);
    if (this.spawnDirector.bossWarningActive) drawBossWarningBanner(ctx, w);

    const hudData: HudData = {
      playerHp: this.player.health!.hp,
      playerMaxHp: this.player.health!.maxHp,
      coreHp: this.core.health!.hp,
      coreMaxHp: this.core.health!.maxHp,
      // Phase 2: label/ammo now come from the actual current weapon
      // (WEAPONS[...].name) rather than assuming slot 1 is always the
      // rifle — a bomber/macer's slot 1 is grenade/mace, and only the
      // rifle actually has a magazine/reload cycle.
      weaponLabel: this.activeSlot === 3 ? 'Summon Wand' : WEAPONS[this.playerWeaponState.current].name,
      ammoText:
        this.activeSlot === 3
          ? 'Left-click to summon'
          : this.playerWeaponState.current === 'rifle'
            ? this.playerWeaponState.reloading
              ? 'Reloading...'
              : `${this.playerWeaponState.rifleAmmo}/${rifleMagazine(this.shopLevels)}`
            : 'unlimited',
      summonCooldownRemaining: this.summonCooldownRemaining,
      summonCooldownTotal: summonCooldownSeconds(this.shopLevels),
      summonMaxAlive: summonMaxAlive(this.shopLevels),
      summonAliveCount: this.entities.filter((e) => e.kind === 'ally' && e.summonedByPlayer && !e.dead).length,
      coins: this.coins,
      waveNumber: this.waveManager.waveIndex + 1,
      totalWaves: WAVES.length,
      isEndless: this.waveManager.waveIndex + 1 > WAVES.length,
      enemiesAlive: this.entities.filter((e) => e.kind === 'enemy' && !e.dead).length,
      wavePhase: this.waveManager.phase,
      timeRemaining: this.waveManager.timeRemaining,
      earlyCallBonusPreview: this.waveManager.currentEarlyCallBonusPreview(),
      bossAlive: !!boss,
      bossHp: boss?.health?.hp ?? 0,
      bossMaxHp: boss?.health?.maxHp ?? 1,
      shopPromptVisible: this.phase === 'playing' && this.distToShopMarker() <= SHOP.interactRadius,
      godMode: this.debug.godMode,
      musicMuted: isMusicMuted(),
      activeSlot: this.activeSlot,
      rifleReloadPct: this.playerWeaponState.reloading
        ? 1 - this.playerWeaponState.reloadTimer / (WEAPONS.rifle.reloadTime ?? 1.5)
        : 1,
      wandCooldownPct:
        summonCooldownSeconds(this.shopLevels) > 0 ? 1 - this.summonCooldownRemaining / summonCooldownSeconds(this.shopLevels) : 1,
      difficultyLabel: DIFFICULTY[this.difficulty].label,
      difficultyColor: DIFFICULTY[this.difficulty].color,
      spawningStopped: this.spawnDirector.spawningStopped,
      tuningActive: !isTuningOverrideEmpty(this.tuningOverride),
    };
    drawHud(ctx, w, h, hudData);
    if (this.waveManager.phase === 'intermission') this.drawScorePanel();
    drawMinimap(
      ctx,
      w,
      this.player.x,
      this.player.y,
      this.obstacles,
      this.entities.filter((e) => e.kind === 'enemy' && !e.dead).map((e) => ({ x: e.x, y: e.y, isBoss: !!e.isBoss })),
      this.spawnDirector.bossWarningActive,
      this.entities.filter((e) => e.kind === 'ally' && !e.dead).map((e) => ({ x: e.x, y: e.y })),
      this.entities.filter((e) => e.kind === 'coin' && e.isGem && !e.dead).map((e) => ({ x: e.x, y: e.y })),
    );

    if (this.debug.overlay) {
      const debugData: DebugData = {
        fps: this.fps,
        entityCount: this.entities.length,
        enemyCount: this.entities.filter((e) => e.kind === 'enemy').length,
        allyCount: this.entities.filter((e) => e.kind === 'ally').length,
        projectileCount: this.entities.filter((e) => e.kind === 'projectile').length,
        updateMs: this.lastUpdateMs,
        renderMs: this.lastRenderMs,
        godMode: this.debug.godMode,
        spawnCycleType: DEBUG.spawnCycleTypes[this.debug.spawnCycleIndex],
        renderStyle: this.renderStyle,
        tuningActive: !isTuningOverrideEmpty(this.tuningOverride),
      };
      drawDebugOverlay(ctx, debugData);
    }
    if (this.debug.spawnReadout) {
      const snap = this.spawnDirector.debugSnapshot();
      const readout: SpawnReadoutData = {
        smoothedKillRate: snap.smoothedKillRate,
        currentRate: snap.currentRate,
        normalizedTarget: snap.normalizedTarget,
        budgetSpent: snap.budgetSpent,
        budgetTotal: snap.budgetTotal,
        aliveCount: this.entities.filter((e) => e.kind === 'enemy' && !e.dead).length,
        // Round 8: was the raw SPAWN_DIRECTOR.aliveCap constant, which drifted
        // from reality once spawnRateMult composes difficulty * endlessFactor
        // — read the director's own scaled cap instead (see effectiveAliveCap).
        aliveCap: snap.effectiveAliveCap,
        waveTimeRemaining: this.waveManager.phase === 'running' ? this.waveManager.timeRemaining : 0,
        history: this.rateHistory,
        activeSpawnPointId: snap.activeSpawnPointId,
        clumpProgress: snap.clumpProgress,
        clumpTarget: snap.clumpTarget,
        pauseTimer: snap.pauseTimer,
        endlessFactor: endlessFactor(this.waveManager.waveIndex + 1),
      };
      drawSpawnReadout(ctx, w, readout);
    }

    if (this.phase === 'shop') {
      this.shopPanel.updateHover(this.input.mouseX, this.input.mouseY, w, h);
      this.shopPanel.draw(ctx, w, h, this.coins, this.shopLevels);
    }

    // Post-launch: live tuning panel (B to toggle) — see ui/tuningPanel.ts.
    if (this.tuningPanelOpen) {
      this.tuningPanel.updateHover(this.input.mouseX, this.input.mouseY, w, h);
      this.tuningPanel.draw(ctx, w, h, this.tuningOverride, DIFFICULTY[this.difficulty].label);
    }
    if (this.tuningExportMessage) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#7CFC00';
      ctx.fillText(this.tuningExportMessage, w / 2, h - 40);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    if (this.phase === 'gameover') {
      this.drawGameOverScreen();
    }

    if (this.endlessBannerTimer > 0) this.drawEndlessBanner();

    if (this.phase === 'start') {
      drawStartScreen(ctx, w, h, this.difficulty, this.playerClass, this.riskMode);
    }

    this.lastRenderMs = performance.now() - t0;
  }

  /** Round 8: transient one-time "Wave 5 Complete — Endless Mode" celebratory banner, see endlessBannerTimer. */
  private drawEndlessBanner(): void {
    const ctx = this.ctx;
    const w = this.camera.screenWidth;
    // Fade the last ~0.8s of its ~3.5s life.
    const alpha = Math.min(1, this.endlessBannerTimer / 0.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#ffd766';
    ctx.fillText(`WAVE ${WAVES.length} COMPLETE`, w / 2, 170);
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('— ENDLESS MODE —', w / 2, 210);
    ctx.restore();
  }

  private drawGameOverScreen(): void {
    const ctx = this.ctx;
    const w = this.camera.screenWidth;
    const h = this.camera.screenHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 80px sans-serif';
    const info = this.gameOverInfo;
    ctx.fillText('GAME OVER', w / 2, h / 2 - 160);
    ctx.font = '36px sans-serif';
    ctx.fillText(`Wave reached: ${info?.waveReached ?? 1}`, w / 2, h / 2 - 70);
    ctx.fillText(`Coins collected: ${info?.coins ?? 0}`, w / 2, h / 2 - 22);

    // Phase 3: run-end grade presentation.
    const grade = this.currentRunGrade();
    ctx.font = 'bold 56px sans-serif';
    ctx.fillStyle = '#ffd766';
    ctx.fillText(`Run Grade: ${grade.letter}`, w / 2, h / 2 + 46);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#cfd8e3';
    ctx.fillText(
      `${grade.weightedAveragePct.toFixed(1)}% weighted average over ${this.scoreHistory.length} scored wave(s)` +
        (grade.gated ? ' — capped by a hard gate (see DECISIONS.md)' : ''),
      w / 2,
      h / 2 + 82,
    );

    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#9fd3ff';
    ctx.fillText('Press R to restart', w / 2, h / 2 + 140);
    ctx.textAlign = 'left';
  }

  /**
   * Phase 3: intermission-only readout of the wave that just ended (full
   * 5-component breakdown) plus the run's current grade so far — the
   * in-game counterpart to the `[SCORE]` console log written by
   * onWaveEnd(). Drawn directly here (not via ui/hud.ts's typed HudData)
   * since it's a self-contained, occasional overlay rather than an
   * always-on HUD element.
   */
  private drawScorePanel(): void {
    const last = this.scoreHistory[this.scoreHistory.length - 1];
    if (!last) return;
    const ctx = this.ctx;
    const w = this.camera.screenWidth;
    const x = w / 2 - 260;
    const y = 90;
    const grade = this.currentRunGrade();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, 520, 200);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(x, y, 520, 200);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd766';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`Wave ${last.wave} Score: ${Math.round(last.total)}/1000`, x + 16, y + 30);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#e8e8e8';
    const lines = [
      `Integrity ${Math.round(last.integrity)}/200   Tempo ${Math.round(last.tempo)}/200`,
      `Survival ${Math.round(last.survival)}/200   Command/Econ ${Math.round(last.commandEconomy)}/200`,
      `Mastery ${Math.round(last.mastery)}/200`,
    ];
    lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 62 + i * 26));
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#9fd3ff';
    ctx.fillText(`Run grade so far: ${grade.letter} (${grade.weightedAveragePct.toFixed(1)}%)`, x + 16, y + 160);
    ctx.restore();
  }
}
