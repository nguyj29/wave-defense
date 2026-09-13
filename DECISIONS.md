# DECISIONS.md

Running log of the stack choice and every judgment call made while building
this MVP. Numbers referenced here live in `src/config.ts` unless noted.

## Stack

**TypeScript + Vite + HTML5 Canvas 2D, no game engine.** Took the
recommendation as-is: `npm run dev` gives instant hot reload, Canvas 2D gives
full control over the flat-shape art style (circles/triangles/hexagons/
polygons) with zero art pipeline, and a plain module graph keeps the door
open to ~10 enemy types / 4 classes / 25 waves without fighting a framework.
300 moving entities render and simulate at a steady 60fps in testing (see
Performance below) — no need for WebGL.

## Architecture

- **Fixed 60Hz timestep** (`src/engine/loop.ts`) with an accumulator and
  render interpolation (`alpha`). Rendering reads `prevX/prevY -> x/y`
  lerped by `alpha`, so movement look smooth independent of display refresh
  rate.
- **Entities as data + small components**, not a full ECS framework: every
  object (player, ally, enemy, projectile, coin, core) is one `Entity` with
  a required core (id/kind/faction/transform) and optional component
  objects (`health`, `regen`, `melee`, `ranged`, `ai`, `projectile`). This
  gets the "no enemy ever regenerates" rule for free — the enemy factory
  simply never attaches a `Regen` component — and keeps combat
  faction-agnostic: `combat/damage.ts::applyDamage` and
  `combat/projectiles.ts` only check `faction` fields, so a bomber's
  friendly-fire AoE later is a non-issue, not a rewrite.
- **The core is a real Entity** (`kind: 'core'`), not a special-cased hp
  counter. It goes through the exact same `applyDamage`/health path as the
  player and every enemy. This was not explicitly requested but directly
  serves "one damage/health/collision path, faction-agnostic" and
  simplified enemy AI (core is just another valid attack target).
- **Spatial partitioning**: a uniform grid (`engine/grid.ts`) rebuilt every
  tick from live units, used for both target-seeking (allies/enemies/
  archers) and obstacle collision queries. Rebuilding from scratch each
  tick (rather than incremental maintenance) was simpler and is plenty fast
  at this entity count — see Performance.
