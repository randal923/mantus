# NPC shops

Part of [`11-economy`](11-economy.md). Depends on
[`11a-currency-and-bank`](11a-currency-and-bank.md) and NPC dialogue hooks from
[`10b-npc-dialogue-and-travel`](10b-npc-dialogue-and-travel.md). Treat every
operation as concurrent by default.

## NPC shops

- [ ] Define typed server shop catalogs with item type, buy/sell price, subtype,
  amount bounds, availability/quest rules, and optional stock.
- [ ] Client sends offer id and requested count. Re-check current catalog,
  player range/floor, money, capacity, inventory space, ownership, and amount
  at execution.
- [ ] Purchase/sale item and money legs plus audit entry commit in one database
  transaction before success is sent.

## Planned file surface

- Server: `server/src/economy/ShopService.ts` and typed shop catalog content.
- Protocol/client: shop intents/projections and a focused accessible panel.

## Required exploit tests

- [ ] Buy/sell prices, counts, item ids, ownership, capacity, and range cannot be
  forged; failed operations change neither money nor items.
- [ ] Concurrent purchases racing on one balance or one stock unit cannot go
  negative or oversell.
- [ ] Every shop commit has its audit entry in the same transaction.

[Back to overview](README.md)
