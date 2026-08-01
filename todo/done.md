
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

  **Feature 110 — public website and read-only landing API
  (2026-07-31)** — replaced the one-column marketing page with a responsive
  fantasy portal layout inspired by Tibia's information architecture: a
  branded hero, grouped navigation rail, central news/editorial stream, and
  live world-data rail. The presentation remains Mantus-specific charcoal,
  pewter, oxblood, and cyan, with original generated citadel, ritual-vault,
  and forest-expedition artwork stored as optimized WebP assets. English and
  Brazilian Portuguese copy covers every new surface, and the intentionally
  provisional story is labeled as a development preview.

  The game process now owns `GET /api/public/landing` on the same listener as
  WebSocket upgrades. It exposes only world status, the daily boosted pair,
  and five bounded public experience-ranking rows; accepts no writes or
  request bodies; applies short cache/security/CORS headers; coalesces
  concurrent database reads; and caches the fixed projection for 30 seconds.
  The shared protocol package defines the strict response schema, and the
  browser validates the untrusted JSON before rendering it. WebSocket
  payload, connection, and shutdown behavior continue through the same
  `GameServer` boundary.

  **Files touched**: `client/components/landing/`,
  `client/public/images/landing/`, `client/locales/`, `client/ASSETS.md`,
  `protocol/src/publicLanding.ts`, `server/src/PublicLandingApi.ts`,
  `server/src/PublicLandingApi.test.ts`, `server/src/GameServer.ts`, and
  `server/src/boosted/BoostedService.ts`.

  **Verified**: protocol, server, and client TypeScript checks passed; the
  landing component lint passed; the optimized Next.js production build
  generated `/` and `/play`; 2 public-API tests, 31 `GameServer` WebSocket
  regressions, and 10 boosted-rotation tests passed. The remaining editorial
  placeholders are recorded in `TODO.md`.

  **Follow-up 2026-07-31 — public community routes and complete read-only
  API** — expanded the portal into a shared public site with a RubinOT-inspired
  grouped desktop/mobile menu and dedicated `/highscores`, `/online`,
  `/characters`, `/characters/[name]`, and `/server-info` routes. Character
  names in the ranking and connected-player table now open the same public
  profile, which shows the server-owned appearance, level, vocation, sex,
  residence, guild, title, achievement showcase, badges, creation time, and
  last login without exposing an account id, position, inventory, or hidden
  stats. The landing artwork now dissolves through a deep backdrop-matched
  gradient into an overlapping content grid instead of ending at a hard
  border.

  Renamed `PublicLandingApi` to the cohesive `PublicApi` and added bounded,
  strict-schema routes for the landing projection, paged category/vocation
  highscores, currently authenticated online players, name-addressed
  profiles, and safe gameplay-facing server settings. HTTP reads reject
  bodies, writes, unknown/duplicate query fields, invalid names, and ranking
  pages past the existing 1,000-row cap. Database projections use fixed
  parameterized SQL, caches and concurrent loads are capped, live lists are
  limited to 1,000 rows, and the shared HTTP/WebSocket listener has an
  explicit connection ceiling. Offline guild membership comes from the
  durable profile projection; online status comes only from a bound live
  session, not lingering world state.

  **Files touched**: `client/app/{highscores,online,characters,server-info}/`,
  `client/components/public-site/`, `client/components/landing/`,
  `client/hooks/usePublicApiData.ts`, `client/lib/public/`,
  `client/locales/`, `protocol/src/publicWebsite.ts`,
  `server/src/PublicApi.ts`, `server/src/PublicApi.test.ts`,
  `server/src/GameServer.ts`, and `server/src/profile/`.

  **Verified**: all workspace TypeScript checks passed; the client lint has no
  new errors (15 pre-existing warnings); the optimized Next.js build produced
  all seven public/game routes; 1,439 server tests and 326 client tests passed;
  all new pages returned HTTP 200 against the active local processes; and
  hydrated desktop plus 390px mobile browser checks confirmed real highscore,
  character, and server-info data. The intentionally provisional editorial
  copy remains recorded in `TODO.md`.

  **Follow-up 2026-07-31 — Tibia-style character page and public death
  history** — rebuilt the character route around the official site's stacked
  information hierarchy: full-width framed sections, strong title bars, and
  compact alternating label/value rows for character information,
  achievements, deaths, account information, and related characters. It keeps
  Mantus's charcoal/oxblood presentation rather than copying Tibia's artwork.
  Account linkage remains private: the related-characters section explains
  that sibling characters are withheld until the game has an explicit public
  opt-in instead of leaking account ownership.

  Corrected the earlier mistaken death-history placeholder. Feature 83 already
  persists every authoritative player death in `character_deaths`; `PublicApi`
  now reads page zero through the existing parameterized `CyclopediaStore`
  projection (15 rows, 30-day window), validates the entries through the
  shared public schema, and renders the real timestamp and server-authored
  cause. No new table or duplicate death write path was introduced.

  **Verified**: all workspace TypeScript checks passed; 3 `PublicApi` tests
  passed including the death projection; lint reports only the same 15
  pre-existing warnings; the optimized Next.js build passed with all routes;
  the live API returned six real death records for the visual test character;
  and a hydrated desktop browser check confirmed the complete stacked layout
  and data.

  **Follow-up 2026-07-31 — seamless hero/backdrop blend** — replaced the
  landing hero's opaque bottom cover with a real alpha mask on both the
  generated citadel artwork and its readability shade. The image now fades
  directly into the page's existing forged-stone backdrop, while the
  three-column content grid overlaps the final part of that fade. This removes
  the rectangular image edge and separate black transition band.

  **Files touched**: `client/app/globals.css`,
  `client/components/landing/LandingHeader.tsx`, and
  `client/components/landing/LandingPage.tsx`.

  **Verified**: client TypeScript and the optimized Next.js production build
  passed; a hydrated 1,440px browser capture confirmed that the image remains
  visible behind the first content row and dissolves continuously into the
  shared backdrop.

  **Follow-up 2026-07-31 — cleaner landing news hierarchy** — kept one
  featured story with its image and summary, but reduced its vertical weight
  and converted the three older stories from repeated excerpt blocks into a
  quiet date/title/category archive. The redundant “Prepare your character”
  action was also removed from the story body. The result preserves the
  available news without forcing every item to compete with the featured
  story.

  **Files touched**: `client/components/landing/LandingNews.tsx` and
  `client/components/landing/LandingNewsRow.tsx`.

  **Verified**: client TypeScript and focused lint passed; a hydrated 1,440px
  full-page browser capture confirmed the shorter feature and compact,
  single-line desktop archive.

  **Follow-up 2026-07-31 — persistent public-site frame** — moved the landing
  hero, grouped navigation rail, and live world-data rail into one shared
  public layout. Highscores, online players, character search, character
  profiles, and server information now replace only the center content while
  retaining the homepage artwork and navigation context. Route-specific
  headings were converted into compact center-column panels, highscore
  filters were reshaped for the narrower content column, and homepage section
  links now resolve correctly from every sub-route.

  **Files touched**: `client/components/public-site/PublicSiteLayout.tsx`,
  `client/components/public-site/PublicPageHero.tsx`,
  `client/components/public-site/{HighscoresPage,OnlinePlayersPage,CharacterSearchPage,CharacterProfilePage,ServerInfoPage}.tsx`,
  and `client/components/landing/{LandingPage,LandingNews,LandingNavigation}.tsx`.

  **Verified**: focused lint, client TypeScript, and the optimized Next.js
  production build passed for all eight application routes. Hydrated browser
  captures at 1,440px confirmed the shared frame around highscores and a live
  character profile; a 390px capture confirmed responsive character search,
  navigation, and world-data rails without horizontal overflow.

  **Follow-up 2026-07-31 — focused navigation and vocation guide** — removed
  Featured Story, News Archive, World Overview, and Enter the Game from both
  public navigation systems. News now links only to Latest News; Game links to
  the new Vocation guide and Server Information. `/vocations` explains all
  five starter paths with their battle role, playstyle, strengths, tradeoffs,
  promotion, and a portrait rendered from the real game outfit assets. The
  guide is fully localized in English and Brazilian Portuguese and retains the
  shared public hero and side rails.

  **Files touched**:
  `client/components/public-site/{PublicSiteHeader,VocationsPage,VocationGuideCard}.tsx`,
  `client/components/landing/{LandingHeader,LandingNavigation}.tsx`,
  `client/app/vocations/page.tsx`, and `client/locales/{en,pt-BR}.json`.

  **Verified**: locale JSON parsing, focused lint, client TypeScript, and the
  optimized Next.js production build passed; the build now generates nine
  public/game routes including `/vocations`. Hydrated 1,440px and 390px
  full-page captures confirmed the shortened menus, all five outfit portraits,
  and the responsive guide without horizontal overflow.

  **Follow-up 2026-07-31 — content-first portal and profile polish** — reduced
  the global header to the Mantus mark, language controls, and Play Now by
  removing only the News/Game/Community navigation block. The large marketing
  hero and route-introduction cards were removed entirely; the citadel artwork
  is now an absolute shared backdrop that reserves no layout space, so every
  route begins directly beneath the compact header.

  Rebuilt the landing news stream around Tibia-inspired dispatches: each story
  has a strong dated oxblood headline bar and a clearly separated body, while
  the featured story keeps a restrained supporting image instead of a dominant
  banner. Public highscore filters now use the existing shared `Dropdown`
  component. The character page gained a live outfit/status summary, visible
  badges, tighter information columns, stronger section bars, and refined
  alternating tables while retaining real achievements and death history.

  **Files touched**: `client/components/landing/{LandingNews,LandingNewsRow,LandingPage}.tsx`,
  `client/components/public-site/{PublicSiteHeader,PublicSiteArtworkHeader,PublicSiteLayout,PublicSiteShell,HighscoresPage,CharacterProfilePage,PublicProfileSummary,PublicProfileSection,PublicProfileInformation,PublicProfileAchievements,PublicProfileDeaths,PublicProfileAccountInformation,PublicProfileCharactersPrivacy}.tsx`,
  and the remaining public route page components.

  **Verified**: focused lint and client TypeScript passed. Hydrated desktop
  captures confirmed the content-first root news page, shared highscore
  dropdowns, no-gap server-information layout, and live character summary;
  390px captures confirmed the server and profile layouts remain readable
  without horizontal overflow.

  **Follow-up 2026-07-31 — auth-aware public actions and login modal** —
  replaced unconditional Play Now links across the public header and account
  rail with session-aware actions. Authenticated visitors go directly to the
  game, while signed-out visitors open the existing email, account creation,
  and Google login experience in the shared game-styled modal without leaving
  the current public page. The standalone game login screen now reuses the
  same login hook, so both entry points retain one deliberate error and
  confirmation flow. The modal is portaled to the document root so the
  sticky header's backdrop filter cannot constrain its full-screen overlay.

  **Files touched**: `client/components/auth/{LoginModal,LoginPanel,LoginScreen}.tsx`,
  `client/components/public-site/{PublicAuthAction,PublicSiteHeader}.tsx`,
  `client/components/landing/LandingNavigation.tsx`,
  `client/hooks/{useLogin,usePublicAuthSession}.ts`, and
  `client/locales/{en,pt-BR}.json`.

  **Verified**: focused lint, client TypeScript, and the optimized Next.js
  production build passed for all ten generated routes. Hydrated 1,440px and
  390px browser captures confirmed a centered, complete, scroll-safe login
  modal over the public page.