- **Pathfinding behind an interface** (`world/flowfield.ts`'s `Pathfinder`):
  enemies call `getDirection(x,y)` and never touch the flow field
  implementation directly. A Dijkstra-built flow field (grid cell 32,
  8-directional) is computed once at level load from the core's cell
  outward. Swapping in per-agent A* or a second field for a future rusher/
  boss archetype only requires a new class implementing `Pathfinder` — no
  caller changes.
- **Local avoidance** layered on top of the flow field: soft same-faction
  separation (positional correction, `entities/movement.ts`) plus hard
  circle-vs-obstacle and circle-vs-wall resolution, applied uniformly to
  player/ally/enemy after behaviors set a desired velocity.
- **Weapons and enemy archetypes are pure config** (`config.ts`'s
  `WEAPONS`/`ENEMIES`/`WAVES` tables) plus a small behavior module keyed by
  a `behavior` string (`entities/behaviors/enemy.ts` dispatches on
  `ENEMIES[archetype].behavior`). Adding a 7th enemy type is a config entry
  plus, only if the behavior is genuinely new, one function — the enemy
  factory and base Entity type never change.
- **One-call reset** (`Game.reset()`): regenerates the seeded obstacle
  layout, recomputes the flow field, resets entity ID allocation, shop
  levels, coins, wave/spawn-director state, and the death-processed set.
  No module holds run-scoped state outside what `reset()` touches.

## Judgment calls / assumptions

1. **Bullets/arrows pass over trees but are stopped by rocks.** Trees are
   canopy-and-trunk decoration at a scale where "a bullet clips a
   tree branch" reads as unfair; rocks are chest-high and solid enough to
   be an intentional line-of-sight/cover tool once the player learns it,
   especially against kiting archers. Implemented as a flag on the
   projectile component (`blockedByRocks`) and a `type==='rock'` check in
   `combat/projectiles.ts`, so it is a one-line reversal if playtesting
   disagrees. Ground movement collides with both trees and rocks
   identically (only the projectile pass-through differs).
2. **The wave-5 boss is an explicit placeholder** (`ENEMIES.boss` in
   `config.ts`): a scaled-up grunt (bigger radius/HP/damage, same `melee`
   behavior key as a grunt) with no special ability, no phases, no ranged
   attack. It is defined entirely as data plus the existing melee behavior
   function — replacing it with a real scripted/behavior-tree boss later
   means writing a new behavior key and swapping `ENEMIES.boss.behavior`,
   nothing else in the enemy pipeline changes.
3. **Stragglers survive the wave timer into intermission**, per spec,
   rather than despawning. Watch this in playtesting: if the adaptive
   spawn rate over-fills a wave right before the 3:00 mark (spawn director
   pushes rate toward max while the player is doing well, then a last
   burst spawns just before timeout), the intermission could open with an
   uncomfortable number of enemies still homing in on the core while the
   shop is up. The spec's documented fallback if this snowballs is to
   despawn stragglers at the timer edge — not implemented, flagging per
   the brief.
4. **Enemy contact-damage is rate-limited by the player's i-frame window**,
   not by a global "one hit per tick" rule — this is a deliberate,
   spec-required behavior (0.3s i-frames "so a crowd can't delete you
   instantly"), confirmed under a 300-grunt stress-test dogpile: the player
   takes chip damage at roughly `meleeDamage / iframeDuration` ≈ 26.7 dps
   regardless of how many attackers are in contact simultaneously, rather
   than being one-shot by simultaneous hits.
5. **God mode is a tiny module-level flag** in `combat/damage.ts`
   (`setGodMode`/`godMode`) rather than being threaded through every
   combat call site as a parameter. Pragmatic exception to the
   "faction-agnostic, no special-casing" rule — it only special-cases the
   player, only under an explicit debug toggle (F5), and keeps every other
   combat call site untouched.
6. **Player-summoned allies and spawner allies share one `createAlly`
   factory and one `updateAlly` behavior**; only `hp`/`regenRate` differ
   (70hp/2hp-s vs 50hp/1hp-s) plus the `summonedByPlayer` flag used for the
   "max 6 summoned" cap. Both regen behaviors (always-on vs the player's
   delayed out-of-combat regen) run through the same `Regen` component with
   an `alwaysOn` flag, per spec.
7. **Ally/enemy chase movement goes straight at the target** (not through
   the flow field) once a live target is acquired; the flow field is only
   used for the "no target, walking toward the core" case. Live-target
   chase relies on local obstacle/wall collision resolution to route around
   obstacles, which is fine at this map's obstacle density but would need
   a per-agent path (see the `Pathfinder` interface note above) if future
   maps get maze-like.
8. **F4 ("skip to next wave")** force-ends whichever phase is currently
   active (running -> intermission, or intermission -> next wave) rather
   than guaranteeing landing exactly on the next running wave in one press.
   From a running wave it takes two presses to reach the next wave's
   combat. Documented here rather than over-building a chained-transition
   method for a debug-only key.
9. **Shop UI and world rendering are both plain Canvas 2D draws** (no DOM
   overlay) for a single consistent rendering/coordinate pipeline and
   simpler pause-and-dim-the-world behavior; the shop panel/HUD/minimap/
   debug overlay all draw directly in screen space after the camera-
   transformed world pass.
10. **Base walls**: modeled as two axis-aligned rectangle *pairs* (each
    wall split by its gap) rather than one rectangle with a literal hole,
    since Canvas/AABB collision has no native "rectangle with a hole"
    primitive — two rectangles are simpler and exactly as correct.
11. **Enemy target priority**: `findNearest` for melee/kiting enemies
    considers `player` and `ally` kinds within aggro radius and falls back
    to the core when nothing is in range — this directly implements "path
    to core, divert to attack player/ally in range, then resume" without a
    separate "resume" state; resuming is just "no target found" on the
    next tick's fresh query.

## Shop price-curve readout (dev mode)

Printed automatically on `npm run dev` startup and re-runnable in the
browser console via **F9** (`printDevReadout()` in
`src/economy/devReadout.ts`). Computed by fitting `power ∝ cost^x` via a
log-log least-squares regression over levels 1-30, where `power` is
modeled as growing linearly with level (true for every stat here by
construction — a fixed per-level increment — so the fit's exponent doesn't
depend on the arbitrary linear scale used).

| Item | Price exponent | Cumulative cost @ L30 | Fitted power exponent x |
|---|---|---|---|
| rifleDamage | 0.75 | 4521 | 0.614 |
| rifleMagazine | 0.75 | 4068 | 0.613 |
| pistolDamage | 0.75 | 3617 | 0.613 |
| pistolFireRate | 0.75 | 4974 | 0.613 |
| summonCount | 0.75 | 6779 | 0.613 |
| summonRecharge | 0.75 | 5424 | 0.613 |
| summonCap | 0.75 | 5878 | 0.614 |
| summonHp | 0.75 | 4068 | 0.613 |
| coreHp | 0.75 | 5652 | 0.613 |
| spawnerOutput | 0.75 | 5424 | 0.613 |
| spawnerCapacity | 0.75 | 4974 | 0.613 |
| allyStrength | 0.75 | 4521 | 0.614 |
| coinYield | **1.0** | 9300 | 0.540 |

All fitted exponents land inside the 0.5-1.0 target band (theoretical
prediction for exponent 0.75 is `1/1.75 ≈ 0.571`; the small gap from the
observed ~0.613 is `Math.round()` in `priceForLevel` — real-money prices
aren't perfectly continuous). Coin yield at exponent 1.0 predicts `1/2 =
0.5`, observed 0.540, same rounding effect.

### Coin-yield payoff verification

Simulated against the spec's ~70%-budget expected drop schedule
(25/36/52/69/109 across waves 1-5), coin yield priced at exponent **1.0**
(not 0.75) with a purely additive +25%-of-*base*-drop effect per level
(never compounding level-over-level):

- **Level 1** (cost 20, bought right after wave 1 with its 25 coins):
  cumulative bonus reaches 20 (break-even) **~85% through wave 3**, and
  nets **+46.5 coins** by the end of wave 5 — matches the spec's "breaks
  even partway through wave 3... nets ~+45 by wave 5" almost exactly.
- **Level 2** (cost 40, bought after wave 2): its marginal bonus
  breaks even **~36% through wave 5** — in the right neighborhood as "the
  marginal case" the spec calls out, though closer to *mid*-wave-5 than
  strictly *late*-wave-5 in this exact simulation. Noting the discrepancy
  rather than fudging the schedule to force an exact match; the qualitative
  point (level 2 is a much closer call than level 1) holds.

### Two things flagged per the brief

1. **Multiplicative stacking on the pistol** (damage × fire rate, both
   upgradeable): acceptable for the MVP's five items because the pistol is
   deliberately the weak/backup weapon, but this is the first
   multiplicative-stat combination in the game and needs re-examining once
   more multiplicative stats exist (e.g. a future crit-chance or
   attack-speed-affecting-summon-uptime item) — the combined power curve of
   two multiplied linear stats is worse-than-linear in level, which the
   single-stat `P ∝ C^x` fit above doesn't capture.
2. **Coin yield compounds economically** (it buys other upgrades) even
   though its own scaling is linear-additive by design (`price exponent
   1.0`, `+25%-of-base` additive, never `×1.25`). This is why it needed a
   different, stricter price curve than every other item — a
   power-law-compounding coin multiplier stacked with the standard 0.75
   exponent would make it strictly dominant.

## TODOs explicitly not built (per spec)

- **Base tab expansion**: ally type unlocks, wall/door HP upgrades. A
  placeholder comment lives above `COIN_YIELD_PER_LEVEL` in
  `src/config.ts` noting where these will slot in (new `SHOP_ITEMS` entries
  tagged `tab: 'base'`, plus real wall HP/door state once doors exist).
- **Opt-in difficulty modifier**: a risk-for-reward setting (e.g. a
  separate settable multiplier on spawn budgets/enemy stats in exchange for
  bonus coins) is intentionally absent. Not stubbed in config since it has
  no natural home yet (it isn't a shop item) — noted here as the "coming
  later" surface it will attach to (`WaveManager`/`SpawnDirector`
  construction).

## Numbers most likely to need tuning after playtesting

- **`SPAWN_DIRECTOR.killRateAtMax` (1.2 kills/s)** and the base/max spawn
  rates (0.15 / 0.7 per second) — these three numbers entirely determine
  how "adaptive" the difficulty feels; only real play will show if 1.2
  kills/s is achievable/too-easy for a single assault-rifle player plus two
  ally spawners.
- **Archer `kiteDistance` (350) vs `aggroRadius`/range (450)** — the 100-unit
  buffer between "notices you" and "wants to be this far away" was picked
  to leave room to strafe without constantly re-triggering advance/retreat;
  may need widening if archers look jittery in practice.
- **Ally separation `SEPARATION_FACTOR` (0.4)** in `entities/movement.ts` —
  tuned by eye against a handful of allies; large ally counts (spawner cap
  upgraded many times) may reveal it's too soft (allies stack) or too
  stiff (allies jitter/vibrate against each other).
- **Boss stats (1200 HP / 25 dmg / 70 speed)** are explicitly a scaled-up
  grunt and are the least playtested numbers in the game — the spec frames
  the wave-5 boss as a structural placeholder, not a tuned encounter.
- **`COINS.magnetSpeed` (400) and `magnetRadius`/`pickupRadius` both at
  40** — spec says pickup and magnet share the same 40-unit radius, which
  means the "magnet pull" is barely distinguishable from a hard pickup
  radius in practice; worth widening the magnet radius beyond pickup in a
  follow-up pass if it doesn't read as intended.
- **Base wall gap placement / chokepoint geometry** (`world/map.ts`) — the
  flow field was verified analytically (enemies path into the gaps, not
  into the wall faces) but has not been watched under a full 45-enemy wave
  visually; worth a dedicated pass watching for bunching right at a gap
  mouth once real playtesting is possible.

## Playtest feedback pass (post-MVP)

Seven changes requested after a play session. Numbers below are all in
`src/config.ts` unless noted; behavior changes are in the files named.

1. **Removed the random screen-shake jitter on gunfire; replaced it with
   deterministic recoil.** `combat/playerWeapons.ts`'s `screenShake` field
   (which drove `ctx.translate((Math.random()-0.5)*s, ...)` in `game.ts`,
   redrawing the *entire* view at a random offset every frame while it was
   nonzero) is gone entirely. In its place: `PlayerWeaponState.recoil` snaps
   to `1` on every shot and eases back to `0` via exponential decay
   (`RECOIL.decayPerSecond = 16`, same curve every time — no `Math.random()`
   anywhere in the effect). Two things read that `0..1` value, both scaled
   by new per-weapon `WeaponDef.recoilCamera`/`recoilBarrel` fields (rifle
   14/10, pistol 6/5 world units — rifle kicks noticeably more): a camera
   kick opposite the aim angle at the moment of firing (`game.ts` render(),
   translated in screen pixels via `camera.pixelScale`), and a barrel-line
   pullback (`Entity.barrelPullback`, consumed in `render/renderer.ts`'s
   player-only aim-line draw) that visually recoils the line back toward the
   player and eases back out. Both are driven by the same `recoil` scalar so
   they stay in lockstep. Applies to both weapons (previously screenShake
   was rifle-only); the pistol's smaller numbers keep it feeling snappier/
   lighter as the backup weapon.
2. **Ally engagement/leash behavior**, `entities/behaviors/ally.ts`: allies
   no longer call `findNearestUnbounded` and beeline across the whole
   3200x3200 map when nothing is within range (a suicide-run risk). The
   engagement range is now `Entity.aggroRadius` (defaulting to the new
   `ALLY.aggroRadius = 700`, renamed from `seekRadius` and now actually set
   on ally entities in `factory.ts`, exactly mirroring how `ENEMIES[x]
   .aggroRadius` already worked) — this was also the "give allies an
   equivalently-named field" ask. When nothing is in range: if the ally is
   farther than `ALLY.leashRadius` (500 units) from `CORE`, it enters a new
   `'returnToBase'` state and walks home; otherwise it enters a new `'idle'`
   state and does a light wander within `ALLY.idleWanderRadius` (60 units)
   of its current spot (re-picking a nearby wander point every 2-4s) rather
   than standing as a frozen statue or running off-map. `AllyBehaviorState`
   in `entities/types.ts` was updated to `'advance' | 'attack' |
   'returnToBase' | 'idle'` (dropped the old `'seekEnemy'`, which is no
   longer a real state now that unbounded seeking is gone).
3. **Rifle range 600 -> 1800.** `CAMERA.baseViewWidth` is 1600 (the 1x-zoom
   screen width), so 600 meant the rifle couldn't even reach across one
   screen; 1800 comfortably exceeds a full screen width at 1x zoom, making
   it the clear long-range option. Pistol range left at 500 (already a
   3.6x gap below the new rifle range, more than enough separation without
   needing to nerf the pistol further — it's meant to stay the short-range
   backup).
4. **Projectiles decelerate to a stop instead of popping out of existence**,
   `combat/projectiles.ts` + new `PROJECTILE_PHYSICS` config: over the final
   `decelFractionOfRange` (20%) of a projectile's `maxRange`, its speed eases
   from full to zero via a smoothstep curve (`t*t*(3-2*t)`, applied to
   distance-traveled fraction, not elapsed time, so it's consistent
   regardless of bullet speed). Rock-blocking and hit detection still run
   every frame during this decel window — a slowing bullet can still land a
   hit or get blocked right up until it stops — using the same code path as
   before. Once stopped (either `traveled >= maxRange` or speed drops below
   2% of launch speed, whichever first), the projectile sits in place and
   fades via a new `Entity.alpha` field (`stopFadeDuration = 0.35s`) before
   being removed. `Entity.alpha` is a generic render-only opacity multiplier
   (read in `render/renderer.ts`'s `drawEntity` via `ctx.globalAlpha`), not
   projectile-specific, so it's reusable for any future fade effect.
5. **Obstacle density**: `treeCount` 120 -> 65, `rockCountMin` 40 -> 22 on
   the same 3200x3200 map — roughly halved, which reads as scattered forest
   rather than dense thicket. Rock count was cut proportionally less than
   trees (45% vs 46%... effectively the same ratio) specifically so there's
   still meaningful cover near approach lanes for the archer-kiting-behind-
   rocks mechanic (`ENEMIES.archer`: kites at 350, fires up to 450, rocks
   block arrows) — the placement algorithm in `world/obstacles.ts` is
   unchanged (same seeded rejection-sampling against `BASE_CLEAR_RECT` /
   `CORNER_CLEAR_RADIUS` / world bounds), just asked for fewer of each type,
   so spawn corners, the base interior, and lane traversability are
   respected identically to before, just less densely packed.
6. **Spawn rate roughly 2.3x'd**: `baseRate` 0.15 -> 0.35 spawns/s, `maxRate`
   0.7 -> 1.8 spawns/s, `aliveCap` 45 -> 90. "Much higher" was the explicit
   ask, so both rates were raised well beyond a timid bump; `aliveCap` was
   doubled to actually let the higher max rate matter (the old 45 cap would
   have throttled a 1.8/s rate almost immediately once a wave got going).
   `killRateAtMax` (1.2 kills/s) and the ramp timings (`rampUpSec`/
   `rampDownSec`) were left alone per the brief — nothing about the higher
   base/max rates makes those look obviously wrong on inspection; they still
   read as a reasonable "sustained kill pace that saturates the director"
   and "3s to ramp up, 8s to decay" shape, just against a higher ceiling.
   Since per-wave spawn budgets (`WAVES`) are unchanged fixed counts, the
   practical effect is exactly as expected: waves burn through their budget
   faster and the field gets denser mid-wave, which is the intended
   feedback loop. Also fixed a stale hardcoded `aliveCap: 45` literal in
   `game.ts`'s spawn-readout debug HUD (F7) to read `SPAWN_DIRECTOR.aliveCap`
   instead, so the debug readout doesn't silently drift from the real value
   again.
7. **Flow field smoothing**, `world/flowfield.ts` — the `Pathfinder`
   interface (`getDirection`/`recompute`) is untouched, so no caller
   changes. Two changes inside `FlowField`:
   - **Direction-field construction** no longer snaps each cell to its
     single lowest-distance 8-connected neighbor (which limited every cell
     to one of 8 possible headings). It now estimates a discrete gradient
     of the Dijkstra distance field via central differences
     (`-(dist[x+1]-dist[x-1])/2`, same for y) and normalizes that as the
     cell's direction. This alone lets headings vary continuously with the
     local shape of the distance field instead of being quantized to 8
     angles. A best-neighbor fallback (the old algorithm) is kept for the
     rare degenerate/flat-gradient case (e.g. exactly at the core, or a
     locally symmetric pocket) so no reachable cell ever gets a zero
     vector.
   - **`getDirection(x,y)`** now bilinearly interpolates the direction
     vectors of the surrounding 2x2 cell-center neighborhood based on
     fractional position, then re-normalizes, instead of returning the raw
     direction of whichever single cell contains the query point. Any
     blocked/unreachable corner sample falls back to a straight-line vector
     toward `CORE` (the same fallback the original single-cell lookup used)
     so a bad corner near an obstacle or the field's edge can't corrupt the
     blend. Together these remove the blocky 8-direction "staircase" look,
     especially near diagonals, without changing the underlying Dijkstra
     core or the `Pathfinder` contract.
   - Checked `entities/movement.ts`'s local avoidance (soft same-faction
     separation + hard obstacle/wall resolution): it's a positional
     correction applied after behaviors set a desired velocity, not a
     velocity-space force, so it can't fight the smoother flow-field
     heading the way a competing steering force could — left untouched.
   - Verified via Playwright smoke run (headless Chromium against the dev
     server): spawned grunts at a far corner via the F6 debug key, let the
     sim run ~30s, and watched the entity count / positions across
     screenshots — enemies funneled through the horizontal wall's gap and
     reached the player/base rather than bunching against the wrong side of
     a wall face (visually confirmed one wave of grunts crossing the gap
     and engaging the player). A dedicated visual "watch a full 45+ enemy
     wave stream through both gaps" pass is still worth doing in a real
     playtest — the automated check above used a small manually-triggered
     cluster, not a full wave.

### Verification for this pass

- `npm run build` (tsc + vite build) passes clean.
- Playwright smoke run against `npm run dev` (headless Chromium, no browser
  available for a human here): game boots to `'playing'` phase with no
  console/page errors; rifle fires and ammo decrements while held (recoil
  code path exercised, no exceptions); F6-spawned grunts pathed through the
  wall gap and reached/attacked the player over an extended run (ended in a
  real game-over from an idle, undefended player — confirms enemy contact
  damage and pathing both still work end-to-end); an ally engaged an enemy
  near the player during that run (ally combat state still triggers). Did
  **not** verify: subjective "does the recoil feel right" and "does the
  spawn rate feel like enough" (both are feel calls that need a human
  playing), a full 45-enemy wave watched end-to-end for gap bunching, or the
  archer-kiting-behind-rocks mechanic specifically at the new, lower rock
  count (the placement algorithm and rock count are still comfortably above
  zero near lanes, but only a human playtest will show whether kiting cover
  still feels sufficient).

## Map redesign, lanes, clumped spawns, SFX, and detailed render style (post-MVP pass 2)

Six changes requested in one pass. Numbers below are in `src/config.ts` unless noted.

1. **Core color -> blue.** `CORE.color = '#3b6fe0'` (new field, was a hardcoded
   `'#5ec96a'` string in `entities/factory.ts::createCore`), a medium blue
   chosen to read clearly against the forest green ground, the gray concrete
   lanes, and the brown walls — nothing else on the map competes for that hue.

2. **Base moved to bottom-middle; wall pen rebuilt around it.**
   `CORE.x/y` are now `WORLD.width/2, WORLD.height - 220` (same 220-unit edge
   margin the old corner base used, just centered horizontally instead of
   flush to the west edge). The old two-segment L-shaped wall (which only
   made sense for a corner) is replaced with a symmetric "pen": one wall
   running east-west `BASE.wallSetback` (260) units north of the core,
   spanning `CORE.x -/+ BASE.wallHalfSpan` (750, so 1500 units total), broken
   by **three** gaps (`BASE.gapOffsets = [-400, 0, +400]`, each `gapWidth`
   120 wide) — one per active spawn lane — plus two side walls dropping
   straight down from the north wall's ends to the world's south edge, which
   closes off flanking around the sides (the base needs no south wall of its
   own since it already sits flush against the world edge). `world/map.ts`
   derives every rectangle from `BASE`/`CORE` config rather than hardcoding
   coordinates, so retuning the pen size/gap count later is a config edit.
   **Why three gaps instead of the spec's suggested one-or-two**: three
   spawn points (top-left/top-middle/top-right) each getting its own gap
   gives a completely unambiguous lane-to-gap mapping (see lanes below) with
   no forking or awkward diagonal merging, and three medium chokepoints
   (360 of 1500 wall units open, 24%) still leaves the wall doing most of the
   fencing — it isn't materially "leakier" than the old single ~120-of-740
   gap ratio. This is the judgment call most likely to want revisiting after
   watching a real wave stream through it (does one gap read as too crowded,
   are all three gaps used evenly, etc).
3. **Data-driven spawn points, with the 25-wave game's unlock gating built
   in now.** `world/map.ts::SPAWN_POINTS` is `{id, x, y, unlockWave}[]`:
   `top-left`/`top-middle`/`top-right` at `unlockWave: 1` (always on),
   `mid-left`/`mid-right` (level with the base on the far west/east edges) at
   `unlockWave: 15` — an explicit, documented placeholder for the planned
   25-wave game, not a tuned value; nothing about *this* 5-wave prototype
   depends on 15 specifically, it just needs to be higher than 5.
   `activeSpawnPoints(waveNumber)` filters by `unlockWave <= waveNumber`
   (falling back to the first spawn point if the filter ever produced an
   empty list, as a defensive guard) and both `SpawnDirector` and
   `obstacles.ts`'s clear-zone/lane logic consume that filtered list — so
   unlocking mid-left/mid-right later really is a one-line data edit
   (`unlockWave: 15` -> whatever wave), no code path to touch.
4. **Concrete lanes + patchy forest instead of uniform scatter.** Each
   wave-1 spawn point gets a straight `Lane` (`world/map.ts::LANE_SEGMENTS`)
   to its assigned gap center (`LANES.width = 180`, inside the requested
   150-200 range — picked at the wide end since 3 lanes converge close
   together near the pen and a narrower width made the middle lane's
   obstacle-free strip visually pinch right at the gap mouth).
   `world/obstacles.ts` excludes placement within `width/2` of any lane
   (`distToSegment`) in addition to the existing base-pen and per-spawn-point
   clear zones, and `render/renderer.ts::drawLanes` paints a gray strip (plus
   a dashed centerline) under the ground grid so the roads read visually,
   not just mechanically. Forest placement also changed from pure uniform
   rejection-sampling to **patch-based clumping**
   (`OBSTACLES.patchCount = 6`, `patchRadius = 420`): 6 patch centers are
   seeded away from the base and >=`laneWidth/2 + 80` from every lane, then
   85% of trees/rocks (`scatterFraction = 0.15` is the uniform remainder, so
   the transition between patch and open ground doesn't look like a hard
   cutout) sample a random point within a random patch's radius instead of
   the whole map — this is what produces the "green patches off to the
   sides" look instead of a scattered-everywhere thicket. Density was cut
   again on top of that (`treeCount` 65->46, `rockCountMin` 22->16) since
   lanes alone already open up the approach paths considerably; rock count
   again cut proportionally less than trees to preserve archer-kiting cover
   near the patches. The seeded RNG (`WORLD.seed`) and rejection-sampling
   approach are unchanged, so layout is still fully reproducible.
5. **Spawner/shop/player positions updated for the new base shape.**
   `SPAWNER_POSITIONS` moved to `CORE.x -/+ 220, CORE.y - 140` (symmetric,
   inside the pen, clear of the shop marker); `SHOP.marker` moved to
   `CORE.x + 160, CORE.y - 70` (also inside the pen). `game.ts`'s player
   spawn (`CORE.x + 60, CORE.y - 60`) was left as a relative offset from
   `CORE`, which — since `CORE` itself moved — automatically lands inside
   the new pen with no change needed; verified visually (see below).

6. **Clumped wave spawning**, `waves/spawnDirector.ts`: replaced the old
   "spawn one unit the instant the accumulator crosses 1, round-robin every
   corner one spawn at a time" discharge with a **clump-then-pause** cycle
   from one spawn point at a time. The adaptive rate math (`smoothedKillRate`
   -> `normalizedTarget` -> `currentRate` between base/max, with the
   existing ramp/hysteresis) is completely untouched — it still controls how
   much spawn "budget" accumulates per second. What changed is how that
   budget discharges: it accumulates toward `clumpTarget` units (3-6,
   `SPAWN_DIRECTOR.clumpSizeMin/Max`, linearly interpolated by the same
   `normalizedTarget` 0..1 that drives `currentRate`) from the single
   currently-selected spawn point; once the clump is spawned, the spawn
   point rotates to the next one in `activeSpawnPoints(wave.wave)` and a
   `pauseSecMin..pauseSecMax` (1-3s) pause opens before the next clump starts
   accumulating — **higher pressure means both bigger clumps and shorter
   pauses** (linearly, in opposite directions across the same
   `normalizedTarget`), so the "distinct bursts from one point at a time"
   read gets more intense under load instead of degenerating into an
   everywhere-at-once trickle the way a higher raw rate alone would. The
   accumulator is reset to 0 when a clump ends (rather than left to carry
   over into the pause) specifically so the clump right after a pause
   doesn't fire as one oversized burst on top of its own fresh
   `clumpTarget` — this is the detail most likely to need retuning if clumps
   feel front-loaded in practice. Boss telegraph/spawn timing, `aliveCap`,
   and per-wave `grunts`/`archers` budgets are all unchanged — only pacing
   and which spawn point is used changed. Verified via a scripted Playwright
   run driving the live `SpawnDirector.debugSnapshot()`: wave 1 opened with
   3 grunts from `top-left` (`clumpProgress` climbing 0->1->2->3), then
   `activeSpawnPointId` flipped to `top-middle` with `pauseTimer` counting
   down from ~2.6s — exactly the intended cycle.
   The F7 debug readout (`ui/debugOverlay.ts`) gained the new state:
   `activeSpawnPointId` and either `clump: N/target` (while accumulating) or
   `paused: N.Ns` (while between clumps), replacing nothing — the existing
   fields (`smoothedKillRate`, `currentRate`, budget, alive/cap, wave time)
   are unchanged.

7. **Procedural sound effects**, new `src/audio/sfx.ts` module (Web Audio
   API only — oscillators + a shared reusable white-noise buffer, no
   external audio files, per the "hobby project, synthesized assets are
   fine" note). `playSfx(name, volume?)` is the entire public API; every
   sound is a `SfxLayer[]` entry in one `SFX_DEFS` config table (tone-sweep
   layers: waveform/freqStart/freqEnd/gain/attack/decay/delay; noise-burst
   layers: same envelope shape plus a biquad filter type/freq) so adding a
   15th sound is a data entry, never a new scattered `new OscillatorNode()`
   call in gameplay code. Implemented: `rifleShot` (sawtooth + highpass
   noise crack, short/high), `pistolShot` (square + lowpass noise thump,
   punchier/lower/single-shot), `reload` (two delayed short square-wave
   clicks), `enemyHit` (short thud, survives), `enemyDeathGrunt`/
   `enemyDeathArcher` (descending tones at two pitches) and
   `enemyDeathBoss` (bigger: lower sine + a long lowpass noise rumble
   underneath), `allySummon` (two-note rising sine "cast"), `allyHit` (short
   triangle-wave thwack when an ally's melee lands), `playerHurt` (sawtooth +
   noise), `coreHurt` (deliberately lower/deeper than `playerHurt`, plus a
   second delayed thud so it reads as an "alarm" double-hit — the explicit
   ask was a distinct base-under-attack audio cue independent of watching
   the HP bar), `coinPickup` (bright rising sine blip), `shopOpen`/
   `shopPurchase` (soft rise / two-note cash blip). Wired at the existing
   faction-agnostic call sites rather than duplicated per-caller:
   `combat/damage.ts::applyDamage` dispatches the hit/death sound purely
   from `target.kind`/`archetype`/`isBoss` (so it automatically covers
   bullets, arrows, and melee alike — one function, no new call sites needed
   in `projectiles.ts` or the enemy AI), `combat/weapons.ts::tryMeleeAttack`
   plays `allyHit` only when `attacker.kind === 'ally'`, and
   `combat/playerWeapons.ts`/`game.ts` cover the rest (fire, reload, summon
   cast, coin pickup, shop open/buy). **Autoplay policy**: `initAudio()`
   creates/resumes the shared `AudioContext` and is called from `Input`'s
   first `keydown`/`mousedown` listeners (`src/input.ts`) — i.e. the same
   first user gesture that already exists before the game does anything, so
   there's no separate "click to enable audio" prompt needed; `playSfx()`
   itself silently no-ops if the context is still suspended (e.g. a
   pre-gesture debug call) rather than throwing.
   **Explicitly skipped, per the brief's own "use your judgment" framing**:
   an enemy-spawn "blip" (spawns now happen in clumps of 3-6 within a
   fraction of a second — a blip per spawn would be a rapid-fire buzz, not a
   clear cue) and footstep/movement sounds for any entity (the brief itself
   flagged the noise/throttling risk at ~300 entities; a single per-player
   footstep tick was considered but skipped for this pass since it's a pure
   "feel" addition that's easy to add later once the other SFX have been
   heard and judged, rather than adding one more unverified feel-call sound
   in the same pass as everything else).

8. **Alternate "in-house sprite" detailed render style**, new
   `src/render/rendererDetailed.ts`, toggled at runtime with **F10**
   (documented in the F1 debug-overlay legend). Both styles are Canvas2D
   shape primitives only (no image/sprite assets) and share the existing
   camera/world transform and `interpolatedPos` helper from
   `render/renderer.ts`; the detailed path adds, per the brief: a soft drop
   shadow ellipse under every non-projectile/coin entity, a lighter
   "highlight" patch and a darker rim stroke on every shape (circle/
   triangle/hexagon/square), an inner beveled hexagon for the boss/core, a
   two-tone beveled look on wall segments, layered-circle tree canopies
   (3 overlapping tones instead of one flat disc, matching the "layered
   circles for foliage" suggestion) and rocks with a couple of darker/
   lighter triangular facets fanned from center. **Performance**: rather
   than creating `CanvasGradient` objects per entity per frame (the brief's
   flagged risk at ~300 entities), shading uses a cheap string-math
   `shade(hex, percent)` helper (parse `#rrggbb`, offset each channel, only
   ever run against a handful of distinct entity/obstacle colors) plus flat
   overlapping fills for the "highlight" — no gradient allocation in the hot
   path at all. **Default: `detailed`** — it was judged to look more
   polished in the side-by-side screenshot comparison taken during
   verification (see below) while staying well inside the "clean, chunky,
   zombs.io-ish" brief; F10 switches back to the original flat style
   instantly for comparison, and the debug overlay (F1) shows which style is
   active. This default is a pure aesthetic call and the one most likely to
   want the user's own opinion once they've actually played with both.

### Verification for this pass

- `npm run build` (tsc + vite build) passes clean.
- Playwright smoke run against `npm run dev` (headless Chromium): game boots
  to `'playing'` phase at the new base position (`core.x/y` = `1600, 2980` on
  the 3200x3200 world, player spawns inside the pen at `1660, 2920`) with no
  `pageerror`/`console.error` events across the whole run (weapon fire,
  summon cast, coin pickup and shop-adjacent code paths were all exercised,
  so every new `playSfx()` call site ran without throwing — this confirms
  the *code path* is exception-free, not that the audio itself sounds
  right, which needs a human listening).
- Drove `SpawnDirector.debugSnapshot()` directly over ~11 simulated seconds
  of wave 1 and confirmed the clump-then-pause cycle end to end: 3 grunts
  spawned from `top-left` (`clumpProgress` 0->1->2->3 against
  `clumpTarget: 3`), then `activeSpawnPointId` switched to `top-middle` and
  `pauseTimer` counted down from ~2.6s toward 0 before the next clump would
  start — matches the intended "clump, pause, rotate" read, not a smooth
  trickle.
- Took side-by-side screenshots (zoomed out over the base) confirming: the
  core renders blue with the new pen wall/3-gap layout, all three lanes
  visibly converge into their respective gaps as gray concrete strips
  distinct from the green ground, spawners and the shop marker sit inside
  the pen, and forest/rock obstacles read as clumped patches off to the
  sides of the lanes rather than uniform scatter — both in the flat and the
  detailed render style (F10 toggles between the two screenshots cleanly).
- **Did not verify** (needs a human): whether the SFX actually sound good /
  "Roblox-punchy" as intended — only that every trigger site fires without
  a JS exception and Web Audio API calls are well-formed; whether 3 gaps at
  120 units each feel like the right choke-point pressure once a full
  45-enemy wave streams through visually (only a small forced clump was
  watched, not a full wave); whether the detailed render style is in fact
  the preferred default over flat; and the lane width / patch density
  "feel" of openness the brief asked for, which is inherently a subjective
  call.

## Wave-counter bug investigation, 60s test waves + auto-scaling prices, gem drops, Gem Chance item, UI feedback, haptics (post-MVP pass 4)

Six items requested in one pass. Numbers below are in `src/config.ts` unless noted.

### 1. Wave-counter "doesn't increment" — no bug found, it's wave length

Read `waves/waveManager.ts` (phase/timer state machine), `waves/spawnDirector.ts`
end-to-end (the clump-then-pause rewrite from the previous pass), `game.ts`'s
force-end-wave-early logic (`isBudgetExhausted && aliveEnemies === 0`), and
`ui/hud.ts` (wave number display) looking specifically for the failure modes
named in the brief: a clump-in-progress that never fully discharges, an
off-by-one that stalls before the last few units spawn, and spawn points
filtered by `unlockWave` accidentally excluding an active point.

- `isBudgetExhausted` is `spawnedGrunts >= wave.grunts && spawnedArchers >=
  wave.archers && (wave.boss === 0 || bossSpawned)`. Traced the discharge
  loop in `SpawnDirector.update()`: `pickNextKind()` returns `'grunt'`/
  `'archer'` directly once the other budget is exhausted (no more
  proportional coin-flip once one side hits 0) and returns `null` only once
  *both* are exhausted, which `break`s the while loop — there is no path
  where the last few units of a budget are skipped or where the loop exits
  early while `spawnAccumulator >= 1` and units remain. The `aliveCap`
  guard (`aliveCount + requests.length < aliveCap`) only pauses discharge
  (banked in `spawnAccumulator`) — it never drops a spawn or corrupts the
  counters. `advanceToNextClump()` only rotates the spawn point/resets
  clump bookkeeping; it never touches `spawnedGrunts`/`spawnedArchers`/
  `bossSpawned`, so a clump boundary can't stall the budget count.
- `activeSpawnPoints(1)` (used by every wave in this 5-wave prototype) returns
  all three `unlockWave: 1` points (`top-left`/`top-middle`/`top-right`) —
  confirmed by reading `world/map.ts`; nothing filters out an active point.
- `hud.ts`'s `waveNumber` field is populated fresh every frame in `game.ts`'s
  `render()` from `this.waveManager.waveIndex + 1` (see the `HudData`
  construction) — not a value captured once at start. There is no snapshot/
  staleness bug.
- **Verified live**: a scripted run pressed the F4 debug key 6 times (2 F4
  presses per full wave = running→intermission→next-wave) and read
  `window.game.waveManager.waveIndex` directly — it went `0 → 3` after 6
  presses and stayed at `3` after a 7th (the 7th only flips `running` to
  `intermission` again, correctly not incrementing further since two presses
  are needed per wave, matching the documented F4 behavior from the
  previous pass). This confirms the state machine transitions and the live
  HUD read are both correct.
- **Conclusion: no regression found.** At the pre-existing `durationSec: 180`
  + `intermissionSec: 60`, a full wave cycle is 4 minutes; if a wave's
  adaptive spawn rate is slow to exhaust budget or the player isn't
  aggressively clearing enemies, "doesn't seem to increment" after a couple
  of minutes of play is exactly what a correctly-functioning 4-minute cycle
  looks like. Item 2 below (60s test waves) directly addresses this for
  faster dev iteration without needing any state-machine fix, because
  there wasn't a bug to fix.

### 2. Wave duration → 60s (temporary testing value) + auto-scaling shop prices

`WAVES[*].durationSec` is `60` for all 5 waves (was `180`), commented in
`config.ts` as an explicit temporary testing value with the designed value
(180) and the revert instructions inline. `intermissionSec` is untouched
(60, as instructed).

Since the shop's price curve was calibrated assuming ~180s/wave of coin
income, `economy/shop.ts::waveDurationScaleFactor()` computes
`average(WAVES[*].durationSec) / WAVE_DESIGN_BASELINE_DURATION_SEC` (a new
`config.ts` constant, `180`) and `priceForLevel()` multiplies every price by
that factor before rounding. Chose a **straight linear ratio of average
actual duration to baseline** (not, say, a sqrt-dampened curve) because the
scaling is explicitly a testing convenience, not a tuned mechanic — the goal
is "prices track available playtime roughly 1:1", and a more clever curve
would just be extra unverified guesswork for a value nobody is meant to see
in the shipped game. Averaging (rather than reading `WAVES[0].durationSec`
directly) is the more robust choice if wave durations ever diverge, though
they don't currently. At 60s test waves this computes `60/180 = 0.333`; at
the designed 180s it's `1.0` (i.e. reverting `durationSec` to 180 for every
wave restores the original prices with zero other code changes, as
required). Verified numerically and visually via a live shop-panel
screenshot at the 60s scaling: `coreHp` level-1 price `round(25 * 1^0.75 *
0.333) = 8` (was 19 at factor 1.0), `spawnerCapacity` level-1 `round(22 *
0.333) = 7` (was 17), `gemChance` level-2 price `round(20 * 2^1.0 * 0.333) =
13` (was 40) — all match what the running game actually charged in the
shop UI screenshot. `economy/devReadout.ts`'s price-curve table calls the
same `priceForLevel()`, so its F9 console readout automatically reflects
scaled prices too; it now also prints the live `waveDurationScaleFactor()`
value in its header line so it's obvious from the readout alone whether
you're looking at scaled-for-testing or calibrated numbers.

### 3. Gem drops

New `GEM` config block: `dropChanceBase: 0.05` (5%), `dropChanceBoss: 0.20`
(20%, checked via `ENEMIES[x].isBoss`/`Entity.isBoss`), `coinValue: 10`,
`chancePerLevel: 0.05` (see item 4). In `game.ts`'s enemy-death loop, each
death rolls `Math.random() < effectiveGemChance(shopLevels, isBoss)` *before*
rolling a normal coin value — on a hit, it spawns a gem-flagged coin instead
of a normal one, so a kill drops exactly one pickup either way (gems don't
stack on top of the base coin).

**Entity/rendering**: extended the existing `kind: 'coin'` entity rather than
adding a new `EntityKind`, since coins already carry all the state (position,
`coinValue`) and go through one magnet/pickup code path in `game.ts` that a
new kind would have had to duplicate. Added `Entity.isGem?: boolean` (types.ts)
and a `createCoin(x, y, value, isGem = false)` overload (factory.ts) that
picks a cyan color (`#5fe0ff`) and slightly larger radius for gems vs the
gold coin. `game.ts`'s coin-render loop draws gems as a small diamond
(4-point rhombus path) instead of a circle — visually distinct at a glance
from the round gold coins, cyan reading clearly against the green/gray map.
The magnet/pickup loop is completely unchanged in structure (same
`pickupRadius`/`magnetRadius`/`magnetSpeed` math keyed off `c.kind ===
'coin'`) — it just also credits `c.coinValue` for gems (already `10` from
creation) and plays `gemPickup` (a brighter two-note sparkle chime,
`audio/sfx.ts`) instead of `coinPickup` when `c.isGem`.

**Scaling decision (documented per the brief)**: gem value is a **flat
`GEM.coinValue = 10`, NOT scaled by the coin-yield-style multiplier or the
current-wave early-call coin bonus** — reasoned as: gems are a separate rare-
drop mechanic layered on top of the base per-kill coin curve, not part of it,
so they shouldn't inherit modifiers designed to tune that curve (an
early-call bonus scaling gem value too would make gem economics accidentally
entangled with intermission-skip timing, which has nothing to do with why
gems exist). The regular coin drop's value calculation is otherwise
unchanged (still `coinsMin..coinsMax` scaled by `(1 + currentWaveCoinBonus)`)
— removing the old `coinYieldMultiplier` factor there is purely because that
multiplier no longer exists (see item 4), not a scaling-philosophy change to
normal coins.

