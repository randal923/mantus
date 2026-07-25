# Feature 34 — completed

Cross-links: [todo-9.md](../todo-9.md) · [implementation](../implementation-feature-34.md)
· [Feature 31 log](implementation-feature-31-completed.md) (memory-first corpse invariants)
· [Feature 33](../implementation-feature-33.md) (carried/field decay, which inherits this clock).

---

## 2026-07-25 — Decay deadlines resume from the persisted row instead of restarting

**Problem.** Decay deadlines lived purely in memory. On boot, every persisted
world item with decay metadata was re-armed with its *full* duration, so a
restart silently extended the life of every decayable on the ground. The
accepted-limitation wording was "later, never earlier, never twice" — safe, but
a restart-hoarding lever and a bad base for Feature 33's carried deadlines.

**What changed.**

- `server/src/item/sql/worldTreeItemsQuery.ts` now also selects
  `age_ms` — `GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - updated_at)) *
  1000))::bigint` — how long each row has been unchanged. It is computed
  entirely on the **database** clock, so skew between the app host and the DB
  host cannot shift a resumed deadline.
- `WorldItemDeltas` carries `agesMs: ReadonlyMap<string, number>` alongside
  `items`; `PgItemReads.loadWorldDeltas` fills it.
- `DecayManager.observeLoaded(items, agesMs, now)` arms each boot deadline at
  `now - ageMs + duration` instead of `now + duration`. A missing, non-finite
  or negative age falls back to a full duration, so a bad value can never arm
  a deadline in the future or crash the boot.
- `WorldItemDecayRunner.schedule` and `ItemIntentHandler.scheduleWorldDecay`
  thread `agesMs` through; `GameServer` passes
  `deps.worldItemDeltas?.agesMs ?? new Map()`.

Everything else is untouched: `observeCreated` / `observeMutation` still arm
from `now` (a live mutation *is* the arm), execution is still version-guarded
at both the world re-check and the store transaction, and transforms are still
audited exactly as before. Collected records leave the schedule, so an item
whose duration lapsed during downtime transforms once on the first tick, not
once per tick.

**Deliberate deviation from the recorded plan.** The plan called for a
migration adding a `decay_at` column, written in `PgDecayOps` when arming a
deadline. That was not built, for two reasons:

1. `PgDecayOps` *executes* decays; it never arms them. Arming happens in
   memory, in the tick, on every mutation. Writing `decay_at` at arm time
   would mean an extra DB write per world-item mutation, and threading a
   deadline parameter through the ~39 statements that write item rows.
2. The value is redundant. A decay deadline is always
   `last-mutation-time + duration(type)`, `duration` comes from the catalog,
   and `last-mutation-time` is already durable as `items.updated_at`. Deriving
   it costs one expression in one boot query and zero writes.

The behaviour the feature asked for is identical; only the storage is.

**Guarding the derivation.** Because the deadline now depends on
`items.updated_at` being bumped by every write, a new
`server/src/item/updatedAtInvariant.test.ts` scans every non-test source file
for an `UPDATE items` that does not set `updated_at` and fails on any hit. All
39 current statements already set it; the test keeps the next one honest.

**Files touched.**

- `server/src/item/sql/worldTreeItemsQuery.ts`
- `server/src/item/WorldItemDeltas.ts`, `server/src/item/PgItemReads.ts`
- `server/src/item/DecayManager.ts`,
  `server/src/item/WorldItemDecayRunner.ts`,
  `server/src/item/ItemIntentHandler.ts`, `server/src/GameServer.ts`
- `server/src/item/MemoryItemStore.ts`, `server/src/World.ts` (default deltas)
- `server/src/item/updatedAtInvariant.test.ts` (new),
  `server/src/item/DecayManager.test.ts`,
  `server/src/item/ItemIntentHandler.decay.test.ts`,
  `server/src/item/PgItemStore.integration.test.ts`,
  `server/src/item/WorldItemSeeder.test.ts`

**Verification.**

- `DecayManager.test.ts` — mid-duration resume (4 s of a 10 s duration elapsed
  → due at +6 s, not +10 s); elapsed-while-down is due immediately and
  collected exactly once; missing age falls back to a full duration; a
  negative age is ignored rather than arming the future.
- `ItemIntentHandler.decay.test.ts` — a loaded corpse whose stage-one duration
  lapsed during an hour of downtime transforms once, immediately, through the
  real store path, and its next stage is armed fresh rather than collapsed by
  the same downtime.
- `PgItemStore.integration.test.ts` — new case against real Postgres: two
  world items, one backdated 90 s via `updated_at`, and `loadWorldDeltas`
  reports integer ages that match (this is what proves the new SQL runs; no
  integration test previously covered `loadWorldDeltas`).
- Full suites: `npx vitest run` 825 passed / 18 files skipped;
  `TEST_DATABASE_URL=… npx vitest run integration.test` 182 passed across all
  18 files; `npx tsc --noEmit -p .` and `yarn workspace client typecheck`
  clean; `yarn workspace client test` 224 passed.

**Residual risk / accepted limitations.**

- A world item is now resumed from its row age, so an item that sat persisted
  through a long outage decays on the first tick after boot. That is the
  intended behaviour change; a long outage no longer grants free lifetime.
- `restore()` (re-arming a record whose execution failed) still uses a full
  duration from `now`. That path is a retry after a transient failure, not a
  restart, and re-reading the row's age there would cost a query on the error
  path.
- Carried/equipped items still have no decay at all — that is Feature 33,
  which can reuse `observeLoaded`'s clock once carried deadlines exist.
