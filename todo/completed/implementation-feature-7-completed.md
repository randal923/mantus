# Feature 7 — completed

Cross-links: [implementation-feature-7.md](../implementation-feature-7.md) ·
[todo-4.md](../todo-4.md).

---

## 2026-07-24 — First-class world-seed reconciliation path

**Problem.** Re-running the map converter changes the world-item seed hash, so
persisted delta rows carrying the old `seed_map_version` make the server throw
"persisted world items require reconciliation" at startup
(`server/src/item/PgItemReads.ts`). The `items_immutable_identity` trigger
forbids rewriting `seed_map_version`, and `cleanupPartialWorldSeed.ts` refuses
to run once real gameplay data exists. The dev fix (verify each stale row's seed
key still exists in the new items.bin, then DELETE with audit) had only been
done by hand (5 door rows, 2026-07-20). Production needs an audited, fail-closed
path (charter rules 11 & 12).

**What changed.**

- `server/src/item/reconcileWorldSeed.ts` (new) — testable core. Selects stale
  rows (`seed_map_name = $map AND seed_map_version <> $current`) `FOR UPDATE`.
  Classifiable (safe to delete) requires ALL of: seed_key still in the new
  items.bin, still `world`/`house`-located in place (deleting a seed item a
  player picked up would be theft), and no materialized child items (a modified
  container needs manual review). Any other stale row is unclassifiable and the
  function throws, so the caller ROLLBACKs the whole transaction. Each deletion
  writes an `item-destroyed` audit row (reason `world-seed-reconciliation`, with
  seedKey + stale/current versions) in the same transaction. The item reverts to
  its fresh seeded state via the memory-first materializer — not a dupe.
- `server/src/item/collectWorldSeedKeys.ts` (new) — builds the valid seed-key
  set from `items.bin` (each classification-1 entry →
  `${mapName}:${x}:${y}:${z}:${stackIndex}`) plus recursive `:content:${slot}`
  keys from `content.json` (reusing `loadWorldItemSources`), matching how
  `loadMapItems`/`PgWorldItemMaterializer` derive them.
- `server/scripts/reconcileWorldSeed.ts` (new) — offline wrapper: derives
  `mapVersion = sha256(mapSha256:itemsSha256)` from `<map>.map.json`, builds the
  valid seed-key set, and runs the core inside one SERIALIZABLE transaction,
  COMMIT on success / ROLLBACK on any unclassifiable row. Run with the server
  down (never from the tick). Wired as `yarn workspace server db:reconcile-world-seed`.

**Files touched.** `server/src/item/reconcileWorldSeed.ts` (new),
`server/src/item/collectWorldSeedKeys.ts` (new),
`server/scripts/reconcileWorldSeed.ts` (new),
`server/src/item/reconcileWorldSeed.integration.test.ts` (new),
`server/src/item/collectWorldSeedKeys.test.ts` (new),
`server/package.json` (script + integration-test wiring).

**Verification.**
- `server/src/item/reconcileWorldSeed.integration.test.ts` (pg-backed, 3 tests)
  against the dev Postgres: reconciliation deletes stale in-place rows, writes a
  matching `item-destroyed` audit row, and leaves current-version rows untouched
  (no orphans); an unclassifiable stale row (seed key absent from the new
  items.bin) aborts the whole transaction with nothing applied; a no-op when all
  rows are current. Wired into `yarn workspace server test:integration`.
- `server/src/item/collectWorldSeedKeys.test.ts` (3 tests) — entry/content key
  derivation and TITM validation.
- `yarn workspace server typecheck` clean; `tsc --noEmit scripts/reconcileWorldSeed.ts` clean.

**Residual risk.** Deliberately conservative: only in-place, childless
world/house rows whose seed key still exists are auto-deleted. Modified world
containers, seed items a player has picked up, and rows whose seed fixture was
removed from the map all fail closed for manual operator review rather than
risk theft or a dupe. If those cases become common, extend the classifier (e.g.
depth-first container deletion) with the same audit-per-row guarantee. Related
to Feature 99 (db audit/recovery operations).
