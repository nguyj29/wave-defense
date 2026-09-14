// ============================================================================
// config.ts — every tunable number in the game lives here. No magic numbers
// in behavior/render code; if you're tempted to write a literal in a system
// file, it probably belongs in this file instead.
// ============================================================================

export const WORLD = {
  // Round 9 (post-launch, see DECISIONS.md): halved from 4800x4800 — the map
  // was reported too big. A clean 0.5x linear scale (0.25x area), so every
  // *proportional* geometry constant below is just the old value / 2, same
  // methodology as round 5's 1.5x bump the other direction.
  width: 2400,
  height: 2400,
  seed: 1337, // seeded RNG so obstacle layout is reproducible while tuning
  // Round 9: shrunk from 40 to 16 — the map is 4x smaller in area now, so a
  // measured Node-harness recompute (same methodology as round 5's
  // before/after table, run against the real FlowField class and the real
  // round-9 obstacle count) showed every candidate down to 8 comfortably
  // one-time-cost territory (worst observed: ~60ms at cellSize 8, ~13-60ms
  // at 16) — nothing here forced a particular choice on perf grounds alone,
  // unlike round 5's original bump. 16 was picked as a genuinely finer grid
  // than the old 40 (more than round 5's own cellSize/worldSize ratio would
  // give, which'd be 20) without going so fine it stops being a "one-time
  // load cost" by feel. See DECISIONS.md for the full measured table AND a
  // real bug this measurement uncovered (world/flowfield.ts's `dist` array
  // — fixed here, not merely worked around by a larger cellSize).
  cellSize: 16,
};

export const OBSTACLES = {
  // Round 9 (post-launch map-halving, see DECISIONS.md): recalculated by
  // Monte Carlo measuring the actual fraction of the map that
  // world/obstacles.ts::validPlacement() accepts, before vs. after halving —
  // NOT a plain area ratio, because the road grid and base-wall pen keep
  // their *absolute* thickness/gap-width (a chokepoint is a chokepoint
  // regardless of map size — see BASE/ROAD_GRID below) while the map itself
  // shrinks around them, so those fixed-width features eat a much bigger
  // relative share of the smaller map. Measured placeable-area ratio (new
  // config / old config) ≈ 0.156, applied to both counts so the *placed*
  // obstacle density per unit of actually-usable ground stays the same as
  // before the resize rather than the map reading emptier OR absurdly denser
  // for its size. treeCount 150->23, rockCountMin 54->8 (round(150*0.156),
  // round(54*0.156)).
  treeCount: 23,
  treeRadius: 18,
  rockCountMin: 8, // still enough cover in the blocks for archer-kiting
  rockRadius: [24, 40] as [number, number],
  rockVertsRange: [6, 9] as [number, number],
  // Round 9: patchCount scaled by the same 0.156 placeable-area ratio as the
  // obstacle counts (26 -> 4) — with only ~31 total obstacles now, 26
  // separate clumps would mean under 2 obstacles per patch on average,
  // barely reading as "clumps" at all; 4 patches absorbing ~80% of a much
  // smaller obstacle pool (scatterFraction unchanged) still gives a few
  // real, visible clumps rather than a diffuse sprinkle across all 36 (now
  // much smaller) blocks. patchRadius shrunk 260 -> 100, sized the same way
  // round 7 sized it originally: comfortably inside one grid block's
  // interior, which is now ROAD_GRID.spacing - ROAD_GRID.width = 400 - 160 =
  // 240 units across (vs. the old 640) since ROAD_GRID.width is a fixed
  // absolute "road footprint" that did NOT shrink with the map (see
  // ROAD_GRID below) — the interior shrank by more than the map's own 0.5x
  // linear factor as a direct consequence.
  patchCount: 4,
  patchRadius: 100,
  // Unchanged — a fraction, not a size/count, and not dependent on map
  // scale; kept at round 7's value since nothing about *why* 0.2 was chosen
  // (natural block-to-block visual separation vs. polka-dot scatter)
  // depends on how big the map is.
  scatterFraction: 0.2,
};

export const CORE = {
  // Bottom-middle of the world (see DECISIONS.md for the map redesign
  // rationale) — same edge margin (220) the corner base used, and NOT scaled
  // by round 9's map-halving: this is the same absolute-vs-proportional call
  // round 5 already made when the world went 3200->4800 (edge margin stayed
  // 220 then too) — it's a fixed "how far the core sits from the wall/edge"
  // gameplay distance, not a fraction of the world's overall size.
  x: WORLD.width / 2,
  y: WORLD.height - 220,
  radius: 60,
  maxHp: 1000,
  hpPerLevel: 150,
  color: '#3b6fe0', // strong medium blue — reads clearly against forest green
};

export const BASE = {
  // A wall "pen" around the base: one wall running east-west north of the
  // core (three gaps, one per active spawn lane) plus two side walls running
  // south from its ends down to the world edge, closing off flanking. See
  // world/map.ts for the derived geometry and DECISIONS.md for why.
  //
  // Round 9 (post-launch map-halving): wallThickness and gapWidth are
  // DELIBERATELY left unchanged below — they're absolute, gameplay-tuned
  // choke-point dimensions ("how wide is the doorway the horde funnels
  // through"), not a fraction of the world's size. A 120-unit gap is still a
  // reasonable choke width regardless of whether the map around it is
  // 4800 or 2400 units across; halving it purely because the map halved
  // would have made the chokepoint narrower for no gameplay reason. Every
  // *position* below (wallSetback/wallHalfSpan/gapOffsets), by contrast, IS
  // proportional to world size (how far the wall sits from the core, how
  // wide a span it covers) and is halved exactly like round 5 halved-the-
  // other-way (1.5x) when the world went 3200->4800.
  wallThickness: 24,
  gapWidth: 120,
  // The north wall sits this far "in front of" (north of) the core. Scaled
  // 0.5x alongside round 9's world-size halving (was 1.5x'd the other way in
  // round 5 — see DECISIONS.md for both).
  wallSetback: 195,
  // The north wall spans CORE.x -/+ wallHalfSpan; side walls drop straight
  // down from its two ends to the world's south edge. Scaled 0.5x.
  wallHalfSpan: 562.5,
  // Gap centers, as offsets from CORE.x — one per active spawn point
  // (top-left / top-middle / top-right), in that order. Scaled 0.5x.
  gapOffsets: [-300, 0, 300] as number[],
  spawnerRadius: 24,
  spawnerCount: 2,
  spawnerOutputBase: 0.1, // spawns/s == 1 per 10s
  spawnerOutputPerLevel: 0.2,
  spawnerCapacityBase: 4,
  spawnerCapacityPerLevel: 1,
  allyStrengthHpPerLevel: 5,
  allyStrengthDmgPerLevel: 2,
};

export const SHOP = {
  marker: { x: CORE.x + 160, y: CORE.y - 70, radius: 20 },
  interactRadius: 100,
};

// Round 7: the maze-style per-spawn-point lane system (LANE_SEGMENTS /
// LANE_MAZE / buildLanePath) is REPLACED entirely by a uniform, map-wide
// grid of roads — evenly spaced horizontal/vertical concrete strips, like
// city blocks, with forest filling each block's interior. See world/map.ts
// (ROAD_LINES) and DECISIONS.md round 7 for the spacing/width rationale.
//
// Round 9 (post-launch map-halving): `spacing` is scaled 0.5x (800 -> 400)
// alongside the world halving, specifically to PRESERVE the same 5-lines-
// per-axis/36-blocks-total grid shape round 7 designed — spacing=400 on the
// 2400x2400 world places grid lines at 400/800/1200/1600/2000, and 1200 is
// still both a grid line AND CORE.x (WORLD.width/2), so the base's spawn
// lane still lines up with the grid automatically, exactly as before. A
// smaller number of blocks (e.g. leaving spacing at 800, which would only
// fit 2 lines/4 blocks on a 2400 map) would have made the map read as one
// giant block instead of a city grid — scaling spacing down avoids that.
//
// `width` is DELIBERATELY left unchanged (160): like BASE.wallThickness/
// gapWidth above, a road's physical width is an absolute, gameplay-tuned
// footprint ("how wide is the strip you walk down"), not a fraction of the
// world's size — halving it just because the map halved would make every
// road an oddly thin sliver for no gameplay reason. This does mean each
// block's *interior* (spacing - width) shrinks by more than the map's own
// 0.5x linear factor (640 -> 240, not 320) — accounted for explicitly in
// OBSTACLES.patchRadius above.
export const ROAD_GRID = {
  spacing: 400,
  width: 160,
};

