# Items, inventory, equipment, and map use

This is the ownership core for loot and the economy. Follow the security
charter literally: one item has exactly one owner/location, and every transfer
is atomic.

## Static item catalog

- [x] Generate a typed `ItemType` catalog from matching DAT appearance metadata
  and allowed static `items.xml` rules; reject mutable OTBM ids absent from it.
- [x] Include stackability/max count, weight, currency worth, slot/equipment type,
  weapon/armor stats, container capacity, pickup/movable flags, decay and
  transform targets, field/door/bed/depot properties, light, elevation, and
  render stack flags.
- [x] Pin catalog version/source hashes and fail on unknown ids or asset-era
  mismatches. Never trust item properties sent by a client.
- [x] Keep the full catalog server-side; expose only display data needed by the
  client for visible/owned items.

## Mutable item model and database

- [x] Add an `items` table with immutable instance id, item type id, subtype or
  stack count, attributes, version, and exactly one location/owner.
- [x] Model locations as a constrained union such as player equipment slot,
  player inventory/container slot, world tile, depot, inbox, house, trade
  reservation, market escrow, or corpse. Do not represent a move as copy then
  delete.
- [x] Enforce database constraints for valid counts, unique container slots,
  unique equipment slots, legal owner/location combinations, and parent ids.
- [x] Prevent container ancestry cycles and cap nesting depth, slots, and total
  serialized contents.
- [x] Give every item a stable UUID and append creation, merge/split,
  transformation, and ownership/count changes to `audit_log` in the same
  database transaction.
- [x] Make every implemented ownership/count/location change durable in its
  operation's transaction before success is published. Periodic character
  snapshots and a global server save are never item-durability boundaries.

## Intent and transaction architecture

- [x] Define bounded zod intents for move item, use item, use with target, open
  container, close container, equip, unequip, split stack, and rotate as needed.
  - [x] Equip, unequip, pickup, drop, open/close, use/use-with, split, and rotate
    intents and generic container-to-container movement are bounded.
- [x] Address objects with server-issued ids and revisions, not raw array
  indexes. Derive the acting character from its session.
- [x] Enqueue all intents. At execution time re-check item existence/version,
  current ownership/location, visibility, reach/range/line of sight, slot,
  count, capacity/weight, destination space, cooldown, and target compatibility.
- [x] Keep shared projections unchanged while an atomic item transaction is in
  flight, then apply its committed result synchronously in the tick. No
  `await` splits checked and changed shared game state.
- [x] On persistence failure, leave the committed projection unchanged and
  publish one deliberate failure; never issue success before commit.
- [x] Serialize concurrent operations on the same item/container/player so two
  move/trade/loot intents cannot both win.

## Map items and gameplay

- [x] Split immutable decoration from mutable map items during conversion.
  Materialize a base map item atomically on its first mutation and retain its
  stable content/map-version seed origin.
- [x] Add authoritative `TileState` and revisioned visible diffs for dynamic
  items. Static region files are never the source of current mutable state.
- [x] Implement pickup/drop, stack merge/split, backpacks/containers,
  equipment, capacity/weight, rotate, readable/writeable items, and use/use-with
  incrementally.
  - [x] Persist and project the equipped backpack, pickup/drop, bounded stack
    merge/split, equipment, capacity/weight checks, and rotate transforms.
  - [x] Expose basic client controls: double-click map use,
    Shift-double-click pickup, and right-click backpack drop-at-feet.
  - [x] Project nested container windows and parent ancestry, support revisioned
    container-to-container drag/drop, readable/writeable items, rotate, and the
    pinned food/regeneration consume path.
- [ ] Implement doors, switches, fields, decay/transforms, beds, depots, and
  quest/world actions as typed server behaviors. Do not execute imported Lua.
- [x] Keep inventory/equipment UI as projections of committed server
  state; optimistic animation must reconcile to authoritative revisions.
- [x] Replace the display-only placeholder inventory and tooltip fixtures with
  real server-sent inventory state; the `I` hotkey now opens only the committed
  projection received at world entry.

## Planned file surface

- Content/domain: `server/src/item/ItemType.ts`, `Item.ts`, `ItemLocation.ts`,
  generated item catalog and its importer/validator.
- Persistence: `server/db/migrations/004_audit_log.sql`, `005_items.sql`,
  `server/src/item/ItemStore.ts`, `PgItemStore.ts`.
- Runtime: `server/src/item/ItemIntentHandler.ts`,
  `ItemTransferCoordinator.ts`, `Container.ts`, `Inventory.ts`,
  `server/src/world/WorldItemSeeder.ts`, `TileState.ts`,
  `server/src/audit/AuditLog.ts`.
- Protocol/client: typed item/location projections and focused inventory,
  equipment, container, drag/drop, context-menu, and tile-interaction state.

## Required exploit tests

- [x] Two concurrent moves of the same item leave exactly one item in one place.
- [x] Two players picking up the same item produce one durable winner.
- [x] Replayed or stale item revisions cannot duplicate, destroy, or roll back
  an item.
- [x] Negative/zero/oversized stack counts, raw slot indexes, invalid ids,
  over-capacity moves, container cycles, and excessive nesting are rejected.
  - [x] Protocol regression tests cover invalid counts, ids, and raw indexes;
    capacity and database ancestry fault tests are included in the optional
    PostgreSQL integration suite.
- [x] Disconnect/persistence failure during a move resolves to one durable owner.
- [x] Lazy map-item materialization cannot duplicate mutable world items;
  unique seed keys and serializable transactions make concurrent first use
  idempotent.
- [ ] Abrupt process death immediately before or after an ownership transaction
  leaves the item in exactly one durable location after restart; no daily
  global save is needed to reconcile it.
- [x] Economy-relevant creation/destruction/transfer and its audit entry commit
  together or neither commits.

## Audited remaining gaps (2026-07-16)

- Sorting, browse-field/seek/parent navigation, fluids, and richer target
  selection remain implementation gaps in this TODO.
- Fields and decay/transforms are blocked by [`08c-decay`](08c-decay.md);
  corpse/reward containers and quick loot by
  [`08-death-loot-and-decay`](08-death-loot-and-decay.md); depots, inbox,
  mail, stash, and market/trade reservations by [`11-economy`](11-economy.md);
  doors, keys, beds, switches, and quest actions by
  [`12b-world-actions`](12b-world-actions.md); house items by
  [`13d-houses`](13d-houses.md); forge, imbuements, show-off sockets, and
  advanced equipment modifiers by [`14-optional-features`](14-optional-features.md).
- PostgreSQL fault-injection coverage now includes capacity, ancestry,
  transaction rollback, audit atomicity, and conjuring. A true process-kill
  crash harness remains an implementation gap; the integration suite runs
  only when `TEST_DATABASE_URL` is configured.
- A future map-version upgrade needs an explicit seed reconciliation migration.
  Stable seed keys currently make an unplanned content-version replacement fail
  safely instead of silently duplicating or resetting moved world items.

## Pinned Canary parity gate

- [ ] Inventory every registered item/move/action behavior from the pinned
  sources and implement all player-visible semantics, including containers,
  fluids, food, readable/writeable items, doors, keys, beds, fields,
  decay/transforms, reward containers, stash/mail/depot rules, equipment
  modifiers, charges, imbuement slots, forge tiers, quick-loot/loot-container
  configuration, browse-field/seek/parent-container actions, inspection,
  wrapping, hotkey equip, show-off sockets, and special-use callbacks.
- [ ] Generated item reports and tests must distinguish non-content/reserved
  ids from gameplay items and reach zero silently ignored gameplay attributes
  or registered item actions.

[Back to overview](README.md)
