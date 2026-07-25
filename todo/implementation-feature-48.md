# Feature 48 — Player-trade parity completions

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

The orphan-restore inbox fallback shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-48-completed.md). This file
tracks only what is still open.

## Remaining work

- **Ground-item trade offers.** Canary lets a player offer a ground item within
  one tile, with auto-walk; here only carried items can be offered. Plan:
  extend the `trade-request` schema in `protocol/src/trade.ts` with an optional
  map-position source, and in `TradeService.request` route that through the
  existing pickup reach/auto-walk validation before reserving. Reach and
  ownership must be re-checked at execution time in the tick, never trusted
  from the message. Test: a forged out-of-reach map source is rejected, and a
  trade-offer racing a pickup on the same ground item leaves exactly one owner.
- **Store-item/unique-id/house-tile restrictions.** Canary blocks trading store
  items, unique items, and items on house tiles. The predicates go in
  `TradeService` / `planTradeReservation.ts` at **both** offer time (for UX)
  and commit time (because offer-time validation is stale by commit, charter
  rule 4). **Blocked**: the item attributes they test do not exist yet —
  Feature 43 (store items), Feature 78 (forge/imbuement item model), Features
  61–64 (house tiles), and a unique-id item model.

## Documented deviations (no action planned)

- **Reserved-offer visibility.** Reserved offers vanish from the giver's
  visible inventory/weight while the trade is open; Tibia keeps them visibly in
  place. Side effect: commit-time capacity is slightly lenient for net trades.
  Conservation is unaffected — accepted deviation, low priority.
- **Per-item look flow.** Canary serves index-based look packets with
  distance-graded detail; here the full offer is pushed as one projection.
  Nothing extra is exposed — UI parity only.