export const PLAYER = {
  // Round 7: bumped from 14 — the player and archer were both reading small
  // next to grunt (14) and boss (45); see DECISIONS.md for the exact
  // before/after numbers and why nothing else needed a code change (every
  // consumer — collision, barrel-line length, muzzle offsets — already
  // reads `e.radius`/`PLAYER.radius` live rather than hardcoding 14).
  radius: 20,
  maxHp: 100,
  regenRate: 3, // hp/s
  regenDelay: 4, // seconds after last damage before regen starts
  speed: 200,
  accelTime: 0.1, // seconds to reach top speed
  iframeDuration: 0.3,
  barrelLength: 22,
};

export const CAMERA = {
  lerpPerSecond: 10,
  zoomMin: 0.5,
  zoomMax: 2.0,
  zoomDefault: 1.0,
  zoomStep: 0.001, // per wheel-delta unit, tuned in input handling
  baseViewWidth: 1600,
  baseViewHeight: 900,
};

// ---------------------------------------------------------------------------
// Weapons — fully data-driven. Adding a weapon = adding an entry here plus a
// key binding; no base-class changes required.
// ---------------------------------------------------------------------------
export interface WeaponDef {
  key: string;
  name: string;
  damageBase: number;
  damagePerLevel: number;
  fireRateBase: number; // shots/s
  fireRatePerLevel: number;
  range: number;
  spreadDeg: number;
  bulletSpeed: number;
  magazineBase?: number;
  magazinePerLevel?: number;
  reloadTime?: number;
  infiniteAmmo?: boolean;
  // Recoil "game feel" (see RECOIL below for the shared decay rate): world
  // units of camera kick and of visual barrel pullback per shot, scaled by
  // weapon so the rifle kicks noticeably more than the pistol.
  recoilCamera: number;
  recoilBarrel: number;
  // Phase 2 (full-game): weapon "kind" dispatches how updatePlayerWeapon
  // resolves an attack — 'gun' (default, unset) fires a normal projectile
  // exactly like the prototype's rifle/pistol; 'melee' sweeps a cone in
  // front of the player (macer); 'thrown' lobs an arcing AoE reusing the
  // same Game.fireballs/burning-ground pipeline built for the fire mage in
  // Phase 1 (bomber class's grenade) — see combat/playerWeapons.ts.
  kind?: 'gun' | 'melee' | 'thrown';
  meleeArcDeg?: number; // 'melee' only: full cone width
  blastRadius?: number; // 'thrown' only: AoE impact radius
  enemyFalloff?: number; // 'thrown' only: fraction of damage dealt to the thrower's OWN faction caught in the blast (the thrower itself is always excluded — see DECISIONS.md)
}

export const WEAPONS: Record<'rifle' | 'pistol' | 'mace' | 'grenade', WeaponDef> = {
  rifle: {
    key: '1',
    name: 'Assault Rifle',
    damageBase: 8,
    damagePerLevel: 2,
    fireRateBase: 10,
    fireRatePerLevel: 0,
    // Raised from 600 so the rifle comfortably outranges one full 1x-zoom
    // screen width (CAMERA.baseViewWidth = 1600) as the long-range option —
    // see DECISIONS.md.
    range: 1800,
    spreadDeg: 3,
    bulletSpeed: 900,
    magazineBase: 30,
    magazinePerLevel: 10,
    reloadTime: 1.5,
    // Reduced to ~1/3 of the original 14/10 (see DECISIONS.md round 5): the
    // rifle's rapid fire rate (10 shots/s) compounds recoil far faster than
    // the pistol's, so it gets the larger reduction of the two to keep
    // sustained fire from feeling like uncontrollable screen-shake.
    recoilCamera: 4.7,
    recoilBarrel: 3.3,
  },
  pistol: {
    key: '2',
    name: 'Pistol',
    damageBase: 12,
    damagePerLevel: 4,
    fireRateBase: 3,
    fireRatePerLevel: 0.5,
    // Kept short relative to the rifle so it stays the clear close-range/
    // backup weapon (see DECISIONS.md).
    range: 500,
    spreadDeg: 0,
    bulletSpeed: 900,
    infiniteAmmo: true,
    // Reduced to 1/2 of the original 6/5 (see DECISIONS.md round 5): the
    // pistol fires single, slower shots (3/s base), so compounding is much
    // less of an issue than the rifle's — a milder cut keeps its kick still
    // felt without needing the rifle's steeper reduction.
    recoilCamera: 3,
    recoilBarrel: 2.5,
  },
  // Macer's melee weapon (Phase 2): a short-range cone sweep in front of the
  // player, high per-hit damage, no ammo. See combat/playerWeapons.ts.
  mace: {
    key: '1',
    name: 'Mace',
    damageBase: 26,
    damagePerLevel: 5,
    fireRateBase: 1.6, // swings/s
    fireRatePerLevel: 0,
    range: 90, // melee cone radius from the player
    spreadDeg: 0,
    bulletSpeed: 0, // unused for melee
    infiniteAmmo: true,
    recoilCamera: 2,
    recoilBarrel: 6, // a bigger barrel-pullback-style "windup" read even though it's not a real barrel
    kind: 'melee',
    meleeArcDeg: 110,
  },
  // Bomber class's thrown weapon (Phase 2): lobs to the mouse position (or
  // this weapon's max range along the aim line, whichever is closer),
  // exploding in `blastRadius` on arrival and leaving no burning ground
  // (reuses the same Game.fireballs pipeline built for the Phase 1 fire
  // mage, with burnDuration 0). See combat/playerWeapons.ts.
  grenade: {
    key: '1',
    name: 'Grenade Launcher',
    damageBase: 45,
    damagePerLevel: 8,
    fireRateBase: 0.9, // one throw per ~1.1s
    fireRatePerLevel: 0,
    range: 550,
    spreadDeg: 0,
    bulletSpeed: 420,
    infiniteAmmo: true,
    recoilCamera: 5,
    recoilBarrel: 4,
    kind: 'thrown',
    blastRadius: 110,
    // Deliberately gentler than the enemy bomber's 35% (a judgment call —
    // see DECISIONS.md): a player's own grenade splashing allies is
    // annoying but shouldn't be as punishing as an enemy's intentional
    // chain-detonation mechanic. The thrower itself is always excluded
    // entirely, regardless of this value.
    enemyFalloff: 0.2,
  },
};

// Shared recoil decay: after a shot kicks the camera/barrel to full strength,
// it eases back to neutral at this rate (exponential decay, so the same
// every time — deterministic "game feel" polish, not screen-wide jitter).
export const RECOIL = {
  decayPerSecond: 16,
};

// ---------------------------------------------------------------------------
// Player classes (Phase 2, full-game) — chosen on the start screen alongside
// difficulty, persists across resets exactly like `difficulty` does. Each
// class binds a distinct slot-1 weapon (see game.ts::classSlot1Weapon) and
// applies a stat multiplier plus one passive effect, implemented at the
// specific call sites named below rather than as a generic "modifier
// system" (four classes with four different, very specific passives didn't
// seem to earn a whole rules-engine abstraction yet — see DECISIONS.md).
// ---------------------------------------------------------------------------
export type PlayerClassId = 'assault' | 'bomber' | 'macer' | 'summoner';

export interface PlayerClassDef {
  id: PlayerClassId;
  label: string;
  color: string;
  textColor: string;
  hpMult: number;
  speedMult: number;
  description: string;
  passiveDescription: string;
  // Passive numeric hooks — applied at their specific call sites (see the
  // comment above): assault's reload speed (combat/playerWeapons.ts),
  // macer's on-hit self-heal (combat/playerWeapons.ts), summoner's
  // summon-count/cap/cooldown multipliers (game.ts::trySummon). Bomber's
  // passive ("immune to own grenade blast") needs no numeric hook — the
  // thrower is unconditionally excluded from its own grenade's blast
  // regardless of class, see WEAPONS.grenade's doc comment.
  reloadTimeMult: number;
  summonStatMult: number;
  meleeSelfHealPerHit: number;
}

