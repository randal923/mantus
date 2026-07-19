# Houses

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on the
atomic item/economy core ([`11a-currency-and-bank`](11a-currency-and-bank.md),
[`11c-depot-and-inbox`](11c-depot-and-inbox.md)) and versioned map/content
inputs.

## Houses

- [ ] Import house ids, tile membership, entrances, towns, and rent metadata from
  the versioned map/content inputs.
- [ ] Add durable owner/tenant/guest/access-list/rent state and an explicit
  atomic ownership transfer/auction path.
- [ ] Authorize doors, beds, item placement/removal, invitations, and eviction
  server-side. Eviction moves items transactionally to a safe depot/inbox; it
  must never copy then delete them.
- [ ] Audit ownership, rent, auction, and mass item movement.
- [ ] Run rent, auction expiry, and eviction from durable idempotent schedules;
  do not depend on a daily server save or restart to advance them.
- [ ] Match pinned house auctions/transfers, access-list syntax, door/guest/
  subowner spells, beds, rent warnings, town ownership, and item eviction.

## Planned file surface

- Feature-local migrations and `server/src/house/` with one main export per
  file (the `house` item location already exists in the schema).
- Bounded protocol intents/projections and a focused client panel.

## Required exploit tests

- [ ] House sale/eviction/rent races conserve every item and gold unit.
- [ ] House schedules run once across continuous uptime and crash/restart
  boundaries without requiring a global-save event.
- [ ] Door/bed/item authorization follows current owner/guest state at
  execution time.

[Back to overview](README.md)
