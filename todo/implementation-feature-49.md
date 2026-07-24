# Feature 49 — Market parity completions

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
The market shipped complete on its core (durable escrow with DB invariants, atomic match/fill/cancel, bounded queries/rates, all five exploit tests), with one deliberate product deviation: the market is usable from anywhere — no depot session — and sell offers/buy fills source pristine stock from ALL depots with per-depot revision bumps in the same transaction. (Canary depot-proximity could be restored via an access check in `MarketService.handle` if ever wanted.) The remaining items are parity completions and UI polish.

## Remaining work
- Stash-sourced sell offers: sells can only source depot items today, not stash counts.
- Marketable-catalog browser: the browsable catalog is only "types with active offers plus own sellable stock"; Canary browses the full marketable catalog from DAT `ATTR.market` metadata, which the importer currently discards.
- Store-coin/tier/imbuement pristineness: pristineness is enforced as "empty attributes, no contained items" — revisit when store coins, forge tiers, and imbuements land.
- Live counterparty notification: an online seller learns of a fill only on next market/bank open (same gap as bank transfers); inbox deliveries already appear live.
- Expiry with full inbox: expiry with a full inbox defers one hour and retries, vs Canary's capacity-bypassing insert. Decide: keep as documented deviation, or implement the bypass.
- Market UI polish:
  - Order-book buy/sell buttons always send the full remaining amount even though `market-accept-offer` supports partial fills — fix with an amount input per row in `client/components/auction/AuctionOrderBook.tsx`.
  - After `market-transacted`, the client re-requests all pages sequentially; a selected item on page > 1 briefly falls back to the first item — keep the prior selection rendered from cache until its page arrives.
  - No level/vocation display in offer detail, no anonymous flag (names are never exposed — tighter than Canary; parity optional).

## Implementation
- Stash-sourced sells: extend `server/src/market/pickEscrowSources.ts` + `PgMarketCreateOps.ts` to draw from stash counts using the `server/src/depot/planStashWithdraw.ts` logic — decrement the stash counter and mint the escrow item row in the same SERIALIZABLE transaction with audits (single atomic move, no copy-then-delete, charter rule 2).
- Catalog browser: extend the DAT importer (`tools/importTibiaAssets.mjs` lane) to keep `ATTR.market`, or expand `marketCategoryOf.ts`; add a paged full-catalog read op in `PgMarketReadOps.ts` / `MarketService` bounded by `MARKET_LIMITS`; client browser list.
- Pristineness: extend the pristineness predicate in the create/accept ops when store-coin/tier/imbuement attributes exist.
- Live notification: after commit in `MarketService`, push the existing market/bank projections to the counterparty's online session — own data only (charter rule 6). Pairs with Feature 45's `bank-updated` push; one push mechanism serves both.
- Expiry bypass (if chosen): a flag in the expiry op (`server/src/depot/DepotExpiryOps.ts` lane) to skip the inbox capacity check for expiry-return inserts, still one transaction + audit entry.
- UI polish: client-only changes in `client/components/auction/`; partial accept already exists server-side.

## Tests
- Racing stash-sourced creates cannot mint more escrow than the stash count; a failed create leaves the count unchanged.
- Full-catalog reads stay within `MARKET_LIMITS` paging bounds; oversized page requests rejected.
- Counterparty push contains only the counterparty's own data.
- If bypass is implemented: expiry return into a full inbox inserts exactly once, audited, in one transaction.

## Dependencies
- Stash (shipped, old todo 11c); Feature 47 hardens the shared market transaction lane.
- Asset-import pipeline regeneration for `ATTR.market` (catalog browser).
- Feature 43 (store coins) and Feature 78 (forge tiers/imbuements) for the pristineness extensions.
- Feature 45 shares the live-notification push mechanism.
