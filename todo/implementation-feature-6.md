# Feature 6 — Underground multi-floor dynamic visibility

Part of [Todo 4 — Rendering and animation](todo-4.md).

**Completed 2026-07-24.** Underground viewers now receive creatures and mutable
tile-item states for the cover-aware aware range (z±2) instead of their own
floor only, via a single shared `visibleFloorRange` policy used by
`creaturesVisibleFromFloor`, `mapItemTilesVisibleFrom`/`...EnteringView`, and
`canSee` — never leaking dynamic entities past a roof (charter rule 6). Full
record, files touched, and verification in
[completed/implementation-feature-6-completed.md](completed/implementation-feature-6-completed.md).
