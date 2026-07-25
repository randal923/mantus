# Feature 34 — Durable decay deadlines

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

**Completed 2026-07-25.** Boot no longer re-arms every persisted world item
with a fresh full duration: `loadWorldDeltas` reports each row's unchanged age
on the database clock and `DecayManager.observeLoaded` resumes the deadline
from it, so a restart neither extends nor restarts an item's remaining life.

No `decay_at` column was added — the deadline is
`items.updated_at + duration(type)`, so the value was redundant and writing it
would have cost a DB write per mutation. A new `updatedAtInvariant` test keeps
every `UPDATE items` bumping `updated_at`, which is what the derivation rests
on. Rationale in the completed log.

Full record, files touched, deviations, and verification in
[completed/implementation-feature-34-completed.md](completed/implementation-feature-34-completed.md).
