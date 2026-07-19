# Player trade

Part of [`11-economy`](11-economy.md). Depends on atomic
[`items`](05-items-and-inventory.md) and
[`11a-currency-and-bank`](11a-currency-and-bank.md). Treat every operation as
concurrent by default; write the exploit test first.

## Player trade

- [x] Model invite, accept, offered-item reservation, both-side confirmation,
  commit, cancel, timeout, disconnect, movement/range failure, and revision
  changes as an explicit state machine.
  (`server/src/trade/TradeSession.ts` — Canary's per-player `TradeState_t`
  folded onto one shared object; every cancel path funnels through
  `TradeService.cancelTrade` which restores both reserved offers.)
- [x] Reserve each offered item against other moves without yielding in the
  middle of shared-state mutation. Revalidate item ancestry/contents and both
  players immediately before commit.
  (Offering moves the root item onto the pre-existing `trade-reservation`
  location in one synchronous memory mutation; the subtree drops out of the
  reachable inventory, so every move/consume/sell path rejects it
  structurally rather than via scattered checks. The commit transaction
  re-verifies both roots' location and version against DB truth.)
- [x] Transfer both item legs in one transaction and append the audit record in
  that transaction; then publish committed state.
  (`PgTradeStore.commitTrade`: one SERIALIZABLE transaction — character locks
  in id order, root locks + re-verification, per-receiver capacity/room
  re-check from freshly read rows, both moves, both `item-transferred` audit
  entries with a `trade` detail block.)
- [x] Match pinned trade inspection, container-content display, distance,
  capacity, cancellation, and configuration behavior through typed intents and
  projections. (2-tile same-floor partner range + line of sight, 100-item
  container cap, capacity/room checked at commit with whole-trade abort,
  "already trading" guards, flat root-first offer projections with nested
  contents and tooltips. See known gaps for deliberate deviations.)

## Shipped file surface

- No new migration: the `trade-reservation` item location and the
  `item-transferred` audit event already existed in the schema.
- Server: `server/src/trade/` (`TradeService`, `TradeSession`,
  `PgTradeStore` + `MemoryTradeStore`, reservation/restore/delivery planners).
- Protocol: `protocol/src/trade.ts`; client: `TradePanel` modal, trade
  started by dragging a carried item onto another player on the map.

## Required exploit tests

Unit in `server/src/trade/TradeService.test.ts`; DB-level in
`server/src/trade/PgTradeStore.integration.test.ts` (gated on
`TEST_DATABASE_URL`, included in `yarn test:integration`):

- [x] The same item cannot be moved while reserved in trade (reserved items
  leave the reachable carried set; drop/move intents fail).
- [x] Simultaneous trade accept/cancel/disconnect leaves every item with one
  owner and both currency legs conserved (gold trades as ordinary coin
  stacks, so item conservation covers the currency legs).
- [x] Two intents racing for the same offered item leave exactly one item
  (racing double-commit at the store level: exactly one commits, totals and
  row counts stay exact).
- [x] Every trade commit has its audit entry in the same transaction (and a
  failed second leg rolls back the first leg's move *and* audit).

## Known gaps (deliberate scope cuts, 2026-07-18)

- **Only carried items can be offered.** Canary lets a player offer a ground
  item within one tile and auto-walks to it (400 ms retry). Here the offered
  item must be in the offerer's equipment/inventory/backpack; pick it up
  first. Fix: accept a map source on `trade-request` and reuse the pickup
  reach/auto-walk flow.
- **Reserved offers leave the giver's visible inventory and weight** while
  the trade is open (they sit on `trade-reservation`). In Tibia the item
  stays visibly in place. Consequence: commit-time capacity checks are
  slightly more lenient than Canary for net trades (the receiver's own
  outgoing item no longer counts against their capacity). Conservation and
  ownership are unaffected.
- **Both sides must offer before accepting.** Canary's accept guard
  technically permits accepting from the acknowledge state (one-sided gift);
  real-Tibia behavior requires both offers, which is what we enforce.
- **No per-item "look" flow.** The full offer (with nested contents and
  tooltips) is pushed as a projection instead of Canary's index-based look
  packets with distance-graded detail. Nothing beyond the offer is exposed.
- **Project additions Canary lacks:** a 1 s per-session cooldown on trade
  request/accept and a 2-minute inactivity timeout that cancels idle trades.
- **Restore with a full loose inventory (100 staged items) stays reserved**
  until a later login recovery finds space; trading is blocked for that
  character in the meantime (`TradeService.recoverOrphans` warns and keeps
  the block). Crash- or offline-cancelled reservations are likewise restored
  by login recovery.
- Canary's store-item/unique-id/house-tile trade restrictions have no
  equivalent item model here yet; revisit when those systems land.

[Back to overview](README.md)
