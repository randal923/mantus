# Feature 48 — Player-trade parity completions

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
Player trade shipped complete on its core (state machine, reservation, one-SERIALIZABLE-transaction commit, all four exploit tests), plus deliberate tightenings (1 s per-session cooldown, 2-min inactivity timeout, both sides must offer before accepting). A handful of Canary parity behaviors remain.

## Remaining work
- Ground-item trade offers: Canary lets a player offer a ground item within one tile with auto-walk; here only carried items can be offered.
- Reserved-offer visibility parity: reserved offers vanish from the giver's visible inventory/weight while the trade is open; Tibia keeps them visibly in place. Side effect: commit-time capacity is slightly lenient for net trades. Conservation is unaffected — accepted deviation, low priority.
- Per-item look flow: Canary serves index-based look packets with distance-graded detail; here the full offer is pushed as one projection. Nothing extra is exposed — UI parity only.
- Orphan-restore with full inventory: when a cancelled trade's item can't be restored (100 staged items), it stays on `trade-reservation` and trading is blocked until login recovery finds space (`TradeService.recoverOrphans`).
- Store-item/unique-id/house-tile restrictions: Canary blocks trading store items, unique items, and items on house tiles; the equivalent item model doesn't exist here yet.

## Implementation
- Ground-item offers: extend the `trade-request` schema in `protocol/src/trade.ts` with an optional map-position source; in `server/src/trade/TradeService.ts`, route through the existing pickup reach/auto-walk validation before reserving. Reach and ownership are re-checked at execution time in the tick, never trusted from the message.
- Reserved-offer visibility: either project reserved items back into inventory views as locked entries (client `client/components/trade/TradePanel.tsx` + inventory projections) while keeping the structural `trade-reservation` location, or adjust `PgTradeStore.commitTrade` capacity math to add back the receiver's outgoing weight/room.
- Per-item look (only if pursued): a `trade-look` intent in `protocol/src/trade.ts` answered from the server-held session offer — never from client-supplied item data.
- Orphan-restore fallback: extend `server/src/trade/planTradeRestore.ts` / `recoverOrphans` to fall back to inbox delivery via the depot mail lane — transactional insert + `audit_log` in the same transaction, id-keyed so retries are idempotent.
- Restrictions: offer-time and commit-time predicate checks in `TradeService` / `planTradeReservation.ts` once store-item attributes, unique ids, and house tiles exist. Both check points matter: offer-time for UX, commit-time because offer-time validation is stale by commit (charter rule 4).

## Tests
- Forged out-of-reach map source for a ground-item offer is rejected; a trade-offer vs pickup race on the same ground item leaves exactly one owner.
- Restore-with-full-inventory delivers to the inbox exactly once across retries.
- Once restrictions land: a store/unique/house-tile item slipped into an offer is rejected at both offer and commit time.

## Dependencies
- Depot/inbox mail lane (shipped) for the orphan-restore fallback; Feature 47's retry hardening covers its transaction lane.
- Feature 43 (store item attributes), Feature 78 (forge/imbuement item model context), Features 61-64 (houses/house tiles), and a unique-id item model for the restriction predicates.
