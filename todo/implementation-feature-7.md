# Feature 7 — Production world-item seed reconciliation

Part of [Todo 4 — Rendering and animation](todo-4.md).

**Completed 2026-07-24.** Added a first-class, offline, fail-closed
reconciliation path: `server/scripts/reconcileWorldSeed.ts` (run via
`yarn workspace server db:reconcile-world-seed`) over the testable core
`server/src/item/reconcileWorldSeed.ts` + seed-key builder
`server/src/item/collectWorldSeedKeys.ts`. It deletes only in-place world/house
delta rows whose seed fixture still exists, writes an `item-destroyed` audit row
per deletion in the same transaction, and aborts the whole transaction on any
unclassifiable row. Full record, files touched, and verification (pg-backed
tests) in
[completed/implementation-feature-7-completed.md](completed/implementation-feature-7-completed.md).
