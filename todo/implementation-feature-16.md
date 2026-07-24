# Feature 16 — Optimistic-queue and persistence-path refinements

Part of [Todo 6 — Items and inventory](todo-6.md).

## Why

The client optimistic drag queue and the memory-first persistence path shipped with a set of accepted limitations, each with a recorded fix. This feature is the ledger of those refinements so they don't live only in past conversations.

## Remaining work

- `use-item`/`open-container` send immediately and get `item-action-failed` if they race a queued drag.
- Picked-up items appear in the backpack only on server confirm — there is no clientId→sprite/tooltip catalog for placeholder prediction; pickup costs ~8–10 sequential queries.
- The queue treats any `inventory-updated` as confirmation; an unsolicited update (e.g. a capacity patch on level-up) arriving mid-flight advances the queue early. Recorded fix: tag item intents with a client nonce echoed in `inventory-updated`.
- Merge prediction guesses stackability client-side (assumes max stack 100); tile previews never predict world-stack merges.
- ~~`move-map-item` allows throws to any existing tile within `THROW_RANGE` (7) with no line-of-sight or walkability check~~ — **LOS done 2026-07-24**: `validateItemIntentTarget` rejects both `move-map-item` and `drop-item` when `world.hasLineOfSight`/`canSee` fail (regression test in `ItemIntentHandler.test.ts`, "rejects a drop or throw whose line of sight is blocked by a wall"). Remaining: a strict destination-walkability check is deliberately *not* added because it would reject trashholder tiles (Feature 13, water/lava are non-walkable but must accept-then-destroy); an explicit 7-tile `THROW_RANGE` distinct from view range is still open.
- Only `PgItemStore.moveToContainer` and `moveWorldItem` use the combined-CTE pattern; `equip`/`unequip`/`pickup`/`drop` run ~8 sequential queries — apply the CTE pattern if confirm latency matters.
- `itemFromRow`/`locationFromRow`/`isAttributes` plus the item-row interface are duplicated between `server/src/item/` and `server/src/depot/` (`server/src/depot/itemFromRow.ts` etc.); dedupe deliberately — the depot variant's location handling differs subtly.
- The single global persist lane (`ItemIntentHandler.persistChain`) is a throughput bottleneck against a remote DB; if saturated, split into dependency-aware lanes (per-character plus per-world-item) — never revert to DB-first.
- Retired DB-first ops are still present as parity reference (`PgEquipmentOps`, `PgContainerMoveOps`, `PgStackOps`, `PgItemUseOps.writeText`, `PgWorldItemOps.pickup/drop/moveWorldItem`, `MemoryItemStore` mirrors + tests) — remove after the memory-first path soaks; do not call them.
- Persist failure currently disconnects the player; consider a live resync if it proves visible in practice.
- The `useOptimisticInventory` prediction layer is now redundant for converted ops; removal is a standalone client-only simplification.
- Shop-sell has no client ownership precheck (accepted); the pickup capacity precheck ignores ground-container contents; `usedWeight` is not adjusted by queued ops (errs in the safe direction).

## Implementation

- Client: `/home/randal/code/tibia/client/hooks/useOptimisticInventory.ts`, `/home/randal/code/tibia/client/lib/render/MapView.ts` (tileOverrides), `/home/randal/code/tibia/client/lib/inventory/validateItemOp.ts`.
- Server: nonce echo added to `inventory-updated` in `/home/randal/code/tibia/protocol/src/serverMessages.ts`; throw validation in `/home/randal/code/tibia/server/src/item/plan/planMoveMapItem.ts` (and the drop path) reusing `World.hasLineOfSight`; CTE batching in `/home/randal/code/tibia/server/src/item/PgItemStore.ts`; row-mapper dedupe across `server/src/item/` and `server/src/depot/`.
- Throw/drop validation is an execution-time server check (charter: never enforce a limit only in the UI); nonce is opaque and server-issued semantics stay authoritative.

## Tests

- Throw across a wall (no LOS) within range 7 is rejected server-side; regression test alongside existing move exploit tests.
- Nonce echo: an unsolicited `inventory-updated` mid-flight no longer advances the optimistic queue.
- CTE-converted ops keep the existing single-owner/race exploit tests green.

## Dependencies

- None hard; persist-lane split only if profiling shows saturation (relates to Feature 106, server perf).