## 2026-08-01 — Daily reward calendar and exercise-weapon choice

**Problem**: the reward wall used the broad Canary supply table and exposed
item selection as an inline quantity editor. It did not match the requested
seven-card calendar, and its 50-charge starter training pool did not let a
player make one clear choice from the normal exercise weapons.

**What changed**: replaced the cycle with prey card, XP boost, and exercise
weapon days in the requested seven-day order. The reward window is now a wide,
compact calendar with a large streak banner, one card per day, collected and
locked status plates, and the server deadline beneath today's card. Clicking
today's prey or XP card claims it; clicking an exercise day opens a separate
chooser containing sword, axe, club, bow, rod, wand, shield, and wraps.

The server projects those eight catalog entries and accepts exactly one normal
500-charge exercise weapon. Pool membership, count, capacity, reach, daily
gate, persistence, and audit handling remain server-authoritative and atomic.

**Files**: `protocol/src/dailyRewards.ts`,
`server/src/daily/{DailyRewardService,dailyRewardPools,validateDailyRewardPicks}.ts`,
`server/src/daily/validateDailyRewardPicks.test.ts`,
`client/components/daily/{DailyRewardCycle,DailyRewardDay,DailyRewardKindIcon,DailyRewardsModal,ExerciseWeaponSelectionModal,RewardStreakBanner}.tsx`,
`client/components/ui/Modal.tsx`, `client/locales/{en,pt-BR}.json`, and
`client/stories/DailyRewardsModal.stories.tsx`.

