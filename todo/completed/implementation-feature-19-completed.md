# Feature 19 — completed

Cross-links: [implementation-feature-19.md](../implementation-feature-19.md) ·
[todo-7.md](../todo-7.md).

---

## 2026-07-24 — Bound progression event-id growth

**Problem.** Every awarded kill/skill/magic event appended an id to the
in-memory `processedEventIds` set (and `sessionEvents`) and a row to
`progression_events`, and nothing ever pruned them. Memory and table size grew
forever with playtime — an unbounded-growth bug (charter rule 10 in spirit:
no unbounded per-connection resource growth).

**Key property that makes pruning safe.** Progression event ids are globally
unique and never re-delivered: combat ids are `{prefix}:{runId}:{counter}`
(fresh `runId` UUID per server run, monotonic counter) and death ids are
`death:{uuid}`. A restarted server never regenerates a prior id, so once an
event's award is durable it will never be replayed — dropping its id past a
bounded window cannot cause a double-award. The retained window is
defense-in-depth, not a correctness bound.

**What changed (durable side).**

- `server/db/migrations/037_progression_event_pruning.sql` — adds
  `snapshot_version integer` to `progression_events` plus a
  `(character_id, snapshot_version)` index.
- `server/src/character/sql/insertProgressionEventsQuery.ts` — inserts tag the
  new character version; new `pruneProgressionEventsQuery` deletes rows older
  than the window; exports `RETAINED_PROGRESSION_SNAPSHOT_VERSIONS = 4`.
- `server/src/character/PgCharacterStore.ts` (`saveSnapshot`) — after inserting
  the batch, prunes `snapshot_version < version - RETAINED` in the **same
  transaction**, so an id is discarded only once the snapshot reflecting it is
  durable. Legacy rows (`snapshot_version = 0`) age out on the next few saves.

**What changed (in-memory side).**

- `server/src/progression/CharacterProgression.ts` — `sessionEvents` became a
  compacting queue with `reservedEventCount`/`committedEventCount`. New
  `reserveUnpersistedEvents()` (advances the reserve pointer, called once per
  enqueued snapshot so pipelined saves partition without overlap) and
  `commitPersistedEvents(count)` (advances the commit pointer in snapshot-commit
  order, then compacts: drops settled events past `RETAINED_MEMORY_EVENTS = 256`
  from both `sessionEvents` and `processedEventIds`). Ids loaded from the DB stay
  in `processedEventIds` and are themselves bounded by the durable prune.
- `server/src/character/CharacterPersistence.ts` — dropped the
  `nextProgressionEventIndex` bookkeeping; the snapshot now reserves events, and
  the durable-commit path calls `commitPersistedEvents` so memory compaction
  mirrors the table prune. Uncommitted (in-flight) events are never dropped.

**Files touched.** `server/db/migrations/037_progression_event_pruning.sql`
(new), `server/src/character/sql/insertProgressionEventsQuery.ts`,
`server/src/character/PgCharacterStore.ts`,
`server/src/progression/CharacterProgression.ts`,
`server/src/character/CharacterPersistence.ts`,
`server/src/progression/CharacterProgression.test.ts`,
`server/src/character/PgCharacterStore.integration.test.ts`.

**Verification.**
- `CharacterProgression.test.ts` — (1) bounds the queue to the retained window
  after a large commit while a replay of a still-retained id is deduped and does
  not double-award; (2) an event awarded *after* reserve but *before* commit
  survives compaction both as a dedupe guard and as an unreserved event for the
  next snapshot — pruning cannot race a concurrent award.
- `PgCharacterStore.integration.test.ts` — one event per save across enough
  versions asserts only the newest window of ids survives (older rows pruned in
  the durable transaction). Ran against the local Postgres:
  `TEST_DATABASE_URL=… vitest run …PgCharacterStore.integration.test.ts` →
  15 passed.
- `yarn workspace server test` → 730 passed / 178 skipped;
  `yarn workspace server typecheck` clean.

**Residual risk.** Static legacy sets (a character that gained events long ago
and never again) only shrink on the next event-bearing save; that is bounded,
not growing, so it is acceptable. Window sizes (`RETAINED_PROGRESSION_SNAPSHOT_
VERSIONS`, `RETAINED_MEMORY_EVENTS`) are single-source constants and can be
retuned in one place.