**Verified live** (forced via a scripted `Math.random` override, since 5%
is impractical to trigger by chance in a short run): spawned a grunt far
from the player, force-killed it with the RNG pinned to always take the gem
branch, and confirmed the resulting entity was `{ kind: 'coin', isGem: true,
coinValue: 10 }` in the live game state before pickup. Did not additionally
verify the diamond *rendering* pixel-for-pixel (code-reviewed the draw path
instead) since the forced gem in the live run spawned far from the player
and off the visible viewport at the time of the check.

### 4. Coin Yield → Gem Chance (Base tab)

Removed `coinYield` entirely: gone from `SHOP_ITEMS`, `ShopItemId`,
`ShopLevels`, and `createInitialShopLevels()` in `economy/shop.ts`, and its
`coinYieldMultiplier()` derived-stat function and the `COIN_YIELD_PER_LEVEL`
config constant are deleted (not left dead) since the coin-drop calc no
longer references a coin-yield multiplier at all. In its place: `gemChance`
(Base tab, `base: 20, exponent: 1.0` — same steeper curve as the old
coin-yield item, on purpose: this is still meant to be a "big commitment,
pays off over several waves" lever, not a cheap incremental stat, per the
brief's explicit ask to preserve that design intent). `effectiveGemChance
(levels, isBoss)` is the new derived-stat function (`economy/shop.ts`):
`base rate + levels.gemChance * GEM.chancePerLevel`, clamped to `[0, 1]`.
`chancePerLevel: 0.05` (+5 percentage points per level) was chosen so a
few levels meaningfully move the needle (base 5% → 30% at level 5) without
either level 1 feeling pointless or a maxed item trivializing the coin
economy (a gem is worth 10 coins vs. a grunt's average ~1.5 coins, so even a
30%-gem-chance grunt kill nets on average `0.3*10 + 0.7*1.5 ≈ 4.05` expected
coins — meaningfully better than baseline `1.5` but nowhere near "coins
don't matter anymore").

`economy/describe.ts`'s `gemChance` case shows `"{current}% gem" ->
"{next}% gem"` (the *effective* current-vs-boss-false rate, matching what a
non-boss kill will actually do); `ui/shopPanel.ts` needed no changes beyond
what it already does generically (label + `describeItem()` + `nextPrice()`)
since the row rendering was already fully data-driven off `SHOP_ITEMS`.
`economy/devReadout.ts`'s price-curve table picks up the rename
automatically (iterates `SHOP_ITEMS`); its payoff-verification section was
rewritten from `computeCoinYieldPayoff()` to `computeGemChancePayoff()`,
simulating expected bonus coins per wave as `kills * chancePerLevel *
coinValue` against the same `[25, 36, 52, 69, 109]` kills-per-wave proxy the
old coin-yield section used (repurposed as a kills estimate rather than a
coins-earned estimate, since it's the same "player killing at increasing
capability across 5 waves" shape either way — not re-derived from scratch,
since the exact kill counts were never independently measured and this is a
sanity-check tool, not a hard spec).

**Sanity-checked cost vs. expected value** (at the 60s-scaled test prices,
which is what a dev would actually see running `npm run dev` right now —
noted in the payoff table's header): level 1 costs `7` coins (scaled) and
its marginal +5% gem chance is worth `25 kills-proxy * 0.05 * 10 = 12.5`
expected bonus coins in wave 1 alone — pays for itself within the very first
wave at these compressed test numbers, which is expected and fine since
prices were deliberately compressed 3x for testing (at the *design* baseline
180s/factor-1.0 prices, level 1 costs `20`, breaking even about 65% through
wave 1 — still a fast payback, appropriately so since it's the cheapest
level of the run's biggest econ lever). Level 2 (design-baseline cost `40`)
breaks even by mid-wave-2 under the same kills-proxy — this item is
intentionally a bit more aggressively front-loaded in payoff than the old
coin-yield item was (whose level-1 payoff was "partway through wave 3"),
which is a deliberate choice given the 5-wave MVP is even shorter than the
original spec anticipated needing a 3-wave payoff window for: a
same-magnitude "waits 3 of 5 waves to pay off" lever would barely matter by
the time it pays off. Not claiming these numbers are perfectly balanced —
this is the "use your judgment, sanity-check a couple of levels" bar the
brief asked for, not a fully playtested economy.

### 5. UI hover/click feedback

`ui/shopPanel.ts` gained a `hitTest()` helper shared by both click-handling
and a new `updateHover(mx, my, screenW, screenH)` method (called every
render frame while the shop is open, from `game.ts`'s `render()`, using the
same live `Input.mouseX/mouseY` the click handler already reads) so hover
and click use one source of truth for "what's under the cursor" instead of
two separately-maintained hit-test implementations. Hovering a tab or a
buyable row now draws a light-blue highlight background + border (rows) or
a lighter fill + border (tabs); a first-frame-of-hover transition plays a
quiet `uiHover` blip (`audio/sfx.ts`, new sound, very low gain `0.08` so it
doesn't get annoying while sweeping the mouse across rows) — deliberately
*not* replayed every frame while stationary over the same target, only on
the hover target changing.

Clicking a row now plays `uiClick` (a short, crisp triangle-wave blip,
distinct in timbre/envelope from every gameplay SFX) and, on a successful
purchase, sets a ~120ms press-flash: the row briefly scales down ~3% and
flashes brighter/white-bordered before easing back (`ShopPanel.tickPressFlash
(dt)`, called once per fixed tick while the shop is open from `game.ts`'s
`handleShopInput()`) — purchases now have an immediate, responsive visual
beat instead of only the coins-counter changing. An unaffordable click still
plays a quieter `uiClick` so the click itself registers as felt, without
implying a purchase happened. Switching tabs plays `uiClick` only when the
tab actually changes (clicking the already-active tab is silent, matching
"activation," not "click anywhere"). Scoped exactly to interactive elements
(shop rows + tabs) per the brief — the HUD's HP/core bars, ammo counter,
minimap, etc. are untouched and have no hover state, since they're not
clickable.

**Verified live**: scripted hover over the "Gem Chance" row and screenshotted
the shop panel — the row shows a visible light-blue background+border while
the mouse sits over it, with no console errors from the hover/click code
path across several shop-panel interactions (tab switches, an actual
successful purchase triggered by a real click, hovering).

### 6. Best-effort haptic feedback

New `src/audio/haptics.ts`, mirroring `audio/sfx.ts`'s data-driven-table
pattern: one `HAPTIC_DEFS: Record<HapticKind, HapticPulse>` config object
(`damage`, `coreDamage`, `shoot`, `kill`), one public entry point
`pulseHaptic(kind)`. Two feature-detected backends, both best-effort and
wrapped in try/catch so an unsupported/blocked API is a silent no-op, never
a thrown error:
- **Gamepad rumble**: polls `navigator.getGamepads()` at call time (no
  persistent polling loop needed — the Gamepad API keeps pad state current
  without an explicit connect callback in most engines/browsers) for a
  connected pad exposing `vibrationActuator`, then calls
  `playEffect('dual-rumble', {...})` with `durationMs` in `[50, 140]` and
  magnitudes in `[0.2, 0.6]` — short and moderate per the brief, not a
  full-intensity rumble pack.
- **`navigator.vibrate`** (mobile): called with a short duration
  (`min(50, durationMs)`, so 30-50ms per event) when the API exists.

Wired at the same faction-agnostic call sites the SFX already use, so no new
call sites were needed in gameplay code: `combat/damage.ts::playDamageSfx`
(already dispatches purely off `target.kind`/`isBoss`) now also calls
`pulseHaptic('damage')` on player hits, `pulseHaptic('coreDamage')` on core
hits, and `pulseHaptic('kill')` on enemy death; `combat/playerWeapons.ts`
calls `pulseHaptic('shoot')` on every rifle shot only (not the pistol — the
brief specifically called out "firing the rifle (a very light pulse)").

**Explicitly documented as best-effort/likely-imperceptible on standard
desktop hardware**, per the brief: this session has no gamepad attached and
a desktop browser's `navigator.vibrate` is universally unimplemented, so
none of this is expected to produce any felt effect during the user's normal
mouse+keyboard play — it's cheap, additive, feature-detected wiring for
whenever a gamepad or mobile browser is actually in the loop, not a verified
"feels good" feature. Not smoke-tested against real hardware (none
available); code-reviewed only, and the try/catch wrapping means even a
completely wrong `playEffect` parameter shape on some exotic
`vibrationActuator` implementation would degrade to a silent no-op rather
than an exception breaking gameplay.

### Verification for this pass

- `npm run build` (tsc + vite build) passes clean.
- Playwright smoke run against `npm run dev`: no `pageerror`/`console.error`
  across every interaction exercised (wave force-advance via F4, forced
  enemy death via direct state mutation both with and without a forced gem
  roll, shop-panel open/hover/tab-switch/purchase).
- **Wave counter**: confirmed live via `window.game.waveManager.waveIndex`
  reading `0 → 3` after 6x F4 (2 presses/wave) and holding at `3` after a
  7th press (correctly only flips phase once) — see item 1.
- **Gem drops**: confirmed live via a forced-RNG kill producing a real
  `{ kind: 'coin', isGem: true, coinValue: 10 }` entity in `game.entities`,
  picked up through the same magnet/pickup path as an ordinary coin (not
  independently re-tested since the code path is identical). Diamond
  rendering and the `gemPickup` SFX trigger were verified by code review
  only, not visually/audibly (the forced-gem test entity spawned off the
  visible viewport, by design, so it wouldn't be immediately auto-picked-up
  before the assertion ran).
- **Gem Chance shop item + auto-scaled prices**: confirmed live via a shop-
  panel screenshot at the 60s test-duration scaling showing "Gem Chance (Lv
  0), 5% gem -> 10% gem, 7c" and the other Base-tab items' scaled prices,
  matching the hand-computed `waveDurationScaleFactor() = 0.333` values.
- **UI hover/click feedback**: confirmed live via a shop-panel screenshot
  showing the light-blue hover highlight on a row under the (scripted)
  mouse position, and a real click-driven purchase completing without
  errors (which also exercises the `uiClick` SFX + press-flash timer code
  paths, though the sound itself and the flash's on-screen motion need a
  human to judge "feel").
- **Not verified by direct observation** (needs a human, or hardware this
  session doesn't have): whether the new SFX (`gemPickup`, `uiHover`,
  `uiClick`) actually sound distinct/good in context; the haptics module
  against a real gamepad or mobile device (none available in this
  environment); the press-flash animation's on-screen motion/timing feel;
  and whether `GEM.chancePerLevel`/`gemChance`'s base price feel right in a
  real multi-wave playthrough rather than just the arithmetic sanity check
  above.

## Ally Brownian idle, maze lanes, bigger map, music, less recoil, inventory HUD, movement noise (post-MVP pass 5)

Seven independent items in one round; each gets its own subsection with the
exact numbers chosen and how it was verified.

### 1. Ally idle -> biased Brownian motion

Removed `returnToBase` entirely (`entities/types.ts::AllyBehaviorState` no
longer has it) along with `ALLY.leashRadius`/`idleWanderRadius` and the old
`e.ai.wanderX/wanderY` re-pick-every-2-4s fields. `entities/behaviors/
ally.ts`'s no-target branch is now a single continuous random walk on a
persistent `e.ai.idleVx/idleVy` velocity:

- Each tick: a random-direction acceleration of magnitude
  `Math.random() * ALLY.idleRandomAccel` (`idleRandomAccel: 260` units/s^2)
  is added to the idle velocity.
- A constant homeward acceleration `ALLY.idleHomeBiasAccel = 14` units/s^2
  (~5.4% of the random component's *max* magnitude, and idling allies rarely
  sit at that max) is added toward `CORE`, so the walk drifts home on
  average without ever being a computed "walk to base" vector.
- The combined velocity is clamped to `ALLY.idleMaxSpeed = 70` units/s
  (35% of `ALLY.speed`, so idling still reads as ambling, not sprinting).
- Soft leash: beyond `ALLY.idleSoftBoundRadius = 900` from `CORE`, the bias
  accel scales up via `1 + (distPastBound) * ALLY.idleHomeBiasBoostPerUnit`
  (`idleHomeBiasBoostPerUnit: 0.05`, so 100 units past the bound already
  doubles the pull) — a strengthening pull, never a snap to a beeline state.

Picked `idleRandomAccel`/`idleHomeBiasAccel`/`idleMaxSpeed` by feel from the
old `idleWanderRadius: 60` (a wander that used to stay within a 60-unit
radius) — the new numbers keep a similar "ambling near home" footprint in
the common case while giving it unpredictable structure. **This is the one
change in this round most in need of a human playtest**: "does the wander
feel pleasant / not-jittery / not-too-far-ranging" is a felt quality no
position sample can fully validate. See Verification below for what was
actually observed live (net drift direction *not* monotonic over a 5-second
sample — expected for a Brownian walk with a small bias, but worth a
longer real-time look).

### 2. Orthogonal, maze-like lanes

`world/map.ts`: replaced the one-diagonal-segment-per-spawn-point
`LANE_SEGMENTS` with `buildLanePath()`, a pure function of (spawn point,
gap center) that emits a chain of up to 5 strictly axis-aligned segments:
straight down -> jog sideways onto a midpoint x (offset by a new
`LANE_MAZE.sidewaysJog: 220` so even the top-middle spawn point, whose x
already equals its gap's x, still gets two real turns instead of one
unbroken vertical line) -> straight down again -> jog onto the gap's exact
x -> straight down into the gap. Turn rows are at `LANE_MAZE
.firstTurnFraction: 0.45` / `secondTurnFraction: 0.75` of the vertical drop.
Jog direction alternates per lane (`jogSign`) so the three lanes' zig-zags
don't all lean the same way.

`LANE_SEGMENTS` is kept as the flattened list of every segment across every
lane's path (`LANE_PATHS.flat()`) — same shape as before (an array of
`{x1,y1,x2,y2,width}`), so `world/obstacles.ts`'s lane-exclusion check and
both `render/renderer.ts::drawLanes` and the obstacle/lane drawing needed
**zero code changes**: they already iterate every element of
`LANE_SEGMENTS`, and there are just more elements now. `LANE_PATHS` (the
per-spawn-point grouping) is exported too in case a future pass wants
per-lane logic (e.g. a lane-specific enemy formation).

### 3. Bigger map (3200 -> 4800) + cellSize (32 -> 40)

`WORLD.width/height`: 3200 -> **4800** (2.25x area). Everything derived from
world size scales with it automatically (`CORE`, `SHOP` are formulas off
`WORLD`/`CORE`), and these were scaled explicitly:
- `BASE.wallSetback` 260->390, `wallHalfSpan` 750->1125, `gapOffsets`
  ±400/0 -> ±600/0 (all 1.5x, the *linear* dimension ratio).
- `SPAWN_EDGE_MARGIN` (map.ts) 80->120, `SPAWN_POINT_CLEAR_RADIUS` 160->240
  (1.5x).
- `OBSTACLES.treeCount` 46->104, `rockCountMin` 16->36 (2.25x, the *area*
  ratio, so density per unit area is unchanged rather than the map reading
  emptier); `patchCount`/`patchRadius` scaled 1.5x (9/630) since those are
  more about clump *size* than raw count.

**cellSize 32 -> 40**, specifically to keep the flow-field's cell count
(and thus its one-time Dijkstra recompute cost at level load) from growing
by the full 2.25x area ratio. Measured with a standalone harness
replicating `world/flowfield.ts::FlowField.recompute()`'s exact algorithm
(same Dijkstra + blocked-cell classification, run outside the browser in
Node so timing isn't muddied by first-load JIT warmup) at similar
obstacle counts:

| Config | Cols x Rows | Cells | Recompute (3 runs) |
|---|---|---|---|
| Old: 3200x3200, cellSize 32, ~140 obstacles | 100x100 | 10,000 | 54ms / 80ms / 78ms |
| **New: 4800x4800, cellSize 40, ~330 obstacles** | 120x120 | 14,400 | **26ms / 22ms / 31ms** |
| Alternative not taken: 4800x4800, cellSize 32, ~330 obstacles | 150x150 | 22,500 | 59ms / 44ms / 42ms |

All three are comfortably one-time-cost territory (well under a second), so
this wasn't a "had to" fix — but the chosen 40 actually recomputes *faster*
than the old 3200-map baseline despite the bigger world, because the
obstacle-count-dominated blocked-cell classification pass (`O(cells x
obstacles)`) is the actual bottleneck here, not the Dijkstra itself, and
40's smaller cell count keeps that pass cheap. Went with cellSize 40 over
keeping 32 for exactly that reason: same "not a problem either way" recompute
budget, but a visibly better number, at the cost of slightly coarser flow-
field granularity (40-unit cells vs 32) — imperceptible at the unit
radii (12-45) and speeds (70-200 units/s) involved. `engine/grid.ts`'s
`SpatialGrid` needed no changes: it's a `Map<string, T[]>` keyed by cell
coordinate, so it costs nothing for a bigger, sparser world — occupied
cells is what matters, not the theoretical cell count over the whole map.

### 4. Background music

New `src/audio/music.ts`, following `audio/sfx.ts`'s "pure Web Audio
synthesis, no external files" rule. Approach: pre-render one `LOOP_SECONDS
= 8` second loop into an `AudioBuffer` via `OfflineAudioContext` (a
continuous two-oscillator drone at 55Hz/110Hz — chosen because 55*8=440 and
110*8=880 are both whole numbers of cycles, so the waveform's phase at the
loop's end exactly matches its phase at the start, giving a genuinely
click-free loop with no crossfade needed — plus a sparse one-note-per-second
triangle bassline cycling `BASS_NOTES` and a half-density sine arpeggio
`ARP_NOTES` an octave up, both with envelopes that fully decay before the
loop wraps), then play it back via a real `AudioBufferSourceNode` with
`loop = true`. A second "intense" buffer (same 8s length, same start time)
adds a soft filtered-noise tick every half-second; it's mixed in via a
separate always-present `intenseGain` node ramped 0 <-> `INTENSE_VOLUME`
(0.09) from `setMusicIntensity()`, called from `game.ts` on
boss-warning/boss-alive state changes — cheap (a gain ramp on an
already-running, phase-locked second source), and optional per the brief
("a single good static loop is an acceptable MVP") so it was kept
deliberately minimal rather than building a full layered arrangement.

Mix levels: `BASE_VOLUME = 0.16` against `sfx.ts`'s `masterGain = 0.5` —
roughly a third of the SFX bus's headroom, chosen so gunfire/hits/UI sounds
stay clearly on top per the brief. `initMusic()` hooks the exact same
first-user-gesture call sites as `sfx.ts::initAudio()` (`input.ts`'s
keydown/mousedown handlers) since both need the same autoplay-policy
unlock. Mute: `KeyM` toggles `toggleMusicMute()` (a 0.15s gain ramp, not an
instant cut, so it doesn't click), with a small always-visible "♪ on/off
(M)" indicator added to the HUD's top-right (`ui/hud.ts::drawHud`) — picked
over a debug-overlay-only indicator since debug overlay is F9-gated and
off by default, and the user should be able to see/toggle music state
without enabling debug tools.

**Explicitly not verifiable by this session**: whether the loop actually
sounds "pleasant" — no audio output exists in this environment. What *was*
verified: `OfflineAudioContext` rendering completes and the resulting
`AudioBufferSourceNode` starts without throwing (a Playwright smoke run
that clicks the canvas — the real user-gesture path — produced zero
console/page errors), the mute toggle flips the HUD indicator and (by code
inspection) ramps `musicGain` to 0, and the boss-intensity hook fires
without error when `spawnDirector.bossWarningActive` changes. The
composition itself (note choices, tempo, whether the drone/bass/arp balance
sits right against gunfire) needs a human ear — flagged as the top
"needs playtest" item alongside the Brownian-motion feel.

### 5. Recoil reduced ~1/3 (rifle) and 1/2 (pistol)

`WEAPONS.rifle`: `recoilCamera` 14->4.7, `recoilBarrel` 10->3.3 (divide by
~3). `WEAPONS.pistol`: `recoilCamera` 6->3, `recoilBarrel` 5->2.5 (divide by
2). Different factors because the rifle fires 10 shots/s (fully-automatic)
so successive kicks compound in the ~60ms between shots — even at 1/3
strength the sustained-fire feel is still present — while the pistol's 3
shots/s (single, deliberate presses in practice) never really compounds, so
a milder 1/2 cut keeps its kick still felt without over-correcting.
`RECOIL.decayPerSecond` (16, exponential ease-back) was left untouched:
the decay is a *rate*, not tied to the recoil's peak magnitude — an
exponential decay to neutral takes the same *time* to fall to any given
fraction of its starting amplitude regardless of what that starting
amplitude is, so halving/thirding the peak doesn't by itself desync the
decay feel. On inspection post-change the two still read as consistent
(quick snap, same-speed ease-back, just a smaller kick), so no decay
adjustment was made. Verified live: fired the rifle continuously for 1.5s
in the Playwright smoke run (ammo counter ticked down correctly, 30->17
rounds) with zero console/page errors; the *felt* reduction in screen kick
is, like the other feel-based items, something only a human playing can
really confirm.

### 6. Inventory slot HUD (bottom-right)

`ui/hud.ts`: added `drawInventorySlots()`, a row of 3 44px boxes (matching
the flat-fill/bordered-box visual language `drawBar` already uses)
positioned above the existing ammo/summon-cooldown row, bottom-right. Each
slot gets a simple shape icon so it reads without text — a horizontal bar
for the rifle, a small block for the pistol, a diamond for the wand — plus
its key number in the corner. The active slot (`d.activeSlot`, already
tracked on `Game` for weapon switching) gets a thicker white border;
inactive slots get a dim border. A thin readiness sliver along each slot's
bottom edge shows rifle reload progress (`rifleReloadPct`, computed in
`game.ts` from `playerWeaponState.reloadTimer`/`WEAPONS.rifle.reloadTime`)
and wand cooldown (`wandCooldownPct`, from the existing
`summonCooldownRemaining`/`summonCooldownSeconds()`) — the pistol has no
sliver since it's infinite-ammo with no cooldown to show. Kept to the
"clean static 3-slot bar with a highlight" scope the brief called the core
ask; no drag-and-drop, no reordering, no extra chrome.

Verified live: Playwright screenshots after pressing `Digit2` and `Digit3`
show the white outline moving to the correct slot each time, with the
weapon label/ammo text below updating in sync ("Pistol" / "unlimited",
then "Summon Wand" / "Left-click to summon" with the cooldown sliver on
slot 3 visibly partial after a summon had been cast).

### 7. Shared steering-noise utility (movement variance)

New `entities/movement.ts::applySteeringNoise(entity, dx, dy, dt)`: gives
an entity a persistent angle offset (`Entity.steerNoiseAngle`, eased each
tick toward a periodically-re-rolled `steerNoiseTarget` at
`STEER_NOISE.changeRatePerSecond = 0.6` rad/s, clamped to
±`STEER_NOISE.maxAngleDeg = 16`°) and rotates the given direction vector by
it — a smoothed random walk on heading, cheap (no real Perlin noise
needed) and stateful per-entity so it drifts continuously rather than
jittering every frame. Wired into exactly the "move directly toward a
distant point" call sites the brief named: `entities/behaviors/
enemy.ts::moveToward()` (chase) and both melee/kiter `toCore` branches
(the flow-field direction gets rotated before being applied), and
`entities/behaviors/ally.ts`'s `advance` branch. **Not** applied to the
kiter's kite/chase/strafe distance-maintenance math or to either faction's
contact-range/attack resolution, per the brief, so combat precision is
unaffected — those branches compute `dx/dy` and act on exact distance
without ever calling `applySteeringNoise`.

Picked 16° max / 0.6 rad/s change rate so the effect reads as "a few
degrees of continuous wander" rather than visible spinning, and specifically
small enough that a grunt still reliably threads a 120-unit-wide wall gap
from a lane 180 units wide (16° of heading error over the last ~50 units of
approach is a worst-case ~14-unit lateral miss, well inside the gap's
margin). Verified live via a Playwright sample of `toCore`-state enemies'
actual velocity headings partway up a lane: enemies clustered in the same
lane (~similar x/y) showed heading spreads of roughly 10-20° from each
other rather than an identical heading, e.g. three enemies near x≈2380-2435
in the top-middle lane read 92°/93°/102°, and three in the top-left lane
read 72°/51°/70° — visibly fanned rather than perfectly overlapping, while
still net-progressing down the correct lane toward the core.

### Verification summary for this round

- `npx tsc --noEmit` and `npm run build` both pass clean.
- Playwright smoke run against `npm run dev` (real Chromium, installed via
  `npx playwright install chromium --with-deps`): zero `console.error`/
  `pageerror` across the full interaction sequence (start click, zoom,
  movement, weapon switching x3, sustained rifle fire, music mute toggle).
- **Confirmed live via screenshot**: orthogonal maze lanes with a real 90°
  turn (not a diagonal) partway up a lane; `CORE.x/y` reading 2400/4580 at
  runtime (matching the new `WORLD` 4800x4800 formula); the inventory HUD
  rendering and its highlight moving correctly across all 3 slots; the
  music-mute HUD indicator flipping "on"->"off" text on `KeyM`; rifle fire
  running without error at the new lower recoil values.
- **Confirmed live via `window.game` state sampling** (not just visual):
  ally idle velocities/positions sampled every 0.8s over ~5s showing
  non-monotonic position changes (wandering) rather than a straight line to
  a target; `toCore`-state enemies' velocity headings showing 10-20°
  spread between units in the same lane instead of identical headings.
- **Not verifiable in this environment / needs a human**: how the music
  loop actually *sounds* (composition/mix balance against gunfire) — no
  audio output exists here; whether the ally Brownian-wander *feels* right
  at normal play speed over a longer session than the ~5-20s samples taken
  here (too aimless, too jittery, wanders too far before drifting back);
  whether the reduced recoil feels adequately toned down without being
  "no recoil at all"; and whether the new 4800x4800 map size / obstacle
  density reads as appropriately "fuller" rather than too sparse or too
  cluttered during actual multi-wave play with real enemy counts (this
  pass didn't change `WAVES` enemy counts, so waves 1-5 spread over a
  visibly bigger map — worth a real playtest to see if early waves now
  feel too empty, in which case a future pass should consider bumping wave
  1-2 grunt counts or trimming the map-size increase for a later wave-only
  unlock).

## Acceptance-criteria verification note

See the final chat report for which of the spec's 16 acceptance criteria
were verified (build/type-check plus scripted Playwright smoke runs against
the dev server — movement, aim/zoom accuracy, rifle fire/reload/switch,
summon cast + cooldown UI, spawner ally production and autonomous combat,
grunt streaming/funneling, archer kiting at wave 3, F4/F6/F7/F8 debug keys,
shop open/buy in both tabs, a 300-entity performance stress test, and a
full player-death -> game-over -> restart cycle) versus which still need a
human playing for a full 15-minute session (the full 3-minute wave timer
end-to-end at real speed, the 5-wave "prototype complete" victory screen
reached "the honest way" without F4, and subjective feel of the spawn
director's ramp/decay).

## Difficulty selector, kill-everything wave-end, coin auto-magnet, minimap ally/gem blips, split ally idle-drift, louder/new music (round 6)

### 1. Difficulty selector

New `DifficultyId`/`DifficultyDef`/`DIFFICULTY` table in `config.ts`. `normal`
is exactly 1.0 across every multiplier so it reproduces every prior round's
balance work unchanged — the brief's explicit requirement. Exact numbers:

| id       | label      | color     | enemyHpMult | enemyDmgMult | spawnRateMult | rewardMult |
|----------|-----------|-----------|-------------|--------------|---------------|------------|
| easy     | Easy      | `#3fae4a` | 0.7         | 0.6          | 0.75          | 0.9        |
| normal   | Normal    | `#e0c341` | 1.0         | 1.0          | 1.0           | 1.0        |
| hard     | Hard      | `#e07a1f` | 1.3         | 1.3          | 1.2           | 1.15       |
| veryHard | Very Hard | `#c62828` | 1.7         | 1.6          | 1.45          | 1.35       |
| hell     | Hell      | `#100d0d` | 2.5         | 2.2          | 1.8           | 1.6        |

Reasoning: `enemyDmgMult` is kept slightly below `enemyHpMult` at every tier
above Normal (e.g. Hell 2.2 vs 2.5) because damage compounds multiplicatively
with the player's own regen-delay/iframe mechanics in a way flat HP doesn't
— a damage multiplier that matched HP 1:1 risked one-shot chip-death chains
feeling unfair rather than "hard." `spawnRateMult` scales
`SPAWN_DIRECTOR.baseRate`/`maxRate`/`aliveCap` uniformly (see
`SpawnDirector`'s new `spawnRateMult` constructor param and
`effectiveAliveCap` getter) — Hell's 90-enemy Normal cap becomes a 162-alive
firehose, confirmed live (see verification below). `rewardMult` gives higher
tiers a real payout bump (not just "harder for nothing") — applied to both
the per-kill coin value and the flat gem `coinValue`, on top of (not
replacing) the existing early-call bonus and gem-chance mechanics, which stay
independent per DECISIONS.md's prior "gems are a separate mechanic" call.
Easy pays out slightly *less* (0.9x) since it's already lower-risk.

Colors are the exact hues requested (green/yellow/orange/red/near-black).
Hell uses `#100d0d` rather than pure black so it still reads as "a very dark
color" rather than "a rendering hole," and both the start-screen button and
the HUD swatch always draw a thin `rgba(255,255,255,0.45-0.5)` border
regardless of selection state specifically so the Hell swatch never
disappears against the dark backdrop — confirmed legible in the live
screenshot (see verification).

New `src/ui/startScreen.ts` (matches the existing one-file-per-screen
pattern: `hud.ts`, `minimap.ts`, `shopPanel.ts`): `drawStartScreen()` +
`hitTestStartScreen()` share one button-layout function so a click always
lands on exactly what was drawn. Selectable via number keys 1-5, arrow
keys (wraps), mouse click on a difficulty swatch, and confirmed via
Enter/Space or clicking START.

**Where the start screen fits into the phase machine**: `GamePhase` already
had a `'start'` value declared but nothing ever used it — `reset()`
unconditionally set `phase = 'playing'`, so the game skipped straight into
play on load with no way to reach it. This round actually wires it up: the
constructor now runs `reset()` (to build the world/player once) and then
overrides `phase = 'start'`; `Game.handleStartScreenInput()` handles the
selector and, on confirm, calls `reset()` again (which applies the then-
current `this.difficulty` and sets `phase = 'playing'`).

**Restart-after-death decision**: the brief left "keeps showing/respects the
selection" vs "returns to the selector" as our call. Chose: **pressing R on
game-over/victory returns to the difficulty selector** (`phase = 'start'`)
rather than instantly replaying, with the previous difficulty preselected
(`this.difficulty` is never reset by `reset()` itself, only by explicit
selector input) — this both respects the prior selection *and* lets the
player change it, which a straight "instant replay" couldn't do without a
separate hotkey.

Difficulty is applied at two points: `Game.spawnEnemyFromRequest()` scales
`ENEMIES[kind].hp`/`meleeDamage`/`ranged.damage` via `createEnemy`'s existing
`defOverride` parameter (no change needed to `createEnemy` itself), and
`Game.reset()`/`onWaveTransition()` pass `DIFFICULTY[difficulty].spawnRateMult`
into `new SpawnDirector(wave, mult)`. The HUD shows the current difficulty
as a small colored swatch + label, top-right below the music toggle
(`HudData.difficultyLabel`/`difficultyColor`).

**Verified live** (Playwright against a real Chromium): selecting Hell via
`Digit5` highlighted it with the white selection border in a screenshot; an
F6-debug-spawned grunt on Hell had `health.maxHp === 75` (30 base * 2.5,
exact); `spawnDirector.effectiveAliveCap === 162` on Hell (90 * 1.8, exact).

### 2. Wave-end timing: kill everything, don't just wait out the clock

`WaveManager.update(dt, aliveEnemies)` now takes the current alive-enemy
count: while `phase === 'running'`, `timeRemaining` still counts down and
clamps at 0 exactly as before, but hitting 0 only transitions to
`'intermission'` if `aliveEnemies === 0` too; otherwise it just returns
`false` and stays `'running'` (spawning already stopped, existing enemies
still fully fightable) until a later tick sees `aliveEnemies === 0`.
`'intermission'`'s own countdown-to-next-wave is untouched.

`SpawnDirector` independently refuses to produce any new non-boss-telegraph
spawn request once its own `elapsed >= wave.durationSec` (new `spawningStopped`
getter) — a boss telegraph already in progress is allowed to finish/spawn
even past the cutoff since it was already committed to, but no new clump/
regular spawn starts. This means `game.ts` doesn't need to gate its call to
`spawnDirector.update()` at all — the director gates itself, per the
brief's suggested option. The old `isBudgetExhausted && aliveEnemies === 0`
early-timeout in `game.ts` (which used to zero `timeRemaining` early) was
removed entirely — redundant now that the timer itself is the sole spawn
cutoff and the alive-count gate handles the "already cleared, waiting on
nothing" case naturally (transitions the instant the timer *and* the count
agree).