export const PLAYER_CLASSES: Record<PlayerClassId, PlayerClassDef> = {
  assault: {
    id: 'assault',
    label: 'Assault',
    color: '#5ec9ff',
    textColor: '#031017',
    hpMult: 1.0,
    speedMult: 1.0,
    description: 'Rifle + pistol. The balanced, default kit.',
    passiveDescription: 'Reloads 20% faster.',
    reloadTimeMult: 0.8,
    summonStatMult: 1.0,
    meleeSelfHealPerHit: 0,
  },
  bomber: {
    id: 'bomber',
    label: 'Bomber',
    color: '#ff9d3d',
    textColor: '#1a0d00',
    hpMult: 0.9,
    speedMult: 0.95,
    description: 'Lobs grenades that explode in an AoE.',
    passiveDescription: 'Immune to its own grenade blast.',
    reloadTimeMult: 1.0,
    summonStatMult: 1.0,
    meleeSelfHealPerHit: 0,
  },
  macer: {
    id: 'macer',
    label: 'Macer',
    color: '#c9a3ff',
    textColor: '#160a26',
    hpMult: 1.3,
    speedMult: 0.9,
    description: 'A heavy melee cone sweep, high HP and damage up close.',
    passiveDescription: 'Heals a little HP on every mace hit.',
    reloadTimeMult: 1.0,
    summonStatMult: 1.0,
    meleeSelfHealPerHit: 2,
  },
  summoner: {
    id: 'summoner',
    label: 'Summoner',
    color: '#7CFC00',
    textColor: '#0a1a00',
    hpMult: 0.85,
    speedMult: 1.0,
    description: 'Weaker personally, commands more and stronger allies.',
    passiveDescription: '+50% summon count/cap, faster summon recharge.',
    reloadTimeMult: 1.0,
    summonStatMult: 1.5,
    meleeSelfHealPerHit: 0,
  },
};

export const SUMMON = {
  key: '3',
  countBase: 3,
  countPerLevel: 1,
  cooldownRateBase: 0.05, // casts/s == 20s cooldown, reciprocal rule
  cooldownRatePerLevel: 0.0075,
  maxAliveBase: 6,
  maxAlivePerLevel: 2,
  allyHpBase: 70,
  allyHpPerLevel: 15,
  allyRegenRate: 2, // always-on
  summonRadiusScatter: 40,
};

// ---------------------------------------------------------------------------
// Allies (spawner-made baseline stats; player-summoned override hp/regen)
// ---------------------------------------------------------------------------
export const ALLY = {
  radius: 12,
  speed: 200,
  hpBase: 50,
  meleeDamage: 10,
  meleeRate: 1, // hits/s
  regenRate: 1, // always-on
  // Engagement/detection range — named to match ENEMIES[x].aggroRadius so
  // the concept is consistent across factions (see entities/types.ts,
  // Entity.aggroRadius, which both factions now populate).
  aggroRadius: 700,
  // Idle behavior (no enemy in range): biased Brownian motion instead of a
  // hard leash-radius beeline/idle split — see DECISIONS.md round 5 and
  // entities/behaviors/ally.ts. Each tick the idle velocity gets a small
  // random nudge, is clamped to idleMaxSpeed, and has a small constant
  // homeward bias added so allies net-drift toward CORE over time without
  // ever computing a direct "walk to base" vector.
  idleMaxSpeed: 70, // clamp on the wander velocity's magnitude, units/s
  idleRandomAccel: 260, // units/s^2 of random-direction accel applied to idle velocity each tick
  idleHomeBiasAccel: 14, // units/s^2 of constant accel toward CORE while inside idleSoftBoundRadius
  // Soft outer bound: beyond this distance from CORE, the homeward bias
  // strength scales up (see idleHomeBiasBoostPerUnit) instead of snapping to
  // a hard "return to base" mode, so an ally that has wandered far still
  // reads as biased-wandering-home rather than beelining.
  idleSoftBoundRadius: 900,
  idleHomeBiasBoostPerUnit: 0.05, // extra bias-accel multiplier per unit of distance past idleSoftBoundRadius
  color: '#3fa9f5',
};

// ---------------------------------------------------------------------------
// Shared movement steering noise: a small, slowly-drifting per-entity angle
// offset applied to "move directly toward a distant target/core" vectors
// (enemy chase/toCore, ally advance) so multiple units converging on the
// same point fan out a little instead of forming a single-file line. See
// entities/movement.ts::applySteeringNoise and DECISIONS.md round 5.
// ---------------------------------------------------------------------------
export const STEER_NOISE = {
  maxAngleDeg: 16, // clamp on the noise angle offset, degrees
  changeRatePerSecond: 0.6, // how fast the smoothed random walk on the angle can move, radians/s at full swing
};

// ---------------------------------------------------------------------------
// Generations (full-game Phase 1) — enemies come in 7 generations mapped to
// the rainbow, violet (weakest) -> red (endgame). A generation is a
// multiplier applied to a base archetype's generation-0 stats, NOT a
// separate enemy: see entities/factory.ts (stat scaling, done by the
// caller in game.ts) and render/colorUtils.ts (hue-by-generation, the only
// visual signal — silhouette/shape carries archetype identity).
// ---------------------------------------------------------------------------
export const GENERATION = {
  count: 7, // 0..6
  // HP/damage scale steeply (~11x violet->red); speed only gently (~1.4x
  // violet->red) — an enemy that scales speed at the same rate as HP becomes
  // impossible to kite and every archetype starts playing the same, so speed
  // gets its own, far shallower, exponent base. Coins scale a little behind
  // power (1.35 vs 1.5) so later waves are richer without breaking the
  // early-game economy's relative weight.
  hpDmgExponentBase: 1.5,
  speedExponentBase: 1.06,
  coinExponentBase: 1.35,
  wavesPerGeneration: 4, // g = floor((wave-1)/wavesPerGeneration), capped at count-1
  // From this wave on, spawns mix ~70% current generation / ~30% one
  // generation below (chaff) rather than 100% current generation — see
  // pickSpawnGeneration() below.
  mixFromWave: 9,
  mixCurrentFraction: 0.7,
};

export interface GenerationScale {
  hpDmg: number;
  speed: number;
  coin: number;
}

export function generationScale(g: number): GenerationScale {
  const gg = Math.max(0, g);
  return {
    hpDmg: Math.pow(GENERATION.hpDmgExponentBase, gg),
    speed: Math.pow(GENERATION.speedExponentBase, gg),
    coin: Math.pow(GENERATION.coinExponentBase, gg),
  };
}

/**
 * Generation for a given 1-based wave number, min(floor((wave-1)/4), 6).
 * `offset` lets a caller request a generation above/below that baseline
 * without touching this function — Phase 3's bosses (always one generation
 * above their wave) will call `generationForWave(wave, 1)`; this parameter
 * exists from Phase 1 on for exactly that future use, and is already used
 * below by pickSpawnGeneration()'s isBoss path.
 */
export function generationForWave(wave: number, offset = 0): number {
  const base = Math.min(Math.floor((wave - 1) / GENERATION.wavesPerGeneration), GENERATION.count - 1);
  return Math.max(0, Math.min(GENERATION.count - 1, base + offset));
}

/**
 * The generation to actually use for one spawned enemy: from
 * GENERATION.mixFromWave on, a non-boss spawn rolls ~mixCurrentFraction for
 * the wave's baseline generation and the rest for one generation below (as
 * chaff, so a late wave reads as a mixed crowd with priorities rather than a
 * uniform wall of identical enemies) — see DECISIONS.md. Bosses always use
 * the wave's baseline generation + 1 and are never mixed down.
 */
export function pickSpawnGeneration(waveNumber: number, isBoss = false): number {
  if (isBoss) return generationForWave(waveNumber, 1);
  const baseGen = generationForWave(waveNumber);
  if (waveNumber < GENERATION.mixFromWave) return baseGen;
  return Math.random() < GENERATION.mixCurrentFraction ? baseGen : Math.max(0, baseGen - 1);
}

