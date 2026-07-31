
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

  **2026-07-31** — two action-bar/feedback fixes.

  *Refused actions are puff-only.* A rejected gameplay intent showed the
  server's error code twice over: `handleGameClientError` fired the local
  `CONST_ME_POFF` on the player *and* set `serverError`, which
  `GameNotifications` rendered as a toast (combat/spell codes) or a red banner
  (everything else). Canary answers a refused action with the puff and, at
  most, a status-line cancel message — never a modal-ish overlay. The handler
  now returns right after the puff for the codes that draw one
  (`combat-action-failed`, `item-action-failed`, `item-exhausted`,
  `player-full`, `spell-*`, `potion-*`), still doing the inventory rollback
  and map-preview clear for `item-action-failed`. `serverError` is left to the
  session-level failures it was meant for (character list/load, language, UI
  settings), and the now-dead toast branch was deleted.

  *Action-bar icons no longer vanish into closed backpacks.* Buttons were
  drawn from `getInventoryItems(inventory)` — equipment, the main backpack and
  whatever containers the player happened to have *open* — so a rune or potion
  in a shut bag had no icon (`?`), no count, and was greyed as unavailable; it
  reappeared the moment the bag was opened. It also skewed behaviour, not just
  paint: `GameHudOverlay` reads `useKind === "potion"` to decide whether a
  cursor action targets a creature or a tile, and the item picker could not
  list an object it could not see.

  Canary keeps a whole-inventory aggregate for exactly this:
  `Player::getInventoryItemsId()` totals every slot and every container
  recursively, and `ProtocolGame::sendInventoryIds()` (0xF5) pushes it on
  every inventory change (`updateState`, `onAddInventoryItem`, stow, …) so
  hotkeys keep drawing objects the client cannot otherwise see. Mirrored that:
  `InventoryState` gained `carried`, an array of
  `carriedItemSummarySchema` (typeId, clientId, spriteId, name, total count,
  equipment slot, use kind, potion resources — presentation only, no item ids
  or locations), built by the new `summarizeCarriedItems` over the cache's
  full item set, which already spans every carried container. `useKind`
  derivation moved out of `projectItem` into `getItemUseKind` so both
  projections agree. Client side, `getCarriedItems` replaces
  `getInventoryItems` for everything action-bar (HUD buttons, slot strip,
  icon, item picker, action-bot panel/rules, cursor targeting), and the
  picker's own by-type aggregation collapsed into it.

  Files: `protocol/src/item.ts`,
  `server/src/item/{summarizeCarriedItems,getItemUseKind,projectInventory,
  projectItem}.ts`, `client/lib/inventory/getCarriedItems.ts`,
  `client/lib/action-bar/{createItemAction,createActionBotAction,
  getActionBarActionName}.ts`, `client/components/GameHud.tsx`,
  `client/components/game-window/{GameNotifications.tsx,GameHudOverlay.tsx,
  controllers/handleGameClientError.ts}`,
  `client/components/action-bar/{ActionBarModal,ActionBarSlotStrip,
  ActionBarActionIcon,ActionBarItemPicker,ActionBotRuleRow,
  ActionBotSettingsPanel}.tsx`.

  **Verified**: new `projectInventory` cases — a rune inside a *closed* bag is
  absent from `containers` yet totalled in `carried`, and stacks of one type
  split across an open and a closed container sum to 100. Server `src/item`
  suite (156 passed), client `lib/action-bar` + `lib/inventory` +
  `components/action-bar` (63 passed), all three workspaces typecheck, client
  lint clean (0 errors).

  **Residual risk**: `carried` is optional in the schema and
  `getCarriedItems` falls back to totalling visible items, so a state built
  without it (stories, fixtures) keeps the old behaviour rather than showing
  empty buttons. A button for a type the character carries *none* of still
  falls back to `?` instead of Canary's greyed sprite — recorded under
  Accepted gaps in `TODO.md`. Client-side inventory prediction does not
  recompute `carried`; the count badge trails by one server update after a
  predicted move, which the following `inventory` message corrects.

  **2026-07-31 — imbuement window (Tibia layout), stash-drawn sources, scroll
  flow.** Feature 78's server half had shipped, but the window was a generic
  category list with no imbuement art, astral sources were carried-only (the
  gap `status.md` had parked behind 84), and Canary's blank-scroll flow was
  missing entirely. The client also had no way to see an imbuement outside the
  shrine.

  **Art and layout.** `tools/importOtclientImbuementAssets.mjs` (`yarn
  imbuing:assets`) pulls the 82 imbuement icons plus the empty-slot art from
  the otclient commit the Cyclopedia importer already pins, into
  `client/public/assets/imbuing/`. The ids line up exactly: Canary's
  `Imbuement::getIconID()` returns `iconid + (baseid - 1)`
  (`imbuements.cpp:465`), which is what `sendWindow` was already projecting, and
  our catalog spans 1–81 across 72 imbuements. The window was rebuilt to
  `modules/game_imbuing/new_design/t_imbui.otui`'s structure in our tokens: a
  mode rail (Pick Item / Blank Scroll) beside three panels — item + slots,
  tier tabs + list + description, then the apply or clear action. The action
  panel lives in the `Modal` footer so its button cannot scroll out of reach at
  laptop heights.

  **Stash-drawn sources.** `planImbuementMaterials` transcribes
  `player.cpp:2682-2727`: every source must be covered by carried + stash, and
  each is taken from carried first with only the shortfall withdrawn. The two
  lanes are the hazard here — the stash is memory-authoritative behind a
  trailing persist FIFO, while imbuing is a DB-authoritative SERIALIZABLE
  transaction. Rather than split the spend across both, the stash share is
  reserved in the depot cache synchronously inside the tick and the absolute
  post-mutation counts ride the *same* transaction as the gold debit, the
  source destruction, the attribute write and the audit row; any non-commit
  restores the reservation in the outcome step. Ordering is safe because
  `handleApply` already refused to run while `itemPersistsPending > 0`, which
  drains the depot lane first — `depotOperationPending` was added to that gate
  for the same reason. `DepotService` grew only `stashCountOf` /
  `setStashCounts`.

  **Scroll flow.** `handleScrollCreate` (Canary `createScrollImbuement`,
  `player.cpp:2548-2620`) spends a blank scroll — `ITEM_EMPTY_IMBUEMENT_SCROLL`
  = 51442 — plus the sources and the base price, and mints the filled scroll
  inside the transaction; `handleScrollApply` (`:2511-2546`) spends a filled
  scroll into the item's first free slot for free. Migration
  `063_imbuement_scrolls.sql` restates `audit_log_event_type_check` from 062
  verbatim plus `imbuement-scroll-create` / `imbuement-scroll-apply`.

  **Two bugs found on the way.** The imbuement debit never called
  `setBankBalance`, so the cached balance drifted after every apply and clear
  and every later affordability read was wrong until reload — the transaction
  now returns the post-debit balance and the service applies it. And options
  were being *filtered* by tier eligibility, which made Tibia's three tier
  buttons impossible to render; they now carry a `blockedReason` and grey out
  instead. A tier button disables only on `wrong-category`, never on a material
  shortage, or the player could never see which source they were short of.

  **Other changes.** Using a shrine now opens the window (`imbuement-shrine`
  world action, adjacent + non-mutating like `daily-shrine`), and the window
  itself requires shrine adjacency, so the catalog and the player's own
  material counts no longer go out to anyone standing anywhere. The
  inventory's hover "imbue" badge was dropped with it. `iconId` is
  denormalized into the item's imbuement attribute alongside the existing
  `name`, so `projectItem` can show running imbuements on equipped gear
  without threading the imbuement catalog through ten call sites.

  **Files**: `tools/importOtclientImbuementAssets.mjs`,
  `protocol/src/{imbuements,item,clientMessages}.ts`,
  `server/src/imbuement/{ImbuementService,ImbuementStore,PgImbuementStore,
  MemoryImbuementStore,planImbuementMaterials,buildImbuementOptions,
  imbuementBlockedReasonOf,imbuementShrineItemIds}.ts`,
  `server/src/action/{handleImbuementShrineUse,WorldAction,WorldActionContext,
  WorldActionRegistry,resolveWorldAction,worldActionPreconditions}.ts`,
  `server/src/{depot/DepotService,forge/itemImbuementsOf,item/projectItem,
  GameServer}.ts`, `server/db/migrations/063_imbuement_scrolls.sql`,
  `client/components/imbuement/*` (13 files),
  `client/components/inventory/{ItemSlot,ItemSlotImbuements,InventoryPanel}.tsx`,
  `client/lib/imbuement/{imbuementIconSrc,formatImbuementDuration}.ts`,
  `client/{lib/net/GameClient.ts,locales/{en,pt-BR}.json}`, game-window store
  and overlay wiring.

  **Verified**: 14 new server tests — the carried-first/stash-shortfall split
  at every boundary, stash counted toward availability, two racing applies
  spending the same stash sources leaving exactly one mutation, the
  reservation restored when the transaction does not commit, and scroll
  forging both succeeding and refusing with no blank scroll. Full server suite
  1,455 passed. Client: 326 unit, 5 imbuement story interactions (two of which
  caught the tier-button and button-label bugs above), all three workspaces
  typecheck, imbuement lint clean.

  **Residual risk**: migration 063 is pending `db:migrate` along with 055-062,
  so the scroll audit events will be rejected until it runs. The window shows
  no success chance because this Canary has no roll (the XML `percent` and
  `protectionPrice` are display-only) — if a later Canary bump reintroduces
  the roll, the protection checkbox has to come with it. Imbuement entries
  written before this change carry no `iconId` and render the placeholder icon
  on equipped gear until re-applied. The clear panel shows the server's
  remaining time without a local countdown, since decay is conditional on
  combat outside a protection zone and a client clock would drift.

  **Follow-up 2026-07-31** — right-clicking an imbuing shrine did nothing, and
  the cause turned out to be larger than the missing wiring: **no imbuing
  shrine existed on the server at all**. `convertOtbm` only writes a tile's
  item into `otservbr.items.bin` when `getMapItemSemantics` calls it `mutable`
  or `interactive`; a shrine is immovable, not pickupable, not stateful, not a
  container and carries no action id, so all 28 placements stayed baked into
  the client draw layer and the server held nothing for those tiles. A scan of
  the shipped `items.bin` found zero placements for every imbuing id.

  That means the use never resolved — but also that `nearShrine()` could never
  return true, so **every imbuement apply and clear had been failing with
  `no-shrine` since Feature 78 shipped**; the feature was unreachable in-game,
  not merely unwired. The same trap had already been hit and documented for
  the reward shrines: `MUTABLE_ITEM_IDS` in `tools/getMapItemSemantics.mjs`
  carries 25720-25803 with a comment saying that without it "they stay baked
  draw-only and their handler never sees them". Added the 13 imbuing ids there
  and re-ran `yarn map:convert`.

  While scanning, the shrine id set itself turned out to be incomplete:
  `25101`, `25102` and `25201` were missing from the list Feature 78 shipped,
  and they account for 7 of the 28 placements on this map — a partial fix
  would still have left those shrines dead. Corrected in
  `imbuementShrineItemIds.ts` (now shared by the world action and the
  adjacency check, which had previously duplicated the set).

  Regeneration was reproducible rather than a map swap: `map/otservbr.otbm`
  still hashes to the manifest's `a80de1dd…` and the tracked map data was
  clean, so the only server-side change is `items.bin` growing by exactly
  252 bytes (28 items x 9) plus the item count in `map.json`. Running
  `convertOtbm` alone wipes the minimap PNGs, so `buildMinimapTiles` has to
  follow it (that is what `yarn map:convert` does); 55 minimap regions changed
  because the shrines moved out of the baked draw layer, the same way the
  reward shrines already render from server items.

  **Files**: `tools/getMapItemSemantics.mjs`,
  `server/src/imbuement/imbuementShrineItemIds.ts`,
  `server/src/playtest/scenarios/imbuementShrine.ts`, `server/package.json`,
  regenerated `server/data/{otservbr.items.bin,otservbr.map.json}` and
  `client/public/assets/map/otservbr/**`. Migration renumbered
  `063_imbuement_scrolls.sql` to `067_` after a parallel branch took 063-066;
  none of those restate `audit_log_event_type_check`, so 062 is still the
  correct base for its list.

  **Verified**: new `yarn workspace server playtest:imbuement-shrine` drives a
  real client against a real server — teleport beside the shrine at
  33774,32754,3, send the `use-map` a right-click sends, and assert the window
  arrives with no item picked, 72 options and all three tiers present; then
  teleport 12 tiles away, repeat the use, and assert no window comes back.
  Exit 0. Full server suite 1,455 passed.

  **Residual risk**: any database that has world-item deltas from before this
  regeneration needs `yarn workspace server db:reconcile-world-seed` with the
  server down before it will boot — the playtest database refused to start
  until it ran (`persisted world items require reconciliation for this map
  version`) and reconciled 1 stale row. The 55 changed minimap regions were
  not visually reviewed; shrines may render slightly differently on the
  minimap now that they are server items rather than baked pixels.

