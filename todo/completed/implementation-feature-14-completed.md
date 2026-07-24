# Feature 14 — completed

Cross-links: [implementation-feature-14.md](../implementation-feature-14.md) ·
[todo-6.md](../todo-6.md).

---

## 2026-07-24 — Client walk-then-use auto-retry

**Problem.** Canary auto-walks the player adjacent to an out-of-reach
use/pickup target and retries once; we hard-failed the action (a distant
right-click use or shift-pickup did nothing useful). Pure client-side QoL — the
server's reach validation stays authoritative.

**What changed (client-only).**

- `client/lib/movement/walkStepsToReach.ts` (new) — `walkStepsToReach(from,
  target)` returns the straight-line steps that end *adjacent* to the target
  (it drops `getAutoWalkDirections`' final on-target step), and `isWithinReach`
  is chebyshev-adjacency on the same floor. Empty across floors — the client
  never auto-walks floor transitions, and the server re-validates every step.
- `client/lib/movement/ReachActionScheduler.ts` (new) — a small stateful
  scheduler: `request(from, target, act)` runs `act` immediately when in reach,
  otherwise auto-walks adjacent and defers `act`; `onMoved(position)` fires the
  deferred action exactly once on arrival; `cancel()` / a new `request` drops
  the previous pending action, so it never loops.
- `client/lib/render/WorldRenderer.ts` — routes right-click use (`useMap`),
  double-click use, and shift-double-click pickup through the scheduler;
  `setOwnPosition` feeds every own-position update to `onMoved`; a fresh
  left-click walk `cancel()`s a pending action. The orchestration was extracted
  into the scheduler so it is unit-testable (WorldRenderer itself is an
  untested PixiJS class).

**Files touched.** `client/lib/movement/walkStepsToReach.ts` (new),
`client/lib/movement/ReachActionScheduler.ts` (new),
`client/lib/render/WorldRenderer.ts`; tests `walkStepsToReach.test.ts` (new),
`ReachActionScheduler.test.ts` (new).

**Verification.**
- `walkStepsToReach.test.ts` — no steps when already adjacent/same tile; stops
  one tile short (ends adjacent); diagonal targets; never across floors.
- `ReachActionScheduler.test.ts` — immediate run when in reach (no walk);
  out-of-reach walks toward target and retries exactly once on arrival, with no
  second fire on further moves ("a second failure does not loop"); cancel and a
  superseding request drop the pending action.
- `yarn workspace client test` → 214 passed; `typecheck` clean.

**Residual risk / scope.** The map context-menu "Use" (`GameMapContextMenu` →
`client.useMap`) still sends immediately without walk-then-use — it is a React
path with the raw client and no renderer position state; the primary
right-click / double-click surfaces are covered. No server or protocol changes;
the server owns every reach check, so a deferred retry that fires while still
blocked is simply rejected server-side (no loop).
