# Feature 31 — completed

Cross-links: [todo-9.md](../todo-9.md) · [implementation](../implementation-feature-31.md)
· overlaps [Feature 47](../implementation-feature-47.md) (depot/market transaction hardening)
· widened by [Feature 30](../implementation-feature-30.md) (materialize-on-open).

---

## 2026-07-25 — Retry consolidation, migration-drift fix, unpersisted-loot guard

### 1. Economy/depot/market/trade transactions now retry

**Problem.** `item/withSerializableTransaction` retried serialization aborts,
but `economy/runSerializableTransaction` (used by bank, shop, trade, market,
wheel gems, VIP, houses, promotions, the Mantus store, moderation and guilds)
and the near-identical `depot/runSerializableTransaction` did not. Five stores
had each grown their own bespoke retry loop around it — with three different
attempt counts (3 or 5) and two different backoff policies — and the remaining
callers had none at all. Its `catch` also ran `await client.query("ROLLBACK")`
unguarded: on a dead connection the rollback threw and *replaced* the original
cause, which silently converted a `TransactionRollback` (a business outcome
that must resolve, not throw) into a hard error.

**What changed.**

- `server/src/economy/runSerializableTransaction.ts` gained the retry loop:
  5 attempts, `RETRY_BACKOFF_MS * attempt` growing backoff, fresh connection
  and fresh transaction per attempt, so every read and execution-time check
  re-runs against the winner's committed state. The rollback is now wrapped in
  its own try/catch so the original cause always survives.
- `server/src/depot/runSerializableTransaction.ts` and its three one-line SQL
  constants were deleted; the four depot ops now import the economy helper,
  which is what trade/market/house/etc. already did.
- The bespoke retry wrappers in `PgGuildStore`, `PgHouseStore`,
  `PgModerationStore`, `PgVipStore` and `PgMantusStore` were removed. Leaving
  them would have nested 5 attempts inside 3–5 more (up to 25 round trips on a
  hot row). Their 28 `this.transact(...)` call sites now call
  `runSerializableTransaction(this.pool, ...)` directly.
- `isSerializationFailure` moved from `server/src/guild/` to
  `server/src/economy/` — economy is where the shared helper now lives, and
  importing it out of `guild/` was backwards layering.

**Deliberate deviation from the recorded plan.** The implementation note asked
for the `withSerializableTransaction` pattern *including*
`isTransientDatabaseError`. That broader set (connection resets, `08*`,
`ECONNRESET`, …) is **not** used here. Those errors leave the commit outcome
ambiguous: the COMMIT may already have landed when the socket died. Item ops
can absorb that because every guarded op carries an expected version, so a
re-run misses instead of double-applying. Economy money legs are not
version-guarded, so retrying an ambiguous bank/market/store transfer could
apply it twice — a dupe. `40001` and `40P01` are *guaranteed* server-side
rollbacks with nothing applied, so re-running those is safe. The test suite
pins this: a connection reset must not retry.

### 2. Integration tests no longer drift from the migration set

**Problem.** All eighteen `*.integration.test.ts` files replayed a
hand-maintained list of migration filenames. Every new migration silently
skipped every one of them, so the schema under test drifted from production.

**What changed.** New `server/src/test/applyMigrations.ts` reads
`server/db/migrations/`, validates the `NNN_name.sql` filename shape, sorts by
version number (same ordering `scripts/migrate.ts` uses) and replays all of it.
All eighteen tests now call `await applyMigrations(setupClient)`.

The first run of the full replay immediately caught real drift:
`PgMantusStore.integration.test.ts` was inserting `max_health` / `max_mana` /
`capacity` into `characters`, columns `007_progression.sql` had dropped — its
hardcoded list stopped at `004`. That insert is now aligned with the live
schema. This is exactly the failure mode the feature predicted.

### 3. Unpersisted-loot guard

**Problem (the fragile invariant).** Memory-first corpses have no DB row until
first touch. A guarded `write`/`delete`/`stage` against such an item can only
miss, and a missed guarded op poisons the persist chain and resyncs the player.
`planLoot` / `planPickup` / `planMoveMapItem` handled loot origins; `planDrop`
did not. Its merge path emitted `{ kind: "write", expectedVersion:
mergeTarget.version }` against whatever `findWorldMergeTarget` returned — and
that helper does not exclude unpersisted stacks. `planMoveMapItem`'s
seed-merge branch had the same hole in its `delete` of the merge target.

**What changed.**

- New `server/src/item/plan/appendMergeTargetPersist.ts`: for a merge survivor
  with a loot origin it emits `insert` (in the already-merged state) plus the
  `loot-created` audit; otherwise the ordinary guarded `write`.
  `planDrop` (both the whole-stack and partial-drop branches) and
  `planMoveMapItem` now share it.
- `planMoveMapItem`'s seed-merge branch skips the merge-target `delete` when
  that target has no row.
- New `server/src/item/plan/findUnpersistedGuardViolation.ts`: a pure checker
  that walks a plan's `rowOps` in order and reports the first guarded op
  against an item that has a loot origin and no preceding `insert` in the same
  plan. Planner tests assert it returns null.

**Files touched.**

- `server/src/economy/runSerializableTransaction.ts`,
  `server/src/economy/isSerializationFailure.ts` (moved from `guild/`)
- `server/src/economy/runSerializableTransaction.test.ts` (new)
- `server/src/depot/runSerializableTransaction.ts`,
  `server/src/depot/sql/{beginSerializableTransaction,commitTransaction,rollbackTransaction}.ts`
  (deleted); `DepotPersistOps.ts`, `DepotMailOps.ts`, `DepotExpiryOps.ts`,
  `DepotRewardOps.ts`
- `server/src/guild/PgGuildStore.ts`, `server/src/house/PgHouseStore.ts`,
  `server/src/moderation/PgModerationStore.ts`,
  `server/src/social/PgVipStore.ts`, `server/src/store/PgMantusStore.ts`
- `server/src/test/applyMigrations.ts` (new) and all 18
  `*.integration.test.ts` files
- `server/src/item/plan/appendMergeTargetPersist.ts` (new),
  `findUnpersistedGuardViolation.ts` (new),
  `unpersistedLootInvariant.test.ts` (new), `planDrop.ts`,
  `planMoveMapItem.ts`

**Verification.**

- `npx vitest run` — 819 passed, 18 files skipped (the DB-gated integration
  suites), 0 failed.
- `TEST_DATABASE_URL=… npx vitest run integration.test` — 182 passed across all
  18 integration files with the full migration replay.
- `npx tsc --noEmit -p .` clean; `yarn workspace client typecheck` clean.
- New: 7 `runSerializableTransaction` tests (retries 40001 and 40P01; bounded
  give-up; business rollback never retried and still resolves; connection reset
  never retried; validation error never retried; rollback-statement failure
  still resolves the business rollback) and 6 unpersisted-loot invariant tests.

**Not done, deliberately.**

- `ProgressionSystem.persistAward` debounce. The implementation note says to
  add it *only* if 40001 exhaustion is actually observed under kill bursts. It
  has not been, and `PgItemStore.integration.test.ts` still proves the existing
  5-attempt budget survives a kill-time save burst. Not added preemptively.

**Residual risk / accepted limitations.**

- Untouched corpses and their loot still vanish on restart. This is intended
  and matches Canary; it is not a bug to fix.
- `findUnpersistedGuardViolation` is a test-time checker, not a hot-path
  assertion — running it inside the tick would add per-plan work for a case
  that must never happen. New planners have to opt into it in their tests.
- The economy retry deliberately does not cover connection-level transients
  (see the deviation note above); those still surface as errors to the caller.
