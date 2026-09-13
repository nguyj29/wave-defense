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

## Phase 3 — 25-wave economy, 5 bosses, and the scoring system

### 25-wave budget/mix table

`config.ts::buildWaveTable()` replaces Phase 1's 13-wave hand-typed
placeholder. Rather than 25 hand-authored literal rows, it's generated once
at module load from a small `WAVE_ECONOMY` constant block (total budget at
wave 1, a per-wave growth rate, and each archetype's target mix share once
its intro wave is reached) — still "pure data" from every consumer's view
(`WAVES` is a plain `WaveDef[]`; nothing downstream calls the generator),
but retuning the whole curve is editing a handful of numbers instead of 25
rows. `budgetGrowthPerWave: 1.1` and `budgetCap: 260` were picked to land
in the same rough neighborhood as the old endless-mode escalation (1.12)
while giving wave 25 a clearly "endgame" budget (66 grunts + 66 archers +
38 rushers + 24 bombers + 19 healers + 24 fire mages, per the live-verified
table) without spiraling unboundedly. Archetype mix shares (archer 28%,
rusher 16%, bomber 10%, healer 8%, fire mage 10%, grunt absorbs the rest)
are a judgment call, not derived from anything in the brief — flagged for
rebalancing once there's actual playtesting to judge composition-feel
against. Verified live: the generated table has exactly 25 rows, correct
intro-wave gating per archetype, and the exact boss archetype at 5/10/15/
20/25.

### 5 bosses

One boss per milestone wave (`BOSS_WAVES` in config.ts, read via the new
`WaveDef.bossArchetype` field that `SpawnDirector` now requests instead of
a hardcoded `'boss'` kind):

- **Wave 5 — Warlord** (`boss`): the prototype's original boss, unchanged,
  no special ability. Deliberately the simplest of the 5 — a first boss
  fight should teach "big HP bar, hits hard," not a mechanic layered on
  top.
- **Wave 10 — Siegebreaker** (`bossSiege`): a kiter (like the archer) that
  periodically slams the ground in an AoE — punishes a melee-only build
  that tries to stand and trade rather than respecting its ranged attack.