// ---------------------------------------------------------------------------
// Enemy archetypes — data-driven. New archetype = config entry + behavior key.
// Every stat below is the archetype's GENERATION-0 (violet) baseline; actual
// spawned stats are `baseline * generationScale(g).*` (composed with
// difficulty/endless multipliers exactly as before) — see
// game.ts::spawnEnemyFromRequest, the single place all of this scaling is
// composed together.
//
// All archetypes share four conceptual fields per the brief: `aggroRadius`
// (aggro range), an attack range (melee contact / ranged.range /
// fireMage.range — archetype-specific, not duplicated as a separate generic
// field to avoid two sources of truth), an anchor behavior (`toCore` for
// every combat archetype, `behindHorde` for the healer, driving
// entities/behaviors/healer.ts's positioning heuristic), and a leash radius.
// `leashRadius` below is METADATA ONLY in Phase 1 — no archetype currently
// returns to an anchor point once it commits to a target (the prototype's
// existing "divert to attack, resume toward core after" IS the closest thing
// to a leash and already works via aggroRadius); a real "give up and
// return" leash behavior is not yet implemented and is flagged here for a
// later phase if it turns out to be needed. See DECISIONS.md.
// ---------------------------------------------------------------------------
export interface EnemyDef {
  key: string;
  shape: 'circle' | 'triangle' | 'hexagon' | 'square' | 'chevron' | 'diamond' | 'concaveQuad' | 'squatSquare';
  color: string;
  radius: number;
  hp: number;
  speed: number;
  meleeDamage: number;
  meleeRate: number;
  aggroRadius: number;
  anchor: 'core' | 'behindHorde';
  leashRadius: number; // metadata only for now — see comment above
  coinsMin: number;
  coinsMax: number;
  behavior: 'melee' | 'kiter' | 'healer' | 'fireMage'; // behavior key, see entities/behaviors/enemy.ts
  ranged?: {
    damage: number;
    rate: number; // shots/s
    projectileSpeed: number;
    range: number;
    kiteDistance: number;
  };
  bomber?: {
    fuseSec: number;
    detonationDamage: number;
    detonationRadius: number;
    enemyFalloff: number;
  };
  healer?: {
    healRadius: number;
    healRate: number;
  };
  fireMage?: {
    range: number;
    projectileSpeed: number;
    rate: number;
    damage: number;
    impactRadius: number;
    burnDuration: number;
    burnDps: number;
    burnRadius: number;
    enemyFalloff: number;
  };
  isBoss?: boolean;
  // Phase 3: any number of special abilities a boss cycles through
  // independent of its normal melee/ranged attack — see game.ts's central
  // boss-ability tick (mirrors the Phase 1 bomber-fuse pattern: driven
  // outside AI behavior code so it's easy to reason about/extend per boss).
  bossAbilities?: BossAbilityDef[];
}

// Phase 3 boss special abilities — one config shape covering all 5 bosses'
// mechanics, dispatched by `type` in game.ts's central tick
// (Game.updateBossAbilities). Added as a list (not a single ability) so the
// wave-25 final boss can combine more than one (see ENEMIES.bossApex).
export interface BossAbilityDef {
  type: 'slam' | 'summonAdds' | 'burnPulse' | 'enrageAtLowHp';
  cooldown: number; // seconds between uses; ignored for 'enrageAtLowHp' (a one-time threshold trigger, not a repeating cooldown)
  // 'slam': an instant faction-aware AoE centered on the boss (reuses
  // combat/areaDamage.ts, same as bomber/fire-mage).
  damage?: number;
  radius?: number;
  // 'summonAdds': spawns reinforcements at the boss's position.
  summonCount?: number;
  summonArchetype?: EnemyArchetypeId;
  // 'burnPulse': drops a burning-ground zone under the boss (reuses
  // Game.groundEffects, same mechanic as the fire mage's burning ground).
  burnDuration?: number;
  burnDps?: number;
  burnRadius?: number;
  // 'enrageAtLowHp': permanent speed/damage buff once HP drops below the
  // threshold fraction of max HP.
  hpThresholdFraction?: number;
  speedMult?: number;
  dmgMult?: number;
}

export type EnemyArchetypeId =
  | 'grunt'
  | 'archer'
  | 'rusher'
  | 'bomber'
  | 'healer'
  | 'fireMage'
  | 'boss'
  | 'bossSiege'
  | 'bossSummoner'
  | 'bossInferno'
  | 'bossApex';

// Shared faction-aware-area-damage falloff for bomber detonation / fire-mage
// burning ground: "friendly fire" among enemies is intentional and identical
// for both mechanics, so they share this one constant rather than each
// picking their own number — see combat/areaDamage.ts.
const ENEMY_AOE_FALLOFF = 0.35;

