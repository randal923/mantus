# Feature 16 — completed sub-work

Feature 16 is the umbrella ledger of optimistic-queue / persistence-path
refinements. It stays **open** in
[implementation-feature-16.md](../implementation-feature-16.md); this file logs
the self-contained slices already finished.

Cross-links: [implementation-feature-16.md](../implementation-feature-16.md) ·
[todo-6.md](../todo-6.md).

---

## 2026-07-24 — Throw/drop line-of-sight rejection locked

`validateItemIntentTarget` already rejected `move-map-item` and `drop-item`
when `world.hasLineOfSight`/`canSee` fail, but the throw-across-a-wall case had
only incidental coverage. Added an explicit regression test isolating LOS
(`ItemIntentHandler.test.ts`, "rejects a drop or throw whose line of sight is
blocked by a wall"): a blocked throw and blocked drop are rejected, a clear-line
throw is accepted as a control. A strict destination-walkability check was
deliberately **not** added — it would reject Feature 13 trashholder tiles
(water/lava are non-walkable but must accept-then-destroy). An explicit 7-tile
`THROW_RANGE` distinct from view range remains open.

**Files.** `server/src/item/ItemIntentHandler.test.ts`.

## 2026-07-24 — Nonce echo stops early queue advance

**Problem.** The client optimistic drag queue treated *any* `inventory-updated`
as the in-flight op's confirmation. A server-initiated change (potion, food,
decay, trash destruction) arriving mid-flight advanced the queue early, settling
the wrong op and desyncing the render.

**What changed.**
- `protocol/src/clientMessages.ts` — new `itemIntentNonceSchema`; an optional
  `nonce` on the six drag intents (equip/unequip/drop/move-item via the shared
  `ownedItemIntentSchema`, plus pickup and move-map directly).
- `protocol/src/serverMessages.ts` — optional `nonce` echo on
  `inventory-updated`.
- `server/src/item/ItemIntentHandler.ts` — `handle` echoes `intent.nonce` on the
  drag-op `inventory-updated` (the single planCarriedIntent send path all six
  reach); server never interprets it. Server-initiated inventory sends (potion,
  food, conjure, trash) carry no nonce.
- `client/lib/inventory/resolveConfirmAction.ts` (new) — pure decision:
  `advance-preview` / `advance-drag` (only on a matching nonce) / `patch-only`.
- `client/hooks/useOptimisticInventory.ts` — tracks the in-flight nonce
  (`inFlightNonceRef`, a per-session counter), attaches it when sending, and
  routes `confirm(state, nonce)` through `resolveConfirmAction`. An unsolicited
  update now patches the confirmed state without advancing the queue.
- `client/components/game-window/messages/handlePlayerStateMessage.ts` — passes
  `message.nonce` to `confirm`.

**Correctness note.** No double-apply: the server sends a drag's own echo in the
same tick it applies the mutation, so any later `inventory-updated` reflecting
that drag arrives *after* its echo. An unsolicited update seen while the drag is
still pending therefore never includes the drag, and re-applying the pending op
over it is correct. A server-rejected drag sends an error → the existing
`rollback()` clears the queue, so it never stalls.

**Files.** `protocol/src/clientMessages.ts`, `protocol/src/serverMessages.ts`,
`server/src/item/ItemIntentHandler.ts`,
`client/lib/inventory/resolveConfirmAction.ts` (new),
`client/hooks/useOptimisticInventory.ts`,
`client/components/game-window/messages/handlePlayerStateMessage.ts`; tests
`client/lib/inventory/resolveConfirmAction.test.ts` (new),
`server/src/item/ItemIntentHandler.test.ts`.

**Verification.** `resolveConfirmAction.test.ts` — preview settled first; drag
advances only on a matching nonce; unsolicited (no nonce) or out-of-order
(different nonce) is patch-only; nothing-in-flight is patch-only.
`ItemIntentHandler.test.ts` — a move with a nonce echoes it; a move without a
nonce carries none. `yarn workspace client test` → 218 passed;
`yarn workspace server test` → 757 passed; all typechecks + protocol build clean.

**Residual (still open in the ledger).** CTE batching for equip/unequip/pickup/
drop; row-mapper dedupe across `item/` and `depot/`; persist-lane split;
`useOptimisticInventory` prediction-layer removal; merge-stackability prediction;
explicit `THROW_RANGE`; retiring the DB-first parity-reference ops.
