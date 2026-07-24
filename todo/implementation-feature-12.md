# Feature 12 — Server-side use exhausts (200 ms parity)

Part of [Todo 6 — Items and inventory](todo-6.md).

**Completed 2026-07-24.** Added a per-session `useExhaustReadyAt` timer
(`USE_EXHAUST_MS = 200`, exported from `server/src/Session.ts`) checked at
execution time in the tick. `use-item`, `use-item-with` (food + tools), the
instant-use `use-map` branches, and the action-bar use path
(`activateOwnedItem`) are all gated; the `use-map` walk-to fallback stays on the
step cooldown. New `item-exhausted` error code shows a puff client-side. Full
record, files touched, and verification in
[completed/implementation-feature-12-completed.md](completed/implementation-feature-12-completed.md).
