# DECISIONS.md — wave-defense-full

This is a NEW decision log for the `full-game/` project, a parallel, larger
build on top of the "wave-defense" prototype (branch
`claude/wave-defense-game-mvp-if7h0v`, commit `7f7ae86`). It does not
duplicate the prototype's own `DECISIONS.md` — see that file (in the
prototype's own checkout) for the reasoning behind the systems this project
inherits unchanged (map/road-grid, camera, spatial-grid collision, flow-field
pathfinding, coin economy shape, adaptive spawn director, engagement/posture
states, procedural SFX architecture, dual flat/detailed renderer, etc.).
Only judgment calls made *for this project* are logged here, organized by
phase.

## Baseline copy (setup)

- `full-game/` is a straight copy of the prototype's `src/`, `package.json`
  (renamed to `wave-defense-full`), `index.html`, `tsconfig.json`, and
  `public/` as of commit `7f7ae86`. `npm install && npm run build` verified
  clean before any new code was written.
- The prototype's root-level `src/`, `package.json`, etc. are untouched —
  this is a second, independent app living in its own subdirectory, sharing
  only git history with the prototype up to the branch point.

## Phase 1 — Generations and the enemy roster

### Generation system

- `generationScale(g)` (config.ts) returns `{ hpDmg: 1.5^g, speed: 1.06^g,
  coin: 1.35^g }` exactly per the brief. All three axes are composed with
  difficulty/endless multipliers in exactly one place —
  `game.ts::spawnEnemyFromRequest` — so no other system needs to reason
  about more than one scaling axis at a time.
- `generationForWave(wave, offset=0)` implements `min(floor((wave-1)/4), 6)`
  plus an optional offset, present from Phase 1 on specifically so Phase 3's
  bosses (always one generation above their wave) can call
  `generationForWave(wave, 1)` without this function changing.
- `pickSpawnGeneration(wave, isBoss)` is the single call site that decides
  the generation for one spawned enemy: below wave 9 it's always the wave's
  baseline generation; from wave 9 on, non-boss spawns roll 70% baseline /
  30% one generation below (chaff), matching the brief's "mixed crowd with
  priorities" intent; bosses always get baseline+1 and are never mixed down.
  Verified live (Playwright smoke test): 500 samples of
  `pickSpawnGeneration(9, false)` came back ~72%/28% across the two
  generations, matching the target 70/30 split within sampling noise.
- **Hue formula**: `hueForGeneration(g) = 270 - 270 * (g/6)` (colorUtils.ts)
  — a straight linear walk from violet (270°) to red (0°) across the 7
  generations, applied via HSL hue-replacement on each archetype's own base
  color (preserving that color's saturation/lightness). This is
  *intentionally* the only per-generation visual difference; archetype
  identity is carried entirely by shape. It composes with the prototype's
  existing difficulty/endless `warmHexColor` warm-shift (generation hue is
  applied first, then the existing difficulty/endless-power warm-shift nudges
  further toward red on top) — two independent "how dangerous is this"
  signals stacking rather than one replacing the other. Verified live:
  `hueForGeneration(0..6)` returns exactly `[270, 225, 180, 135, 90, 45, 0]`.
- All 6 non-boss archetypes + boss are seeded with a violet base `color` in
  ENEMIES (their hue is always overwritten by `applyGenerationHue` at spawn
  time — the seed color only matters if something ever renders `ENEMIES[x]`
  directly, unshifted, e.g. a future debug/tooling view).

### The 4 new archetypes

- **Rusher** and **Bomber** both reuse the existing `'melee'` behavior
  unchanged — rusher's "beeline the core, ignore almost everything" read
  comes entirely from a tiny `aggroRadius: 120` config value (the existing
  melee behavior already falls back to a core-beeline whenever nothing is in
  aggro range); bomber has `meleeDamage: 0` so it approaches and simply
  stands at contact range doing nothing (its real "attack" — the
  fuse/detonation state machine — is driven centrally in `game.ts`, not by
  AI behavior, because it must keep running even after the bomber itself has
  died). This is a nice validation that the existing archetype/behavior
  split generalizes well — two of the four new archetypes needed **zero**
  new behavior code, only config + (for bomber) a small central tick.
- **Bomber fuse/detonation state machine**: fuse ignition lives in
  `combat/damage.ts::maybeIgniteBomberFuse`, called from both `applyDamage`
  and `applyDotDamage`, so *any* damage source lights it (a bullet, an
  ally's melee hit, another bomber's blast, or burning ground). It only
  fires if the entity **survived** the hit (`target.dead === false`
  afterward) — this is what makes "killing it before the fuse expires
  prevents detonation entirely" true for a one-shot kill (fuse never gets a
  chance to light) while "once lit, it detonates regardless" holds for every
  subsequent hit (the fuse, once lit, is independent of `dead`/`health`
  entirely — it's ticked centrally in `game.ts::simulate()` over ALL
  entities, not just live ones, and a dead-but-still-fused bomber is
  explicitly kept out of the end-of-tick cull filter until it actually
  detonates). Verified live via three targeted Playwright tests: (1) a
  non-lethal hit lights the fuse and it counts down to exactly 0 over 3s
  then the entity is culled; (2) two bombers placed within each other's
  detonation radius — damaging only the first causes it to detonate,
  dealing exactly `detonationDamage * enemyFalloff` (27.3 of 78) to the
  second bomber AND lighting *its* fuse in turn (confirmed chain-capable);
  (3) a grunt in the same blast radius took the identical 35% falloff
  damage, confirming the faction-aware split treats "any other enemy" the
  same regardless of archetype.
