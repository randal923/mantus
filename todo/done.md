
  **Follow-up 2026-07-30** — auto-loot only ever filled the equipped backpack.
  The cause was not in `autoLoot` at all: `planLoot`'s default branch (and
  `planPickup`'s, character for character the same code) looked for a free
  slot with `firstFreeContainerSlot(catalog, items, backpack)` on the equipped
  backpack alone, and searched for a stack to top up only among that
  backpack's own direct children. Bags nested inside it were invisible, so a
  full main backpack meant `planLoot` returned null and the sweep took
  nothing — with plenty of room one level down.

  The repo already had the right traversal: `backpackContainers`, which walks
  the equipped backpack and every container nested inside it depth-first in
  slot order, matching the fill order `BackpackSlotLocker` produces inside a
  transaction. It was sitting in `server/src/economy/plan/` serving only the
  shop's `CarriedItemDraft`. Moved it to `server/src/item/plan/` (an item-tree
  concern, and `item/` must not depend on `economy/`), added a `depth` field,
  and extracted the shared rule into
  `server/src/item/plan/planBackpackPlacement.ts`: top up the first partial
  stack found anywhere in the tree, else take the first free slot in the first
  container with room, skipping any container where `depth + 1 + subtree
  height` would exceed the 8-level nesting cap — the same rule the
  explicit-destination branch already enforced. `planLoot` and `planPickup`
  both call it now, so auto-loot, manual corpse looting and ground pickup all
  place items identically, and all three agree with where a purchase lands.
  `slotOf` became dead in both planners and was removed.

  **Verified**: 3 new auto-loot cases — a bag nested inside a *full* backpack
  is filled rather than the sweep giving up; a partial gold stack sitting in a
  nested bag is topped up (50 → 60) instead of a new stack being opened; and
  nothing is taken when every container in the whole tree is full. The first
  two were confirmed to fail against the old single-backpack behaviour
  (temporarily capping the walk to one container reproduces exactly those two
  failures) and pass with the fix. Note the harness needs `capacityMax` raised
  for these: with the default 400 oz the 19 filler axes hit the weight cap
  before placement was ever reached, which would have made the tests pass for
  the wrong reason. Full suite after the change: 1,436 server + 326 client
  passed, 0 failed — no existing loot, pickup, trade or economy test moved.

  **Follow-up 2026-07-31** — drinking a *stack* of potions failed outright
  with `combat-action-failed` when the equipped backpack had no free slot.
  `planPotionUse` mirrored the same single-container bug auto-loot had: the
  returned flask needed a free slot in the equipped backpack's own direct
  children (`firstFreeContainerSlot`), a bag nested inside it was invisible,
  and a null plan aborted the whole use. Reported as "ultimate mana potion is
  not working" because bought stacks are large and the backpack is usually
  the fullest container; a single potion was unaffected (count 1 takes the
  `transform` branch, which reuses the potion's own row).

  Canary's `data/scripts/actions/items/potions.lua` restores health/mana
  first and only then does `player:addItem(potion.flask, 1)` — `canDropOnMap`
  defaults true and the placement cascades through sub-containers, so a full
  backpack never blocks the drink. `planPotionUse` now calls the shared
  `planBackpackPlacement` (the walker the 2026-07-30 auto-loot fix
  consolidated on), so the flask tops up the first partial flask stack in the
  backpack tree, else takes the first free slot in it — the same destination
  a purchase or a pickup would get. When the whole tree is full the new
  `discard` potion plan drinks the potion and drops the flask; the potion row
  is still decremented in the one transaction and the destruction audit still
  written, only the flask creation (and its audit) is skipped. This also
  replaced the old merge search, which scanned `collectReachableItemIds` and
  picked a flask stack by *uuid order* — arbitrary, and it could top up a
  stack lying in an open corpse.

  Files: `server/src/item/plan/planPotionUse.ts`,
  `server/src/item/PotionItemPlan.ts`, `server/src/item/PgItemUseOps.ts`,
  `server/src/item/MemoryItemStore.ts`.

  **Verified**: 3 new `planPotionUse` cases (stack top-up, cascade into a
  sub-bag when the backpack is full, `discard` when the whole tree is full)
  plus a Combat-level regression that a level-130 sorcerer with a full
  backpack drinks an ultimate mana potion (23373), gains 425–575 mana, gets
  no error, has the stack decremented to 4 in the store, and receives no
  flask. The Combat case was confirmed to reproduce the reported
  `combat-action-failed` before the change. Full server suite after: 1,439
  passed, 0 failed. `PgItemUseOps`'s `discard` branch is covered only by the
  memory store — the Postgres potion tests are integration-gated and were
  skipped here (no DB in this session).

  **Residual risk**: Canary drops the flask on the ground when the player
  cannot carry it; we destroy it (Canary's own "deactivated flasks" KV does
  the same). Recorded under Accepted gaps in `TODO.md`.
