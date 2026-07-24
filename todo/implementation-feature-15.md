# Feature 15 — Process-kill crash durability harness

Part of [Todo 6 — Items and inventory](todo-6.md).

## Why

This is the one unchecked exploit test from the item-system definition of done: abrupt process death around an ownership transaction must leave the item in exactly one durable location after restart. The current Postgres fault-injection suite approximates but does not prove it.

## Remaining work

- Build a true process-kill crash harness; the current fault-injection suite covers capacity, ancestry, rollback, audit atomicity, and conjuring, but only runs when `TEST_DATABASE_URL` is set.
- Related accepted limitation (record stays until fixed): a future map-version upgrade needs an explicit seed reconciliation migration.

## Implementation

- Harness that spawns the game server as a child process, delivers SIGKILL immediately before and immediately after commit in the write paths of `/home/randal/code/tibia/server/src/item/PgItemPersistOps.ts`, restarts the server, and asserts the item has exactly one durable location.
- Extend the existing integration-test infrastructure in `/home/randal/code/tibia/server/src/item/PgItemStore.integration.test.ts` (pg integration-test setup is documented in memory: item-drag-optimistic-queue notes).

## Tests

- Kill-before-commit: item remains in its original location after restart; no duplicate.
- Kill-after-commit: item exists only in its new location after restart; no duplicate.
- Both variants for each memory-first write path (move, equip, pickup, drop).

## Dependencies

- Requires `TEST_DATABASE_URL` (persistent playtest/integration DB).
