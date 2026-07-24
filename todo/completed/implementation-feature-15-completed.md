# Feature 15 — completed

Cross-links: [implementation-feature-15.md](../implementation-feature-15.md) ·
[todo-6.md](../todo-6.md).

---

## 2026-07-24 — Process-kill crash durability harness

**Problem.** The one unchecked exploit test from the item-system definition of
done: an abrupt process death around an ownership transaction must leave the
item in exactly one durable location after restart. The existing fault-injection
suite used in-process throws, which approximate but do not prove abrupt death.

**What changed.**

- `server/src/item/withSerializableTransaction.ts` — added a crash-injection
  seam. `ITEM_TX_CRASH_POINT` is read **once at import** (unset in production →
  the hot path is a single constant comparison). When set to `"before-commit"`
  or `"after-commit"`, `crashIfInjected` calls `process.exit(137)` at that
  transaction boundary: the OS severs the DB socket with the transaction still
  open (before) or already committed (after), running no rollback, flush, or
  graceful shutdown — exactly the state a SIGKILL leaves. `withSerializableTransaction`
  is the single wrapper for **every** item write path (moves, equip, pickup,
  drop, the memory-first `PgItemPersistOps` persist), so the one seam covers all
  of them.
- `server/src/item/crashHarness/crashWorker.ts` (new) — a child process (never
  imported by the game server) that connects to the harness DB/schema and runs
  one memory-first ownership move (`planMoveToContainer` → `store.persist`).
- `server/src/item/PgItemCrashHarness.integration.test.ts` (new) — sets up a
  schema + character + backpack + pouch, then spawns the worker (via `tsx`) for
  each boundary and asserts the durable outcome.
- `server/package.json` — added the harness to `test:integration`.

**Why `process.exit(137)`, not SIGKILL.** Self-`SIGKILL` raced a clean process
exit unreliably (the after-commit case sometimes exited 0), and an *external*
SIGKILL did not survive the `tsx` child boundary (a child blocked in
`Atomics.wait` was not terminated). `process.exit(137)` is deterministic,
runs no cleanup, and severs the DB connection mid-transaction — the invariant
under test (an abrupt death leaves exactly one durable location) is what matters,
not the specific signal number. 137 marks the injected crash for the assertions.

**Files touched.** `server/src/item/withSerializableTransaction.ts`,
`server/src/item/crashHarness/crashWorker.ts` (new),
`server/src/item/PgItemCrashHarness.integration.test.ts` (new),
`server/package.json`.

**Verification (against local Postgres).**
- kill-before-commit → worker exits 137; the item stays in the backpack at its
  original slot, v1 — exactly one row (transaction aborted by the severed
  connection).
- kill-after-commit → worker exits 137; the item is only in the pouch at the new
  slot, v2 — exactly one row, no duplicate.
- no-crash control → worker exits 0; the item moved.
- `TEST_DATABASE_URL=… vitest run …PgItemCrashHarness.integration.test.ts` →
  3 passed, ~2 s, no hang. `yarn workspace server test` → 757 passed;
  `typecheck` clean; the seam is a no-op with `ITEM_TX_CRASH_POINT` unset.

**Residual risk / remaining work.** The harness proves the move (container)
path, the canonical ownership transfer. The other memory-first paths (equip,
pickup, drop) share the same `withSerializableTransaction` wrapper and seam, so
they are covered by construction; adding per-path worker variants is
straightforward follow-up if desired. The separately-recorded accepted
limitation — a future map-version upgrade needs an explicit seed reconciliation
migration — is unrelated and still tracked in
[implementation-feature-15.md](../implementation-feature-15.md).
