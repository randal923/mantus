# Feature 12 — completed

Cross-links: [implementation-feature-12.md](../implementation-feature-12.md) ·
[todo-6.md](../todo-6.md).

---

## 2026-07-24 — Server-side 200 ms generic use exhaust

**Problem.** Canary applies a 200 ms exhaust per generic item use (its
`actions` exhaust group). We only enforced the potions' 1 s exhaust plus the
single-in-flight `itemOperationPending` latch; `use-map` reused the walk
cooldown, and food/tool uses had no explicit timer. That is a charter rule 8
violation — a use limit enforced only incidentally, not server-side by design —
so a modified client could replay `use-item`/`use-item-with`/`use-map` intents
faster than any real client.

**What changed (server-authoritative).**

- `server/src/Session.ts` — added `useExhaustReadyAt` plus `useExhausted(now)` /
  `armUseExhaust(now)` and the exported `USE_EXHAUST_MS = 200`. The timer is a
  plain per-session timestamp mirroring the potion-exhaust pattern; it is read
  at execution time inside the tick (charter rule 4), never at enqueue.
- `server/src/GameServer.ts` (`handleIntent`, the tick's execution point):
  - `use-item` split into its own case — exhaust-gated, then dispatched;
    container open/move/equip/rotate/write flows stay in the ungated block
    because they are not "uses".
  - `use-item-with` — exhaust-gated before the tool-use / generic-use dispatch,
    so food and tool uses share the one timer.
  - `use-map` — the three instant-use branches (depot open, world-container
    open, typed world action) are exhaust-gated and arm the window only when
    one of them actually fires; the walk-to fallback (ladders/stairs/holes,
    governed by the step cooldown) is untouched, so a walk-click is never
    blocked by a recent use.
- `server/src/item/ItemIntentHandler.ts` (`activateOwnedItem`) — the action-bar
  item-use path reaches the tick outside `handleIntent`, so the same exhaust is
  applied there for the use / use-on-target modes; opening a container is not
  gated.
- `protocol/src/serverMessages.ts` — new `item-exhausted` server error code.
- `client/components/game-window/controllers/handleGameClientError.ts` —
  `item-exhausted` shows the standard "can't do that yet" puff (no inventory
  rollback: uses are not optimistic).

**Files touched.** `server/src/Session.ts`, `server/src/GameServer.ts`,
`server/src/item/ItemIntentHandler.ts`, `protocol/src/serverMessages.ts`,
`client/components/game-window/controllers/handleGameClientError.ts`,
`server/src/Session.test.ts`, `server/src/item/ItemIntentHandler.test.ts`.

**Verification.**
- `server/src/item/ItemIntentHandler.test.ts` — new test drives
  `activateOwnedItem` with a readable letter and asserts a use fires at t=0,
  is rejected at t=100 and t=199 (inside the window, no re-use), and fires
  again at t=200: rapid replays cannot exceed one use per 200 ms.
- `server/src/Session.test.ts` — unit test for the `useExhausted`/
  `armUseExhaust` window boundaries (0/199 exhausted, 200 clear).
- `yarn workspace server test run src/Session.test.ts
  src/item/ItemIntentHandler.test.ts` → 16 passed;
  `src/GameServer.test.ts` → 31 passed. `yarn workspace server typecheck` and
  `yarn workspace client typecheck` clean; protocol rebuilt.

**Residual risk.** None significant. The exhaust arms on the attempt (matching
Canary), so a rejected use still consumes the window — intended for
replay protection. The value is a single source of truth (`USE_EXHAUST_MS`);
if Canary's group value is retuned, change it in one place.
