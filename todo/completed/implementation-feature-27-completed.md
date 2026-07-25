# Feature 27 — completed

Cross-links: [todo-8.md](../todo-8.md) · [implementation](../implementation-feature-27.md).

---

## 2026-07-25 — Debounced action-bar and minimap saves survive tab close

**Problem.** Action-bar edits and minimap layout changes are written through an
800 ms debounce (`runtime.actionBarSaveTimerRef` /
`runtime.uiSettingsSaveTimerRef`). Nothing flushed a pending timer, so an edit
made in the last 800 ms before the tab closed — or before the connection
controller tore down and reconnected — was silently discarded. The client also
ignores `action-bar-updated` while a save is pending, so the loss was invisible
until the next login showed the stale bar.

**What changed.**

- New `client/lib/game-window/flushPendingSaves.ts` — a single function that,
  for each of the two pending timers, cancels it and sends the save
  immediately. It is idempotent (a cleared timer sends nothing) and tolerates a
  null `clientRef`, so calling it during teardown is safe.
- `client/components/game-window/controllers/GameWindowConnectionController.tsx`
  registers `flushPendingSaves` on both `beforeunload` and `pagehide` (pagehide
  covers mobile/bfcache paths where `beforeunload` does not fire), and calls it
  once more in the effect cleanup **before** `client.disconnect()`, so a
  deliberate teardown or reconnect also flushes.

The unexpected-socket-drop path is unchanged: `handleGameClientStatus` still
just clears the timer, because the socket is already gone and there is nothing
to send.

**Second recorded gap was already closed.** The 2026-07-20 note said only
`origin: "spell"` entries were slottable and runes still had to be cast from
the inventory. The unified action bar (migration `034_unified_action_bar.sql`)
superseded that: `actionBarActionSchema` carries a `kind: "item"` variant, and
`client/components/action-bar/ActionBarItemPicker.tsx` maps `useKind === "rune"`
to the rune target modes (`use-on-self` / `use-at-cursor` /
`use-with-crosshair`) from the spell catalog's `runeItemTypeId`. No work was
needed.

**Files touched.**

- `client/lib/game-window/flushPendingSaves.ts` (new)
- `client/lib/game-window/flushPendingSaves.test.ts` (new)
- `client/components/game-window/controllers/GameWindowConnectionController.tsx`

**Verification.** `yarn vitest run --project unit
lib/game-window/flushPendingSaves.test.ts` — 4 tests: pending action-bar save is
sent and the timer cannot fire twice; pending minimap layout save is sent; no
pending save sends nothing; a null client does not throw. `yarn workspace client
typecheck` clean.

**Residual risk.** `beforeunload`/`pagehide` handlers can be cut short by the
browser during an abrupt kill; the send is a WebSocket frame, which is
best-effort at that point. Nothing server-side changed — server-side action-bar
slot validation remains authoritative.
