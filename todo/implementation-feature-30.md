# Feature 30 — World-container and loot UX completions

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

**Completed 2026-07-25.** All four deferred affordances shipped: several world
container views per session (bounded), in-place browsing of a container nested
inside a corpse or chest, materialize-on-open for pristine seeded map chests
(memory-first, with the taken-content seed hidden so a restart cannot duplicate
it), and a quick-loot sweep with an optional category filter built on Feature
29's eligibility buckets. Reach, ownership, and revision checks all still run
at execution time inside the tick, and every take is a single atomic move.

Full record, files touched, verification, and the three residual notes (persist
burst on a sweep, memory-only chests lost on restart, no per-category loot
containers) in
[completed/implementation-feature-30-completed.md](completed/implementation-feature-30-completed.md).
