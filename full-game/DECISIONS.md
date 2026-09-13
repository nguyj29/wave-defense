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
