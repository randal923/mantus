# Feature 30 — completed

Cross-links: [todo-9.md](../todo-9.md) · [implementation](../implementation-feature-30.md).

---

## 2026-07-25 — Nested views, multi-view sessions, pristine chests, quick loot

**Problem.** The v1 corpse-loot slice deliberately shipped a single view per
session, direct children only, no quick-loot affordance, and no way to open a
pristine map chest (a seeded container that has never been materialized). All
four were deferred scope rather than bugs, but each one had to keep the
per-tick reach re-validation and the memory-first persistence model intact.

**What changed.**

- **Multiple views per session, nested in place.** `WorldContainerViews` now
  holds a bounded list per session (8, oldest evicted — charter rule 10)
  instead of one view. A view records the world root it hangs off, its own
  container, and its parent, so a bag inside a corpse browses in place. The new
  `open-world-container { containerId, revision }` intent opens a child: the id
  is re-resolved at execution time against the live subtree of an *already
  open* view, the revision must match, the container must still be a container,
  and reach is re-checked against the world root. Every view revalidates each
  tick — root gone, container moved out of the root's subtree, or the player
  out of reach closes exactly that view (and its descendants).
- **Loot from a nested view.** `planLoot` takes any item inside the root's
  subtree instead of only direct children, re-deriving parentage from world
  state. `ItemIntentHandler` maps the client's (possibly nested) container id to
  the world root before planning and target-validating, so loot protection and
  reach still resolve against the root — the same protection a bag inside a
  corpse inherits.
- **Pristine map chests open.** `WorldContainerViews.findContainerRoot` falls
  back to a tile's seeded `WorldItemSource` and materializes the tree in memory
  (after the reach check), registering it through the new
  `World.registerUnpersistedSeedItems`. Nothing is written on open: the first
  take inserts the row carrying the seed identity (`planLoot` /
  `appendUnpersistedLootInserts` seeded branch), and `items.seed_key`'s unique
  index is what makes a double materialization impossible. `applyItemMutation`
  hides a seed key the moment its item is materialized, and
  `materializeWorldSource` now skips hidden content seeds — so a restart (which
  drops the memory-only chest back to pristine) cannot hand out an item that
  was already taken. `findUnpersistedGuardViolation` covers seed origins too,
  so no plan can guard a row that does not exist yet.
- **Quick loot.** The new `quick-loot { containerId, category? }` intent sweeps
  one open view. The eligible set is derived server-side inside the tick from
  the live view and Feature 29's `quickLootCategory` buckets (`none` — not
  pickupable — is never taken); the optional category only narrows it. Each
  item is an ordinary `planLoot` move with its own expected-version guard and
  its own transaction, so a sweep that runs out of room or races another player
  simply stops there and never half-applies a move.
- **Client.** `lootSession` became `lootSessions` (one window per open
  container, reconciled by container id); `LootPanel` opens a contained bag in
  place and gained a "Loot all" button; `GameClient` gained
  `openWorldContainer` and `quickLoot`.

**Files touched.**

- `protocol/src/clientMessages.ts` (two new bounded intents)
- `server/src/item/WorldContainerViews.ts` (rewritten),
  `ItemIntentHandler.ts`, `ItemIntent.ts`, `plan/planLoot.ts`,
  `plan/appendUnpersistedLootInserts.ts`,
  `plan/findUnpersistedGuardViolation.ts`, `plan/materializeWorldSource.ts`,
  `plan/WorldItemsView.ts`
- `server/src/world/DynamicMapItems.ts`, `server/src/World.ts`,
  `server/src/GameServer.ts`
- `client/lib/net/GameClient.ts`,
  `client/components/inventory/LootPanel.tsx`,
  `client/components/game-window/GameInventoryOverlays.tsx`,
  `client/components/game-window/messages/handleCommerceMessage.ts`,
  `handleCharacterSessionMessage.ts`, store/state types

**Verification.** `yarn workspace server test` — 860 passed / 183 skipped.
New `server/src/item/ItemIntentHandler.worldContainers.test.ts` (12 tests):
nested browse + loot out of a nested view; a container not inside an open view
cannot be opened; a nested view closes when its bag leaves the corpse; two
views reconcile independently; walking away closes every view and revokes
looting; quick loot sweeps, honours a category filter, refuses an unopened
container and a protected corpse; a seeded chest materializes on open with no
row written, two openers share one materialization and a race leaves exactly
one gold row, and a taken content's seed key is hidden so it cannot be
re-created. `ItemIntentSchemas.test.ts` bounds both new intents (bad uuid,
`none` as a filter, and a forged outcome field are all rejected).
`yarn workspace client test` — 224 passed; all three workspaces typecheck.

**Residual risk / still open.**

- A quick-loot sweep enqueues one persist per item taken. That is by design
  (each move keeps its own guard), but a sweep of a full corpse is a burst on
  the persist chain; if that ever matters, the batching belongs in the store,
  not in the planner.
- A chest materialized in memory but never taken from is lost on restart, the
  same volatility corpses already accept. Its contents are re-derived from the
  seed on the next open, minus anything already taken.
- Quick loot always fills the backpack; it does not honour per-category loot
  containers (Canary's loot lists), which stay unimplemented.