- **Shared area-damage utility**: `combat/areaDamage.ts` extracts the
  "full damage to the opposing faction, `enemyFalloff` fraction to the same
  faction" pattern used by both bomber detonation (one-shot,
  `applyAreaDamage`) and fire-mage burning ground (continuous per-tick,
  `applyAreaDotDamage`). Both archetypes' configs use the same
  `ENEMY_AOE_FALLOFF = 0.35` constant (config.ts) rather than each picking
  their own number, since the brief specifies 35% for both mechanics
  identically.
- **Fire mage**: kites at range exactly like the archer (a near-duplicate of
  `updateKiter`, kept as its own function — see
  `entities/behaviors/fireMage.ts` — rather than parameterizing the shared
  one, since the two attack calls have diverged enough that a callback
  parameter felt like more indirection than the ~15 duplicated lines
  warranted). **Judgment call**: the fireball-in-flight and the
  burning-ground zone it leaves are tracked as lightweight parallel arrays
  on `Game` (`fireballs`, `groundEffects`) rather than as full ECS entities.
  The shared bullet/arrow projectile pipeline
  (`combat/projectiles.ts::updateProjectiles`) assumes "travel in a straight
  line, stop on the first hit" — a lobbed AoE that flies to a *fixed target
  point* and, on arrival, both deals an impact AoE and spawns a persistent
  zone doesn't fit that shape without complicating the shared pipeline for
  every other projectile. This is flagged for reconsideration once Phase 5's
  sprite work wants every visible thing to be a uniform renderable entity —
  for now the render code just draws these two arrays directly alongside
  the entity list (see `render/renderer.ts::drawFireball`/`drawGroundFire`
  and `game.ts::render()`). Verified live: a forced fireball impact dealt
  ~35% falloff damage on impact and continued dealing burn damage every
  tick afterward (until the target walked out of the burn radius, which is
  itself correct emergent behavior — the ground effect doesn't track a
  target, it's a fixed zone).
- **Healer**: `entities/behaviors/healer.ts`. Positioning heuristic
  (judgment call, not fully specified by the brief): rather than reasoning
  about "horde facing," it seeks a point near the **centroid of nearby
  same-faction enemies** (within 400 units), nudged 150 units further from
  the player — this reads as "hanging back among its own side" and degrades
  gracefully to anchoring on CORE when no other enemies are nearby yet
  (e.g. a lone healer). Flee trigger fires on EITHER a recent hit
  (`hitFlashTimer > 0`) OR a player/ally within `aggroRadius` (220,
  repurposed here as a "personally targeted" proximity radius rather than a
  combat engagement radius, since the healer has no attack of its own) —
  satisfying the brief's "took damage recently OR within an aggressor's
  attack range" without needing to track a specific attacker id. No-self-heal
  is enforced by an explicit `t.id === e.id` exclusion in the heal loop, on
  top of (not instead of) the pre-existing faction-wide "enemies never get a
  Regen component" rule. Verified live: a hurt healer with a hurt ally
  nearby healed only the ally (confirmed via `healingTargetIds`), never
  itself; a full accounting of the healer's own HP change during that test
  was contaminated by a leftover burning-ground effect from an earlier test
  step overlapping its position (test artifact, not a game bug — reproduced
  and explained, not chased further).
- **Rendering**: 4 new custom polygon shapes (`chevron` for rusher,
  `squatSquare` for bomber, `diamond` for healer, `concaveQuad` for fire
  mage) added to both `render/renderer.ts` (flat) and
  `render/rendererDetailed.ts` (shaded), matching the existing per-shape
  switch-case style exactly. New per-archetype visuals: an expanding-ring +
  accelerating-flash bomber fuse tell (`drawBomberFuse`), a pulsing
  heal-tether line (`drawHealerTethers`), and a fireball/burning-ground pair
  (`drawFireball`/`drawGroundFire`).
- **Audio**: 4 new procedural SFX in `audio/sfx.ts`'s existing
  `SFX_DEFS` table (no new subsystem) — `bomberFuse` (a single
  low-to-high frequency glide spanning the full 3s fuse, using the existing
  tone-layer's exponential ramp rather than a new looping-ping mechanism),
  `bomberDetonate`, `fireballLaunch`, `fireballImpact`.

### Wave table extension

- Extended from 5 to 13 waves (see `config.ts::WAVES` for the full
  rationale comment). This reaches indigo (wave 5), blue (wave 9) and
  touches green (wave 13), and crosses the wave-9 generation-mixing
  threshold — enough to prove the generation system end-to-end per the
  brief's explicit "not the full 25-wave economy yet" scope. Rusher enters
  wave 6, bomber wave 9 (matching the brief's intro waves); the counts for
  waves 6-13 are a reasonable-but-not-tuned linear-ish ramp, **explicitly
  flagged as a placeholder** — the full 25-wave budget/mix-percentage
  economy is Phase 3 scope.
- Healer (wave 13) and fire mage (wave 17) are fully implemented and
  spawnable via the F6 debug cycle from Phase 1 on, but are not yet wired
  into the normal per-wave spawn budget (`WaveDef` doesn't have
  `healers`/`fireMages` fields yet) — that wiring naturally belongs with
  Phase 3's full wave-table rebuild rather than being half-done twice.
- `SpawnDirector.pickNextKind()` was generalized from a hardcoded
  grunt/archer binary interleave to a weighted-random pick across any
  number of archetypes with remaining budget in the current wave, so adding
  a 5th/6th archetype to the budget system later (Phase 3) needs no change
  here.

### Other judgment calls / likely rebalancing candidates

- Bomber's `aggroRadius` (200) and fire mage's/healer's various radii are
  not specified exactly by the brief where noted inline in `config.ts` —
  picked to feel reasonable, flagged for playtesting-driven rebalancing.
- Healer's heal rate and bomber's/fire-mage's damage all scale with
  generation via the same `hpDmg` exponent that scales combat damage — the
  brief specifies HP/damage scaling explicitly but doesn't say whether
  healer throughput should scale with generation; scaling it was the more
  internally-consistent choice (a red-generation healer is a bigger threat,
  not just a bigger HP bar) but is worth a second look once more of the
  economy exists to judge against.
- `leashRadius` was added to `EnemyDef` as required shared metadata per the
  brief but is **not yet enforced** by any behavior — no archetype currently
  "gives up and returns to an anchor" once it commits to a target (the
  existing divert-to-attack/resume-toward-core loop is the closest existing
  behavior). Flagged in case a real leash-and-return mechanic turns out to
  be wanted later.
- Rounding: HP/damage overrides are `Math.round`ed; healer heal-rate and
  fire-mage burn-dps are left as floats (health.hp is already a float
  elsewhere in the prototype, e.g. regen) since sub-1 fractional
  heal/burn-per-tick amounts are the normal case at 60Hz.

### What was verified live vs. by code review only

Live-verified (headless Chromium via Playwright, driving the actual running
`Game` instance through its real `simulate()` loop — see
`entities/behaviors/*`, `game.ts`, `combat/*`): generation multiplier
formulas, hue-by-generation formula, wave→generation mapping including the
wave-9+ mix ratio and the boss +1 offset, all 4 new archetypes spawn with
distinct shapes/stats, bomber fuse ignition/countdown/detonation/chain/
faction-falloff, fire-mage impact+burning-ground damage/falloff, healer
heal-only-others + tether-target tracking. Code-review-only (not
screenshot-verified pixel-by-pixel, since this session had no interactive
display, only a headless browser driven via injected JS): the new shape
render paths (`chevron`/`diamond`/`concaveQuad`/`squatSquare`) in both
renderer variants, the bomber-fuse ring/flash visual, the heal-tether line
visual, and the F6 debug-cycle key itself (its underlying function,
`spawnEnemyFromRequest`, was exercised directly and confirmed correct; the
keyboard-cycling UI path around it was not separately driven).

## Phase 2 — Player classes

Four classes (`config.ts::PLAYER_CLASSES`), chosen on the start screen
alongside difficulty (new class row + QWER keys, `ui/startScreen.ts`),
persisting across resets exactly like difficulty already did.

- **Assault** — the prototype's original kit unchanged: rifle (slot 1) +
  pistol (slot 2) + summon (slot 3), 1.0 HP/speed. Passive: reloads 20%
  faster (`reloadTimeMult`, applied in `combat/playerWeapons.ts::startReload`).
  This is deliberately the "no surprises" baseline class.
- **Bomber** — slot 1 is a new Grenade Launcher weapon
  (`WEAPONS.grenade`, `kind: 'thrown'`) that lobs to the mouse position (or
  its max range along that line, whichever is closer) and explodes in an
  AoE. It reuses the *exact same* `Game.fireballs`/`applyAreaDamage`
  pipeline built for Phase 1's fire mage — a thrown AoE with a fixed target
  point is the same shape regardless of who's throwing it — with
  `burnDuration: 0` so no ground-fire zone is left behind (a plain grenade,
  not a fire mage's spell). Passive ("immune to its own blast"): the
  thrower's own id is now threaded through as `FireballSpawn.ownerId` and
  passed to `applyAreaDamage`'s `excludeId`, so a player is always excluded
  from their own grenade's blast — implemented as a general capability of
  the shared pipeline (any owner id can be excluded) rather than a
  bomber-class-specific branch, since it's the more obviously-correct
  default for anyone lobbing their own explosive regardless of class.
  90% HP / 95% speed — a glass-cannon-ish AoE class.
- **Macer** — slot 1 is a new Mace weapon (`WEAPONS.mace`, `kind: 'melee'`):
  a 110°, 90-unit-range cone swept in front of the player on every attack,
  hitting every enemy inside it (not a single-target hitscan), high per-hit
  damage, no ammo. Passive: heals a flat 2 HP on every swing that connects
  with at least one enemy. 130% HP / 90% speed — a tanky brawler.
- **Summoner** — slot 1 is just the pistol (weak personal offense
  deliberately), slot 2 is disabled (there's nothing else to bind there),
  slot 3 (summon) is its whole identity. Passive: +50% summon count AND cap,
  and a faster recharge (cooldown divided by the same 1.5x multiplier) —
  applied as one multiplier (`summonStatMult`) composed with the existing
  shop-derived numbers in `game.ts::trySummon`, keeping `economy/shop.ts`
  itself entirely class-agnostic (a deliberate boundary: shop math doesn't
  need to know classes exist, class passives compose on top at the one call
  site that actually spends them). 85% HP, normal speed.

### Judgment calls

- **Weapon system generalization**: `combat/playerWeapons.ts`'s `WeaponId`
  grew from `{rifle, pistol}` to include `mace`/`grenade`, dispatched by a
  new `WeaponDef.kind` (`'gun' | 'melee' | 'thrown'`, unset = gun). Rather
  than writing three separate "fire" functions with no shared structure, the
  original rifle/pistol projectile path became `fireGun`, and `fireMelee`/
  `fireThrown` are new siblings — `updatePlayerWeapon` picks one after the
  shared cooldown/reload/recoil bookkeeping at the top, so all four weapons
  still go through one state machine and one recoil-decay curve.
- **No per-class shop upgrades yet**: mace/grenade have no shop entries
  (only rifle/pistol/summon do, per the prototype). This is intentionally
  deferred — the brief's Phase 4 explicitly covers "per-type upgrades" in
  the rebuilt shop, and adding half of that system now (some upgrade paths
  for 2 of 4 weapons) would need redoing anyway once Phase 4's tab
  structure exists.
- **Class selection is a start-screen-only choice** (no mid-run
  respec/class-switch), matching how difficulty already works — consistent
  UX, and avoids having to define what happens to already-summoned allies,
  ammo state, etc. if a class changed mid-run.
- **Player-grenade friendly-fire fraction** (`WEAPONS.grenade.enemyFalloff
  = 0.2`) is deliberately gentler than the enemy bomber's 0.35 — a
  judgment call: a player's own grenade splashing their allies is meant to
  be a minor "watch your throws" tax, not a punishing chain-detonation
  mechanic like the enemy bomber's is designed to be. Worth revisiting
  once there's more multiplayer-adjacent-feeling ally density to judge it
  against.
- **Macer's `meleeArcDeg`/range (110°/90 units)** and **grenade's
  blast/range (110/550)** are first-pass numbers, not deeply playtested —
  flagged as rebalancing candidates once Phase 3/4 make runs long enough to
  judge class balance against a real difficulty curve.

### Verified live vs. code-review only

Live-verified via headless-Chromium Playwright driving the real `Game`
instance: class selection (keyboard) correctly binds the right slot-1
weapon and applies the right HP multiplier for all 4 classes; bomber's
grenade throw enqueues a fireball; macer's mace sweep hits an enemy in its
cone for exactly its configured damage and heals the player for exactly its
configured self-heal amount (plus the pre-existing, unrelated passive HP
regen tick — confirmed by exact-number matching); summoner's summon count/
cap/cooldown all reflect the 1.5x multiplier exactly. Code-review only: the
new start-screen class-row visuals/layout, and full weapon-switching via
the actual Digit1/Digit2 keys while playing (the underlying
`classSlot1Weapon`/`classSlot2Weapon`/`switchWeapon` calls were exercised
directly and confirmed correct; the keyboard path around them during live
gameplay was not separately driven end-to-end).
