# Feature 19 — Progression event-id pruning

Part of [Todo 7 — Vocations, stats, and progression](todo-7.md).

## Why

Unbounded growth bug: every kill appends a `death:{uuid}` id to `processedEventIds` and a row to `progression_events`, and nothing ever prunes them. Memory and table size grow forever with playtime.

## Remaining work

- Retain only a bounded window of event ids: those newer than the last committed snapshot version.
- Prune older rows during snapshot saves.

## Implementation

- Add pruning inside the snapshot-save transaction: `/home/randal/code/tibia/server/src/progression/CharacterProgression.ts` (holds `processedEventIds` in memory) and `/home/randal/code/tibia/server/src/character/sql/insertProgressionEventsQuery.ts` (delete-older-than-snapshot-version in the same transaction).
- Keeping prune and snapshot in one transaction preserves the idempotency guarantee — an event id is only discarded once the snapshot that reflects it is durable.

## Tests

- A replayed pre-prune event id still cannot double-award within the retained window.
- Pruning cannot race a concurrent award (no award lost, no double award, under concurrent snapshot + event).

## Dependencies

- None; standalone fix.
