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