// All archetypes seed `color` as a violet (hue ~270, matching generation 0)
// with a slightly different saturation/lightness each — the hue itself gets
// completely overwritten by render/colorUtils.ts::applyGenerationHue at
// spawn time, so archetypes read as visually distinct only via shape (as
// intended: "silhouette carries archetype, hue carries generation"), while
// still having a sensible, non-identical base color if that hue-shift is
// ever bypassed (e.g. a debug tool rendering ENEMIES[...] directly).
export const ENEMIES: Record<EnemyArchetypeId, EnemyDef> = {
  grunt: {
    key: 'grunt',
    shape: 'circle',
    color: '#8f00ff',
    radius: 14,
    hp: 30,
    speed: 90,
    meleeDamage: 8,
    meleeRate: 1,
    aggroRadius: 150,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 1,
    coinsMax: 2,
    behavior: 'melee',
  },
  archer: {
    key: 'archer',
    shape: 'triangle',
    color: '#8a3bd6',
    // Round 7: bumped from 13, alongside the player radius bump — see
    // DECISIONS.md. Same reasoning: every consumer reads e.radius live, so
    // this is a pure data change.
    radius: 19,
    hp: 24,
    speed: 80,
    meleeDamage: 0,
    meleeRate: 0,
    // Bumped from 450 to match the full-game brief's archer table (range 500,
    // aggro 500) when generalizing archer into the archetype+generation
    // system — see DECISIONS.md.
    aggroRadius: 500,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 2,
    coinsMax: 3,
    behavior: 'kiter',
    ranged: {
      damage: 10,
      rate: 0.5, // one shot per 2s
      projectileSpeed: 500,
      range: 500,
      kiteDistance: 350,
    },
  },
  // Rusher: beelines the core and largely ignores everything else — a tiny
  // aggro radius plus the existing 'melee' behavior (which already falls
  // back to a core-beeline whenever nothing is within aggroRadius) gives
  // exactly this without needing a new behavior implementation. High speed,
  // low HP: it's meant to arrive early and punish a player who's drifted
  // from the base, not to fight.
  rusher: {
    key: 'rusher',
    shape: 'chevron',
    color: '#b366ff',
    radius: 13,
    hp: 18,
    speed: 180,
    meleeDamage: 12,
    meleeRate: 1,
    aggroRadius: 120,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 2,
    coinsMax: 3,
    behavior: 'melee',
  },
  // Bomber: slow, tanky, harmless until damaged. Also uses 'melee' behavior
  // for movement (approach core/player, stand at contact range) — it simply
  // has no melee component attached (meleeDamage: 0) so it never actually
  // hits anything; its real "attack" (the fuse/detonation state machine) is
  // driven centrally every tick in game.ts (see BomberAttack on Entity),
  // because it must keep ticking even after the bomber itself has died.
  bomber: {
    key: 'bomber',
    shape: 'squatSquare',
    color: '#7a1fd9',
    radius: 20,
    hp: 60,
    speed: 55,
    meleeDamage: 0,
    meleeRate: 0,
    // Not specified by the brief; picked moderate — close enough to matter,
    // not so close it never gets a chance to be shot mid-crowd before
    // reaching melee range. Flagged as a likely rebalance candidate.
    aggroRadius: 200,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 4,
    coinsMax: 5,
    behavior: 'melee',
    bomber: {
      fuseSec: 3,
      detonationDamage: 60,
      detonationRadius: 140,
      enemyFalloff: ENEMY_AOE_FALLOFF,
    },
  },
  // Healer: hangs back behind the horde, heals nearby enemies (never
  // itself), flees when threatened. See entities/behaviors/healer.ts.
  healer: {
    key: 'healer',
    shape: 'diamond',
    color: '#c9a3ff',
    radius: 15,
    hp: 30,
    speed: 85,
    meleeDamage: 0,
    meleeRate: 0,
    // Used by updateHealer as the "am I being personally targeted" flee
    // trigger radius (a player/ally this close counts as an aggressor even
    // without a discrete recent-hit event) — see DECISIONS.md.
    aggroRadius: 220,
    anchor: 'behindHorde',
    leashRadius: 0,
    coinsMin: 3,
    coinsMax: 4,
    behavior: 'healer',
    healer: {
      healRadius: 250,
      healRate: 6,
    },
  },
  // Fire mage: kites like the archer but lobs an arcing fireball that leaves
  // burning ground — the real weapon is the ground effect (area denial),
  // not the modest direct-impact damage.
  fireMage: {
    key: 'fireMage',
    shape: 'concaveQuad',
    color: '#9d4dff',
    radius: 18,
    hp: 28,
    speed: 75,
    meleeDamage: 0,
    meleeRate: 0,
    aggroRadius: 450,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 3,
    coinsMax: 4,
    behavior: 'fireMage',
    fireMage: {
      range: 450,
      projectileSpeed: 380,
      rate: 0.4, // one cast per 2.5s — slower than the archer, the ground effect does the real work over time
      damage: 20,
      impactRadius: 100,
      burnDuration: 6,
      burnDps: 5,
      burnRadius: 100,
      enemyFalloff: ENEMY_AOE_FALLOFF,
    },
  },
  // Wave 5 boss — "Warlord": a straightforward heavy melee unit, no special
  // ability. The prototype's original boss, kept as the simplest of the 5 —
  // a first boss encounter should teach "big HP bar, hits hard, tank it or
  // kite it," not a mechanic on top of that.
  boss: {
    key: 'boss',
    shape: 'hexagon',
    color: '#7a0dd6',
    radius: 45,
    hp: 1200,
    speed: 70,
    meleeDamage: 25,
    meleeRate: 1,
    aggroRadius: 250,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 25,
    coinsMax: 25,
    behavior: 'melee',
    isBoss: true,
  },
  // Wave 10 boss — "Siegebreaker": a kiter (like the archer, but a boss)
  // that periodically slams the ground in an AoE, punishing melee players
  // who stand and trade rather than respecting its ranged attack.
  bossSiege: {
    key: 'bossSiege',
    shape: 'hexagon',
    color: '#7a0dd6',
    radius: 50,
    hp: 2200,
    speed: 65,
    meleeDamage: 0,
    meleeRate: 0,
    aggroRadius: 550,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 40,
    coinsMax: 40,
    behavior: 'kiter',
    ranged: { damage: 22, rate: 0.6, projectileSpeed: 480, range: 500, kiteDistance: 380 },
    isBoss: true,
    bossAbilities: [{ type: 'slam', cooldown: 6, damage: 35, radius: 160 }],
  },
  // Wave 15 boss — "Summoner" (unrelated to the player's Summoner class):
  // periodically calls in grunt reinforcements at its own position, so the
  // fight is as much about managing adds as damaging the boss itself.
  bossSummoner: {
    key: 'bossSummoner',
    shape: 'hexagon',
    color: '#7a0dd6',
    radius: 48,
    hp: 3200,
    speed: 60,
    meleeDamage: 20,
    meleeRate: 1,
    aggroRadius: 280,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 55,
    coinsMax: 55,
    behavior: 'melee',
    isBoss: true,
    bossAbilities: [{ type: 'summonAdds', cooldown: 8, summonCount: 3, summonArchetype: 'grunt' }],
  },
  // Wave 20 boss — "Inferno": periodically drops a burning-ground pulse
  // under itself (reusing the fire mage's burning-ground mechanic at a
  // bigger radius) — area denial around a melee-range boss, forcing players
  // to fight at its edge and reposition rather than stand still.
  bossInferno: {
    key: 'bossInferno',
    shape: 'hexagon',
    color: '#7a0dd6',
    radius: 50,
    hp: 4600,
    speed: 65,
    meleeDamage: 26,
    meleeRate: 1,
    aggroRadius: 300,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 70,
    coinsMax: 70,
    behavior: 'melee',
    isBoss: true,
    bossAbilities: [{ type: 'burnPulse', cooldown: 7, burnDuration: 4, burnDps: 8, burnRadius: 170 }],
  },
  // Wave 25 boss — "Apex": the final boss, combining two of the previous
  // bosses' mechanics (a slam AND periodic reinforcements) plus a one-time
  // enrage past 40% HP (faster + harder-hitting for the closing stretch of
  // the fight) — deliberately the "everything you've learned, at once"
  // finale rather than a wholly new 4th mechanic.
  bossApex: {
    key: 'bossApex',
    shape: 'hexagon',
    color: '#7a0dd6',
    radius: 55,
    hp: 7000,
    speed: 68,
    meleeDamage: 32,
    meleeRate: 1,
    aggroRadius: 320,
    anchor: 'core',
    leashRadius: 0,
    coinsMin: 100,
    coinsMax: 100,
    behavior: 'melee',
    isBoss: true,
    bossAbilities: [
      { type: 'slam', cooldown: 7, damage: 40, radius: 170 },
      { type: 'summonAdds', cooldown: 10, summonCount: 2, summonArchetype: 'rusher' },
      { type: 'enrageAtLowHp', cooldown: 0, hpThresholdFraction: 0.4, speedMult: 1.3, dmgMult: 1.3 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Waves — pure data. Extending to 25 waves means editing this array only.
// ---------------------------------------------------------------------------
export interface WaveDef {
  wave: number;
  grunts: number;
  archers: number;
  rushers: number;
  bombers: number;
  healers: number;
  fireMages: number;
  boss: number;
  // Phase 3: which boss archetype to actually spawn when `boss > 0` fires —
  // see waves/spawnDirector.ts, which reads this instead of a hardcoded
  // 'boss' kind. Irrelevant (never read) on a wave with boss: 0.
  bossArchetype: EnemyArchetypeId;
  durationSec: number;
  intermissionSec: number;
}

// `durationSec` is designed/calibrated at 180 (see
// WAVE_DESIGN_BASELINE_DURATION_SEC below, and DECISIONS.md) — the shop
// price curve assumes 3-minute waves' worth of coin income per wave.
//
// *** TEMPORARY TESTING VALUE ***: durationSec is currently shortened to 60
// for faster dev iteration (so a full run doesn't take forever). Flip every
// `durationSec: 60` below back to `180` to restore the designed pacing —
// shop prices auto-scale off WAVES via
// `economy/shop.ts::waveDurationScaleFactor()`, so no other change is needed
// when you do. See DECISIONS.md for the scaling rationale.
//
// Phase 3 (full-game): the full 25-wave budget/mix-percentage economy,
// replacing Phase 1's 13-wave placeholder extension. Generated once, at
// module load, by `buildWaveTable()` below from a small set of tunable
// constants (total per-wave budget growth rate, each archetype's target
// mix share once unlocked, boss waves) rather than 25 hand-typed literals —
// still "pure data" from every consumer's point of view (WAVES is a plain
// array; nothing downstream calls the generator), but the growth curve and
// mix shares are each one number to retune instead of 25 rows to
// hand-edit. See DECISIONS.md for the exact numbers and reasoning.
const WAVE_ECONOMY = {
  // Total non-boss enemy budget at wave 1, growing at this rate per wave —
  // deliberately closer to the old endless-mode growthRate (1.12) than a
  // wild curve, so the 25-wave curve reads as "the old endless escalation,
  // but pre-authored and capped at a sane top end" rather than a new shape.
  budgetWave1: 24,
  budgetGrowthPerWave: 1.1,
  budgetCap: 260,
  // Once an archetype is unlocked (introWave reached), it claims this
  // fraction of the wave's total budget; grunt (always unlocked, no
  // introWave) absorbs whatever's left over. Shares intentionally don't sum
  // to 1 on their own — most waves have only some archetypes unlocked, and
  // grunt is the remainder in every case.
  archerIntroWave: 3,
  archerShare: 0.28,
  rusherIntroWave: 6,
  rusherShare: 0.16,
  bomberIntroWave: 9,
  bomberShare: 0.1,
  healerIntroWave: 13,
  healerShare: 0.08,
  fireMageIntroWave: 17,
  fireMageShare: 0.1,
};

const BOSS_WAVES: Partial<Record<number, EnemyArchetypeId>> = {
  5: 'boss',
  10: 'bossSiege',
  15: 'bossSummoner',
  20: 'bossInferno',
  25: 'bossApex',
};

function buildWaveTable(): WaveDef[] {
  const e = WAVE_ECONOMY;
  const waves: WaveDef[] = [];
  for (let wave = 1; wave <= 25; wave++) {
    const budget = Math.min(e.budgetCap, Math.round(e.budgetWave1 * Math.pow(e.budgetGrowthPerWave, wave - 1)));
    let remaining = 1;
    const shareOf = (introWave: number, share: number) => {
      if (wave < introWave) return 0;
      const s = Math.min(share, remaining);
      remaining -= s;
      return s;
    };
    const archerShare = shareOf(e.archerIntroWave, e.archerShare);
    const rusherShare = shareOf(e.rusherIntroWave, e.rusherShare);
    const bomberShare = shareOf(e.bomberIntroWave, e.bomberShare);
    const healerShare = shareOf(e.healerIntroWave, e.healerShare);
    const fireMageShare = shareOf(e.fireMageIntroWave, e.fireMageShare);
    const gruntShare = remaining; // whatever's left, always >= 0 by construction

    const bossArchetype = BOSS_WAVES[wave];
    // *** TEMPORARY TESTING VALUE ***: durationSec/intermissionSec are
    // shortened from the designed 180s/intermission pacing for faster dev
    // iteration across a full 25-wave run — see the comment on
    // WAVE_DESIGN_BASELINE_DURATION_SEC below for how shop prices
    // auto-compensate. Grows mildly by wave tier so later waves (bigger
    // budgets) get a little more time, capped at 150s.
    const durationSec = Math.min(150, 60 + Math.floor((wave - 1) / 4) * 10);

    waves.push({
      wave,
      grunts: Math.round(budget * gruntShare),
      archers: Math.round(budget * archerShare),
      rushers: Math.round(budget * rusherShare),
      bombers: Math.round(budget * bomberShare),
      healers: Math.round(budget * healerShare),
      fireMages: Math.round(budget * fireMageShare),
      boss: bossArchetype ? 1 : 0,
      bossArchetype: bossArchetype ?? 'boss',
      durationSec,
      intermissionSec: 60,
    });
  }
  return waves;
}

export const WAVES: WaveDef[] = buildWaveTable();

// ---------------------------------------------------------------------------
// Endless mode (round 8): waves past WAVES.length (5) don't exist as static
// data — they're synthesized from wave 5's shape by `getWaveDef()` below,
// scaled by `endlessFactor()`. See DECISIONS.md for the exact formula and
// worked examples at waves 10/15/20.
// ---------------------------------------------------------------------------
export const ENDLESS = {
  // Per-wave-past-5 compounding growth rate applied to enemy HP/damage/spawn
  // rate (via endlessFactor). Picked from the middle of the requested
  // 1.08-1.15 band: noticeably harder each wave without spiking absurdly —
  // see DECISIONS.md for waves 10/15/20 worked examples at Normal and Hell.
  growthRate: 1.12,
  // Wave-6+ enemy budget (grunts/archers) grows linearly off wave 5's counts
  // so total spawned enemies keeps rough pace with the shrinking-relative
  // pressure of a flat budget against an ever-rising spawn rate, capped so a
  // very deep endless run doesn't spawn an unbounded number of entities per
  // wave. Boss count is left at wave 5's (1) — the boss's own HP/damage
  // already scale via endlessFactor, a second simultaneous boss is a
  // separate, unrequested design decision.
  budgetGrowthPerWavePastFive: 0.08,
  maxBudgetScale: 3.0,
};

/**
 * Escalating multiplier applied to enemy HP/damage/spawn-rate for endless
 * waves (waveNumber > WAVES.length): `growthRate ^ (waveNumber - 5)`, 1.0 at
 * or before wave 5. Composed multiplicatively with per-difficulty
 * enemyHpMult/enemyDmgMult/spawnRateMult (see spawnEnemyFromRequest in
 * game.ts and SpawnDirector's spawnRateMult), so Hell + a deep endless wave
 * compounds — intentional, see DECISIONS.md.
 */
export function endlessFactor(waveNumber: number): number {
  if (waveNumber <= WAVES.length) return 1.0;
  return Math.pow(ENDLESS.growthRate, waveNumber - WAVES.length);
}

/**
 * Returns the WaveDef for any 1-based wave number, including past
 * WAVES.length: for wave 6+, synthesizes a WaveDef from WAVES' final entry
 * (wave 5) with grunts/archers scaled up by a capped linear factor (boss
 * count and durationSec/intermissionSec left as wave 5's). WAVES itself
 * stays a fixed 5-element array — extending/tuning it is still a pure data
 * edit, per the existing architecture.
 */
export function getWaveDef(waveNumber: number): WaveDef {
  if (waveNumber <= WAVES.length) return WAVES[waveNumber - 1];
  const base = WAVES[WAVES.length - 1];
  const budgetScale = Math.min(
    ENDLESS.maxBudgetScale,
    1 + ENDLESS.budgetGrowthPerWavePastFive * (waveNumber - WAVES.length),
  );
  // Phase 3: endless mode (wave 26+) now synthesizes off wave 25 (WAVES'
  // final entry) instead of wave 5's — its `boss`/`bossArchetype` fields
  // are wave 25's, i.e. the Apex boss, so a deep endless run keeps facing
  // Apex-scaled-up encounters repeatedly rather than reverting to an
  // earlier, easier boss. That's a judgment call carried over unchanged
  // from the prototype's existing pattern (endless always re-fights the
  // LAST authored boss) — see DECISIONS.md.
  return {
    wave: waveNumber,
    grunts: Math.round(base.grunts * budgetScale),
    archers: Math.round(base.archers * budgetScale),
    rushers: Math.round(base.rushers * budgetScale),
    bombers: Math.round(base.bombers * budgetScale),
    healers: Math.round(base.healers * budgetScale),
    fireMages: Math.round(base.fireMages * budgetScale),
    boss: base.boss,
    bossArchetype: base.bossArchetype,
    durationSec: base.durationSec,
    intermissionSec: base.intermissionSec,
  };
}

// The wave duration the shop's price curve was originally calibrated
// against (see DECISIONS.md's coin-yield/gem-chance payoff sections). Used
// by `economy/shop.ts::waveDurationScaleFactor()` to auto-scale prices
// whenever WAVES.durationSec is changed for testing (see the comment above).
export const WAVE_DESIGN_BASELINE_DURATION_SEC = 180;

export const SPAWN_DIRECTOR = {
  // Roughly 2.3x'd both base and max (see DECISIONS.md) — "much higher"
  // spawn density was the explicit ask, and the spatial-grid collision
  // system has headroom well past this at the ~300-entity budget.
  baseRate: 0.35, // spawns/s
  maxRate: 1.8, // spawns/s
  killRateAtMax: 1.2, // kills/s that saturates the rate
  killWindowSec: 10, // rolling window for smoothed kill rate
  rampUpSec: 3,
  rampDownSec: 8,
  aliveCap: 90,
  hysteresis: 0.05, // deadband on normalized kill rate before rate is allowed to move further
  bossBudgetFraction: 0.6, // spawn boss after 60% of budget spawned...
  bossLatestSec: 120, // ...or at 2:00 mark, whichever first
  // Clumped spawning (see DECISIONS.md): spawns discharge from one active
  // spawn point at a time in a burst of clumpSizeMin..clumpSizeMax units,
  // then that spawn point rotates and a pauseMin..pauseMax second gap opens
  // before the next clump starts accumulating. Both ranges are linearly
  // interpolated by the same normalized kill-rate pressure (0..1) that
  // drives currentRate — higher pressure means bigger clumps *and* shorter
  // pauses, so the "cycling clumps" read gets more intense exactly when the
  // adaptive rate would otherwise just spawn faster in a smooth trickle.
  clumpSizeMin: 3,
  clumpSizeMax: 6,
  pauseSecMin: 1, // pause length at max pressure (normalized target == 1)
  pauseSecMax: 3, // pause length at min pressure (normalized target == 0)
};

// ---------------------------------------------------------------------------
// Projectile flight physics — shared by every projectile (bullets & arrows),
// so a shot loses momentum smoothly at max range instead of popping out of
// existence. See combat/projectiles.ts.
// ---------------------------------------------------------------------------
export const PROJECTILE_PHYSICS = {
  // Deceleration begins this fraction of the way through maxRange (i.e. over
  // the final 20% of the shot's travel) and eases the speed down to 0 by the
  // time traveled reaches maxRange.
  decelFractionOfRange: 0.2,
  // Once "stopped", the projectile sits in place and fades out over this
  // many seconds before being removed.
  stopFadeDuration: 0.35,
};

export const EARLY_CALL = {
  bonusPerSecond: 0.004, // +0.4% per second skipped
  maxBonus: 0.25, // capped at +25%
};

export const COINS = {
  pickupRadius: 40,
  magnetRadius: 40, // gems only (round 6): manual walk-up, magnet begins at the same radius as pickup
  // Raised from 400 (round 6): coins now home in on the player unconditionally,
  // from anywhere on the map (see game.ts's coin loop) — at the old speed, a
  // coin dropped far away (e.g. an ally kill on the far side of the map)
  // would take many seconds to visibly arrive, reading as sluggish rather
  // than "snappy magnet." 650 comfortably covers the map's worst-case span
  // (originally ~4800 units; round 9 halved the map to ~2400, so this is now
  // an even faster ~3.7s worst case) — left unchanged since a faster-than-
  // strictly-needed magnet speed isn't a problem, only a slower one is.
  magnetSpeed: 650,
};

// ---------------------------------------------------------------------------
// Gem drops: a rare, flat-value alternative to a coin drop (see DECISIONS.md
// for why the flat coinValue is NOT scaled by coinYieldMultiplier/early-call
// bonuses — gems are a separate "rare drop" mechanic, not part of the base
// economy curve). Picked up identically to coins (same magnet/pickup radius).
// ---------------------------------------------------------------------------
export const GEM = {
  dropChanceBase: 0.05, // 5% base chance any non-boss enemy drops a gem instead of a coin
  dropChanceBoss: 0.2, // 20% for bosses
  coinValue: 10, // flat coin-equivalent value on pickup
  chancePerLevel: 0.05, // +5 percentage points per Gem Chance shop level, additive on top of the base rates
};

// ---------------------------------------------------------------------------
// Shop pricing: price(L) = round(base * L^exponent). Reciprocal rule for all
// cooldown/interval/duration stats: store as a rate, add linearly, invert.
// ---------------------------------------------------------------------------
export interface ShopItemDef {
  id: string;
  tab: 'weapons' | 'base' | 'class';
  label: string;
  base: number;
  exponent: number;
  // Phase 4: a one-time unlock (like an ally type) rather than an
  // indefinitely-purchasable stat level — the shop UI still uses the same
  // level/price machinery (price(1) is simply its one cost), but level is
  // capped at 1 and describe.ts shows "Unlocked"/"Locked" instead of a
  // before/after stat delta.
  oneTimeUnlock?: boolean;
}

export const SHOP_ITEMS: ShopItemDef[] = [
  { id: 'rifleDamage', tab: 'weapons', label: 'Rifle Damage', base: 20, exponent: 0.75 },
  { id: 'rifleMagazine', tab: 'weapons', label: 'Rifle Magazine', base: 18, exponent: 0.75 },
  { id: 'pistolDamage', tab: 'weapons', label: 'Pistol Damage', base: 16, exponent: 0.75 },
  { id: 'pistolFireRate', tab: 'weapons', label: 'Pistol Fire Rate', base: 22, exponent: 0.75 },
  { id: 'summonCount', tab: 'weapons', label: 'Summon Count', base: 30, exponent: 0.75 },
  { id: 'summonRecharge', tab: 'weapons', label: 'Summon Recharge', base: 24, exponent: 0.75 },
  { id: 'summonCap', tab: 'weapons', label: 'Summon Cap', base: 26, exponent: 0.75 },
  { id: 'summonHp', tab: 'weapons', label: 'Summoned Ally HP', base: 18, exponent: 0.75 },
  { id: 'coreHp', tab: 'base', label: 'Core HP', base: 25, exponent: 0.75 },
  { id: 'spawnerOutput', tab: 'base', label: 'Spawner Output', base: 24, exponent: 0.75 },
  { id: 'spawnerCapacity', tab: 'base', label: 'Spawner Capacity', base: 22, exponent: 0.75 },
  { id: 'allyStrength', tab: 'base', label: 'Ally Strength', base: 20, exponent: 0.75 },
  // Gem Chance replaced the old Coin Yield item (see DECISIONS.md) — same
  // "big commitment, pays off over several waves" design intent, so it kept
  // the steeper exponent 1.0 (not the standard 0.75) rather than the
  // standard curve, since a rising gem chance is a compounding-ish income
  // multiplier much like coin yield was.
  //
  // Phase 4: base recalibrated from 20 to 500 against the real 25-wave
  // economy (was tuned only against the prototype's 5-wave one) so its
  // payoff — per the brief's "coin-yield payoff moved to wave 12-18" —
  // actually lands there: level 1 (cost ~240 at the current
  // waveDurationScaleFactor) pays off around wave 12, level 2 (~480) around
  // wave 18. See economy/devReadout.ts::computeGemChancePayoff and
  // DECISIONS.md for the worked numbers.
  { id: 'gemChance', tab: 'base', label: 'Gem Chance', base: 500, exponent: 1.0 },
  // Phase 4: ally-type unlocks (base tab) — one-time purchases that add a
  // new ally archetype to the spawner/summon rotation (see
  // config.ts::ALLY_TYPES, entities/factory.ts, entities/behaviors/ally.ts).
  { id: 'unlockArcherAlly', tab: 'base', label: 'Unlock Archer Ally', base: 220, exponent: 1, oneTimeUnlock: true },
  { id: 'unlockGuardianAlly', tab: 'base', label: 'Unlock Guardian Ally', base: 260, exponent: 1, oneTimeUnlock: true },
  // Phase 4: door HP upgrade — the shop item exists now (per the brief's
  // Phase 4 scope), but doors themselves don't exist as entities until
  // Phase 5 ("doors with HP blocking movement"). Buying levels here is
  // harmless today (nothing reads doorHp yet) and Phase 5's door
  // implementation is expected to call `economy/shop.ts::doorMaxHp(levels)`
  // the same way `coreMaxHp` already works — see DECISIONS.md.
  { id: 'doorHp', tab: 'base', label: 'Door HP', base: 22, exponent: 0.75 },
  // Phase 4: per-class weapon upgrades (Class tab) — mace/grenade had no
  // shop path at all through Phase 2 (deferred explicitly, see that
  // phase's DECISIONS.md entry); rifle/pistol/summon stay on the Weapons
  // tab since every class can reach them (pistol/summon) or they're
  // assault's signature weapon (rifle), whereas these four are each truly
  // one class's own weapon.
  { id: 'maceDamage', tab: 'class', label: 'Mace Damage', base: 22, exponent: 0.75 },
  { id: 'maceSelfHeal', tab: 'class', label: 'Mace Self-Heal', base: 20, exponent: 0.8 },
  { id: 'grenadeDamage', tab: 'class', label: 'Grenade Damage', base: 24, exponent: 0.75 },
  { id: 'grenadeBlastRadius', tab: 'class', label: 'Grenade Blast Radius', base: 20, exponent: 0.8 },
];

// ---------------------------------------------------------------------------
// Ally types (Phase 4) — the always-available 'basic' melee ally (unchanged
// from the prototype) plus two purchasable unlocks. Once unlocked, both
// spawners and the player's own summon cast include the new type(s) in
// their random pick (see entities/spawnerSystem.ts and
// game.ts::trySummon) — a judgment call: rather than a separate "which
// type" UI, unlocking just widens the existing random-ally-spawn pool, so
// the shop stays the only place types are chosen.
// ---------------------------------------------------------------------------
export type AllyTypeId = 'basic' | 'archer' | 'guardian';

export interface AllyTypeDef {
  id: AllyTypeId;
  shape: 'triangle' | 'diamond';
  color: string;
  hpMult: number; // multiplies the caller's base HP (spawner or summon-derived)
  speedMult: number;
  meleeDamageMult: number;
  meleeRateMult: number;
  ranged?: {
    damageMult: number; // relative to the caller's base melee damage, since allies have no separate "base ranged damage" stat today
    rate: number;
    projectileSpeed: number;
    range: number;
    kiteDistance: number;
  };
}

export const ALLY_TYPES: Record<AllyTypeId, AllyTypeDef> = {
  basic: {
    id: 'basic',
    shape: 'triangle',
    color: '#3fa9f5',
    hpMult: 1,
    speedMult: 1,
    meleeDamageMult: 1,
    meleeRateMult: 1,
  },
  // Archer ally: a ranged unit that kites like the enemy archer instead of
  // closing to melee — trades HP/melee damage for standoff range.
  archer: {
    id: 'archer',
    shape: 'triangle',
    color: '#7fd4ff',
    hpMult: 0.75,
    speedMult: 1.0,
    meleeDamageMult: 0, // no melee component attached at all — see factory.ts
    meleeRateMult: 0,
    ranged: { damageMult: 1.4, rate: 0.6, projectileSpeed: 500, range: 420, kiteDistance: 320 },
  },
  // Guardian ally: slow, tanky melee — a frontline body to soak hits rather
  // than a damage source.
  guardian: {
    id: 'guardian',
    shape: 'diamond',
    color: '#2f6fb0',
    hpMult: 2.2,
    speedMult: 0.7,
    meleeDamageMult: 1.3,
    meleeRateMult: 0.85,
  },
};

// ---------------------------------------------------------------------------
// Opt-in risk-for-reward modifier (Phase 4) — separate from, and composed
// multiplicatively with, the main Easy..Hell difficulty selector. Off by
// default; the player toggles it on the start screen (does not change
// mid-run) knowing it makes every wave harder in exchange for more coins —
// a deliberate "I know what I'm doing" lever distinct from picking a harder
// named difficulty tier. See DECISIONS.md for why a single flat toggle was
// chosen over a leveled dial (the brief called for "a separate settable
// value," which a boolean satisfies most simply).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Doors (Phase 5) — geometry lives in world/map.ts::DOOR_RECTS, HP comes
// from economy/shop.ts::doorMaxHp() (Phase 4's doorHp shop item); this is
// just the contact-damage rate.
// ---------------------------------------------------------------------------
export const DOOR = {
  enemyContactDps: 12, // per contacting enemy, so a crowd breaks a door faster than one straggler
};

export const RISK_MODIFIER = {
  enemyMult: 1.25, // extra multiplier on enemy HP/damage when active, on top of the difficulty tier's own multiplier
  rewardMult: 1.35, // extra multiplier on coin/gem payout when active
};

export const DEBUG = {
  spawnCycleTypes: ['grunt', 'archer', 'rusher', 'bomber', 'healer', 'fireMage', 'boss'] as const,
};

// ---------------------------------------------------------------------------
// Difficulty selector (round 6): chosen on the start screen before a run,
// stored on Game and applied at reset()/onWaveTransition() time. `normal` is
// exactly 1.0 across the board so it reproduces the exact balance every prior
// round was tuned against — see DECISIONS.md for the full reasoning behind
// each tier's numbers. Colors are the exact hues the brief specified
// (green/yellow/orange/red/near-black); `textColor` is chosen per-swatch so
// the label stays legible against that particular background.
// ---------------------------------------------------------------------------
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'veryHard' | 'hell';

export interface DifficultyDef {
  label: string;
  color: string;
  textColor: string;
  enemyHpMult: number;
  enemyDmgMult: number;
  spawnRateMult: number; // scales SPAWN_DIRECTOR.baseRate/maxRate/aliveCap uniformly
  rewardMult: number; // scales coin + gem payout
  // Round 7: the wave number (1-based, into WAVES) on which archers first
  // appear for this difficulty tier. Normal (3) reproduces WAVES' own
  // baseline exactly. Harder tiers introduce archers earlier — see
  // getWaveForDifficulty() below for how this is actually applied (it pulls
  // a fraction of an early wave's existing grunt budget into archers rather
  // than adding extra enemies on top, so an earlier intro reads as "harder
  // composition" without diluting/inflating the wave's total headcount) —
  // and DECISIONS.md round 7 for the exact per-tier numbers and reasoning.
  archerIntroWave: number;
}

// Fraction of a wave's total (grunts+archers) budget that becomes archers
// when a difficulty tier introduces them earlier than WAVES' own baseline.
// Kept modest (vs. wave 3's baseline ~29% archer share) so an early-Hell
// wave 1 stays grunt-dominant rather than getting swarmed by kiting archers
// before the player has any shop upgrades — see DECISIONS.md round 7.
const DIFFICULTY_ARCHER_INTRO_SHARE = 0.25;

/**
 * Returns the actual per-wave enemy composition to spawn for a given
 * difficulty: identical to `base` (a WAVES[] entry) unless this difficulty's
 * `archerIntroWave` is earlier than `base.wave` would otherwise have
 * archers, in which case a `DIFFICULTY_ARCHER_INTRO_SHARE` fraction of that
 * wave's existing grunt+archer budget is converted to archers. Pure
 * function of (base, difficulty) — no per-difficulty conditionals live in
 * spawnDirector/behavior code, and extending WAVES to 25 entries needs no
 * change here. See DECISIONS.md round 7.
 */
export function getWaveForDifficulty(base: WaveDef, difficultyId: DifficultyId): WaveDef {
  const diff = DIFFICULTY[difficultyId];
  if (base.archers > 0 || base.wave < diff.archerIntroWave) return base;
  const total = base.grunts + base.archers;
  const archers = Math.round(total * DIFFICULTY_ARCHER_INTRO_SHARE);
  return { ...base, grunts: total - archers, archers };
}

// ---------------------------------------------------------------------------
// Live tuning overrides (post-launch dev tool) — an EXTRA multiplier layer a
// player can dial in at runtime via the in-game tuning panel (B to toggle,
// see game.ts/ui/tuningPanel.ts), on top of (never replacing) the
// per-difficulty DIFFICULTY[id] multipliers and the endless-mode
// endlessFactor(). Saved to localStorage keyed by difficulty (see
// persistence/tuningStore.ts) so it survives reloads and doesn't leak
// between difficulty tiers. All fields optional — {} means "no override for
// this difficulty yet," which is the common case. See DECISIONS.md for the
// exact composition formula and the panel's interaction model.
// ---------------------------------------------------------------------------
export type TuningKnobId = 'spawnRateMult' | 'enemySpeedMult' | 'enemyDmgMult' | 'enemyHpMult' | 'aliveCapMult';

export interface TuningOverride {
  spawnRateMult?: number;
  // New knob (didn't exist before this dev tool): an extra multiplier on
  // enemy movement speed, composed with generationScale(g).speed at spawn
  // time — see entities/factory.ts/game.ts::spawnEnemyFromRequest.
  enemySpeedMult?: number;
  enemyDmgMult?: number;
  enemyHpMult?: number;
  // A separate lever from spawnRateMult (which already scales the alive cap
  // uniformly alongside base/max spawn rate) — this multiplies the resulting
  // cap again, so a player can loosen/tighten the cap independent of how
  // fast enemies actually spawn in.
  aliveCapMult?: number;
}

export interface TuningKnobDef {
  id: TuningKnobId;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export const TUNING_KNOBS: TuningKnobDef[] = [
  { id: 'spawnRateMult', label: 'Spawn Rate', min: 0.25, max: 3.0, step: 0.05, default: 1 },
  { id: 'enemySpeedMult', label: 'Enemy Speed', min: 0.25, max: 3.0, step: 0.05, default: 1 },
  { id: 'enemyDmgMult', label: 'Enemy Damage', min: 0.1, max: 5.0, step: 0.05, default: 1 },
  { id: 'enemyHpMult', label: 'Enemy HP', min: 0.1, max: 5.0, step: 0.05, default: 1 },
  { id: 'aliveCapMult', label: 'Alive Cap', min: 0.25, max: 3.0, step: 0.05, default: 1 },
];

export function isTuningOverrideEmpty(o: TuningOverride): boolean {
  return TUNING_KNOBS.every((k) => o[k.id] === undefined);
}

export const DIFFICULTY: Record<DifficultyId, DifficultyDef> = {
  easy: {
    label: 'Easy',
    color: '#3fae4a',
    textColor: '#0a1a0a',
    enemyHpMult: 0.7,
    enemyDmgMult: 0.6,
    spawnRateMult: 0.75,
    rewardMult: 0.9,
    archerIntroWave: 3, // same as Normal's baseline — Easy doesn't need pushing later still
  },
  normal: {
    label: 'Normal',
    color: '#e0c341',
    textColor: '#241d02',
    enemyHpMult: 1.0,
    enemyDmgMult: 1.0,
    spawnRateMult: 1.0,
    rewardMult: 1.0,
    archerIntroWave: 3, // WAVES' own baseline — unchanged from before round 7
  },
  hard: {
    label: 'Hard',
    color: '#e07a1f',
    textColor: '#241200',
    enemyHpMult: 1.3,
    enemyDmgMult: 1.3,
    spawnRateMult: 1.2,
    rewardMult: 1.15,
    archerIntroWave: 2, // one wave earlier than Normal
  },
  veryHard: {
    label: 'Very Hard',
    color: '#c62828',
    textColor: '#ffffff',
    enemyHpMult: 1.7,
    enemyDmgMult: 1.6,
    spawnRateMult: 1.45,
    rewardMult: 1.35,
    archerIntroWave: 1, // archers from the very first wave
  },
  hell: {
    // Near-black rather than pure #000 so it still reads as "a color" (not a
    // rendering hole) even before the selection/legibility border is drawn.
    label: 'Hell',
    color: '#100d0d',
    textColor: '#e8b4b4',
    enemyHpMult: 2.5,
    enemyDmgMult: 2.2,
    spawnRateMult: 1.8,
    rewardMult: 1.6,
    archerIntroWave: 1, // archers from the very first wave, same as Very Hard
  },
};