**Verified**: protocol, server, and client TypeScript checks passed; focused
client lint passed; 10 focused server tests and 5 daily-reward client tests
passed. The new exploit regression rejects starter weapons, multiple choices,
out-of-pool IDs, and over-allowance counts.

**Residual risk**: the existing Postgres claim transaction was not changed and
its integration suite was not run because no test database was used in this
session.

## 2026-08-01 — Configurable bestiary/bosstiary kill credit

**Problem**: every creature death credited exactly 1 kill toward
bestiary/bosstiary completion (boosted boss aside); there was no server
setting to boost progression the way experience/skill/loot rates can be.

**What changed**: added `rates.bestiaryKills` and `rates.bosstiaryKills` to
`config.yml` (integer 1–1000, validated in `loadServerConfig`).
`BestiaryTracker.onMonsterKilled` multiplies each death's increment by the
matching rate; the boosted boss's Canary triple stacks multiplicatively on
the bosstiary rate. The playtest parity config pins both back to 1 so parity
scenarios keep asserting exact counts. The public `/api/public/server-info`
rates object gained both keys (`protocol/src/publicWebsite.ts` — required,
because the strict schema would otherwise 503 the endpoint now that
`GameServer` passes `config.rates` through verbatim) and the public
server-info page displays them.

**Files**: `config.yml`, `server/src/loadServerConfig.ts`,
`server/src/config.ts`, `server/src/bestiary/BestiaryTracker.ts`,
`server/src/GameServer.ts`, `server/src/playtest/startPlaytestServer.ts`,
`server/src/playtest/{itemAnimationProbeServer,monsterLoadServer,playerLoadServer}.ts`,
`protocol/src/publicWebsite.ts`,
`client/components/public-site/ServerInfoPage.tsx`,
`client/locales/{en,pt-BR}.json`, plus rates fixtures in
`server/src/{PublicApi,GameServer,gm/GmCommands,moderation/ModerationCommands,bestiary/BestiaryService,loadServerConfig}.test.ts`.

