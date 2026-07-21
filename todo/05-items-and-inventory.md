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
    Shift-double-click pickup, right-click item use/open/equip, and drag owned
    items onto visible map tiles.
  - [x] Project nested container windows and parent ancestry, support revisioned
    container-to-container drag/drop, readable/writeable items, rotate, and the
    pinned food/regeneration consume path.
  - [x] Support Tibia-style ground, inventory, nested-container, and equipment
    drag sources with explicit bounded destination slots. Empty-slot moves,
    occupied container-slot swaps, equipment replacement, pickup, drop,
    equip, and unequip remain server-authoritative and transactionally durable.
- [ ] Implement doors, switches, fields, decay/transforms, beds, depots, and
  quest/world actions as typed server behaviors. Do not execute imported Lua.
- [ ] Add the remaining server-side use exhausts (Canary parity: 200 ms per
  generic use). Potions now enforce their separate 1 s execution-time exhaust;
  `use-item` is still throttled only by the single-in-flight
  `itemOperationPending` latch, `use-map` reuses the walk cooldown, and food
  and tool uses still need explicit timers (charter rule 8). Found in the
  2026-07-18 Canary use-surface audit.
- [ ] Implement trash holders (dustbins, sewer trash tiles; 79 catalog types
  with `kind: "trashholder"`): an item dropped or thrown onto the tile is
  destroyed with an effect and an audit entry instead of persisting as a
  world item. Hook: destination check in `planDrop`/`planMoveMapItem`.
  Note (2026-07-20): trashholder-typed liquids (water/lava/tar grounds) are
  now static map scenery — `getMapItemSemantics` no longer marks trashholders
  mutable, so this behavior must key off the catalog type at throw time, not
  off a world item on the tile.
- [ ] Client QoL: when a use/pickup target is out of reach, auto-walk
  adjacent and retry once (Canary walks-then-uses; we hard-fail with an
  error today). Client-side convenience only — server reach checks stay.
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
  [`12-world-actions`](12-world-actions.md); house items by
  [`14d-houses`](14d-houses.md); forge, imbuements, show-off sockets, and
  advanced equipment modifiers by [`15-optional-features`](15-optional-features.md).
- PostgreSQL fault-injection coverage now includes capacity, ancestry,
  transaction rollback, audit atomicity, and conjuring. A true process-kill
  crash harness remains an implementation gap; the integration suite runs
  only when `TEST_DATABASE_URL` is configured.
- A future map-version upgrade needs an explicit seed reconciliation migration.
  Stable seed keys currently make an unplanned content-version replacement fail
  safely instead of silently duplicating or resetting moved world items.

## Known gaps: optimistic drag queue and move batching (2026-07-16)

- `move-item`, `equip-item`, `unequip-item`, `drop-item`, `pickup-item`, and
  `move-map-item` flow through the client's optimistic op queue
  (`useOptimisticInventory`); drops/pickups/throws also render optimistic tile
  previews (`MapView.tileOverrides`). `use-item` and `open-container` still
  send immediately and get `item-action-failed` if they race a queued drag.
- A picked-up item appears in the backpack only when the server confirms —
  the client cannot predict the created item id (seeded items materialize a
  new uuid) and has no clientId→spriteId/tooltip catalog for placeholders.
  The tile-side removal is instant; the inventory-side appearance still costs
  the full `pickup` transaction (~8-10 sequential queries).
- The queue treats any `inventory-updated` as confirmation of the in-flight
  op. An unsolicited update (currently only the capacity patch on level-up)
  arriving mid-flight can advance the queue one op early; the mistaken send is
  rejected by the server and the queue rolls back to server state, so it
  self-heals with a brief visual snap. Fix: tag item intents with a client
  nonce echoed in `inventory-updated`.
- Merge prediction guesses stackability client-side (no prediction when both
  stacks are count 1; assumes a max stack of 100), and tile previews never
  predict world-stack merges — a thrown/dropped stack briefly renders beside
  the stack it merges into. Mispredictions reconcile on the next snapshot.
- `move-map-item` allows throws to any existing tile within `THROW_RANGE` (7)
  on the player's floor — no line-of-sight or walkability check yet (Canary
  uses `canThrowObjectTo`; `World.hasLineOfSight`-style check exists for
  combat and could be reused). Same laxness as `drop-item` today.
