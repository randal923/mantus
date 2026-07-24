# Feature 14 — Client walk-then-use auto-retry

Part of [Todo 6 — Items and inventory](todo-6.md).

**Completed 2026-07-24.** Client-only QoL: a right-click use / double-click use /
shift-pickup on an out-of-reach map target auto-walks the player adjacent and
retries the action once on arrival. `walkStepsToReach` computes the steps that
end adjacent; `ReachActionScheduler` (unit-tested, extracted from the PixiJS
`WorldRenderer`) runs the action immediately when in reach, defers it otherwise,
fires it exactly once on arrival, and cancels on a fresh walk — never looping.
The server still owns every reach check. The map context-menu "Use" path is not
covered (documented). Full record, files touched, and verification in
[completed/implementation-feature-14-completed.md](completed/implementation-feature-14-completed.md).