## 2026-07-31 — Wheel of Destiny window sizing on small screens

**Problem**: the Wheel window resized itself whenever the content changed
(tab switch, selection panel filling in), and below ~1280px the fixed 522px
wheel plus two 208px side columns overflowed: the wheel got a horizontal
scrollbar and the side panels got clipped.

**What changed**: `Modal` gained an optional `height="tall"` that pins the
panel to its maximum height so only the content area scrolls; `WheelModal`
uses it and lays the wheel tab out as a single column below `xl` (wheel
first, then selection and perk summary), each column capped at the wheel's
width. `WheelCanvas` now measures its container and CSS-scales the composited
522px wheel down to fit, dividing pointer coordinates by the measured scale so
hit testing stays exact at any size. New `useMeasuredWidth` hook wraps the
ResizeObserver. The locked hint now also names the promoted-vocation
requirement, which the server has always enforced but the copy omitted.

**Files**: `client/components/ui/Modal.tsx`,
`client/components/wheel/WheelModal.tsx`,
`client/components/wheel/WheelCanvas.tsx`,
`client/hooks/useMeasuredWidth.ts`, `client/locales/{en,pt-BR}.json`.

**Verified**: `yarn workspace client typecheck` and `lint` clean (only
pre-existing `no-img-element` warnings). Not visually re-checked in a running
client.

**Residual risk**: the scaled wheel is a CSS transform, so the pixel art is
resampled below 1:1 and looks softer on narrow viewports; the sub-`xl`
breakpoint is viewport-based, not container-based.
