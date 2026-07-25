# TODO

The backlog for full parity with the pinned Canary baseline lives under
[`todo/`](todo/README.md). It was restructured 2026-07-24 from a full audit of
the previous per-area files against the codebase:

- [`todo/done.md`](todo/done.md) — everything already shipped, grouped by area.
- [`todo/todo-1.md`](todo/todo-1.md) … [`todo/todo-22.md`](todo/todo-22.md) —
  the 22 remaining areas, each listing its numbered features.
- `todo/implementation-feature-N.md` — one implementation plan per remaining
  feature (107 total): remaining work, file surface, approach, Canary
  references, and required exploit/regression tests.

Start with the [overview](todo/README.md) for the pinned upstream snapshots,
rewrite boundary, cross-cutting rules, and recommended order. Feature 1 (the
Canary parity ledger) is the cross-cutting completion contract; Feature 100
(testing and release gates) is the final pre-launch gate.

Add a newly discovered gap to the narrowest matching todo area; add it here
only when it needs a new area or changes the implementation order. Known
limitations accepted during a session are recorded in the owning feature file
(per `AGENTS.md`).

## Accepted gaps

- **Wheel-upgraded (WOD) combat areas are modelled at their base grade only**
  (2026-07-25, Feature 25). Spells that build one combat per Wheel of Destiny
  grade — Energy Beam (`AREA_BEAM5` → `AREA_BEAM7`), Energy Wave
  (`AREA_SQUAREWAVE5` → `AREA_WAVE7`), Great Energy Beam (`AREA_BEAM8` →
  `AREA_BEAM10`), Great Death Beam (`AREA_BEAM6`/`7`/`8` by grade), Mass
  Healing and Sap Strength — import the **first** helper call site, which is
  the un-upgraded combat. The upgraded areas are simply not applied; nothing
  is mis-applied. Fix: extend the catalog entry to carry a per-grade area list
  and pick the grade from `player.wheelBonuses` at cast time, the same way
  `wheelRevelation` is now enforced in `SpellCaster.spellRejectionCode`.
  Owner: Todo 15 (deferred wheel combat perks).

## Repo-wide known breakage

- `yarn parity:check` (and therefore `yarn test:tools`) fails at HEAD:
  `tools/importTibiaAssets.mjs` no longer matches its
  `content/source-manifest.json` converter hash. Pre-existing, unrelated to any
  current feature work — reconcile the asset importer with its manifest entry.
  Every other converter hash verifies.
