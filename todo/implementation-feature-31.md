# Feature 31 — Corpse persistence invariants and retry hardening

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

**Completed 2026-07-25.** Serialization-abort retry moved into the shared
economy transaction helper (covering depot/market/trade/store/guild/house/vip/
moderation, and replacing five bespoke loops); every integration test now
replays the whole `db/migrations/` directory instead of a hand-maintained list;
`planDrop`/`planMoveMapItem` got the loot-origin handling the other planners
already had, with a `findUnpersistedGuardViolation` checker guarding it.

`ProgressionSystem.persistAward` debouncing stays deliberately unbuilt — the
note said to add it only if 40001 exhaustion is actually observed, and it has
not been.

Full record, files touched, deviations, and verification in
[completed/implementation-feature-31-completed.md](completed/implementation-feature-31-completed.md).
