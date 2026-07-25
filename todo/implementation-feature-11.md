# Feature 11 — Typed world-interaction behaviors (delegated umbrella)

Part of [Todo 6 — Items and inventory](todo-6.md).

## Why

Interactive map objects (doors, switches, fields, beds, depots, quest actions) were imported from Lua-scripted Canary content; each behavior must exist as a typed server behavior — imported Lua is never executed. Most sub-areas are delegated; this umbrella tracks the split plus the gaps that stay here.

## Remaining work

- Doors, switches, fields, decay/transforms, beds, depots, quest/world actions as typed server behaviors; never execute imported Lua.
- Ownership split (delegated):
  - fields, decay/transforms → Todo 9 (Features 33–34);
  - corpse/reward containers, quick loot → Todo 9 (Features 29–31);
  - depots/inbox/mail/stash/market/trade reservations → Todo 12 (Features 47–49);
  - doors, keys, beds, switches, quest actions → Todo 13 (Features 50–53);
  - house items → Todo 15 (Features 61–64);
  - forge/imbuements/show-off/advanced modifiers → Todo 16 (Feature 78 and the long tail, Feature 86).
- Direct gaps owned by this feature: container sorting, browse-field/seek/parent-container navigation, fluids, richer target selection.

### Fluids — blocked on catalog data (assessed 2026-07-25)

The pinned behavior is `data-otservbr-global/scripts/actions/other/fluids.lua`
(192 lines), registered on 21 fluid-container ids (2524, 2873-2885, 2893,
2901-2904, 3465, 3477-3480). It has five arms: pour between two fluid
containers, fill from a tile whose type has a `fluidsource`, drink from self
(drunk/poison conditions, `addMana(50-150)` for mana fluid, `addHealth(60)` for
life fluid, and a per-fluid `say` message), empty onto the ground as a splash
pool (item 2886 carrying the fluid subtype, decaying away), and two scripted
special cases (the 26076 basin and the actionid-2023 gravestone teleport).

Three things are missing before any of that can be written:

1. **`ItemType.fluidSource` does not exist and no catalog type carries it** —
   verified against `server/data/item-catalog.json`: zero types have the field.
   `tools/convertCanaryItems.mjs` does not parse `fluidsource` from
   `data/items/items.xml`, so "fill from a water tile" has no data behind it.
   Adding it means an importer change plus a full 16 MB catalog rebuild.
2. **No fluid-subtype model on carried items.** Canary stores the fluid in the
   item's `type`/subtype field; our `Item` has `count` and `attributes`, and the
   shop layer already has its own subtype notion
   (`server/src/economy/shopSubtypeAttributes.ts`) that this must not conflict
   with. The representation needs deciding before the handler.
3. **`use-item-with` cannot name a carried item or the player as the target.**
   The intent carries a `targetPosition` only, so pour-between-containers and
   drink-from-self need new bounded target kinds in `protocol/` first (schema +
   max size + rate expectation, per the charter).

The drunk condition and the splash-pool decay path both already exist, so once
those three land the handler itself is small. Sequence: catalog field →
subtype model → protocol target kinds → `handleFluidUse` + exploit tests.

## Implementation

- Behaviors hook into `/home/randal/code/tibia/server/src/item/ItemIntentHandler.ts` and the planners under `/home/randal/code/tibia/server/src/item/plan/` (e.g. `planCarriedIntent.ts`); catalog properties are typed in `/home/randal/code/tibia/server/src/item/ItemType.ts`.
- A door data importer already exists: `/home/randal/code/tibia/tools/importCanaryDoors.mjs`.
- Fluids and browse-field need new plan files plus bounded zod intents (with max size + rate expectation) defined in `protocol/` before implementing the handlers, per the charter.
- All checks (reach, ownership, capacity, destination) re-run at execution time inside the tick; mutations complete synchronously before persistence.
- Canary `data/scripts/actions` and movement behaviors are the parity reference.

## Tests

- Per-behavior exploit tests as each direct gap lands: out-of-reach/forged-id fluid use rejected; browse-field cannot enumerate tiles out of view; concurrent sort/move races leave item sets intact.

## Dependencies

- Todo 9 (Features 29–31, 33–34), Todo 12 (Features 47–49), Todo 13 (Features 50–53), Todo 15 (Features 61–64), Todo 16 (Features 78, 86) for delegated slices.
- Feeds Feature 17 (item-parity gate).
