# Feature 15 — Process-kill crash durability harness

Part of [Todo 6 — Items and inventory](todo-6.md).

**Completed 2026-07-24 (harness).** A crash-injection seam in
`withSerializableTransaction` (`ITEM_TX_CRASH_POINT`, read once at import,
no-op in production) abruptly ends the process with `process.exit(137)` before
or after COMMIT, severing the DB socket mid-transaction. `crashHarness/crashWorker.ts`
runs one memory-first ownership move in a spawned child; `PgItemCrashHarness.integration.test.ts`
asserts kill-before-commit leaves the item in its original location, kill-after-commit
in its new location (one row each, no dupes), and the control commits. The one
seam covers every item write path (all use `withSerializableTransaction`). Full
record and the `process.exit` vs SIGKILL rationale in
[completed/implementation-feature-15-completed.md](completed/implementation-feature-15-completed.md).

## Accepted limitation (still open)

A future map-version upgrade needs an explicit seed reconciliation migration
(recorded when the world-seed path landed). Unrelated to the crash harness;
keep tracking here until implemented.

## Dependencies

- Requires `TEST_DATABASE_URL` (persistent playtest/integration DB).
