# Market

Part of [`11-economy`](11-economy.md). Depends on
[`11a-currency-and-bank`](11a-currency-and-bank.md) and
[`11c-depot-and-inbox`](11c-depot-and-inbox.md) for escrow and delivery.
Treat every operation as concurrent by default.

## Market

- [x] Use durable order ids and escrow. Sell items move to market escrow;
  buy-order funds move to escrow before an order becomes matchable.
  (`016_market.sql`: uuid offer ids, `market_escrow_items` join to escrowed
  rows, `escrow_balance` on buy offers with the standing DB invariant
  `escrow_balance = remaining_amount * unit_price`.)
- [x] Match/fill/cancel atomically with row locks or serializable transactions,
  deterministic price/amount math, fees, idempotency keys, and audit records.
  (One SERIALIZABLE transaction per mutation; `market_requests` consumes each
  client `requestId` exactly once; 2% fee clamped [20, 1_000_000], creator
  pays, never refunded — Canary parity.)
- [x] Bound active orders, query sizes, history, and request rates.
  (`MARKET_LIMITS` in `protocol/src/market.ts`; 100 offers/character, paged
  item list, 1s per-session mutation cooldown; browse never exposes owner
  names or ids — only a `mine` flag on the receiving session's own offers.)
- [x] Match pinned market fees, escrow-at-creation, 30-day expiry, partial
  fills, same-account accept block, inbox delivery, and bank proceeds.

## Shipped file surface

- `server/db/migrations/016_market.sql` — offers, escrow join, history,
  request dedupe, audit/ledger enum extensions.
- Server: `server/src/market/` (`MarketService`, `PgMarketStore` + ops).
- Protocol: `protocol/src/market.ts`; client: auction panel opened from the
  top navigation bar, usable anywhere.

## Required exploit tests

All in `server/src/market/PgMarketStore.integration.test.ts` (gated on
`TEST_DATABASE_URL`, included in `yarn test:integration`):

- [x] The same item cannot be moved while held in market escrow (mail rejects
  escrow rows; a second offer over an escrowed item is rejected).
- [x] Partial fill/cancel/replay races cannot duplicate escrow or overfill an
  order (racing creates over one item, racing accepts, racing fills of a buy
  offer's remainder, cancel-vs-accept, requestId replays, expiry replays).
- [x] Order listings and history expose no seller inventory or private state.
- [x] Every fill/cancel commit has its audit/ledger entries in the same
  transaction; failed operations leave zero rows behind.
- [x] Conservation under concurrent mixed load: items across
  depot/inbox/escrow and gold across banks/escrow/fees stay exact.

## Known gaps (deliberate scope cuts, 2026-07-18)

- **The market is usable from anywhere** (2026-07-18 product decision).
  Canary requires standing at a depot; here market intents need no depot
  session, and sell offers / buy-offer fills source pristine stock from ALL
  of the character's depots (per-depot revision bumps in the same
  transaction). Depot proximity was never a security boundary — every leg
  still validates ownership at execution time against the session's own
  character. Restore parity, if ever wanted, by re-adding an access check in
  `MarketService.handle`.
- ~~Money legs are bank-only~~ — fixed 2026-07-18: fees, buy escrow, and
  purchases now pay carried-coins-first with bank fallback
  (`spendMarketFunds` inside the same transaction, Canary order); proceeds
  and refunds still credit the bank (parity). The market shows and checks
  the combined spendable balance (bank + carried).
- **Sell stock comes from the opened depot only.** Canary also sells out of
  the supply stash (tier-0). Stash-sourced escrow needs stash-count
  decrements plus item-row minting in the same transaction.
- **No store-coin, tier, or imbuement handling** — those systems do not exist
  here yet. Pristineness is enforced as "empty `attributes`, no contained
  items", which is the correct project-native equivalent today.
- **Browsable catalog = types with active offers plus own sellable stock.**
  A buy offer for an item nobody owns or lists cannot be created from the UI
  (no full marketable-catalog browser; the DAT importer still discards
  `ATTR.market` metadata). Marketability is derived server-side from
  `primaryType` in `marketCategoryOf.ts`.
- **No level/vocation display in detail view, no premium gate, no anonymous
  flag** (names are never exposed at all, which is strictly tighter).
- **Counterparties are not notified live** (bank-transfer parity gap): an
  online seller learns of a fill on the next market/bank open; inbox
  deliveries do appear live via the depot cache.
- **Expiry with a full recipient inbox defers the offer by one hour** and
  retries, rather than Canary's capacity-bypassing insert.
- **`runSerializableTransaction` still does not retry 40001** (pre-existing,
  see 11c); a serialization-aborted market action surfaces as
  `market-action-failed: failed` and the client may retry.
- **UI accepts offers only in full.** `market-accept-offer` supports partial
  amounts, but the auction order book's buy/sell buttons always send the
  offer's full remaining amount. Fix: add an amount input per order-book row
  (or a confirm dialog) in `AuctionOrderBook.tsx`.
- **Item list refresh after a transaction briefly renders page 1 only.** The
  client re-requests all market pages sequentially after `market-transacted`;
  while later pages stream in, a selected item that lives on page > 1 falls
  back to the first item in the browser display until its page arrives.

[Back to overview](README.md)
