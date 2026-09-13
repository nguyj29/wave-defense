import { Camera } from './camera.ts';
import { ALLY, COINS, CORE, DEBUG, GEM, PLAYER, SHOP, SPAWN_DIRECTOR, SUMMON, WEAPONS, WORLD } from './config.ts';
import { setGodMode, updateRegen } from './combat/damage.ts';
import {
  createPlayerWeaponState,
  startReload,
  switchWeapon,
  updatePlayerWeapon,
  type PlayerWeaponState,
} from './combat/playerWeapons.ts';
import { updateProjectiles } from './combat/projectiles.ts';
import { tickCooldowns } from './combat/weapons.ts';
import { updateAlly } from './entities/behaviors/ally.ts';
import { updateEnemy } from './entities/behaviors/enemy.ts';
import type { WorldContext } from './entities/context.ts';
import { createAlly, createCoin, createCore, createEnemy, createPlayer } from './entities/factory.ts';
import { integrateAndResolve } from './entities/movement.ts';
import { updateSpawners, type AllySpawner } from './entities/spawnerSystem.ts';
import type { Entity } from './entities/types.ts';
import { resetEntityIdCounter } from './entities/types.ts';
import {
  coreMaxHp,
  createInitialShopLevels,
  effectiveGemChance,
  rifleMagazine,
  spawnerAllyDamage,
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
import { FIXED_DT, GameLoop } from './engine/loop.ts';
import { SpatialGrid } from './engine/grid.ts';
import { Input } from './input.ts';
import { drawDebugOverlay, drawSpawnReadout, type DebugData, type SpawnReadoutData } from './ui/debugOverlay.ts';
import { drawHud, type HudData } from './ui/hud.ts';
import { drawBossWarningBanner, drawMinimap } from './ui/minimap.ts';
import { ShopPanel } from './ui/shopPanel.ts';
import {
  drawCollisionRadii,
  drawEntity,
  drawFlowFieldDebug,
  drawObstacles,
  drawShopMarker,
  drawSpawners,
  drawWalls,
  drawWorldBackground,
  drawWorldBounds,
} from './render/renderer.ts';
import { drawEntityDetailed, drawObstaclesDetailed, drawWallsDetailed } from './render/rendererDetailed.ts';
import { playSfx } from './audio/sfx.ts';
import { isMusicMuted, setMusicIntensity, toggleMusicMute } from './audio/music.ts';
import { FlowField, type Pathfinder } from './world/flowfield.ts';
import { SPAWNER_POSITIONS } from './world/map.ts';
import { generateObstacles, type Obstacle } from './world/obstacles.ts';
import { SpawnDirector, type SpawnKind } from './waves/spawnDirector.ts';
import { WaveManager } from './waves/waveManager.ts';

export type GamePhase = 'start' | 'playing' | 'shop' | 'gameover' | 'victory';

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

  shopLevels: ShopLevels = createInitialShopLevels();
  coins = 0;
  playerWeaponState!: PlayerWeaponState;
  activeSlot: 1 | 2 | 3 = 1;
  summonCooldownRemaining = 0;
  currentWaveCoinBonus = 0;

  waveManager = new WaveManager();
  spawnDirector = new SpawnDirector(this.waveManager.currentWave);

  phase: GamePhase = 'start';
  gameOverInfo: { waveReached: number; coins: number; victory: boolean } | null = null;
  shopPanel = new ShopPanel();

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
  private lastMusicIntense = false;

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
    this.shopLevels = createInitialShopLevels();
    this.coins = 0;
    this.currentWaveCoinBonus = 0;
    this.summonCooldownRemaining = 0;
    this.activeSlot = 1;

    this.player = createPlayer(CORE.x + 60, CORE.y - 60, PLAYER.maxHp);
    this.entities.push(this.player);

    this.core = createCore(CORE.x, CORE.y, CORE.radius, coreMaxHp(this.shopLevels));
    this.entities.push(this.core);

    this.spawners = SPAWNER_POSITIONS.map((pos, i) => ({ id: i, x: pos.x, y: pos.y, timer: 0 }));

    this.playerWeaponState = createPlayerWeaponState(this.shopLevels);

    this.waveManager = new WaveManager();
    this.spawnDirector = new SpawnDirector(this.waveManager.currentWave);
    this.rateHistory = [];

    this.camera.snapTo(this.player.x, this.player.y);
    this.camera.zoom = 1.0;
    this.gameOverInfo = null;
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

    if ((this.phase === 'gameover' || this.phase === 'victory') && this.input.wasPressed('KeyR')) {
      this.reset();
    }

    this.input.endTick();
    this.lastUpdateMs = performance.now() - t0;
  }

  private distToShopMarker(): number {
    const dx = this.player.x - SHOP.marker.x;
    const dy = this.player.y - SHOP.marker.y;
    return Math.hypot(dx, dy);
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
    this.coins -= cost;
    this.shopLevels[id]++;
    if (id === 'coreHp') {
      const newMax = coreMaxHp(this.shopLevels);
      const delta = newMax - this.core.health!.maxHp;
      this.core.health!.maxHp = newMax;
      this.core.health!.hp += delta;
    }
    playSfx('shopPurchase');
  }

  private simulate(dt: number): void {
    const wm = this.waveManager;
    const input = this.input;

    // --- Player control -------------------------------------------------
    const axis = input.moveAxis();
    const targetVx = axis.x * PLAYER.speed;
    const targetVy = axis.y * PLAYER.speed;
    const accel = PLAYER.speed / PLAYER.accelTime;
    this.player.vx = approach(this.player.vx, targetVx, accel * dt);
    this.player.vy = approach(this.player.vy, targetVy, accel * dt);

    const mouseWorld = this.camera.screenToWorld(input.mouseX, input.mouseY);
    this.player.angle = Math.atan2(mouseWorld.y - this.player.y, mouseWorld.x - this.player.x);

    if (input.wasPressed('Digit1')) {
      this.activeSlot = 1;
      switchWeapon(this.playerWeaponState, 'rifle');
    }
    if (input.wasPressed('Digit2')) {
      this.activeSlot = 2;
      switchWeapon(this.playerWeaponState, 'pistol');
    }
    if (input.wasPressed('Digit3')) this.activeSlot = 3;
    if (input.wasPressed('KeyR')) startReload(this.playerWeaponState, this.shopLevels);
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
    };

    tickCooldowns(this.entities, dt);

    // Weapon fire (rifle/pistol) or summon cast.
    this.summonCooldownRemaining = Math.max(0, this.summonCooldownRemaining - dt);
    if (this.activeSlot === 3) {
      if (input.wasMousePressed()) this.trySummon(mouseWorld.x, mouseWorld.y);
    } else {
      updatePlayerWeapon(this.playerWeaponState, dt, this.shopLevels, this.player, this.player.angle, input.mouseDown, ctx);
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

    // Movement integration + collision resolution (player/ally/enemy only).
    const movers = liveUnits.filter((e) => e.kind !== 'core');
    integrateAndResolve(movers, this.obstacles, this.obstacleGrid, this.unitGrid, dt);

    // Spawners.
    updateSpawners(
      this.spawners,
      this.entities,
      dt,
      spawnerIntervalSeconds(this.shopLevels),
      spawnerCapacity(this.shopLevels),
      spawnerAllyHp(this.shopLevels),
      spawnerAllyDamage(this.shopLevels),
    );

    // Enemy deaths -> coins/gems + kill tracking (each entity processed exactly once).
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.dead && e.coinsMin !== undefined && !this.deathHandled.has(e.id)) {
        this.deathHandled.add(e.id);
        this.spawnDirector.registerKill();
        const gemChance = effectiveGemChance(this.shopLevels, !!e.isBoss);
        if (Math.random() < gemChance) {
          // Gems are a flat, rare-drop bonus — deliberately NOT scaled by
          // coinYield-style multipliers or the early-call bonus (see
          // DECISIONS.md): they're a separate mechanic from the base
          // per-kill coin curve, not part of it.
          this.entities.push(createCoin(e.x, e.y, GEM.coinValue, true));
        } else {
          const base = e.coinsMin + Math.random() * ((e.coinsMax ?? e.coinsMin) - e.coinsMin);
          const value = Math.round(base * (1 + this.currentWaveCoinBonus));
          this.entities.push(createCoin(e.x, e.y, value));
        }
      }
    }

    // Coin/gem magnet + pickup (same path for both — only the SFX differs).
    for (const c of this.entities) {
      if (c.kind !== 'coin' || c.dead) continue;
      const dx = this.player.x - c.x;
      const dy = this.player.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d <= COINS.pickupRadius) {
        this.coins += c.coinValue ?? 0;
        c.dead = true;
        playSfx(c.isGem ? 'gemPickup' : 'coinPickup', 0.6);
      } else if (d <= COINS.magnetRadius) {
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
      this.gameOverInfo = { waveReached: wm.waveIndex + 1, coins: this.coins, victory: false };
      this.phase = 'gameover';
    }

    // --- Wave / spawn direction -----------------------------------------
    if (wm.phase === 'running') {
      const aliveEnemies = this.entities.filter((e) => e.kind === 'enemy' && !e.dead).length;
      const requests = this.spawnDirector.update(dt, aliveEnemies);
      for (const req of requests) this.spawnEnemyFromRequest(req.kind, req.x, req.y);

      if (this.spawnDirector.isBudgetExhausted && aliveEnemies === 0) {
        wm.timeRemaining = 0;
      }

      // Subtle music intensity bump during boss warning/an active boss —
      // cheap gain-ramp layer on the already-running, phase-synced loop
      // (see audio/music.ts). Only call on an actual state change so we
      // aren't re-triggering the ramp every tick.
      const bossActive = this.spawnDirector.bossWarningActive || this.entities.some((e) => e.kind === 'enemy' && e.isBoss && !e.dead);
      if (bossActive !== this.lastMusicIntense) {
        this.lastMusicIntense = bossActive;
        setMusicIntensity(bossActive);
      }
    }

    if (input.wasPressed('Space') && wm.phase === 'intermission') {
      const bonus = wm.skipIntermission();
      this.onWaveTransition(bonus);
    }

    const changed = wm.update(dt);
    if (changed) {
      if (wm.phase === 'running') this.onWaveTransition(wm.pendingEarlyCallBonus);
      else if (wm.phase === 'allWavesComplete') {
        this.gameOverInfo = { waveReached: wm.waveIndex + 1, coins: this.coins, victory: true };
        this.phase = 'victory';
      }
    }

    // Spawn-rate debug graph history.
    this.rateHistory.push(this.spawnDirector.currentRate);
    if (this.rateHistory.length > 120) this.rateHistory.shift();

    // Cull dead non-core entities so arrays don't grow unbounded.
    this.entities = this.entities.filter((e) => !e.dead || e.kind === 'core');
  }

  private onWaveTransition(bonus: number): void {
    this.spawnDirector = new SpawnDirector(this.waveManager.currentWave);
    this.currentWaveCoinBonus = bonus;
  }

  private trySummon(x: number, y: number): void {
    if (this.summonCooldownRemaining > 0) return;
    const aliveSummoned = this.entities.filter((e) => e.kind === 'ally' && e.summonedByPlayer && !e.dead).length;
    const maxAlive = summonMaxAlive(this.shopLevels);
    if (aliveSummoned >= maxAlive) return;
    const count = Math.min(summonCount(this.shopLevels), maxAlive - aliveSummoned);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const scatter = SUMMON.summonRadiusScatter;
      const ally = createAlly(x + Math.cos(angle) * scatter, y + Math.sin(angle) * scatter, {
        hp: summonAllyHp(this.shopLevels),
        regenRate: SUMMON.allyRegenRate,
        speed: ALLY.speed,
        meleeDamage: ALLY.meleeDamage,
        meleeRate: ALLY.meleeRate,
        summonedByPlayer: true,
      });
      this.entities.push(ally);
    }
    this.summonCooldownRemaining = summonCooldownSeconds(this.shopLevels);
    playSfx('allySummon');
  }

  private spawnEnemyFromRequest(kind: SpawnKind, x: number, y: number): void {
    this.entities.push(createEnemy(kind, x, y));
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
      this.waveManager.timeRemaining = -0.001;
      const changed = this.waveManager.update(0);
      if (changed) {
        if (this.waveManager.phase === 'running') this.onWaveTransition(this.waveManager.pendingEarlyCallBonus);
        else if (this.waveManager.phase === 'allWavesComplete') {
          this.gameOverInfo = { waveReached: this.waveManager.waveIndex + 1, coins: this.coins, victory: true };
          this.phase = 'victory';
        }
      }
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
      if (e.dead || e.kind === 'coin') continue;
      if (detailed) drawEntityDetailed(ctx, this.camera, e, alpha);
      else drawEntity(ctx, this.camera, e, alpha);
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
      weaponLabel: this.activeSlot === 3 ? 'Summon Wand' : this.activeSlot === 1 ? 'Assault Rifle' : 'Pistol',
      ammoText:
        this.activeSlot === 1
          ? this.playerWeaponState.reloading
            ? 'Reloading...'
            : `${this.playerWeaponState.rifleAmmo}/${rifleMagazine(this.shopLevels)}`
          : this.activeSlot === 2
            ? 'unlimited'
            : 'Left-click to summon',
      summonCooldownRemaining: this.summonCooldownRemaining,
      summonCooldownTotal: summonCooldownSeconds(this.shopLevels),
      summonMaxAlive: summonMaxAlive(this.shopLevels),
      summonAliveCount: this.entities.filter((e) => e.kind === 'ally' && e.summonedByPlayer && !e.dead).length,
      coins: this.coins,
      waveNumber: this.waveManager.waveIndex + 1,
      totalWaves: 5,
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
    };
    drawHud(ctx, w, h, hudData);
    drawMinimap(
      ctx,
      w,
      this.player.x,
      this.player.y,
      this.obstacles,
      this.entities.filter((e) => e.kind === 'enemy' && !e.dead).map((e) => ({ x: e.x, y: e.y, isBoss: !!e.isBoss })),
      this.spawnDirector.bossWarningActive,
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
        aliveCap: SPAWN_DIRECTOR.aliveCap,
        waveTimeRemaining: this.waveManager.phase === 'running' ? this.waveManager.timeRemaining : 0,
        history: this.rateHistory,
        activeSpawnPointId: snap.activeSpawnPointId,
        clumpProgress: snap.clumpProgress,
        clumpTarget: snap.clumpTarget,
        pauseTimer: snap.pauseTimer,
      };
      drawSpawnReadout(ctx, w, readout);
    }

    if (this.phase === 'shop') {
      this.shopPanel.updateHover(this.input.mouseX, this.input.mouseY, w, h);
      this.shopPanel.draw(ctx, w, h, this.coins, this.shopLevels);
    }

    if (this.phase === 'gameover' || this.phase === 'victory') {
      this.drawGameOverScreen();
    }

    this.lastRenderMs = performance.now() - t0;
  }

  private drawGameOverScreen(): void {
    const ctx = this.ctx;
    const w = this.camera.screenWidth;
    const h = this.camera.screenHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    const info = this.gameOverInfo;
    ctx.fillText(info?.victory ? 'PROTOTYPE COMPLETE' : 'GAME OVER', w / 2, h / 2 - 60);
    ctx.font = '18px sans-serif';
    ctx.fillText(`Wave reached: ${info?.waveReached ?? 1}`, w / 2, h / 2 - 10);
    ctx.fillText(`Coins collected: ${info?.coins ?? 0}`, w / 2, h / 2 + 16);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#9fd3ff';
    ctx.fillText('Press R to restart', w / 2, h / 2 + 56);
    ctx.textAlign = 'left';
  }
}
