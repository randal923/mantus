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

- [ ] Define bounded zod intents for move item, use item, use with target, open
  container, close container, equip, unequip, split stack, and rotate as needed.
  - [x] Equip, unequip, pickup, drop, open/close, use/use-with, split, and rotate
    intents are bounded; generic container-to-container movement remains.
- [x] Address objects with server-issued ids and revisions, not raw array
  indexes. Derive the acting character from its session.
- [ ] Enqueue all intents. At execution time re-check item existence/version,
  current ownership/location, visibility, reach/range/line of sight, slot,
  count, capacity/weight, destination space, cooldown, and target compatibility.
- [ ] Mutate/reserve relevant in-memory state synchronously in the tick, then
  persist one atomic transaction. No `await` may split checked and changed
  shared state.
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
- [ ] Implement pickup/drop, stack merge/split, backpacks/containers,
  equipment, capacity/weight, rotate, readable/writeable items, and use/use-with
  incrementally.
  - [x] Persist and project the equipped backpack, pickup/drop, bounded stack
    merge/split, equipment, capacity/weight checks, and rotate transforms.
  - [x] Expose basic client controls: double-click map use,
    Shift-double-click pickup, and right-click backpack drop-at-feet.
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
- [ ] Negative/zero/oversized stack counts, raw slot indexes, invalid ids,
  over-capacity moves, container cycles, and excessive nesting are rejected.
  - [x] Protocol regression tests cover invalid counts, ids, and raw indexes;
    capacity and database ancestry fault tests remain.
- [ ] Disconnect/persistence failure during a move resolves to one durable owner.
- [x] Lazy map-item materialization cannot duplicate mutable world items;
  unique seed keys and serializable transactions make concurrent first use
  idempotent.
- [ ] Abrupt process death immediately before or after an ownership transaction
  leaves the item in exactly one durable location after restart; no daily
  global save is needed to reconcile it.
- [ ] Economy-relevant creation/destruction/transfer and its audit entry commit
  together or neither commits.

## Known gaps after the first vertical slice (2026-07-16)

- Nested container windows, generic container-to-container moves, drag/drop,
  sorting, and richer target selection are deferred. Add server-issued
  container projections and revisions before exposing those controls.
- `use`/`use-with` currently covers rotate transforms. Read/write, doors,
  switches, fields, decay, beds, depots, corpses, and quest actions still need
  typed server behaviors and exploit tests.
- The client never sends `use-item`/`use-item-with`/`rotate-item`, so the
  server's rotate-transform support is unreachable from the UI. Expose an
  item-use control (context menu or double-click) when the next use behavior
  lands.
- Food and drink have no use behavior: eating for regeneration is
  unimplemented and was previously unlisted. Needs a typed consume action on
  the use-item path feeding the regeneration schedule in
  [`06-progression`](06-progression.md), with server-side exhaust.
- Add PostgreSQL fault-injection coverage for capacity, ancestry cycles,
  persistence rollback, disconnect/crash boundaries, and audit atomicity. The
  integration suite runs only when `TEST_DATABASE_URL` is configured.
- A future map-version upgrade needs an explicit seed reconciliation migration.
  Stable seed keys currently make an unplanned content-version replacement fail
  safely instead of silently duplicating or resetting moved world items.

[Back to overview](README.md)
