# Items, inventory, equipment, and map use

This is the ownership core for loot and the economy. Follow the security
charter literally: one item has exactly one owner/location, and every transfer
is atomic.

## Static item catalog

- [ ] Generate a typed `ItemType` catalog by joining matching DAT appearance
  metadata, OTBM ids, and allowed static `items.xml` rules.
- [ ] Include stackability/max count, weight, worth, slot/equipment type,
  weapon/armor stats, container capacity, pickup/movable flags, decay and
  transform targets, field/door/bed/depot properties, light, elevation, and
  render stack flags.
- [ ] Pin catalog version/source hashes and fail on unknown ids or asset-era
  mismatches. Never trust item properties sent by a client.
- [ ] Keep the full catalog server-side; expose only display data needed by the
  client for visible/owned items.

## Mutable item model and database

- [ ] Add an `items` table with immutable instance id, item type id, subtype or
  stack count, attributes, version, and exactly one location/owner.
- [ ] Model locations as a constrained union such as player equipment slot,
  player inventory/container slot, world tile, depot, inbox, house, trade
  reservation, market escrow, or corpse. Do not represent a move as copy then
  delete.
- [ ] Enforce database constraints for valid counts, unique container slots,
  unique equipment slots, legal owner/location combinations, and parent ids.
- [ ] Prevent container ancestry cycles and cap nesting depth, slots, and total
  serialized contents.
- [ ] Give rares/audited economy objects stable serials where useful and append
  creation, destruction, and ownership changes to `audit_log` in the same
  database transaction.
- [ ] Make every ownership/count/location change durable in its operation's
  transaction before success is published. Periodic character snapshots and a
  global server save are never item-durability boundaries.

## Intent and transaction architecture

- [ ] Define bounded zod intents for move item, use item, use with target, open
  container, close container, equip, unequip, split stack, and rotate as needed.
- [ ] Address objects with server-issued ids and revisions, not raw array
  indexes. Derive the acting character from its session.
- [ ] Enqueue all intents. At execution time re-check item existence/version,
  current ownership/location, visibility, reach/range/line of sight, slot,
  count, capacity/weight, destination space, cooldown, and target compatibility.
- [ ] Mutate/reserve relevant in-memory state synchronously in the tick, then
  persist one atomic transaction. No `await` may split checked and changed
  shared state.
- [ ] On persistence failure, resolve the reservation through one deliberate
  rollback/reload path; never issue success before commit.
- [ ] Serialize concurrent operations on the same item/container/player so two
  move/trade/loot intents cannot both win.

## Map items and gameplay

- [ ] Split immutable decoration from mutable map items during conversion.
  Seed mutable world item rows exactly once against a content/map version.
- [ ] Add authoritative `TileState` and revisioned visible diffs for dynamic
  items. Static region files are never the source of current mutable state.
- [ ] Implement pickup/drop, stack merge/split, backpacks/containers,
  equipment, capacity/weight, rotate, readable/writeable items, and use/use-with
  incrementally.
- [ ] Implement doors, switches, fields, decay/transforms, beds, depots, and
  quest/world actions as typed server behaviors. Do not execute imported Lua.
- [ ] Keep inventory/equipment/container UI as projections of committed server
  state; optimistic animation must reconcile to authoritative revisions.
- [ ] Replace `client/components/inventory/placeholderInventory.ts` with real
  server-sent inventory state. Added 2026-07-15 so the `I` hotkey
  (`client/lib/hotkeys/`) can open the InventoryPanel before the server sends
  inventory; it is display-only hardcoded data and must be deleted once the
  server projects real inventory to the client.

## Planned file surface

- Content/domain: `server/src/item/ItemType.ts`, `Item.ts`, `ItemLocation.ts`,
  generated item catalog and its importer/validator.
- Persistence: `server/db/migrations/003_items.sql`, `004_audit_log.sql`,
  `server/src/item/ItemStore.ts`, `PgItemStore.ts`.
- Runtime: `server/src/item/ItemIntentHandler.ts`,
  `ItemTransferCoordinator.ts`, `Container.ts`, `Inventory.ts`,
  `server/src/world/WorldItemSeeder.ts`, `TileState.ts`,
  `server/src/audit/AuditLog.ts`.
- Protocol/client: typed item/location projections and focused inventory,
  equipment, container, drag/drop, context-menu, and tile-interaction state.

## Required exploit tests

- [ ] Two concurrent moves of the same item leave exactly one item in one place.
- [ ] Two players looting/trading/picking up the same item produce one winner.
- [ ] Replayed or stale item revisions cannot duplicate, destroy, or roll back
  an item.
- [ ] Negative/zero/oversized stack counts, raw slot indexes, invalid ids,
  over-capacity moves, container cycles, and excessive nesting are rejected.
- [ ] Disconnect/persistence failure during a move resolves to one durable owner.
- [ ] Map seed reruns and restarts do not duplicate mutable world items.
- [ ] Abrupt process death immediately before or after an ownership transaction
  leaves the item in exactly one durable location after restart; no daily
  global save is needed to reconcile it.
- [ ] Economy-relevant creation/destruction/transfer and its audit entry commit
  together or neither commits.

[Back to overview](README.md)
