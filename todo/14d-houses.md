# Houses

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on the
atomic item/economy core ([`11a-currency-and-bank`](11a-currency-and-bank.md),
[`11c-depot-and-inbox`](11c-depot-and-inbox.md)) and versioned map/content
inputs.

## Houses

- [x] Import house ids, tile membership, entrances, towns, and rent metadata from
  the versioned map/content inputs.
  (Shipped 2026-07-19: `tools/importCanaryHouses.mjs` → committed
  `server/data/houses.json` (993 houses, sha-pinned in
  `content/source-manifest.json`); `tileMetadata.houseId` parsed into a
  house-tile index on `MapData`/`World`.)
- [x] Add durable owner/tenant/guest/access-list/rent state and an explicit
  atomic ownership transfer/auction path.
  (Migration `019_houses.sql`; buy-at-house from bank (level 100,
  1000 gp/sqm), owner→player transfer offer/accept with both bank legs in
  one serializable tx, premium checked for purchase/recipient/accept, abandon.
  Timed Cyclopedia-style auctions deferred.)
- [x] Authorize doors, beds, item placement/removal, invitations, and eviction
  server-side. Eviction moves items transactionally to a safe depot/inbox; it
  must never copy then delete them.
  (Walk/door/item-mutation gates all execution-time through
  `HouseService.canUseHouseTile`; eviction moves movable items to the
  previous owner's inbox with per-item idempotent delivery keys. Beds: no
  bed/sleep system exists yet — nothing to authorize.)
- [x] Audit ownership, rent, auction, and mass item movement.
  (`house-purchase/transfer/rent/eviction` audit events + bank ledger
  entries in the same transactions.)
- [x] Run rent, auction expiry, and eviction from durable idempotent schedules;
  do not depend on a daily server save or restart to advance them.
  (Tick-driven scan ≥60 s apart; each charge guarded on `paid_until` inside
  its own tx; 7 warnings then eviction; replay/crash safe.)
- [ ] Match pinned house auctions/transfers, access-list syntax, door/guest/
  subowner spells, beds, rent warnings, town ownership, and item eviction.
  - Done: transfers, guest/subowner access managed in-game via the House
    modal (replaces aleta sio/som spells by design), kick, monthly rent
    warnings (server messages, 7-strike eviction), item eviction.
  - Deferred: timed auctions, Canary text access-list syntax incl.
    `@guild`/rank entries and per-door lists (kind=2), beds/sleep,
    guildhall purchase (guild-leader + guild-bank flow), rent-warning
    letter items, blocking monsters/NPCs from house tiles, eviction
    reconciliation for in-flight world-item persists, inbox-overflow
    spillover (surplus items stay on tiles, audited).

## Planned file surface

- Feature-local migrations and `server/src/house/` with one main export per
  file (the `house` item location already exists in the schema).
- Bounded protocol intents/projections and a focused client panel.

## Required exploit tests

- [x] House sale/eviction/rent races conserve every item and gold unit.
  (`house/PgHouseStore.integration.test.ts` — racing buyers,
  transfer-vs-abandon, conservation invariants.)
- [x] House schedules run once across continuous uptime and crash/restart
  boundaries without requiring a global-save event.
  (Replayed/concurrent rent charges → single ledger row; eviction
  exactly-once via delivery keys.)
- [x] Door/bed/item authorization follows current owner/guest state at
  execution time. (`house/HouseService.test.ts` — mid-session revocation
  blocks the next step/use and sweeps occupants.)

[Back to overview](README.md)