**Verified**: protocol and server typechecks pass; 74 tests across the
affected suites pass, including a new tracker test (bestiary ×2, bosstiary
×5 stacking to ×15 with the boosted triple) and config-validation rejections
for fractional/zero rates. Live wire probe: server booted with
`bestiaryKills: 2`, one rat death pushed `bestiary-entry-changed kills=2`.

**Residual risk**: client typecheck currently fails only in concurrently
in-progress imbuement files unrelated to this change. Charm spending remains
unimplemented (todo/status.md row 73/77).

**Follow-up 2026-08-01 — public realm rates**: the public server information
already exposed both kill-credit rates, but the realm still configured
Bosstiary at ×1. Updated `config.yml` to set `bosstiaryKills: 2`, so the
landing page now shows both Bestiary and Bosstiary at ×2 and the game server
applies the advertised rates. Files touched: `config.yml` and `todo/done.md`.
Verified with `yarn workspace server test src/loadServerConfig.test.ts` (9
tests passed) and `git diff --check`. Residual risk: none known; the change
takes effect when the server next loads its configuration.

## 2026-08-01 — Imbuement shrine workspace layout

**Problem**: the functional imbuement window still used a narrow mode rail,
compact slot buttons, tier tabs, and a footer action card. That hierarchy did
not match the supplied shrine reference, whose item stage, slot selection,
imbuement controls, and source flow read as one large in-game workspace.

**What changed**: rebuilt the client layout around a dedicated 900px-tall,
viewport-safe `max-w-6xl` shrine dialog. Its flatter header and section frames
fit the complete desktop flow without a modal scrollbar: a taller exact 50/50
item-and-slot stage, Basic/Intricate/Powerful tabs, directly clickable
imbuement icons, compact square source tiles, selected result, price, and
footer. Every carried imbuable item is a directly clickable icon in the item
half; the blank-scroll workflow sits in that same grid instead of a separate
footer mode rail. Required source sprites resolve through the validated wiki
item catalog, so their artwork remains visible even when the owned count is
zero. The item-request transition retains the last complete server projection
until the new one arrives, eliminating the intermediate empty-window flicker.
Occupied-slot clearing, bank balance, material counts, and all existing intent
callbacks remain intact. The screenshot's 90% success roll was not copied
because this pinned Canary applies valid imbuements deterministically; the
selected state reports the accurate 100% guaranteed outcome (or 0% while
blocked).

