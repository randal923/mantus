# Feature 27 — Action-bar polish

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

**Completed 2026-07-25.** Debounced action-bar and minimap-layout saves are now
flushed on `beforeunload`/`pagehide` and on connection-controller teardown; the
rune-slot gap had already been closed by the unified action bar.

Full record, files touched, and verification in
[completed/implementation-feature-27-completed.md](completed/implementation-feature-27-completed.md).