F4 ("skip wave" dev shortcut) previously worked by forcing
`timeRemaining = -0.001` then calling `update(0)`, relying on the old
unconditional-transition behavior. Since `update()` is now gated on
`aliveEnemies`, F4 would otherwise get stuck if any enemies were alive —
clearly wrong for a dev shortcut. Added `WaveManager.debugForceAdvance()`,
an unconditional phase-advance bypassing the gate entirely, and pointed F4
at it instead.

HUD label (`ui/hud.ts`): while `'running'` and spawning hasn't stopped yet,
shows `"Spawning ends in: m:ss"` (was a bare countdown implying the wave
itself ends there). Once spawning has stopped: if enemies remain, a pulsing
amber `"Clearing remaining enemies..."`; if none remain (the one-tick window
before the phase actually flips), `"Wave clear!"`.

**Soft-lock check** (per the brief's explicit ask): reviewed
`entities/behaviors/enemy.ts` and the flow-field pathing
(`world/flowfield.ts`) — enemies path via a precomputed Dijkstra flow field
over obstacle-free cells, so an enemy cannot spawn or wander into a cell
inside a solid obstacle in the first place (obstacles carve cells out of the
field at recompute time), and the kiter archer's kite/strafe logic only
maintains distance, never flees off the flow field's reachable area. I did
not find a path to a genuinely stuck/unreachable enemy. The one soft-lock
*shape* that remains theoretically possible and is explicitly *not* fixed
here (the brief allows this as acceptable tension): if `SPAWN_DIRECTOR`'s
`aliveCap` combined with an unlucky archer kiting at max range behind heavy
obstacle cover makes the last 1-2 enemies very slow to actually close with
and kill, the player just has to chase them down — by design now, since
that's the whole point of this round's change. Worth a human playtest to
confirm this never drags on uncomfortably long in practice, especially on
Hell where `spawnRateMult` raises `aliveCap` to 162 (more stragglers
possible at the tail of a wave).

**Verified live**: force-set `waveManager.timeRemaining = 0` and
`spawnDirector['elapsed'] = 9999` (spawning fully expired) with exactly one
enemy alive — `waveManager.phase` stayed `'running'` across multiple fixed
ticks (`spawningStopped: true`, `alive: 1`, `phase: 'running'`); killing that
enemy (`dead = true`) then transitioned to `'intermission'` on the next tick.
Screenshot confirms the "Clearing remaining enemies..." HUD label rendering
live under these exact conditions.

### 3. Coins auto-magnetize from anywhere; gems stay manual

`game.ts`'s coin/gem loop: removed the `magnetRadius` distance gate for
non-gem coins entirely — every live coin now unconditionally accelerates
toward the player's current position from the instant it drops, regardless
of who/what killed the enemy or how far away. Gems (`c.isGem`) are
explicitly excluded from this branch and keep the exact old behavior
(magnet only inside `COINS.magnetRadius`, which already equals
`pickupRadius`, i.e. effectively manual walk-up) — `if (!c.isGem || d <=
COINS.magnetRadius)` is the one-line branch that keeps the two paths
sharing the same magnet-then-pickup code without duplicating it, per the
brief's ask to reuse the existing `isGem` flag rather than fork the loop.

`COINS.magnetSpeed` raised from 400 to 650 (see config.ts comment): at 400,
a coin dropped across a large chunk of the now-4800-unit map would take
several visible seconds crawling toward the player, reading as sluggish
rather than a satisfying "snap" now that the mechanic is "from anywhere."
650 was picked as a felt-right middle ground (covers the map's diagonal
span in single-digit seconds) rather than an instant teleport, which would
undercut the "coins visibly fly across the map" spectacle the brief
specifically wants allies-killing-far-away to produce.

**Verified live**: spawned a coin 2000 units from the player and a gem 2000
units on the other side; after 0.5s the coin had moved ~325 units toward the
player (`4460 -> 4135`, exact direction toward player's x) while the gem's
position was pixel-identical to its spawn point (`460,4520` unchanged) —
confirms coins magnetize unconditionally and gems do not.

### 4. Minimap: ally + gem blips

`ui/minimap.ts::drawMinimap()` gained two new optional params (default `[]`,
so no call site besides `game.ts`'s needed updating for type-safety, though
`game.ts`'s was updated to actually pass real data): `allies: MinimapPoint[]`
drawn as small blue (`#3fa9f5`, the same color as the in-world ally
triangle) dots, and `gems: MinimapPoint[]` drawn as small cyan (`#5fe0ff`,
matching the in-world gem diamond) dots — both drawn before the enemy blip
loop so an overlapping enemy blip still reads on top. `game.ts`'s call site
gathers both the same way it already gathers `MinimapEnemy[]`: a `.filter()`
+ `.map()` over `this.entities` for `kind === 'ally' && !dead` and
`kind === 'coin' && isGem && !dead` respectively.

**Verified live**: screenshot with one F6-spawned enemy, one manually-pushed
summoned ally, and one manually-pushed gem all visible simultaneously on the
170x170 minimap in their respective distinct colors.

### 5. Ally idle-drift target split: player-summoned vs spawner-made

`entities/context.ts::WorldContext` gained two new required fields,
`playerX`/`playerY` — the simplest way to give `updateAlly()` live access to
the player's position without pulling in the full player `Entity` or a grid
lookup (matches the "thread it through the same way other systems get
player access" instruction; `game.ts`'s `ctx` object, built fresh every tick
in `simulate()`, now includes `playerX: this.player.x, playerY: this.player.y`
alongside its existing fields). `enemy.ts`'s behavior already receives the
core `Entity` directly as a separate function argument and didn't need any
change.

`entities/behaviors/ally.ts`'s idle-state Brownian-walk logic: the only
change is where `homeX`/`homeY` (formerly a hardcoded `CORE.x`/`CORE.y`)
comes from — `e.summonedByPlayer ? [ctx.playerX, ctx.playerY] : [CORE.x,
CORE.y]`. Every other part of the mechanic (random-accel nudge, clamp to
`idleMaxSpeed`, soft-bound bias boost past `idleSoftBoundRadius`) is
untouched and reads the live player position fresh every tick (no snapshot
staleness) since `ctx` is rebuilt every `simulate()` call.

**Verified live** two ways: (1) in the running game, pushed one summoned and
one spawner ally near the player, drove the player ~300 units away over
1.5s, and watched positions after — inconclusive on its own since the
random-walk component dominates over a few seconds (by design: the home
bias is deliberately weak per round 5). (2) A clean isolated unit-test-style
check: called `updateAlly()` directly for 200 ticks (dt=0.1) with
`Math.random` monkeypatched to return 0 (removing all randomness, isolating
pure bias-driven motion) and a "player" fixed far from CORE — the summoned
ally moved in a dead-straight line toward the player's exact position
(ending exactly on the player's y and having covered exactly
`idleMaxSpeed * elapsed` = 70*20 = 1400 units of x, landing at x=2400 as
expected), while the spawner ally moved in a dead-straight line toward
CORE's exact bearing (`atan2(3580,1400) = 68.6°`, matching its measured
displacement angle to within floating-point precision). This cleanly
confirms the split is implemented correctly, independent of the noisy
random-walk component.

### 6. Music: louder + a genuinely different composition

`audio/music.ts`: `BASE_VOLUME` raised from 0.16 to **0.42** (~2.6x) — the
explicit "much louder" ask, landing clearly as the dominant ambient layer
while staying under SFX's `masterGain` (0.5 in `sfx.ts`) so per-shot/per-hit
SFX still read on top rather than being buried (SFX operates as discrete
transient spikes over the continuous music bed, so "under the SFX ceiling"
still leaves plenty of headroom for gunfire to cut through even at 0.42).
`INTENSE_VOLUME` (the boss-mode additive layer) scaled up alongside it,
0.09 -> 0.22, to stay proportionate.

New composition, not just a volume change:
  - `LOOP_SECONDS` moved from 8 to 12, restructured as 4 bars of 3s each.
  - Replaced the old single continuous sub-drone (kept, same trick, still
    two integer-cycle sines for a click-free loop) + one-note-per-second
    sparse bassline + straight-eighths ascending arpeggio, with: the same
    sub-drone (now at LOOP_SECONDS=12-compatible integer-cycle frequencies,
    110Hz/55Hz still both exact), a **driving 8th-note bass pulse** (2
    hits/sec, sawtooth) that **walks a 4-chord minor progression**
    (Am-F-C-G, i.e. `CHORD_ROOTS = [110, 87.31, 130.81, 98]`) one chord per
    bar, a **sustained triangle-wave chord pad** (root+third+fifth held per
    bar) giving real harmonic movement the old loop never had (it only ever
    sounded one note at a time), and a **syncopated square-wave lead riff**
    on an irregular beat-offset table (`LEAD_STEP_TIMES`) instead of the old
    perfectly-even every-2-seconds arpeggio. The chord progression, the
    added chord-pad harmony, the doubled tempo, and the syncopated (rather
    than metronomic) lead rhythm are all genuinely different compositional
    choices, not a re-skin of the same loop — the intent was for a human
    listener to immediately hear it as a different piece, not "the same
    ambient drone, just louder."
  - The seamless-loop mechanism (render into an `OfflineAudioContext`
    buffer, play back via a looping `AudioBufferSourceNode`) and the
    boss-mode "intense" layer / mute toggle are all unchanged in mechanism,
    only in the numbers that scale with the new `LOOP_SECONDS`.

**Not verifiable in this environment**: how the new loop actually *sounds*
— no audio output exists here (same caveat as round 5). This is explicitly
flagged for the user's own playtest, along with "does Hell actually feel
hellish."

### Verification summary for this round

- `npx tsc --noEmit` and `npm run build` both pass clean.
- Full Playwright smoke suite against `npm run dev` (real Chromium): zero
  console errors/pageerrors across every scenario below.
- Difficulty selector: screenshot confirms Hell's near-black swatch is
  legible and correctly highlighted when selected via keyboard; F6-spawned
  grunt HP and `spawnDirector.effectiveAliveCap` both matched the exact
  Hell multipliers (75 HP = 30*2.5; 162 cap = 90*1.8).
- Wave-end gating: `waveManager.phase` stayed `'running'` with the timer and
  spawn-cutoff both expired while one enemy was alive; transitioned to
  `'intermission'` the tick after that enemy died. HUD's "Clearing remaining
  enemies..." label confirmed rendering under these exact conditions via
  screenshot; "Spawning ends in: m:ss" confirmed for the normal countdown
  case, and the top-right difficulty swatch/label confirmed rendering
  correctly for both Normal (yellow) and Very Hard (red) in separate runs.
- Coins: confirmed unconditional long-range homing (a coin 2000 units away
  moved ~325 units toward the player in 0.5s); gems confirmed to NOT move at
  all under the identical setup (pixel-identical position after 0.5s).
- Minimap: ally (blue) and gem (cyan) blips both confirmed rendering
  alongside the existing enemy blip in one screenshot.
- Ally idle-drift split: confirmed via a randomness-eliminated isolated
  replay of `updateAlly()` that a summoned ally's pure home-bias motion
  points exactly at a moving "player" position while a spawner ally's points
  exactly at CORE's bearing — removes the round-5 random-walk noise that
  would otherwise make this hard to observe over a short window.
- Regression check: music mute toggle (`KeyM`) still flips `isMusicMuted()`
  correctly after all of the above changes.
- **Not verifiable in this environment / needs a human**: how the new music
  loop sounds (louder + different composition — the explicit ask was purely
  subjective and there's no audio output here); whether Hell actually feels
  appropriately brutal and Easy appropriately forgiving over a real multi-
  wave playthrough rather than the single-spawn spot-checks done here;
  whether waiting out the last 1-3 stragglers of a wave (especially a kiting
  archer) after spawning has stopped feels like satisfying "finish the job"
  tension or occasionally like tedious mop-up, particularly on Hell where
  `aliveCap` is raised to 162 and more stragglers can be left at the tail;
  whether the new coin-magnet-from-anywhere speed (650) feels right at
  actual play distances rather than the synthetic 2000-unit test case used
  here.

## Bigger player/archer, difficulty-driven archer intro timing, grid-of-roads map, 2x UI text (round 7)

This round picked up mid-flight from a prior agent session that was cut off
by a rate limit partway through. The working tree already contained a
substantially complete implementation of all four goals; this pass verified
each against the goals, found and fixed one real bug (unrelated to this
round's own changes — see the flow-field note below), and confirmed the
rest via `npm run build` plus a Playwright smoke pass against `npm run dev`.

### 1. Bigger player and archer

- `PLAYER.radius`: 14 -> **20**. `ENEMIES.archer.radius`: 13 -> **19**.
  Chosen judgmentally to read clearly larger next to grunt (14, unchanged)
  and the boss (45, unchanged) without the player/archer approaching boss
  scale.
- Verified (by reading `entities/factory.ts`) that every consumer reads
  `PLAYER.radius`/`e.radius` live rather than hardcoding the old 14/13:
  collision radius, the barrel-line length (`r + 14 * camera.pixelScale -
  pullback` in both `renderer.ts` and `rendererDetailed.ts` — the `14` there
  is an unrelated fixed barrel-protrusion-past-the-hitbox constant, not the
  old player radius, and needed no change), and muzzle offsets. No code
  changes were needed here beyond the two config numbers the prior session
  had already landed.

### 2. Difficulty-driven archer introduction timing

- Added `archerIntroWave` (a plain number field) per `DifficultyDef` tier:

  | Difficulty | archerIntroWave |
  |---|---|
  | Easy | 3 (same as Normal's baseline) |
  | Normal | 3 (WAVES' own unscaled baseline — unchanged) |
  | Hard | 2 |
  | Very Hard | 1 |
  | Hell | 1 |

- Implemented as pure data + one pure function
  (`getWaveForDifficulty(base, difficultyId)` in `config.ts`), not
  conditionals scattered through `SpawnDirector`/behavior code: if the
  base `WaveDef` (from `WAVES`) already has archers, or the wave number is
  still earlier than this difficulty's `archerIntroWave`, the wave is
  returned unchanged. Otherwise a fixed `DIFFICULTY_ARCHER_INTRO_SHARE =
  0.25` fraction of that wave's existing `grunts + archers` budget is
  converted to archers (kept modest vs. wave 3's baseline ~29% archer
  share, so an early-Hell wave 1 stays grunt-dominant rather than
  swarming the player with kiting archers before any shop upgrades).
  `game.ts` calls this at both initial `reset()` and every
  `onWaveTransition()` when constructing `SpawnDirector`, so
  `SpawnDirector`/`spawnDirector.ts` itself needed zero changes — it just
  consumes whatever `WaveDef` it's handed.
- Re-verified `enemyHpMult`/`enemyDmgMult` apply to all enemy kinds, not
  just grunts: `Game.spawnEnemyFromRequest()` (`game.ts`) looks up
  `ENEMIES[kind]` generically (`kind` being `'grunt' | 'archer' | 'boss'`)
  and applies the multipliers to `hp`, `meleeDamage`, and — when the def
  has a `ranged` block (archers) — `ranged.damage`. This was already
  correct from a prior completed round; no change needed this round.

### 3. Grid-of-roads map

- Replaced the maze-lane system (`LANES`/`LANE_MAZE`/`LANE_SEGMENTS`/
  `buildLanePath()`) entirely with `ROAD_GRID = { spacing: 800, width:
  160 }` (`config.ts`) and `ROAD_LINES`/`onRoadGrid()` (`world/map.ts`):
  evenly spaced vertical/horizontal lines at 800/1600/2400/3200/4000 on
  the 4800x4800 world (5 lines per axis, 36 blocks total). 2400 is both a
  grid line and `CORE.x`, so the base's spawn lane lines up with the grid
  automatically. `width: 160` is close to the old `LANES.width` (180)
  "concrete strip" footprint, trimmed slightly since there are now many
  road strips crossing the whole map instead of a few point-to-point
  corridors.
- Spawn points now sit on the grid lines themselves (`world/map.ts`) —
  the three wave-1 spawn points read as roads leading down onto the grid
  rather than an arbitrary edge margin. The 3 active (wave-1) spawn
  points remain top-left/top-middle/top-right; mid-left/mid-right still
  unlock at wave 15 as before.
- Obstacle placement (`world/obstacles.ts`) now excludes the road grid via
  `onRoadGrid()`/`ROAD_LINES` instead of the old per-lane-segment distance
  check, and patch centers are kept off the grid by `ROAD_GRID.width/2 +
  80`. Counts were retuned for the new geometry (`config.ts::OBSTACLES`):
  `treeCount` 104 -> **150**, `rockCountMin` 36 -> **54**, `patchCount` 9
  -> **26**, `patchRadius` 630 -> **260** (sized to fit one block's
  ~640-unit interior without spilling across a road), `scatterFraction`
  0.15 -> **0.2**. Rationale: the road grid is a thinner lattice than the
  old maze lanes' several wide corridors, so more open area exists overall
  — counts were raised so the block interiors still read as "scattered
  forest" rather than emptier than the old map.
- Base wall/gap choke system (`WALL_SEGMENTS`, `BASE.gapOffsets`) is
  entirely untouched — still bottom-middle, still the funnel mechanic
  right at the base perimeter. The road grid is purely a visual/obstacle-
  exclusion feature; the flow field only reads `WALL_SEGMENTS` + the
  obstacle list, so pathfinding needed no change to keep funneling enemies
  through the wall gaps on the new map (confirmed via screenshot: enemies'
  spawn-to-gap flow is unaffected by the grid).
- **Both F10 render styles already share the grid**: `drawWorldBackground()`
  (`render/renderer.ts`) draws the road grid and is called unconditionally
  in `game.ts`'s render loop before the style-specific
  `drawObstacles(Detailed)`/`drawWalls(Detailed)` branch — so
  `rendererDetailed.ts` needed *no changes at all* for the road grid to
  appear in the detailed style too. Confirmed via screenshot: the grid,
  spacing, and forest blocks are pixel-identical between F10's flat and
  detailed styles (they only differ in obstacle/wall/entity shading, which
  is `rendererDetailed.ts`'s actual job).

### 4. Universal 2x UI text

- Every `ctx.font = ...` call across `src/` was grepped and confirmed
  updated: `game.ts` (game-over/victory screen: 40->80px title, 18->36px
  stat lines, 16->32px restart prompt), `ui/hud.ts` (all HUD text, plus
  the inventory-slot box bumped 44->52px so the doubled slot-number label
  still fits), `ui/shopPanel.ts` (panel grown 560x520 -> 860x760, row
  height 40->62, tab height 36->56, tab width introduced at 260 since tabs
  are now drawn from a shared `TAB_W` constant instead of two independent
  hardcoded widths), `ui/debugOverlay.ts` (both the F1 overlay and F7
  spawn readout panels doubled in both font size and panel/line-spacing
  dimensions), `ui/minimap.ts` (boss warning banner), `ui/startScreen.ts`
  (title, difficulty buttons widened 148->210px to fit "Very Hard" at the
  doubled font, start button, help text). `render/renderer.ts` and
  `render/rendererDetailed.ts` contain no `ctx.font` calls at all (no
  floating in-world text/labels exist in this game — health bars are drawn
  as plain filled rects, not text), so nothing there needed touching.
- Verified via Playwright screenshots at 1400x900 that none of the above
  overlap or clip at the new sizes: start screen (title/subtitle/buttons/
  help text all clear of each other), HUD in a live run (coins/wave/timer/
  HP+core bars/inventory slots/summon bar all readable with clear
  padding), and the shop panel (title/coins/tabs/all 7 weapon rows/hint
  text, or the Base tab) — screenshots on file in this session's scratch
  space. One pre-existing, out-of-scope overlap was noted but not touched:
  the F1 debug overlay panel visually sits on top of the top-left Coins/
  Wave/Enemies-alive HUD text when both are visible simultaneously — this
  overlap predates this round (the old 230x164 debug panel already
  covered the same HUD text region at the old sizes) and debug overlay is
  a developer-only toggle, not part of the "no overlapping UI text" ask
  for normal play.

### Bugfix found and fixed this round (pre-existing, unrelated to the 4 goals)

`world/flowfield.ts`'s `MinHeap.pop()` stored heap entries as a flattened
`[dist, index, dist, index, ...]` array and used two `Array.pop()` calls to
retrieve the last pair when reheapifying — but assigned the two popped
values (`index` pops off the end first, `dist` second) to variables named
the opposite way around. This silently swapped `dist`<->`index` on every
pop, corrupting the heap's ordering without ever throwing, so
`recompute()` "worked" but degenerated from a proper O(V log V) Dijkstra
into pushing enormous numbers of redundant heap entries — turning what
should be a <50ms one-time cost per flow-field recompute into multiple
minutes, badly stalling gameplay every time the field needs to
recalculate. Confirmed pre-existing and unrelated to this round's map
changes (reproduces bit-for-bit against the pre-round-7 committed
`flowfield.ts`). Fixed by swapping the two `pop()` assignments to match
the actual push order.

### Verification summary for this round

- `npx tsc` (via `npm run build`) passes clean; production build succeeds.
- Playwright smoke pass against `npm run dev` (real Chromium), zero
  console errors/pageerrors across every scenario below:
  - Start screen screenshot: title/difficulty buttons/START button/help
    text all render without overlap at the 2x sizes.
  - Selected Very Hard and Hell via keyboard (4/5), started, and
    screenshotted the F1+F7 debug overlays live in both F10 render
    styles — panels, line spacing and the rolling spawn-rate graph all
    render at the new 2x sizes without clipping.
  - Zoomed out via mouse wheel on Normal difficulty and screenshotted the
    road grid in both F10 styles side by side: uniform horizontal/
    vertical concrete strips with dashed centerlines, green block
    interiors scattered with trees/rocks, base wall segments with gaps
    still bottom-middle — pixel-identical grid between the two render
    styles, confirming goal 3 needed no `rendererDetailed.ts` changes.
    Enemies (F6-spawned) visible flowing toward the wall gaps normally on
    the new map.
  - Bigger player/archer confirmed visually in the same screenshots — the
    player hexagon reads noticeably larger relative to the grid/obstacles
    than the pre-round-7 radius would have.
  - Walked to the shop marker and opened the shop panel (E): screenshot
    confirms the grown panel (860x760) cleanly fits the title, coin
    counter, both tabs, and all 7 weapon rows at the doubled fonts with no
    row-to-row or column overlap.
  - Confirmed by code reading (`config.ts::getWaveForDifficulty`,
    `game.ts::spawnEnemyFromRequest`) rather than a live per-difficulty
    wave-composition readout, since the F7 debug panel shows only the
    combined grunt+archer spawn budget total, not the split — the total
    (`grunts+archers`) is unchanged by `getWaveForDifficulty`, so it
    reads identically for Normal and Hell wave 1 even though the actual
    kind split differs, which is expected and by design (composition
    swap, not a headcount change).
- **Not verifiable in this environment / needs a human**: whether the
  earlier archer introduction actually feels appropriately harder rather
  than just different on Hard/Very Hard/Hell over a real playthrough;
  whether the new road-grid map's sightlines/block layout feel good for
  actual play (vs. the old maze lanes) especially for archer-kiting near
  block corners; whether the bigger player/archer hitboxes change melee
  balance in ways that need a numeric follow-up.

## Endless mode past wave 5, and difficulty/endless-scaled hue-shifted enemy colors (round 8)

Two items requested in one pass. Numbers below are in `src/config.ts` unless noted.

### 1. Endless mode

**The old terminal state is gone.** `WaveManager.advanceToNextWave()` used to
set `phase = 'allWavesComplete'` once `waveIndex >= WAVES.length - 1`, which
`game.ts` turned into a `'victory'` game phase and a "PROTOTYPE COMPLETE"
screen that ended the run. That branch is deleted entirely: wave 5 clearing
now just advances to wave 6 through the exact same running→intermission→
next-wave cycle every other wave transition uses, forever. `GamePhase`
dropped `'victory'` and `WaveManager.WavePhase` keeps `'allWavesComplete'`
only as an unreachable type member (nothing sets it anymore) rather than
ripping out a type touched by `HudData`/`debugOverlay` call sites for no
behavioral gain. **Death (player or core HP 0) is now the only way a run
ends** — F4/Space-skip-intermission/the shop all keep working completely
unchanged for wave 6+, since they only ever called the same
`onWaveTransition()`/`debugForceAdvance()` paths that already worked for
waves 1-5.

**A one-time celebratory banner** ("WAVE 5 COMPLETE — ENDLESS MODE") marks
the milestone without freezing the run: `WaveManager.justEnteredEndless`
flips `true` for exactly one tick, the tick `advanceToNextWave()` moves off
`waveIndex === WAVES.length - 1` (i.e. wave 5 → 6), and `game.ts`'s
`onWaveTransition()` consumes that flag into a 3.5s fading
`endlessBannerTimer` (drawn every frame it's `> 0`, faded over its last 0.8s)
— purely a rendering/UI concern, no simulation state depends on it.

**`WAVES` stays a fixed 5-element array**, per the architecture constraint.
Wave 6+ is synthesized on demand by a new `getWaveDef(waveNumber)` in
`config.ts`, which `WaveManager.currentWave` now calls (`getWaveDef(waveIndex
+ 1)`) instead of indexing `WAVES` directly:
- `waveNumber <= WAVES.length` returns the real `WAVES[waveNumber-1]` entry,
  unchanged.
- `waveNumber > WAVES.length` synthesizes a `WaveDef` from `WAVES[4]` (wave
  5's shape): same `boss` count (1) and `durationSec`/`intermissionSec`,
  with `grunts`/`archers` scaled up by a capped linear `budgetScale = 1 +
  ENDLESS.budgetGrowthPerWavePastFive * (waveNumber - 5)` (0.08/wave, capped
  at `ENDLESS.maxBudgetScale = 3.0`, reached at wave 30 and held flat past
  that). **Why scale the budget at all** (rather than repeating wave 5's
  exact 40/24/1 forever, which the brief offered as the simpler option): the
  spawn *rate* also escalates via `endlessFactor` (below), and with a flat
  budget a higher rate just burns through the same number of enemies faster
  — the wave would spend proportionally *less* of its 60s window actively
  spawning as endless waves get deeper, which reads as "pressure peaks early
  then goes quiet," not "the wave is doing more." A mild linear-and-capped
  budget bump keeps total spawned enemies roughly in proportion to the
  rate's own growth without letting per-wave headcount run away
  unboundedly (the alive-cap, itself also endless-scaled — see below — is
  the actual backstop against an unplayable on-screen entity count).
  `getWaveForDifficulty()` (unchanged code, just now also receiving
  synthesized wave defs) still applies its early-archer-intro logic
  correctly since it only reads `base.wave`/`base.archers`, both of which
  `getWaveDef` populates correctly for any wave number.

**The escalation factor itself**, `endlessFactor(waveNumber)` in
`config.ts`:

```
endlessFactor(w) = 1.0                          for w <= 5
endlessFactor(w) = ENDLESS.growthRate ^ (w - 5) for w > 5
```

`ENDLESS.growthRate = 1.12` — the middle of the requested 1.08-1.15 band.
Worked examples (composed multiplicatively with difficulty, per the brief —
`effectiveSpawnRateMult() = DIFFICULTY[id].spawnRateMult * endlessFactor(waveNumber)`,
used both for `SpawnDirector`'s rate/alive-cap scaling and, combined with
`enemyHpMult`/`enemyDmgMult`, for per-enemy HP/damage in
`spawnEnemyFromRequest`):

| Wave | `endlessFactor` | Normal (mult=1.0) HP/dmg/spawn-rate | Hell (hpMult 2.5, dmgMult 2.2, spawnMult 1.8) HP / dmg / spawn-rate |
|---|---|---|---|
| 10 | 1.12^5 = **1.762** | 1.76x across the board | HP 4.41x / dmg 3.88x / rate 3.17x |
| 15 | 1.12^10 = **3.106** | 3.11x across the board | HP 7.77x / dmg 6.83x / rate 5.59x |
| 20 | 1.12^15 = **5.474** | 5.47x across the board | HP 13.68x / dmg 12.04x / rate 9.85x |

Sanity check on "not too spiky, not trivial": going from wave 5 to wave 10
(5 waves) is +76% across the board at Normal — a real step up but not a
sudden wall; by wave 20 (15 waves past the static content) Normal enemies
are at ~5.5x their wave-5 stats, which reads as "endless mode is genuinely
a different, much harder regime by wave 20" without needing an exponent
above ~1.15 (which would roughly double this: `1.15^15 ≈ 8.14x`, judged too
steep for the same wave count) or below ~1.08 (`1.08^15 ≈ 3.17x`, judged to
flatten out too gently to feel like it's "escalating" by wave 20). Hell
stacking on top compounds as intended — a Hell wave-20 grunt hits for
~12x its Normal-wave-5 damage, which is the explicitly-requested
"harder difficulty and deeper endless progress should both matter"
behavior, not a bug to soften.

`SpawnDirector`'s own `spawnRateMult` constructor param (previously just
`DIFFICULTY[id].spawnRateMult`) is now always `Game.effectiveSpawnRateMult()`
— both `reset()` and `onWaveTransition()` construct it that way, so wave
1-5 behavior is unchanged (`endlessFactor <= 5` is always `1.0`) and wave
6+ automatically gets the composed scaling with no `SpawnDirector` code
changes (it already had a `spawnRateMult` parameter from round 6's
difficulty work).

**HUD/debug**: `HudData.totalWaves` (always `5`) was replaced with
`isEndless: boolean` (`waveIndex + 1 > WAVES.length`); the wave line reads
`Wave 6/5`-style text only through wave 5 (`Wave N/5`) and switches to
`Wave N (Endless)` once past it — no more claiming a 5-wave cap once the run
has exceeded it. F7's spawn-director readout gained an `endless factor: X.XXx`
line (the same `endlessFactor(waveNumber)` value) so it's visible how much
of the current rate/cap comes from endless depth vs. difficulty at a
glance, and its `aliveCap` field was fixed from a stale raw
`SPAWN_DIRECTOR.aliveCap` constant read (which silently drifted from the
truth the moment `spawnRateMult` started composing two factors) to the
live `SpawnDirector.debugSnapshot().effectiveAliveCap` — same class of bug
DECISIONS.md previously flagged and fixed for a hardcoded `aliveCap: 45`
literal in round 3, now recurring for a different reason and fixed the same
way.

### 2. Difficulty/endless-scaled hue-shifted enemy colors

**New `src/render/colorUtils.ts`** (checked `renderer.ts`/`rendererDetailed.ts`
first — the only existing color helper there is `rendererDetailed.ts`'s
`shade(hex, percent)`, a flat per-channel lighten/darken with no hue
concept, not reusable for a hue rotation): hex→RGB→HSL→shift→RGB→hex, one
public function `warmHexColor(hex, amount)`. `amount` is `0..1` (clamped);
`0` returns the input unchanged (verified: a Normal-difficulty wave-1 grunt
spawns with the exact literal `#8f00ff` from `ENEMIES.grunt.color`, not a
near-miss from a no-op color round-trip). The hue shift moves the color's
hue toward 0°/360° (red) **the short way around the wheel**: computed as
`delta = ((0 - hue + 540) % 360) - 180` (the signed shortest angular
distance from the base hue to 0, in `(-180, 180]`) and `newHue = hue + delta
* amount`. For violet/indigo (~270-280°) this moves hue *upward* toward
360 (wrapping to 0) — i.e. through magenta/pink toward red — since that's
~85-90° away, versus ~270-280° the other way through blue/cyan/green/
yellow; the near-red boss base color (~0°) barely moves either direction.
Saturation gets a modest `+0.15 * amount` boost (capped at 1.0) for a more
vivid "enraged" look at high warmth; lightness is left untouched so shape/
brightness silhouette reads the same, only the hue/vividness changes.

**Combined "power level" per spawned enemy**, computed in `game.ts`'s
`spawnEnemyFromRequest` (the same function that already builds the `hp`/
`meleeDamage`/`ranged.damage` override object from `diff.enemyHpMult`/
`enemyDmgMult`):

```
powerLevel = diff.enemyHpMult * endlessFactor(waveNumber)
warmth = clamp(1 - 1/powerLevel, 0, 1)
```

`enemyHpMult` was picked as the primary difficulty driver (over averaging
every multiplier) because it's the stat every difficulty tier scales most
aggressively and consistently (0.7x on Easy up to 2.5x on Hell) and it's
already the natural "how much tankier is this enemy" signal; folding in
`enemyDmgMult`/`spawnRateMult`/`rewardMult` too would just be redundant
noise correlated with the same tier. `1 - 1/x` was chosen over a linear or
raw-multiplier mapping specifically because it **saturates** — it's 0 at
`powerLevel == 1` (Normal, wave ≤ 5: enemies look exactly like base
`ENEMIES` colors, per the explicit "Easy wave-1 grunt looks close to normal
violet" requirement) and asymptotically approaches but never reaches 1 as
`powerLevel` grows without bound, so an extreme endless-wave/Hell
combination can't "blow out" past pure red or wrap around into a new,
confusing hue — it just gets asymptotically closer to fully red. Worked
values: Hell wave 1 (`powerLevel = 2.5*1 = 2.5`) → `warmth = 0.6`; Hell wave
10 (`powerLevel = 2.5*1.762 = 4.41`) → `warmth = 0.773`; Hell wave 20
(`powerLevel = 2.5*5.474 = 13.68`) → `warmth = 0.927`; Normal wave 20
(`powerLevel = 1*5.474 = 5.474`) → `warmth = 0.817` (endless depth alone,
even at Normal difficulty, visibly warms colors by wave 20 — judged correct
per the brief's "whether from difficulty selection OR endless-wave scaling"
framing, not a bug to special-case away).

**Wiring**: `override.color = warmHexColor(def.color, warmth)` is added to
the same `override: Partial<EnemyDef>` object `spawnEnemyFromRequest`
already builds and passes to `createEnemy()`. No changes were needed in
`entities/factory.ts` (`createEnemy` already does `{ ...ENEMIES[archetype],
...defOverride }` then `e.color = def.color`, so any override field —
`hp`, `meleeDamage`, now `color` — flows through identically) or in either
render path: both `render/renderer.ts` (`shapeColorWithFlash(e)` returns
`e.color`, only substituting pure white during the existing hit-flash
window) and `render/rendererDetailed.ts` (same pattern) already read the
per-entity `e.color` rather than looking up `ENEMIES[archetype].color`
directly — no render-path bypass to fix.

### Verification for this pass

- `npm run build` (tsc + vite build) passes clean.
- Playwright smoke run against `npm run dev` (headless Chromium):
  - Selected Hell, pressed F4 14 times (2 presses/wave through waves 1-5)
    and confirmed live state: `phase: 'playing'`, `waveManager.waveIndex: 7`
    (wave 8), `wavePhase: 'running'` — the run continued straight through
    wave 5 into wave 8 with no victory screen at any point.
  - F6-spawned a grunt at that point (Hell, wave 8): got back `hp: 105,
    dmg: 25, color: '#ff0068'`. Checked against the formula by hand: `hp =
    round(30 * 2.5 * 1.12^3) = round(30*2.5*1.405) = round(105.4) = 105`;
    `dmg = round(8 * 2.2 * 1.405) = round(24.7) = 25` — both match exactly.
  - `SpawnDirector.debugSnapshot()` at that point showed `currentRate:
    0.885`, `effectiveAliveCap: 228` — both well above the wave-1-Normal
    baseline (`baseRate 0.35`, `aliveCap 90`), confirming spawn-rate/cap
    endless+difficulty composition is live, not just the per-enemy stats.
  - Screenshotted the running game at that state: HUD reads "Wave 8
    (Endless)", the "WAVE 5 COMPLETE — ENDLESS MODE" banner is visible, and
    the F6-spawned grunt renders as a small hot-pink/red circle — visibly
    warmer than base violet while staying recognizably grunt-shaped/sized
    next to the (still dark-red, barely-shifted) boss-shaped core and the
    unaffected blue spawner boxes.
  - Separately confirmed a Normal-difficulty, wave-1 F6-spawned grunt is
    exactly `color: '#8f00ff'` (the literal base `ENEMIES.grunt.color`,
    zero drift) in **both** F10 render styles (flat and detailed
    screenshots both show the same unmodified violet circle) — the `amount
    === 0` no-op path round-trips exactly.
  - Pushed to a much deeper run (20 F4 presses on Hell, landing at
    `waveIndex: 10` / wave 11) and F6-spawned another grunt: `hp: 148`
    (formula: `round(30*2.5*1.12^6) = round(30*2.5*1.9738) = round(148.04)
    = 148`, matches) and a noticeably-more-saturated red (`color:
    '#ff004a'`) than the wave-8 sample above — confirms warmth increases
    monotonically with wave depth, not just a one-time step. Screenshotted
    in both render styles (both show the same hue-shifted red circle).
  - Forced player HP to 0 directly on that same deep-endless run and
    confirmed `phase` transitions to `'gameover'` exactly as before, with
    the game-over screen correctly reading "Wave reached: 11" (not capped
    at 5, not crashing on an out-of-bounds `WAVES` index) — death is still
    the real, working end condition in endless mode.
  - No `pageerror`/`console.error` events across any of the above.
- **Not verified in this environment / needs a human**: the actual "feel"
  of the `growthRate = 1.12` pacing over a real, non-F4-skipped playthrough
  (whether wave 8-12 in particular feels like a fair ramp rather than a
  wall, since that's exactly where a single-player build's gear/shop levels
  are still catching up); whether magenta-leaning mid-warmth colors (e.g.
  the `#ff0068`/`#ff004a` samples above) read as clearly "enraged/warmer"
  to a human eye rather than just "a different color," versus a design that
  detoured through orange/yellow first — the brief's own hue-wheel
  reasoning (shift toward 0°, short way around from ~270-280°) mandates the
  magenta-then-red path taken here, but only a human looking at it can
  confirm it reads as "warming" rather than "random-ish"; and whether
  `budgetGrowthPerWavePastFive = 0.08`/`maxBudgetScale = 3.0` keeps wave
  pacing feeling right at very deep endless waves (30+) rather than either
  dragging on too long (too many enemies for the alive cap to admit
  quickly) or feeling sparse (cap reached too fast, then idle).
