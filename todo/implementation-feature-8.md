# Feature 8 — Effects/missiles vs onTop draw order

Part of [Todo 4 — Rendering and animation](todo-4.md).

**Completed 2026-07-24.** Added a per-floor `onTop` overlay container above the
transient effect layer in `client/lib/render/MapView.ts`; `top-item` pieces now
render into it, so missiles/effects (kept in `transient` to avoid a re-sort per
spawn) draw beneath archway tops, matching OTClient occlusion. Full record,
files touched, and verification in
[completed/implementation-feature-8-completed.md](completed/implementation-feature-8-completed.md).