**Files**: `client/components/imbuement/{ImbuementShrineDialog,
ImbuementModal,ImbuementItemPanel,ImbuementSlotButton,ImbuementListPanel,
ImbuementApplyPanel,ImbuementMaterialBox,ImbuementPanel}.tsx`,
`client/components/game-window/GameForgeOverlays.tsx`,
`client/locales/{en,pt-BR}.json`, and
`client/stories/{ImbuementModal.stories,forgeFixtures}.tsx`. The superseded
separate item picker, tier-tab, option-row, and rail-button components were
removed.

**Verified**: all 6 imbuement Storybook interaction tests pass in Chromium;
focused client lint and the full client TypeScript check pass. Selected and
blocked browser captures were inspected against the supplied references,
including the 50/50 split, larger item/imbuement targets, zero-owned material
sprites, compact square sources, close placement, and desktop overflow.

**Residual risk**: viewports shorter than the 900px target retain an overflow
fallback so actions remain reachable instead of being clipped.

## 2026-08-01 — Feature 111: RubinOT Hunt Finder and live routes

**Problem**: the client had prey and hunting-task progression windows but no
read-only hunting-place guide. Players could not browse suitable spawns,
recommended preparations, creature weaknesses, valuable drops, or routes
without leaving the game.

**What changed**: copied RubinOT 21.0's complete, unencrypted 131-entry
`hunting_places.json` catalog verbatim from `bin/assets.rtc` and documented its
source hash. A bounded parser treats the fetched asset as untrusted before any
guide uses it. The new top-navigation compass opens a full Hunt Finder with
level, vocation, team-size, XP/loot, and text filters; searchable illustrated
cards; and a detail workspace covering creatures, resistances, charms,
premium/route requirements, vocation-specific imbuements, supplies,
equipment, drops, and every approach/in-hunt coordinate segment.

Guide item names resolve through the existing validated wiki catalog and
creatures through the server-authored bestiary projection, so the feature
reuses Mantus' atlas rather than importing RubinOT sprites. The route viewer
draws every available floor over the existing minimap regions. “Track the
path” stores only a display route in client state, opens the live minimap, and
draws the matching-floor segments there; it never sends movement or gameplay
state. All 3,464 copied route endpoints land in minimap regions present in the
current `otservbr` map.

**Files**: `client/public/assets/hunting/hunting_places.json`,
`client/lib/hunt-finder/*`, `client/components/hunt-finder/*`,
`client/hooks/useHuntingPlaces.ts`,
`client/components/game-window/{GameHuntFinderOverlay,GameNavigation,
GameMinimapOverlay,GameWorldOverlayParent}.tsx`, game-window store/state
types, `client/components/navigation/TopNavigationBar.tsx`,
`client/components/minimap/MinimapPanel.tsx`,
`client/lib/minimap/{MinimapRoute,drawMinimap}.ts`, client locales, asset
documentation, and Hunt Finder/navigation stories.

**Verified**: the full client unit suite passes (334 tests), including the
verbatim 131-entry catalog, malformed-coordinate rejection, guide filters,
metric parsing, and floor-scoped live-route drawing. Five Hunt Finder and top
navigation Storybook interactions pass in Chromium. Client TypeScript and
lint pass with no errors, the Next.js production build completes, and
`git diff --check` is clean.

**Residual risk**: six normalized RubinOT-only item labels have no Mantus item
catalog entry and deliberately render text monograms; the accepted gap and
automatic resolution path are recorded in `TODO.md`. All guide content and
coordinates remain present.

### 2026-08-01 follow-up — stable unloaded-bestiary selector

Fixed the Hunt Finder overlay's unloaded-bestiary fallback so its Zustand
selector returns a stable empty array. The former inline `?? []` produced a
new external-store snapshot on every read and triggered React's maximum update
depth guard before bestiary data loaded. Live tracking uses only each guide's
multi-floor `WayPath`, leaves the regular minimap camera and controls untouched,
selects segments by the currently viewed floor (which follows the character by
default), and pulses the line between bright and dim states. The Darashia
Dragon Lair regression fixture covers floors 7 through 10. Browser stories
cover both fresh-store and player-following route states. Verified with client
typecheck, focused unit and Chromium Storybook tests, and `git diff --check`.
