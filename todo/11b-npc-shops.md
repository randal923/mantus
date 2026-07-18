# NPC shops

Part of [`11-economy`](11-economy.md). Depends on
[`11a-currency-and-bank`](11a-currency-and-bank.md) and NPC dialogue hooks from
[`10b-npc-dialogue-and-travel`](10b-npc-dialogue-and-travel.md). Treat every
operation as concurrent by default.

## NPC shops

- [x] Define typed server shop catalogs with item type, buy/sell price, subtype,
  amount bounds, availability/quest rules, and optional stock.
- [x] Client sends offer id and requested count. Re-check current catalog,
  player range/floor, money, capacity, inventory space, ownership, and amount
  at execution.
- [x] Purchase/sale item and money legs plus audit entry commit in one database
  transaction before success is sent.
- [x] Import every pinned NPC buy/sell catalog, subtype, price, stock,
  requirement, and shop callback; no shop offer may be silently dropped.

## Implemented (2026-07-17)

- The importer resolves all 956 NPC types selected by the pinned world and
  accounts for all 286 shop declarations: 284 non-empty catalogs expose 8,368
  executable offers, while Larry and Squeekquek's empty catalogs are explicitly
  classified. This includes 6,176 buy prices, 3,368 sell prices, 530 subtype
  offers, and all 125 storage-gated offers.
- Every recognized Canary buy/sell callback maps to the project's audited
  transactional implementation. Elgar and Murim omit both callbacks upstream;
  their four callback slots are explicitly classified and use the same project
  implementation. No callback is unclassified.
- Cledwyn's silver-token and Yana's gold-token catalogs consume their item
  currencies atomically. Simon the Beggar's zero-cost shovel is preserved and
  audited. The generated report also records three stale Black Bert rows whose
  item ids do not exist in the pinned Canary item catalog; they cannot become
  executable items and are never silently omitted.
- Shop access is granted only by an NPC dialogue action and bound to an opaque,
  expiring server session. Catalog ownership, visibility, range, availability,
  offer, amount, funds, capacity, space, and item ownership are re-checked on
  the authoritative path.
- Purchase and sale mutations use serializable PostgreSQL transactions. Money,
  items, optional finite stock, bank ledger entries, and economy audit entries
  either commit together or roll back together.
- The client has an accessible, localized shop panel. Large catalogs are split
  into ordered messages under the protocol payload limit.

## Follow-up parity work

- Sales currently fail atomically when the coin proceeds do not fit. Canary's
  bank fallback still needs a ledgered, audited implementation.
- Buying into backpacks/shopping bags is not implemented; purchases currently
  use existing matching stacks or free top-level inventory slots.
- Finite stock is durable and race-safe, but no production catalog currently
  defines stock and no restock schedule exists yet.

## Planned file surface

- Server: `server/src/economy/ShopService.ts` and typed shop catalog content.
- Protocol/client: shop intents/projections and a focused accessible panel.

## Required exploit tests

- [x] Buy/sell prices, counts, item ids, ownership, capacity, and range cannot be
  forged; failed operations change neither money nor items.
- [x] Concurrent purchases racing on one balance or one stock unit cannot go
  negative or oversell.
- [x] Every shop commit has its audit entry in the same transaction.

[Back to overview](README.md)
