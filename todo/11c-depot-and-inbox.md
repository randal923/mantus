# Depot and inbox

Part of [`11-economy`](11-economy.md). Depends on atomic
[`items`](05-items-and-inventory.md); the `depot` and `inbox` item locations
already exist in the schema.

## Depot and inbox

- [ ] Add account/character depot ownership and bounded containers keyed by
  server-known town/depot ids.
- [ ] Authorize opening at a visible/reachable depot object; once opened, every
  move still validates session, container revision, slots, capacity, and owner.
- [ ] Define inbox/mail delivery ownership, limits, expiry/return rules, and
  offline transactional behavior without loading an offline live aggregate.
- [ ] Match pinned depot search/retrieval, inbox, mailbox, supply stash, reward
  delivery, and town/depot behavior with bounded authorized projections.

## Planned file surface

- Migrations for depot/inbox metadata.
- Server: `server/src/depot/DepotService.ts`.
- Protocol/client: depot intents/projections and a focused accessible panel.

## Required exploit tests

- [ ] Depot access from an unreachable/wrong-town depot object is rejected at
  execution time.
- [ ] Concurrent moves against one depot slot leave exactly one item per slot.
- [ ] Offline inbox delivery commits transactionally and cannot duplicate items
  when retried.

[Back to overview](README.md)
