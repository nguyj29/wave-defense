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