- **Wave 15 — "Summoner"** (`bossSummoner`, name coincidentally shared with
  the player's Summoner class — unrelated): periodically calls in grunt
  reinforcements at its own position, turning the fight into an
  add-management problem as much as a damage race.
- **Wave 20 — Inferno** (`bossInferno`): periodically drops a burning-ground
  pulse under itself (literally reusing the fire mage's burning-ground
  mechanic at a bigger radius/DPS) — area denial around a melee-range
  boss.
- **Wave 25 — Apex** (`bossApex`): the finale, combining a slam AND
  periodic reinforcements (a rusher pair, so the adds arrive fast) plus a
  one-time enrage past 40% HP (1.3x speed and damage). Deliberately
  "everything you've learned, combined" rather than a wholly new 4th
  mechanic — a genuinely novel finale mechanic felt like scope better spent
  making the combination fight well.

**Implementation**: `config.ts::BossAbilityDef` is one shape covering all
4 ability types (`slam`/`summonAdds`/`burnPulse`/`enrageAtLowHp`), and a
boss can have any number of them (`EnemyDef.bossAbilities: BossAbilityDef[]`
— Apex has 3). Abilities are ticked centrally in
`game.ts::updateBossAbilities`, mirroring Phase 1's bomber-fuse pattern
(driven outside AI behavior code, once per live boss per tick), and reuse
the exact same `combat/areaDamage.ts`/`Game.groundEffects`/
`spawnEnemyFromRequest` machinery Phases 1-2 already built — no new damage
or spawning pathway was needed for any of the 4 ability types. Ability
damage/DPS fields scale with generation/difficulty/endless exactly like a
normal attack; `summonCount`/radii/durations/thresholds are left
un-scaled (a bigger-generation boss should hit harder, not summon more
adds or leave bigger fire — a judgment call). Verified live: all 5 bosses
spawn with correctly scaled HP and their configured ability list; Apex's
slam cooldown cycles, summonAdds spawns exactly 2 rushers at its 10s mark
(isolated from the game's own ambient wave-1 spawning, which was
confirmed as the source of extra entity-count noise in an earlier,
non-isolated version of this test), and forcing HP below the 40% enrage
threshold immediately applies the exact 1.3x speed/damage multiplier
exactly once (confirmed via before/after exact-number matching).

**Endless mode past wave 25** now synthesizes off wave 25 (Apex) instead
of the old wave 5 — a deep endless run re-fights an ever-scaling Apex
repeatedly rather than reverting to an easier boss. This is the existing
prototype pattern (endless always re-fights the LAST authored boss)
carried forward unchanged, not a new decision, but worth flagging since
"endless Apex forever" is a much bigger ask than "endless Warlord forever"
was.

### Scoring system — placement and design

**Placement**: folded into Phase 3 (per the coordinator's instruction to
place it "once waves/bosses exist, whichever is the more natural point")
because the Tempo component needs a wave's authored `durationSec` as its
par time and the Command/Economy component's coin-par needs a wave's full
archetype roster — both only became meaningful once the real 25-wave table
existed, not Phase 1's placeholder one.

**Architecture**: `economy/scoring.ts` is pure functions only
(`computeWaveScore`, `computeRunGrade`, `waveCoinsPar`) — no Game/entity
access, so a headless harness can call them directly with plain data.
`game.ts` owns the per-tick bookkeeping (`waveElapsedSec`/`waveKillCount`/
`waveCoinsEarned` accumulators, reset each wave) since it's the only place
with simultaneous access to core/player HP, kill events, coin drops and
wave timing.

**The 5 components** (200 points each, none of the exact weightings or
formulas were specified by the brief beyond naming the 5 categories — all
of the below are judgment calls, flagged for rebalancing):
- **Integrity** = `200 * coreHpFrac` at wave end.
- **Tempo** = `200 * clamp(1 - overParFraction)`, where a wave finishing at
  or under its authored `durationSec` scores full marks, linearly losing
  credit down to 0 at 2x that duration.
- **Survival** = `200 * playerHpFrac` at wave end (naturally 0 if the
  player died that wave).
- **Command/Economy** = `100 * allyRatio + 100 * coinRatio`, where
  `allyRatio` compares allies alive at wave end to `spawnerCapacity *
  spawnerCount` (a "how full is your base's ally roster" reference) and
  `coinRatio` compares actual coins earned this wave to `waveCoinsPar()` (a
  computed expected-income figure from the wave's archetype roster's
  midpoint coin values — see that function's doc comment for why it's a
  deliberately un-generation-scaled, conservative par).
- **Mastery** = `200 * (enemiesKilled / enemiesSpawned)` this wave — "did
  anything leak/get left alive when the wave ended," the most literal
  reading of "mastery" available from data phases 1-3 actually track (no
  accuracy/headshot-style stats exist in this codebase to score against
  instead).

**Run grade**: a weighted average of every scored wave's total, weight =
`1 + wave/25` (matching the brief's formula exactly), normalized to a 0-100%
and mapped to SS/S/A/B/C/D/F letter bands (97/90/80/65/45/25 cutoffs — a
judgment call, not specified). **Two hard gates**, both judgment calls
since the brief named "hard gates on SS/S/defeat-caps-at-C" without pinning
down exact conditions:
- **Defeat caps the letter at C**, full stop, regardless of the numeric
  percentage — implemented as a one-way downgrade (`capAt`), so a run that
  would already grade D or F on numbers isn't artificially raised, only a
  better-than-C numeric grade gets capped down.
- **SS additionally requires a "flawless" mastery record** — every scored
  wave's Mastery component at least 199/200 (essentially zero leaked
  kills across the whole run). Failing that gate caps the letter at S
  instead. (No equivalent extra gate was added for S beyond the shared
  defeat cap — the brief only named SS and S as gated, and a second,
  different S-specific condition felt like inventing requirements beyond
  what was asked.)

**Presentation**: an intermission-only score panel (`drawScorePanel`)
shows the wave that just ended's full 5-component breakdown plus the
current run grade; the game-over screen shows the final run grade,
percentage, and whether a hard gate applied. **Headless-sandbox-friendly
logging**: every wave's breakdown is `console.log`'d with a `[SCORE]` tag
(all 5 components separately, not just the total) at the moment it's
computed, and the full history is kept on `game.scoreHistory` — reachable
from a driving script via the pre-existing `window.game` escape hatch — so
a non-rendering harness can read every component of every wave without
ever touching the canvas.

**Verified live**: forcing 3 wave transitions via the F4 debug key produced
exactly 3 `[SCORE]` console lines and 3 `scoreHistory` entries with correct
per-wave totals and a correctly-computed weighted run grade; direct calls
to `computeRunGrade` confirmed both hard gates fire exactly as designed
(a numerically-perfect 1000/1000 history grades "C" when `defeated: true`
is passed, and a near-perfect history with one wave's Mastery at 150/200
grades "S" instead of "SS" even though its raw percentage alone would
clear the SS cutoff).

## Phase 4 — full shop/economy, ally unlocks, opt-in risk modifier

### Three-tab shop

`ui/shopPanel.ts`'s `ShopTab` grew from `'weapons' | 'base'` to add
`'class'` — a tab loop replaced the old two hardcoded tab draw calls, so a
future 4th tab is a one-line addition to the `TABS` array. `TAB_W` shrank
210->190 to fit 3 tabs across the same panel width rather than widening the
whole panel.

### Ally-type unlocks + per-type upgrades

Two new one-time-unlock items in the Base tab (`unlockArcherAlly`,
`unlockGuardianAlly`) widen the existing random ally-spawn pool
(`config.ts::ALLY_TYPES`, `economy/shop.ts::unlockedAllyTypes`) — both
spawners and the player's own summon cast now pick uniformly among every
currently-unlocked type each time they create an ally, rather than always
spawning the one original melee triangle. **Judgment call**: no separate
"which type to spawn" UI was built — unlocking a type just adds it to the
existing random pool, keeping the shop as the only place types are chosen
at all (simpler than a second per-spawner-or-summon-source type-selection
control, and consistent with how the rest of the ally system has no manual
targeting either).
- **Archer ally**: a ranged unit (0.75x HP, no melee component at all,
  fires like the enemy archer at 1.4x melee-damage-equivalent). Needed a
  genuinely new ally behavior — `entities/behaviors/ally.ts::
  updateRangedAlly` mirrors the enemy archer's kiting shape
  (`updateKiter`) rather than sharing code with it directly, since ally vs.
  enemy AI already don't share a base function in this codebase.
- **Guardian ally**: no new behavior needed at all — just stat multipliers
  (2.2x HP, 0.7x speed, 1.3x melee damage, diamond shape) layered onto the
  existing melee ally behavior. Another case (like Phase 1's
  rusher/bomber) of a new unit needing zero new AI code.
- **New `ShopItemDef.oneTimeUnlock` flag** + `economy/shop.ts::isMaxed()`
  generalizes "buyable exactly once" beyond ally unlocks — `buyItem()` and
  `ShopPanel` both check it (refusing/graying out a maxed row, showing
  "OWNED" instead of a price) so a future one-time item (a door, a class
  perk) reuses the same mechanism rather than needing its own special case.
- **New Class-tab items**: `maceDamage`/`maceSelfHeal` (macer) and
  `grenadeDamage`/`grenadeBlastRadius` (bomber) — the per-class weapon
  upgrades explicitly deferred in Phase 2. Rifle/pistol/summon stay on the
  Weapons tab (every class can reach at least one of them), reserving
  Class for weapons genuinely exclusive to one class.

### Door HP shop item (Phase 5 dependency, noted explicitly)

Added `doorHp` (Base tab) and `economy/shop.ts::doorMaxHp()` now, per the
brief's Phase 4 scope, even though doors themselves don't exist as
entities until Phase 5. Buying levels today is inert (nothing reads the
value yet) but harmless; Phase 5's door implementation is expected to call
`doorMaxHp(shopLevels)` the same way `coreMaxHp()` is already consumed by
`Game.reset()`/`buyItem()`. Flagged clearly so this isn't mistaken for a
forgotten wiring bug — it's an intentional forward stub.

### Re-derived 25-wave price curve / coin-yield payoff at wave 12-18

`economy/devReadout.ts::computeGemChancePayoff()` had a latent bug once
`WAVES.length` grew past 5 (Phase 3): it read a hardcoded 5-entry
`EXPECTED_KILLS_PER_WAVE` array and indexed it by wave number for the
entire loop, producing `undefined`/`NaN` for wave 6 onward. Fixed by
deriving the "kills per wave" proxy from each `WaveDef`'s own real
archetype-count total instead of a stale hand-typed array, and iterating
the payoff simulation over the full `WAVES.length` (25) waves.

With that fixed, the Gem Chance item's `base` cost was recalibrated from
20 to **500** (worked out empirically against the real 25-wave enemy-count
curve — see the arithmetic in the commit history / this session's working
notes) so that, at the current `waveDurationScaleFactor` (~0.48, since the
25-wave average duration is well under the 180s baseline): level 1 (cost
~240) pays off around **wave 12**, and level 2 (cost ~480) around **wave
18** — landing exactly on the brief's "wave 12-18" target. This is the
one Phase 4 change that's genuinely calibrated against real numbers rather
than picked by feel; still flagged as a candidate for a second pass once
actual playtested coin-income data exists (this used the archetype
roster's un-generation-scaled midpoint values as the income proxy, same
caveat as `waveCoinsPar()` in Phase 3's scoring system).

### Opt-in risk-for-reward modifier

A single boolean (`Game.riskMode`, toggled with **T** on the start
screen, off by default, persists across resets like difficulty/class) that
multiplies enemy HP/damage by `RISK_MODIFIER.enemyMult` (1.25x) and
coin/gem rewards by `RISK_MODIFIER.rewardMult` (1.35x), composed
multiplicatively on top of whatever the main Easy-Hell difficulty tier
already contributes — implemented as two local multiplier variables
(`enemyHpMult`/`enemyDmgMult`) computed once in
`spawnEnemyFromRequest` and threaded through every place that used to read
`diff.enemyHpMult`/`diff.enemyDmgMult` directly. **Judgment call**: the
brief asked for "a separate settable value" without specifying leveled vs.
boolean — a flat on/off toggle was chosen over a numeric dial for
simplicity; if playtesting wants finer-grained risk selection, this is the
one obvious place `RISK_MODIFIER` would grow into a small array of tiers
instead of a single constant pair.

### Verified live vs. code-review only

Live-verified: the 3-tab shop's tab ids are all reachable; buying an
ally-type unlock widens `unlockedAllyTypes()`'s result and a second
purchase attempt is refused (coins unchanged, level stays capped at 1);
summoning after both unlocks produces allies of the new archetypes (archer
and guardian both observed; a `basic`-type draw wasn't captured within the
small sample this particular test's summon-cap allowed, which is expected
sampling variance from a uniform 3-way random pick over few actual spawns,
not a bug — the underlying pick is a plain uniform `Math.random()` index);
mace/grenade shop-upgraded damage values match their `damagePerLevel`
exactly; risk mode's enemy HP multiplier applied exactly (30 base grunt HP
-> 38, matching `30 * 1.25` rounded). Code-review only: the shop panel's
visual "OWNED" state rendering and the start screen's risk-mode text
line/color (their underlying data — `isMaxed`, `riskMode` — were verified
directly; the pixel output was not screenshotted).

## Phase 5 — doors, sprite-descriptor readiness, extended audio, adaptive music

### Doors with HP blocking movement

One door per base-wall gap (`world/map.ts::DOOR_RECTS`, exactly filling the
gap span the wall segments already leave open), HP from the Phase 4
`doorHp` shop item (`economy/shop.ts::doorMaxHp`). **Judgment call**: doors
are NOT full ECS Entities — they're a small `Door` interface on `Game`
(position/size/hp/alive), the same "plain data, not an Entity" choice made
for Phase 1's fireballs/ground-effects, because a door only needs to
participate in (a) movement blocking and (b) taking damage from bullets and
adjacent enemies — it never needs targeting/aggro/AI, so giving it a full
Entity (health component, faction, collision radius that doesn't match its
rectangular shape) felt like more machinery than the feature needs.
- **Movement blocking**: `entities/movement.ts::integrateAndResolve` gained
  an optional `doors: DoorCollider[]` parameter, resolved with the exact
  same `resolveCircleVsRect` helper already used for `WALL_SEGMENTS` —
  a live door blocks exactly like a wall; a broken one (`alive: false`) is
  skipped, so the gap reopens exactly as it always behaved.
- **Damage sources**: (1) any live enemy touching a door's rect contributes
  `DOOR.enemyContactDps` (12) per tick — a crowd breaks a door faster than
  a straggler, checked once per tick in the new `Game.updateDoors()`; (2)
  any player-faction projectile (bullet or grenade... actually grenades
  don't fly as projectiles, only bullets/arrows do — see below) overlapping
  a door's rect is absorbed by it and dealt its damage, so a player CAN
  shoot a door down themselves (e.g. to reposition a fight), checked in a
  small pass right after `updateProjectiles()` rather than teaching the
  shared bullet-collision pipeline about a non-Entity target type.
  **Known gap**: thrown grenades (Phase 2's bomber-class weapon and, in
  spirit, the enemy fire mage's fireball) fly straight to a fixed target
  point without per-frame collision checks (see Phase 1/2's fireball
  design), so they don't currently get stopped by a door in their path —
  flagged as a minor inconsistency, not fixed this phase given how the
  fireball pipeline is structured.
- **Pathfinding note**: the flow field is NOT aware of doors (it only reads
  `WALL_SEGMENTS` + obstacles, unchanged) — enemies still "aim" through a
  gap a door currently blocks and get physically stopped there via
  collision resolution rather than routing around. This is actually the
  desired chokepoint behavior (a horde masses at a defended gate and
  overwhelms it, rather than calmly detouring around), not a bug, but
  worth naming explicitly since it wasn't a deliberate pathfinding design
  — it's what falls out of not touching the flow field.
- **Rendering**: `render/renderer.ts::drawDoors` — an iron-blue rect that
  reddens as HP drops (same green->yellow->red convention as every other
  health readout in the game, applied to the door's own fill since a door
  IS its health indicator, no separate bar needed).

### Sprite-descriptor readiness

`render/spriteRegistry.ts` is the "readiness" the brief asked for: a
`registerSprite(key, image)` / `getSprite(key)` registry (empty today — no
real assets exist yet, deliberately out of scope) plus `tintedSprite()`,
which multiply-blends a grayscale source image by an entity's own computed
color exactly the way `render/colorUtils.ts::applyGenerationHue`/
`warmHexColor` already compute that color for the current vector-shape
rendering — so swapping in real sprites later needs no change to how
colors are decided, only to what gets drawn with them. Every entity now
carries a stable `spriteKey` (set once in `entities/factory.ts` — the
archetype id for enemies, `ally-${type}` for allies, `'player'` for the
player); both `render/renderer.ts::drawEntity` and
`rendererDetailed.ts::drawEntityDetailed` check `getSprite(e.spriteKey)`
first and only fall back to the existing vector-shape switch when nothing
is registered — which is unconditionally true today, so this is a
compile-time-verified drop-in point, not a live parallel rendering path
needing its own testing. **The existing F10 flat/detailed toggle is
unchanged and stays meaningful post-sprite-swap** — both styles would draw
the same registered sprite, 'detailed' just keeps adding its
shadow/shading treatment on top, exactly as it does for vector shapes
today.

### Extended per-archetype audio

Every Phase 1-3 archetype that was previously falling back to
`enemyDeathGrunt`'s generic thud now has its own death SFX
(`enemyDeathRusher`/`enemyDeathBomberCorpse`/`enemyDeathHealer`/
`enemyDeathFireMage`, each a small variation on the existing
sawtooth-descending-tone family so the whole set still reads as one
consistent "enemy death" sound, not five unrelated new noises) —
dispatched via a small lookup table in `combat/damage.ts` instead of the
old inline if/else chain. Also added: a quiet, probabilistically-throttled
`healerHealTick` (roughly once every ~2s per actively-healing healer,
avoiding a new per-entity timer field) and a `doorBreak` crunch distinct
from any enemy-death sound (structural, not organic).

### Adaptive music intensity wired to the spawn director

`audio/music.ts::setMusicIntensity` was generalized from a boolean
on/off to a continuous `0..1 level` (backward-compatible — `true`/`false`
still coerce to `1`/`0` via JS, though every call site was updated to pass
a real number). `game.ts` now feeds it
`Math.max(bossActive ? 1 : 0, spawnDirector.pressureLevel)` — a new public
getter exposing the SpawnDirector's own internal normalized kill-rate
pressure (the same 0..1 value that already drives its spawn rate/clump
size/pause length) — so the intense layer now genuinely rides how hot the
current wave's adaptive difficulty is running, not just "is a boss
present." An active boss (or its warning telegraph) still forces full
intensity regardless of the moment-to-moment pressure reading. A small
deadband (0.03) on the update avoids rescheduling the Web Audio gain ramp
every single fixed tick.

### Verified live vs. code-review only

Live-verified: all 3 doors exist at the correct wall-gap positions with
correct HP from the shop-derived `doorMaxHp()`; `damageDoor()` correctly
clamps to 0 and sets `alive: false` on overkill; a grunt placed directly
against a live door is physically held back by it over 2 real-time seconds
(barely progressing versus its normal speed) while chipping the door's HP
at very close to the expected `enemyContactDps` rate; `pressureLevel` and
the tracked `lastMusicIntensity` are both reachable and correctly
initialized; the sprite registry returns `null` for every key including
`undefined`, confirming the fallback path is what actually renders today.
Code-review only: the actual pixel output of `drawDoors`' color-by-HP
gradient, the extended per-archetype death SFX actually sounding distinct
(Web Audio synthesis output wasn't captured/analyzed, only that the
correct `SfxName` is selected per archetype), and the music intensity gain
ramp's audible effect (only the numeric `level` value reaching
`setMusicIntensity` was verified, not the resulting audio).

## Final state

All 5 phases plus the scoring system are implemented, build cleanly
(`npm run build` — `tsc && vite build`, zero errors) as of this entry, and
have each been smoke-tested live via headless-Chromium Playwright driving
the actual running `Game` instance (not just unit-style calls to isolated
functions) at least once per phase's headline mechanics. See each phase's
section above for exactly what was live-verified vs. code-review-only, and
the "judgment calls" / "likely rebalancing candidates" called out inline
throughout — none of the numeric tuning in this project (wave economy mix
shares, boss ability numbers, scoring component weights/grade cutoffs,
class stat multipliers, risk-modifier strength) has had real playtesting
behind it; it's all internally-consistent and verified-correct
mechanically, but rebalancing against actual play should be expected.