- Only `PgItemStore.moveToContainer` and the new `moveWorldItem` write paths
  use the combined-CTE pattern. `equip`, `unequip`, `pickup`, and `drop`
  still run ~8 sequential queries per call; apply the same pattern if their
  confirm latency matters now that drags render optimistically.
- `itemFromRow`/`locationFromRow`/`isAttributes` and the item-row interface
  exist in near-duplicate copies in `server/src/item/` and `server/src/depot/`
  (a duplication that predates the 2026-07-18 structural refactor, now visible
  as parallel files). Deduplicating means one module importing the other's row
  mapping; do it deliberately in one pass, since the depot variant's location
  handling differs subtly (depot/inbox kinds).

## Known gaps: client-side item-op prechecks (2026-07-18)

`client/lib/inventory/validateItemOp.ts` (plus the shop/depot handlers in
`GameWindow.tsx`) pre-rejects ops the server would certainly refuse, before
the optimistic send. `InventoryState.usedWeight` (exact, hundredths),
`shop-opened.currencyWeight`/`coinWeights`, the shared money planners in
`protocol/src/money.ts`, and per-item `weight` on tile-state map items let
the client mirror capacity math exactly (`exceedsCapacity.ts`,
`precheckShopPurchase.ts`, `precheckShopSale.ts`). Remaining accepted
limitations:

- Shop **sell** has no ownership precheck: `countSellable` needs items inside
  closed containers, which the client cannot see, so any client count would
  falsely reject legitimate sales. Fixing it would need the server to push
  live per-type owned counts with the shop session; not worth the traffic
  while the server precheck answers quickly with `not-owned`.
- **Pickup** capacity uses the map item's unit weight × count; contents of a
  picked-up container on the ground are not included (the server counts
  them), so those pickups may still round-trip before failing.
- `usedWeight` is not adjusted by optimistic previews/queued ops, so
  back-to-back heavy withdraws may pass the client check and be rejected by
  the server — the safe direction (no false client rejections).

## Known gaps (memory-first item ops, 2026-07)

Every item intent is memory-authoritative: carried ops
(equip/unequip/move-item/split/rotate/write, use-item on rotatables) and
ground ops (pickup/drop/move-map-item) are planned in
`server/src/item/plan/`, applied in the tick, and flushed as guarded
single-transaction writes (`PgItemPersistOps`). World items — including the
container subtrees inside dropped/seeded containers — are memory-resident
(`DynamicMapItems.worldItems`, boot-loaded by `worldTreeItemsQuery`); pristine
map seeds materialize in memory (`materializeWorldSource`) and persist with
their seed provenance. Deliberate trade-offs:

- **One global persist lane.** World items pass between characters (A drops,
  B picks up), so all memory-first writes serialize through a single FIFO
  (`ItemIntentHandler.persistChain`); world decay runs through the same lane
  (`runOrderedInternalOperation`). Throughput is one DB round trip per write
  server-wide — fine co-located, a bottleneck against a remote DB with many
  concurrent players. If it ever saturates, split into dependency-aware lanes
  (per-character + per-world-item) rather than reverting to DB-first.
- **Still DB-first:** food/rune/ammo consume, conjuring, corpse creation,
  world decay, and the economy flows (shop/bank/travel/mail, charter-pinned).
  Consumption gates on `session.itemPersistsPending`; corpse creation only
  inserts fresh rows so it needs no ordering; decay rides the global lane.
- **The retired DB-first ops are still present** (`PgEquipmentOps`,
  `PgContainerMoveOps`, `PgStackOps`, `PgItemUseOps.writeText`,
  `PgWorldItemOps.pickup/drop/moveWorldItem`, and `MemoryItemStore` mirrors +
  their tests) as the parity reference. Nothing in the intent path calls
  them; remove them once the memory-first path has soaked, and shrink
  `ItemStore`. Until then do not call them directly — they bypass the caches.
- **Persist failure disconnects the player** (same policy as the depot):
  a guard miss poisons that character's writes and terminates the session so
  the next login reloads DB state. Consider live resync if visible.
- **Client prediction layer retained** (`useOptimisticInventory`): now
  redundant for all converted ops (it masks only shop previews and the
  network RTT). Removing it is a client-only simplification, best done as its
  own change.

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
