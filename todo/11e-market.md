# Market

Part of [`11-economy`](11-economy.md). Depends on
[`11a-currency-and-bank`](11a-currency-and-bank.md) and
[`11c-depot-and-inbox`](11c-depot-and-inbox.md) for escrow and delivery.
Treat every operation as concurrent by default.

## Market

- [ ] Use durable order ids and escrow. Sell items move to market escrow;
  buy-order funds move to escrow before an order becomes matchable.
- [ ] Match/fill/cancel atomically with row locks or serializable transactions,
  deterministic price/amount math, fees, idempotency keys, and audit records.
- [ ] Bound active orders, query sizes, history, and request rates. Never expose
  seller inventory or other private state.
- [ ] Match pinned market browse/detail, create/accept/cancel, vocation/level
  restrictions, fees, history, depot delivery, and item classification rules.

## Planned file surface

- Migrations for market orders, fills, and escrow (the `market-escrow` item
  location already exists in the schema).
- Server: `server/src/market/MarketService.ts`.
- Protocol/client: market intents/projections and a focused accessible panel.

## Required exploit tests

- [ ] The same item cannot be moved while held in market escrow.
- [ ] Partial fill/cancel/replay races cannot duplicate escrow or overfill an
  order.
- [ ] Order listings and history expose no seller inventory or private state.
- [ ] Every fill/cancel commit has its audit/ledger entries in the same
  transaction.

[Back to overview](README.md)
