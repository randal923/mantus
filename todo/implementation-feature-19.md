# Feature 19 — Progression event-id pruning

Part of [Todo 7 — Vocations, stats, and progression](todo-7.md).

**Completed 2026-07-24.** Progression event ids are globally unique and never
re-delivered, so bounding their retention is safe. Durable side: added
`snapshot_version` to `progression_events` (migration 037) and prune rows older
than `RETAINED_PROGRESSION_SNAPSHOT_VERSIONS` in the same save transaction that
makes their successors durable. Memory side: `CharacterProgression`'s
`sessionEvents` is now a compacting queue (`reserveUnpersistedEvents` /
`commitPersistedEvents`) that drops settled ids past `RETAINED_MEMORY_EVENTS`
from both the array and `processedEventIds`; in-flight events are never dropped.
Full record, files touched, and verification in
[completed/implementation-feature-19-completed.md](completed/implementation-feature-19-completed.md).
