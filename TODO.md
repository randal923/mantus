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

- **Economy transactions retry only on `40001`/`40P01`, not on connection-level
  transients** (2026-07-25, Feature 31). `item/withSerializableTransaction`
  retries the broader `isTransientDatabaseError` set because every item op is
  expected-version guarded, so an ambiguous re-run misses instead of
  double-applying. Money legs in `economy/runSerializableTransaction` are not
  version-guarded, so retrying an `ECONNRESET`/`08*` whose COMMIT may already
  have landed could apply a transfer twice. Serialization aborts and deadlocks
  are guaranteed rollbacks and are retried. Fix if connection-level retry is
  ever wanted: give the money legs an idempotency key (the market replay-guard
  pattern) first. Owner: Feature 47 (depot/market transaction hardening).
- **Untouched corpses and their loot vanish on restart** (Feature 31,
  re-affirmed 2026-07-25). Intended, matches Canary — memory-first corpses have
  no DB row until first touch. Not a bug.
- **World decay deadlines are derived from `items.updated_at`, not a stored
  `decay_at`** (2026-07-25, Feature 34). A deadline is always
  `last-mutation-time + duration(type)`, so the column would be redundant and
  would cost a DB write per world-item mutation. The derivation depends on
  every `UPDATE items` bumping `updated_at`;
  `server/src/item/updatedAtInvariant.test.ts` enforces that. If a future
  decay ever needs a deadline that is *not* "full duration from the last
  mutation" (a paused/stop-condition decay — Feature 33), that item does need a
  stored deadline; add the column then, for those items only.

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

- **38 pinned monster loot entries can never drop** (2026-07-25, Feature 29).
  Twelve items (darklight/inferniarch-era drops) exist in the pinned Canary
  monster tables but not in the pinned Tibia 15.11 item catalog, so the roll
  skips them. The budget is pinned by `monsterLootParity.test.ts`, which fails
  if a thirteenth appears. Fix: a newer asset era, not a code change.
- **Blessings are always zero** (2026-07-25, Feature 32). The full Canary death
  loss formula reads a blessing count through `Player.blessings`, which is a
  seam that returns 0 until Feature 72 ships blessing purchase, persistence,
  and consumption. Until then the penalty is only reduced by promotion and the
  unfair-fight reduction, and no items are dropped into a player corpse.
- **Ignore lists are memory-only** (2026-07-25, Feature 35). They survive a
  relogin (keyed by character id for the server's lifetime) but not a restart.
  Fix: a table alongside the other social stores; the suppression path itself
  needs no change.

## Repo-wide known breakage

- `yarn parity:check` (and therefore `yarn test:tools`) fails at HEAD:
  `tools/importTibiaAssets.mjs` no longer matches its
  `content/source-manifest.json` converter hash. Pre-existing, unrelated to any
  current feature work — reconcile the asset importer with its manifest entry.
  Every other converter hash verifies.
