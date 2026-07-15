# Shops, banking, depot, trade, and market

Depends on atomic [`items`](05-items-and-inventory.md), character ownership,
and the audit log. Treat every operation as concurrent by default.

## Currency and accounting

- [ ] Decide whether carried gold is item stacks, an account balance, or both;
  define one canonical conversion path and never let client totals drive it.
- [ ] Add constrained bank balances with nonnegative checks and ledger/audit
  entries committed in the same transaction as every credit/debit.
- [ ] Use exact integer units only. Prices, fees, counts, and balances are
  server-owned and overflow-bounded.
- [ ] Add conservation checks/metrics for gold and tracked rares created,
  destroyed, and transferred.

## NPC shops

- [ ] Define typed server shop catalogs with item type, buy/sell price, subtype,
  amount bounds, availability/quest rules, and optional stock.
- [ ] Client sends offer id and requested count. Re-check current catalog,
  player range/floor, money, capacity, inventory space, ownership, and amount
  at execution.
- [ ] Purchase/sale item and money legs plus audit entry commit in one database
  transaction before success is sent.

## Depot and inbox

- [ ] Add account/character depot ownership and bounded containers keyed by
  server-known town/depot ids.
- [ ] Authorize opening at a visible/reachable depot object; once opened, every
  move still validates session, container revision, slots, capacity, and owner.
- [ ] Define inbox/mail delivery ownership, limits, expiry/return rules, and
  offline transactional behavior without loading an offline live aggregate.

## Player trade

- [ ] Model invite, accept, offered-item reservation, both-side confirmation,
  commit, cancel, timeout, disconnect, movement/range failure, and revision
  changes as an explicit state machine.
- [ ] Reserve each offered item against other moves without yielding in the
  middle of shared-state mutation. Revalidate item ancestry/contents and both
  players immediately before commit.
- [ ] Transfer both item legs in one transaction and append the audit record in
  that transaction; then publish committed state.

## Market

- [ ] Use durable order ids and escrow. Sell items move to market escrow;
  buy-order funds move to escrow before an order becomes matchable.
- [ ] Match/fill/cancel atomically with row locks or serializable transactions,
  deterministic price/amount math, fees, idempotency keys, and audit records.
- [ ] Bound active orders, query sizes, history, and request rates. Never expose
  seller inventory or other private state.

## Planned file surface

- Migrations for bank/ledger, depot/inbox, trade/audit metadata, market orders,
  fills, and escrow locations.
- Server: `server/src/economy/ShopService.ts`, `BankService.ts`,
  `server/src/depot/DepotService.ts`, `server/src/trade/TradeSession.ts`,
  `TradeService.ts`, `server/src/market/MarketService.ts`.
- Protocol/client: shop, depot, trade, bank, and market intent/projection files
  and focused accessible panels.

## Required exploit tests

- [ ] Two purchases/spends racing on one balance cannot go negative.
- [ ] Buy/sell prices, counts, item ids, ownership, capacity, and range cannot be
  forged; failed operations change neither money nor items.
- [ ] The same item cannot be moved while reserved in trade/market escrow.
- [ ] Simultaneous trade accept/cancel/disconnect leaves every item with one
  owner and both currency legs conserved.
- [ ] Partial fill/cancel/replay races cannot duplicate escrow or overfill an
  order.
- [ ] Every economy commit has its audit/ledger entries in the same transaction.

[Back to overview](README.md)
