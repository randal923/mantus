
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
default), and pulses a round-dotted line from the character's current tile to
the endpoint of the nearest segment on that floor. The Darashia Dragon Lair
regression fixture covers floors 7 through 10. Browser stories cover both
fresh-store and player-following route states. Verified with client typecheck,
focused unit and Chromium Storybook tests, and `git diff --check`.

## 2026-08-01 — Bank balance in the wallet counter, top-bar layout, auto-height modals

**Problem**: the top navigation bar's gold counter only summed the coins the
character carried, so the money most players actually hold — the bank balance —
was invisible outside a banker dialogue. The bar also spent width on a
"Connected" status label, left the currency counters stranded in the middle of
the header, and the character-select, login and outfit windows were pinned to
the fixed 900px modal height with most of it empty.

**What changed**: `welcome` now carries the character's own `bankBalance`
(`BANK_LIMITS.maxBalance`-bounded), read from the inventory cache the login
already attached, so the counter is right before any bank visit. The client
keeps it in `GameWindowState.bankBalance` and refreshes it from every message
that already reports an authoritative own balance: `bank-opened`,
`bank-updated`, `shop-opened` and `imbuement-window-state`. `CurrencyCounters`
renders it as a second segment inside the gold pill (coin + carried, divider,
vault glyph + bank), and the whole wallet moved to `ml-auto` so it sits flush
against the navigation buttons, which lost their own `ml-auto`. The connection
status dot and label are gone from the header (`GameNotifications` still
surfaces a lost connection), taking `connectionStatus` off the component's
props with it. `LoginModal`, `CharacterSelectModal` and `OutfitModal` now pass
`height="auto"`; the outfit picker's own `max-h-80` keeps that window bounded.

Four services that debit or credit the bank and had the new balance in hand
were leaving both the cached balance and the client stale, which this counter
would have shown: market create/accept/cancel (also a real cache-drift fix —
`MarketService` never adopted the balance its own transaction committed), the
imbuement apply path, gem atelier transactions, and guild bank deposits and
withdrawals (`GuildBankResult.characterBalance` was returned and ignored;
`GuildService` took an optional `ItemIntentHandler` for it).

**Files**: `protocol/src/serverMessages.ts`, `server/src/CharacterHandler.ts`,
`server/src/GameServer.ts`, `server/src/market/MarketService.ts`,
`server/src/guild/GuildService.ts`,
`server/src/imbuement/ImbuementService.ts`,
`server/src/wheel/GemAtelierService.ts`,
`client/components/navigation/{CurrencyCounters,TopNavigationBar}.tsx`,
`client/components/game-window/GameNavigation.tsx`, the game-window store,
state and action types, `client/components/game-window/messages/{handle
CharacterSessionMessage,handleCommerceMessage,handleProgressionCatalog
Message}.ts`, `client/components/auth/LoginModal.tsx`,
`client/components/characters/CharacterSelectModal.tsx`,
`client/components/outfit/OutfitModal.tsx`, client locales, and the top
navigation story.

**Verified**: `yarn typecheck` passes across protocol, server and client; the
client unit suite (338 tests) and client lint pass; the server suite passes
except `monsterLootParity.test.ts`, which fails on the in-progress creature
import in the working tree and not on anything here. Chromium Storybook
interactions for `TopNavigationBar`, `CharacterSelectModal` and `OutfitModal`
pass (15 tests), and headless screenshots of the rebuilt static Storybook
confirm the two-segment wallet flush against the nav buttons, no connection
label, and both modals hugging their content.

**Residual risk**: six other gold sinks (prey rerolls, hunting-task
rerolls/cancels, bosstiary slot removals, forge, house rent/purchase, NPC
travel) still charge the bank without reporting the new balance, so the
counter can lag until the next bank/shop/market/imbuement/gem/guild event.
`debitBankBalanceQuery` guards with `balance >= $2`, so a stale cache can only
reject an action, never overdraw; the gap and its fix are recorded in
`TODO.md`.

## 2026-08-01 — Canary map verification and missing Hunt Finder populations

**Problem**: the Hunt Finder described current areas such as Werecrocodiles,
Weretigers Oskayaat, Iksupan Occupied Sanctuary, and Podzilla Quara, but the
pinned Canary monster XML placed none of their 11 normal monster types. The
local official Tibia directory was only a 55 MB launcher installation and had
no OTBM, DAT, SPR, or minimap source to import.

**What changed**: verified that `map/otservbr.otbm` already byte-matches
Canary's latest released v3.6.1 OTBM, then rebuilt all map and minimap outputs
without changing the pinned map version. Added 83 authored supplemental spawn
slots across the four missing grounds. The importer binds that source to the
exact OTBM and Hunt Finder hashes and rejects an unknown guide/type, duplicate
position, blocked tile, or position outside the matching route polyline. It now
imports the 11 previously unplaced Canary definitions, yielding 922 monster
types and 84,377 total world placements. Mitmah Scout and Mitmah Seer retain
their Canary critical-hit chance, which is bounded during loading and rolled
only by the server; it emits Canary's critical visual without inventing a
damage bonus. Three current corpse appearances omitted by Canary's
`items.xml` receive Canary's default eight-slot container semantics so Cunning
Werepanther, Iks Yapunac, and White Weretiger can create corpses and drop loot.
The generated world/starter creature, spawn, bestiary, loot-item, item-catalog,
and parity reports were refreshed. `yarn map:convert` was repaired to target
the repository's pinned map directly.

**Files**: `content/{source-manifest.json,canary-parity-inventory.json}`;
`content/{monsters,npcs,spawns}/*.json`;
`content/spawns/hunting-ground-spawns.json`; `tools/{buildItemCatalog,
importCanaryCreatures,parseCanaryCreatureContent,parseHuntingGroundSpawns}.mjs`
and parser tests; `server/data/item-catalog.json`; creature/combat loader,
critical-hit, loot-parity, performance, import, and hunting-coverage tests;
`client/public/assets/creature-loot-items.json`; `package.json`;
`map/README.md`; and the project status/optimization/accepted-gap records.

**Verified**: the pinned OTBM SHA-256 is
`a80de1dda6a9aca3956a9d5b7fb2e0caebb451570d26853fc21beb40d5f31da2`;
`yarn map:convert` processed 17,972,264 tiles and rebuilt 1,116 minimap region
tiles with zero missing item IDs; both world and starter creature imports
completed; all 93 tool tests and the Canary parity inventory gate pass; all
1,467 non-integration server tests pass (251 integration tests skipped by the
normal unit-test command); all 338 client unit tests pass; and the full
protocol/server/client TypeScript check passes.

**Residual risk**: these 83 positions are route-authored coverage because the
upstream spawn XML contains no authoritative placements for the four grounds.
Carnisylvan Sapling is intentionally not made persistent: Canary creates this
zero-XP, no-loot creature dynamically and its registered spell removes it. The
typed self-destruct callback and creation trigger remain recorded in `TODO.md`.
No database world-seed reconciliation is required for this update because the
OTBM and converted map version did not change.

## 2026-08-01 — Sewer-grate click targeting

**Problem**: 2 of Thais's 32 valid sewer grates could not be used to descend.
Their server-authored dropdowns and walkable landing tiles were correct, but
the client redirected clicks to an adjacent 2×2 wall sprite's south-east
anchor. The server consequently received an intent to use the wall while the
paired underground ladder remained usable in the other direction. The same
client-side ambiguity affected 13 of the world's 123 enabled sewer grates.

**What changed**: sewer grates now retain their own map position as the use,
look, and context-menu target even when a neighbouring multi-tile wall sprite
overlaps the tile. Both sewer-grate item types are covered; ordinary doors and
multi-tile gates keep the existing anchor redirect. No outcome moved to the
client: it still sends only the selected map position, and the server resolves
and revalidates the authored dropdown and destination inside the tick.

**Files**: `client/lib/render/{MapView,resolveInteractiveTile}.ts`, its unit
test, and the project completion/status records.

**Verified**: audited all 32 Thais sewer-grate actions (all enabled with
walkable server-authored destinations) and all 123 enabled sewer grates in the
world map; the focused 9-test resolver suite, all 340 client unit tests, lint
for the touched client files, and the full protocol/server/client TypeScript
check pass.

**Residual risk**: none for enabled sewer grates. The map's separately audited
disabled-action backlog is unchanged; the one disabled dropdown in the Thais
area is a closed wooden trapdoor whose tile directly below is a wall, not a
sewer grate.

## 2026-08-01 — Feature 112: hunting bot

**Problem**: the Hunt Finder ships 131 hunting guides, each carrying a route,
but a route was only ever something to look at. The coordinates are drawn on a
wiki map as straight `[start, end]` lines — the median segment is 23 tiles and
the longest is 135 — so they run through walls, water and cliff faces, and
nothing could walk them. Players wanting to hunt one still drove every step by
hand.

**What changed**: a server-owned hunting bot. The client's new HUNTING BOT
window (beside LOOT FILTER) browses the same guide catalog as the Hunt Finder;
picking a hunt seeds its route and asks the server to re-walk it.

Tracing runs off-tick, one leg at a time, over the server's own walkability:
each guide point is snapped onto real ground within 4 tiles, long segments are
sampled every 16 tiles along the guide's own line so the trace follows the
intended corridor instead of wandering, and a bounded breadth-first search
joins the anchors. The search follows step-activated floor changes, so a route
may take a ramp exactly as a player does. Legs it cannot solve come back
flagged, and the window paints those waypoints red for the player to drag.
Measured over all 131 guides: 1669 legs, 94.9 % resolved, 87 routes fully
clean, ~4 ms of search for a whole route.

The route itself is inert geometry. `HuntingBot.tick` only decides *where* the
character should head next and hands that tile to `MovementHandler.walkPathTo`,
which computes the path and lets the existing auto-walk loop re-validate every
single step — so a hand-placed waypoint inside a wall costs a skipped waypoint,
never a teleport. A waypoint nothing can reach is skipped; a whole run of them
stops the bot with a reason the window explains. Auto-targeting picks the
lowest-health visible monster (nearest, then creature id, to break ties) and is
re-evaluated once a second so a running fight is not interrupted; while a
target is alive the bot clears its walk queue and lets the attack pipeline own
the character's feet, forcing the chase the weapon's own range asks for.

Deliberate choices: the route persists, whether the bot is *running* does not —
a character never logs in already walking. Health-hidden monsters are ranked as
untouched so the bot's choice cannot reveal which one is weakest (charter rule
6). Arming requires standing within 100 tiles of the route on one of its
floors.

**Files**: `protocol/src/{huntingBot,index,clientMessages,serverMessages}.ts`;
`server/db/migrations/068_character_hunting_bot.sql`;
`server/src/huntingBot/{findRoutePath,snapToWalkable,buildRouteAnchors,traceRouteLeg,RouteMap,HuntingBot,HuntingBotHandler,selectAutoTarget}.ts`
plus their tests; `server/src/{MovementHandler,Session,World,GameServer,CharacterHandler}.ts`;
`server/src/combat/{Combat,ChaseController,PlayerAutoAttack}.ts`;
`server/src/character/{Character,CharacterRow,CharacterStore,PgCharacterStore,CharacterService,toCharacter,parseHuntingBotRoute,sql/characterColumns}.ts`;
`server/src/test/{makeCharacter,InMemoryCharacterStore}.ts`;
`server/src/playtest/scenarios/huntingBot.ts`;
`client/lib/hunting-bot/{extractRouteWaypoints,insertWaypointAt,guideRouteFor,baseHuntingVocation}.ts`;
`client/lib/minimap/{minimapPixelToTile,worldToMinimapPixel,drawMinimapWaypoints,drawMinimap}.ts`;
`client/components/hunting-bot/{HuntingBotModal,HuntingBotRouteEditor,HuntingBotRouteMap,HuntingBotWaypointList}.tsx`;
`client/components/game-window/GameHuntingBotOverlay.tsx` and the store/message/
runtime plumbing; `client/components/GameHud.tsx`; both locale files;
`client/stories/HuntingBotModal.stories.tsx`.

**Verified**: 50 new server unit tests (pathfinding around walls and across a
ramp, bounding-box and budget cut-offs, snapping, anchor sampling, turning-point
extraction, target ranking and its exclusion matrix, waypoint advance/loop/skip/
stop, the pending-write race, the durable-write rollback, the trace cooldown,
and the schema/transport-cap suite); 12 new client unit tests; 4 Storybook
interaction stories; a `PgCharacterStore` integration round-trip including a
corrupt stored blob degrading to an empty route; and `yarn playtest:hunting-bot`
end to end against a real server — traced a 20-waypoint loop with 0 unreachable
legs, walked 37 single-tile steps across 8 waypoints, auto-targeted a Snake,
stopped on command, and refused to arm both an empty route and one on the other
side of the map. Full `yarn typecheck`, 1517 server tests, 353 client tests and
client lint pass.

**Residual risk**: ladders, holes and ropes are `use` actions rather than steps,
so a route needing one stalls and the bot skips past it — recorded in
`TODO.md`. Closed doors are likewise not opened. Roughly 5 % of guide legs
cannot be traced for those reasons and arrive flagged for hand editing. The
runtime path budget (800 nodes, one search per waypoint per session) has not
been profiled with many bots running at once.

## 2026-08-01 — Feature 112 follow-up: bot no longer cycles waypoints faster than the character walks

**Problem**: whenever the runtime path search failed, `HuntingBot.tick`
advanced to the next waypoint after a single 400 ms repath beat, so the
waypoint index raced around the ring while the character stood still. And the
search failed constantly in real use: the 800-node budget only reaches ~20
Manhattan tiles on open ground, less around geometry, while real legs are
routinely longer — rejoining the route after a combat chase pulled the
character off it, hand-edited waypoints tens of tiles apart, or the arm-time
join that `maxStartDistance: 100` promised but the search could never deliver.
A transient blocker (a creature standing on the goal tile) triggered the same
instant skip.

**What changed**: a failed path search now waits and retries the same waypoint
(new `skipAfterFailedRepaths: 5`, one attempt per 400 ms repath cooldown, new
`Session.huntingBotPathFailures` counter) and only skips a waypoint that stays
unreachable for ~2 s; the consecutive-skip stop ("unreachable") is unchanged.
`maxRuntimeVisited` was raised 800 → 4000 so the legs the bot legitimately
meets are actually findable, and `maxStartDistance` was cut 100 → 20 so arming
never promises a joining walk outside the search's reach.

**Files**: `protocol/src/huntingBot.ts`, `server/src/Session.ts`,
`server/src/huntingBot/HuntingBot.ts`, `server/src/huntingBot/HuntingBot.test.ts`.

**Verified**: reproduced live with a headless-client probe — a route with
~25-tile legs skipped three waypoints in 2.7 s without the character moving off
its first corner; after the fix the same shape walked a 24-tile leg step by
step with zero skip-advances, and a genuinely unwalkable hand-placed corner was
skipped only after the full 5-attempt retry window. Updated/new unit tests
cover retry-before-skip, the retry counter resetting on a successful walk, and
the unreachable-ring stop absorbing retries × skips; all 52 huntingBot tests,
`yarn playtest:hunting-bot` end to end, and protocol + server typechecks pass.

**Residual risk**: a waypoint parked on by another player or an idle creature
still gets skipped after ~2 s rather than approached to an adjacent tile;
goal-adjacent arrival remains future work if that turns out to matter. The
per-tick budget scale profiling gap in `TODO.md` now carries the 4000-node
figure.

## 2026-08-01 — Feature 112 follow-up: chase reach matches vision (Canary ±12 search box)

**Problem**: a hunting-bot character froze mid-route staring at a wounded
dragon on the screen edge, and the dragon stared back. Auto-targeting picks
the weakest visible monster with no reachability check; the bot stands down
while a target is alive; the forced chase then searched with a 32-node budget
(~4 tiles of reach) and the monster's own chase with 96 nodes (~6 tiles), so
neither side could path around the rock ridge between them and the stalemate
never resolved. Both budgets contradicted the pinned Canary source, where
every creature's follow search is boxed to ±12 tiles around the searcher
(`Creature::getPathSearchParams`, creature.cpp:1041; enforced map.cpp:1297)
with a 512-node A* (astarnodes.hpp:37) — a box that always covers the 11-tile
view range (map_const.hpp:12-15), so anything a creature can see it can chase.

**What changed**: new `CHASE_SEARCH_DISTANCE = 12` shared constant
(`server/src/pathfinding/chaseSearchDistance.ts`) with the Canary citations.
`ChaseController` searches the whole box (625-node budget — our BFS has no
heuristic, so it needs the full box area to match the A*'s guarantee), bounds
`canStep` to the box, and stands down 250 ms after a failed search instead of
re-searching every 25 ms tick. `MonsterBrain.moveToward` takes the same box
for chasing (walk-home stays unboxed); `config.yml` raises `ai.maxPathNodes`
96 → 640 (one full box + slack) and `maxAiWorkPerTick` 512 → 2048 (three full
searches per tick; the 250 ms think interval spreads monsters across ten
ticks). The playtest load harnesses mirror the new values.

**Files**: `server/src/pathfinding/chaseSearchDistance.ts` (new),
`server/src/combat/ChaseController.ts` (+ new `ChaseController.test.ts`),
`server/src/ai/MonsterBrain.ts` + test, `config.yml`,
`server/src/spawn/CreaturePerformance.test.ts`,
`server/src/playtest/{itemAnimationProbeServer,monsterLoadServer}.ts`.

**Verified**: new tests — player chase walks a ~22-step detour the old
32-node budget could never find, refuses targets outside the ±12 box, and
skips re-searching inside the failure cooldown; a monster chases around a
wall whose detour floods past the old budget while the starved config
provably stands still; the perf gate re-pinned at 2048 work/640 visited with
a worst-case full-box timing loop. Full server suite (1523 passed / 26
DB-integration skipped), server typecheck, and `yarn playtest:hunting-bot`
end to end all pass.

**Residual risk**: a genuinely uncrossable target (ladder/rope/hole between)
still stalls the bot — recorded in `TODO.md` with the give-up/ignore-list fix;
the enlarged budgets fold into the existing scale-profiling gap there.

## 2026-08-01 — Feature 112 follow-up: arming joins the route at the earliest nearest waypoint

**Problem**: `nearestWaypointIndex` kept updating on ties, so among
equally-close waypoints the last index won. Routes revisit tiles constantly
(closed loops, out-and-back corridors), so arming next to "waypoint 3" could
join at its return-leg twin near the end of the ring and walk toward the end
instead of forward through the hunt.

**What changed**: ties now go to the earliest index (strict-improvement
update in `server/src/huntingBot/HuntingBot.ts`), with the start-distance
boundary kept inclusive. New unit test covers an out-and-back corridor where
the join tile appears twice; all 53 huntingBot tests and the server typecheck
pass.

## 2026-08-01 — Feature 112 follow-up: arming gate proves the join walk instead of guessing from distance

**Problem**: a player standing visibly inside their hunt got "You are not
standing in this hunting ground" when arming. The morning's fix had cut
`maxStartDistance` 100 → 20 to keep the gate inside the old search budget, so
standing a screen from the nearest waypoint now refused; and a route on a
different floor produced the same misleading travel-there message, since the
same-floor filter and the distance filter shared one error.

**What changed**: arming is gated by what it actually promises.
`HuntingBot.start` now returns "ok" / "wrong-floor" / "out-of-range": a route
with no waypoint on the character's floor names the floor
(new `hunting-bot-wrong-floor` protocol error, new `huntingBot.errors
.wrongFloor` strings in en/pt-BR, mapped in `HuntingBotRouteEditor`); within
`maxStartDistance` (back up to 30, now only a cheap pre-filter) the arm runs
the real joining path search (`maxStartVisited: 10_000`, one-shot per arm
click, sized past the worst 30-tile diagonal) and refuses only when no
walkable join exists — on success the join leg is already queued, so the
character starts walking the same tick. The out-of-range copy now says what
is actually wrong ("No walkable path reaches the route from here").

**Files**: `protocol/src/{serverMessages,huntingBot}.ts`,
`server/src/huntingBot/{HuntingBot,HuntingBotHandler}.ts` + both tests,
`client/components/hunting-bot/HuntingBotRouteEditor.tsx`,
`client/locales/{en,pt-BR}.json`.

**Verified**: 55 huntingBot unit tests (new: refuses when nothing walkable
reaches the route; wrong-floor named at the handler; existing arm tests moved
to the reason-string contract); a live probe armed from a traced tile 27
tiles from the route — refused before this change — and walked the 55-step
join back to waypoint 0; `yarn playtest:hunting-bot` still passes both
refusal steps; protocol, server and client typechecks pass.

**Residual risk**: arming spam is bounded only by the connection message-rate
cap; each arm click may spend a 10k-node search (~4 ms). Fine at current
scale; folds into the existing path-budget profiling gap in TODO.md.

## 2026-08-01 — Guide catalog: dedicated "Darashia Dragon Lords" hunting place

**Problem**: the catalog had no way to hunt the Darashia dragon-lord floor —
the world spawns 24 dragon lords on z11 (plus 4 in a z12 side chamber) under
the Darashia Dragon Lair, but no guide named them or carried a route there.
A first attempt folded them into the existing Dragon Lair card (extra
monster row + a second route floor), which was invisible in the card list
and hidden by any level filter above 40, so it shipped as its own entry
instead.

**What changed**: new catalog entry "Darashia Dragon Lords" (Level 60,
Solo/Duo, Darashia): Dragon Lord monster row (resistances matching the
Fenrock/POI dragon-lord guides), its signature valuables, the lair's travel
WayPath with the destination moved to the lower cave, and a floor-11
RoutePath — a 24-point loop computed as a 2-opt tour over the dragon-lord
spawn homes (316 tiles, legs <= ~25). The Dragon Lair entry itself is
byte-identical to before. Catalog count pins updated 131 -> 132 in
`parseHuntingPlaces.test.ts` / `filterHuntingPlaces.test.ts`. File:
`client/public/assets/hunting/hunting_places.json` (note: it uses CRLF line
endings — write it back with `newline='\r\n'` or the whole file diffs).

**Follow-up (same day)**: the new card never reached the player because
`next.config.ts` serves `/assets/*` with `max-age=86400,
stale-while-revalidate=604800` — tuned for sprite atlases, but it let the
browser serve a day-old `hunting_places.json` from HTTP cache without
revalidating. `useHuntingPlaces` and `useWikiItems` now fetch with
`cache: "no-cache"` (always revalidate; unchanged files answer 304).
The other hand-maintained `/assets` JSON catalogs
(`proficiencies`, `proficiency-sprites`, `creature-loot-items`,
`npc-shop-categories`) still ride the day-long cache — recorded in TODO.md.

**Verified**: JSON parses with all 131 original places byte-identical plus
the new entry; hunt-finder and hunting-bot unit tests and both modal
interaction stories pass; a playtest probe ran the floor-11 loop through the
real `hunting-bot-trace` pipeline — 181 traced waypoints, 0 unresolved legs.
Residual: the four z12 dragon lords sit in a small side chamber with no
guide route (hand-draw if wanted), and the z10->z11 descent is a use-action
floor change the bot cannot cross, so players walk down and arm on floor 11.

## 2026-08-01 — Hunt finder & hunting bot: level filter no longer autofills, digits-only text input

**Problem**: both the Hunt Finder and the Hunting Bot browser seeded their
level filter with the character's level, hiding lower-level hunts by default,
and used a native `type="number"` input (spinner arrows, scroll-to-change).

**What changed**: the filter state is now a digits-only string that starts
empty (empty = no level filter, placeholder "All"); the input is a plain text
field with `inputMode="numeric"`, max 4 digits, non-digits stripped on
change. `filterHuntingPlaces` keeps its numeric contract — the modals pass
`Number(value)`. The now-unused `characterLevel` prop was removed from
`HuntFinderModal`/`HuntingBotModal` and their overlays/stories, and the
OutOfRange story was re-pinned to the new arm-error copy. Files:
`client/components/hunt-finder/{HuntFinderFilters,HuntFinderModal}.tsx`,
`client/components/hunting-bot/HuntingBotModal.tsx`,
`client/components/game-window/{GameHuntFinderOverlay,GameHuntingBotOverlay}.tsx`,
both story files.

**Verified**: client typecheck; HuntingBotModal (4) and HuntFinderModal (1)
interaction stories pass; hunt-finder unit tests pass. Noted: five unrelated
story tests (ActionBar Empty, GameHud chat-hover, ProficiencyModal Locked
Levels, SpellListModal Knight, WheelModal Empty) fail identically at HEAD
with these changes stashed — pre-existing breakage, not touched here.

## 2026-08-01 — Feature 112 follow-up: routes save reliably (DB cap, dropped traces, refused saves)

**Problem**: opening a hunt showed an empty route map until "Reset guide" was
clicked twice. Three server defects stacked: (1) migration 068 capped the
stored route at `pg_column_size <= 8192`, smaller than a legal route — a
traced 181-waypoint ring already exceeds it (protocol allows 200) — so every
full-size traced save violated the constraint, failed, and the rollback echo
blanked the window back to the previous (often empty) route; (2) a trace
arriving inside the 2 s cooldown or while one ran was silently dropped, so
the card-open auto-trace plus one quick reset left the window waiting on a
reply that never came ("Tracing…" forever); (3) a route update racing the
in-flight durable write was refused with `hunting-bot-update-pending`,
silently losing the newest route and forking client from server.

**What changed**: migration `069_hunting_bot_route_size.sql` re-derives the
cap from the worst legal route (200 waypoints + 64-char name ≈ 12 KB jsonb)
to 32 KB, still defence in depth. `HuntingBotHandler` never drops or refuses
the newest request: a trace during cooldown/pending is held in
`Session.huntingBotDeferredTracePoints` and started by the tick as soon as
both clear; a route update during a pending write is held in
`Session.huntingBotDeferredRoute` and applied when the write settles
(last-write-wins, intermediates coalesce, one in flight at a time).
`applyResolvedOutcomes(now)` runs the deferred work after draining outcomes.

**Files**: `server/db/migrations/069_hunting_bot_route_size.sql` (pending
`db:migrate`), `server/src/Session.ts`,
`server/src/huntingBot/HuntingBotHandler.ts` + test, `server/src/GameServer.ts`.

**Verified**: a wire probe replaying the client's exact sequence (auto-trace,
800 ms debounced raw save, traced save, reset inside the cooldown) showed the
pre-fix failures — silent trace drop, update-pending refusal, and the
constraint violation with rollback — and post-fix shows the traced 181-wp
route echoing back saved, the deferred trace answering itself when the
cooldown ends, and a maximum 200-waypoint route persisting. 56 huntingBot
unit tests (new: deferred-route apply, deferred-trace answer), the full
`yarn playtest:hunting-bot` scenario, and server typecheck pass.

**Residual risk**: `hunting-bot-update-pending` remains in the protocol error
enum but is no longer emitted; deferred slots are one-deep by design (the
newest request wins), which matches the window's semantics.

## 2026-08-01 — Depot lists items inside closed nested backpacks

**Problem**: the depot window's "Carried items" pane only showed the direct
contents of the equipped backpack, so anything inside a bag within it could
not be stored (or stowed) without first opening and unpacking the bag. The
server never had this restriction — `planDepotDeposit`/`planStashDeposit`
find the item anywhere in the carried snapshot — the pane was fed from the
client's `inventory.items`, which is only the top level, and closed nested
containers never reach the client at all.

**What changed**: the carried list is now server-projected into the
`depot-state` message. New `carriedDepotItemSchema` (`{ depth, item }`,
capped at `DEPOT_LIMITS.maxCarriedListed` = 1024, depth ≤ 8) and a required
`carriedItems` field on `depotStateMessageSchema`. New
`server/src/depot/listCarriedDepotItems.ts` walks every equipped container
depth-first in slot order (cycle-guarded, same 8-level cap as
`collectDescendantItems`) and projects each item with `projectItem`, so the
entries carry the same id/revision/stowable data the deposit and stow intents
need. `DepotModal` renders `state.carriedItems` (indented by depth) instead
of the `inventoryItems` prop, which was removed. Staleness self-heals: every
mutation and every `stale` failure already re-sends the depot state, which
now refreshes the carried pane too.

**Files**: `protocol/src/depot.ts`,
`server/src/depot/listCarriedDepotItems.ts` (new),
`server/src/depot/projectDepotState.ts`, `server/src/depot/DepotService.ts`,
`client/components/depot/DepotModal.tsx`,
`client/components/game-window/GameCommerceOverlays.tsx`.

**Verified**: new DepotService test — a sword inside a closed bag inside the
equipped backpack is listed at depth 1 and deposited directly; the refreshed
state drops it from the carried list and the persist fires once. All depot
unit tests (13) pass; protocol, server and client typechecks pass.

**Residual risk**: the mailbox window still lists only top-level items to
mail (recorded in `TODO.md`); the carried list caps at 1024 entries, beyond
any weight-feasible inventory.

## 2026-08-01 — Client keeps up while its tab is backgrounded

**Problem**: switching browser tabs made the game look like it stopped.
Gameplay never actually paused — the bot, combat and world all run
server-side — but the client's world tick rides the PixiJS ticker
(`requestAnimationFrame`), which browsers freeze in hidden tabs. Three
things broke: (1) every damage number, hit splash, missile and speech
bubble received while hidden created a Pixi object that only the frozen
tick could expire, so an AFK hunt accumulated thousands of live sprites
that all animated at once on return; (2) the creature-message → store
flush was RAF-batched, so the backlog array grew unboundedly while
hidden; (3) the world-load texture-upload loop awaited one animation
frame per texture, so tabbing away during the loading screen stalled the
load — and `worldReady()` — until the tab was refocused.

**What changed**: new `client/lib/render/isDocumentHidden.ts` guard
(node-test-safe). `CombatEffectRenderer.showMagicEffect/showMissile/
showCombatText/showExperienceText` and `SpeechTextRenderer.showSpeech`
skip creation while hidden — they are pure cosmetics nobody can see.
`WorldRenderer.setMap` skips the per-texture RAF yield while hidden so
loading completes in the background. `GameWindowConnectionController`
schedules a 250ms `setTimeout` fallback alongside the RAF flush
(whichever fires first wins and cancels the other), so the visible-
creatures store keeps draining at the browser's ~1s background-timer
clamp instead of accumulating forever.

**Files**: `client/lib/render/isDocumentHidden.ts` (new),
`client/lib/render/CombatEffectRenderer.ts`,
`client/lib/render/SpeechTextRenderer.ts`,
`client/lib/render/WorldRenderer.ts`,
`client/components/game-window/controllers/GameWindowConnectionController.tsx`.

**Verified**: client typecheck passes; full client unit suite passes
(82 files, 353 tests) — renderer tests run in the node environment where
`isDocumentHidden()` reports visible, so existing behavior is unchanged.

**Residual risk**: Chrome's Memory Saver can still discard a
long-backgrounded tab outright (full page unload → disconnect); that is
browser policy we cannot override from page JS — players AFK-hunting for
hours should exempt the game site from Memory Saver. Recorded in
`TODO.md`.

## 2026-08-02 — Click-only Wheel selection and Tibia-layout Gem tabs

**Problem**: hovering a Wheel of Destiny slice replaced the information for
the slice the player had clicked, so the selection panel did not represent a
stable selection. The Fragment Workshop was a wide data table that omitted
Tibia's grade ladder, 5×6 image grid, search/filter/page controls, and most of
the original Workshop artwork. The Gem Atelier likewise split its content
across generic cards instead of Tibia's vessel/revelation column, selected-gem
strip, filters, and 5×3 collection.

**What changed**: hover still draws the lightweight focus overlay, but only a
click now changes the selection panel. The Workshop now follows the original
`fragmentMenu.otui` structure: a four-stage selected-mod grade ladder on the
left; all 69 vocation-compatible supreme/basic mods in a searchable,
filterable 30-card page on the right; socketed and owned markers; upgrade
cost/action controls; and the resource strip below. Mod cards and every grade
stage composite the original grade and mod sheets. The original ladder
circles, animated overlays, connectors, Enhance button, and Workshop menu art
were added through the reproducible asset importer. The Atelier now follows
`gemMenu.otui`: the original four-corner vessel socket and stacked revelation
column sit beside a selected-gem strip, search/affinity/quality/lock controls,
15-gem pages, and a 5×3 grid. Gem cards show their actual gem, grade, modifier,
lock, and equipped art; the original Reveal, Place/Remove, Switch, and Destroy
button strips drive the existing server-authoritative intents. Supreme mod
icons use Tibia's optical +3px/−2px offset so their art is centered inside the
grade medallion instead of only mathematically centered by its sprite bounds.
The Atelier side rail is widened with a larger vessel assembly, 64px
revelation gems, and scaled Reveal/cost controls for better readability. Its
rows remain compact and the redundant resource footer is omitted so the full
Atelier tab fits inside the 900px Wheel modal without internal scrolling.
Shared dropdown values are vertically centered, and the empty gem collection
uses a balanced centered height instead of collapsing into a short message box
or overflowing the 900px layout.
All imported art comes from mehah otclient commit
`9bfac7719fd5cd2d8a2cddf2ea6219e908e129f9`. English and Brazilian Portuguese
copy now covers the new controls.

**Files**: `client/components/wheel/{GemAtelierTab,GemDetails,GemList,GemRevealPanel,GemVessels}.tsx`,
`client/components/wheel/FragmentWorkshop*.tsx`,
`client/components/wheel/WheelModal.tsx`,
`client/components/wheel/WheelSelectionPanel.tsx`,
`client/lib/wheel/gemLargeIconStyle.ts`,
`client/public/assets/wheel/{backdrop_grades_*,enhance-button.png,fragmentMenu.png,gemMenu.png,icons-modgrades-potential.png,place-vessel-button.png,remove-vessel-button.png,reveal-button.png,switch-button.png,destroy-button.png}`,
`client/locales/{en,pt-BR}.json`, `client/stories/WheelModal.stories.tsx`,
`client/ASSETS.md`, `tools/importWheelGemAssets.mjs`.

**Verified**: `yarn --cwd client typecheck`; `yarn --cwd client lint` (0
errors, 16 pre-existing warnings); the focused Wheel Storybook project (7
stories, including hover-versus-click selection and Workshop search/select/
improve interactions); and `yarn --cwd client build-storybook` all pass.

**Residual risk**: the browser-control surface needed for a manual
side-by-side screenshot comparison was unavailable in this session. The
Workshop was rendered in Chromium by the Storybook interaction test and the
static Storybook build includes every new sprite-position rule.

## 2026-08-02 — Shared action-bar feature buttons

**Problem**: Action Bot, Loot Filter, and Hunting Bot repeated the same button
markup in `GameHud`, which made their status treatment and sizing easy to
drift. The 28px controls were also too short for the HUD dock.

**What changed**: all three controls now render through the shared
`HudFeatureButton` component. It owns the accessible configuration label,
enabled-status light, common styling, and a taller 36px height. The floating
button row offset was increased to keep the taller controls clear of the
action bar.

**Files**: `client/components/action-bar/HudFeatureButton.tsx`,
`client/components/GameHud.tsx`, `client/stories/GameHud.stories.tsx`.

**Verified**: client typecheck and focused ESLint pass; all four Chromium
`GameHud` Storybook interactions pass, including exact button heights and all
three callbacks.

**Residual risk**: none known.

## 2026-08-02 — DOM item icons stop binding full 4096×4096 atlases

**Problem**: user-reported lag when the inventory opens in game. Every DOM
`SpriteIcon` piece set `background-image: url(/assets/atlas-N.png)` — a CSS
window into a 4096×4096 RGBA sheet (~67MB decoded). Opening a panel full of
icons forced main-thread PNG decodes and kept one full-sheet compositor
texture per referenced atlas alive, on top of the WebGL world's own copies of
the same sheets. A new e2e probe showed the React/DOM side of the panel is
cheap (60fps, zero long tasks, even walking with 300 monsters and the panel
open in headless Chromium), so the atlas-as-CSS-background pattern was the
one structural cost left — it only bites on real GPUs, which the software
renderer used by the probe cannot model.

**What changed**: `SpriteIcon` pieces now draw a 32×32 blob-URL crop of their
sprite, produced once per distinct sprite by the new `spriteCellIconStore`
from the `ImageBitmap` the shared `AssetStore` already holds for the world
renderer (no second decode of any sheet). `useItemIcon` additionally returns
the appearance's full sprite list so all phases and stack variants are
cropped up front — an animation never advances onto a phase whose crop is
missing. Pieces also carry `data-sprite-id` for tests/debugging.
`AssetStore.spriteRect` became public and `sheetImage()` was added. A new
`inventoryPerformance.e2e.test.tsx` measures FPS/long-tasks across
standing/walking/monster stages with the panel closed vs open and gates
open-panel FPS at ≥50% of closed.

**Files**: `client/components/inventory/SpriteIcon.tsx`,
`client/lib/render/spriteCellIconStore.ts` (new),
`client/lib/render/useSpriteCellUrls.ts` (new),
`client/lib/render/useItemIcon.ts`, `client/lib/render/AssetStore.ts`,
`client/e2e/inventoryPerformance.e2e.test.tsx` (new),
`client/e2e/itemIconAnimation.e2e.test.tsx`,
`client/e2e/itemAnimationWorld.e2e.test.tsx`.

**Verified**: client typecheck, lint (0 errors), 353 unit tests;
`itemIconAnimation` e2e (phases cycle, stacks differ, 2×2 draws whole,
static stays static); `itemAnimationWorld` e2e against the 4126 probe
server; `inventoryPerformance` e2e (panel open ≈ closed FPS);
`gameFreeze` (worst stall 59ms) and `monsterPerformance` pass in isolation —
full-lane runs can flake under CPU contention when the dev servers are
running alongside.

**Residual risk**: the lag report came from real hardware the headless
software-rendered probe cannot reproduce; the structural cause is removed,
but confirmation on the reporting machine is pending. Blob crop URLs are
never revoked (bounded by distinct sprites seen per session, ~4KB each).

## 2026-08-02 — HUD FPS + ping counter

**Problem**: no in-game way to see frame rate or server latency, which made
performance reports ("inventory makes the game lag") unverifiable on the
player's own machine.

**What changed**: new `ping`/`pong` protocol pair (client sends
`{type:"ping", nonce}` where the nonce is its own `Date.now()`; the server
echoes it from the tick loop, so the round trip includes the intent queue —
the latency every real action pays). `GameHudOverlay` pings every 2s while
the HUD is mounted (post-welcome only, well inside the 30 msg/s cap) and
stores the round trip as `latencyMs`; implausible echoes (<0 or >60s) are
dropped. New `FpsPingCounter` renders "FPS n · Ping n ms" top-left under the
nav bar (first entry in the existing indicator stack), sampling rAF cadence
in 500ms windows. EN + pt-BR strings, Storybook story, and the inventory
perf e2e now asserts the counter renders and its ping fills from a real
pong.

**Files**: `protocol/src/clientMessages.ts`, `protocol/src/serverMessages.ts`,
`server/src/GameServer.ts`, `client/lib/net/GameClient.ts`,
`client/components/FpsPingCounter.tsx` (new),
`client/components/GameHud.tsx`,
`client/components/game-window/GameHudOverlay.tsx`,
`client/components/game-window/messages/handlePlayerStateMessage.ts`,
`client/components/game-window/store/createGameWindowStore.ts`,
`client/components/game-window/types/GameWindowState.ts`,
`client/components/game-window/types/GameWindowStoreActions.ts`,
`client/locales/en.json`, `client/locales/pt-BR.json`,
`client/stories/FpsPingCounter.stories.tsx` (new),
`client/e2e/inventoryPerformance.e2e.test.tsx`.

**Verified**: protocol/server/client typecheck; server unit suite (1528
passed); client lint (0 errors) + unit tests; storybook stories pass; the
inventory perf e2e sees the counter render and the ping populate against a
real server.

**Residual risk / deploy order**: the server must deploy before (or with)
the client. An old server counts unknown `ping` messages as protocol
violations, and the client sends one every 2s — a new client against an old
server would strike itself to disconnection.

## 2026-08-02 — Ghost border behind the top-left HUD chips

**Problem**: a faint rounded rectangle rendered around the whole top-left
indicator stack (FPS/ping counter, protection zone, conditions).
`.ui-panel-frame::before` draws the decorative inner border with
`position: absolute; inset: 5px`, but `.ui-panel-frame` set no position of
its own — so on statically-placed panels the pseudo-element anchored to the
nearest positioned ancestor (the `absolute top-24 left-4` stack) and framed
it instead. Latent for every static `ui-panel-frame` (condition bar, skull,
tracker, party, VIP…); the always-visible FPS counter made it permanent.

**What changed**: `globals.css` gives `.ui-panel-frame` `position: relative`
inside `@layer base`, so Tailwind positioning utilities (`absolute`,
`fixed`, `relative`) still win on panels that set their own. The
FpsPingCounter story asserts the computed position is `relative` as a
regression guard.

**Files**: `client/app/globals.css`,
`client/stories/FpsPingCounter.stories.tsx`.

**Verified**: 25 story tests across 8 panel story files (static chips plus
absolute/fixed panels: BattleList, ContextMenu, DropUp, InventoryPanel…),
client typecheck, lint. Note: GameHud's "Chat Hotkey Stays Enabled With Hud
Panels" story fails identically on a clean checkout (pre-existing,
unrelated); and `vitest run --project storybook` without file arguments
fails at startup with "No projects matched" — run it with explicit story
file paths.

**Residual risk**: none known beyond the pre-existing story failure above.

## 2026-08-02 — Full-height Mantus Store and purchase dialog

**Problem**: the store catalog was capped at 34rem inside the shared 900px
modal, leaving much of the window unused. Offers were arranged as a narrow
list/detail split, and choosing an offer opened a small inline confirmation
strip instead of the focused purchase dialog used by the visual reference.

**What changed**: the store now fills the shared modal's available height and
uses its full-width size. Categories and the account balance form a persistent
left rail, while the catalog uses dense two-column offer cards across the full
remaining height. Clicking a single-offer product opens its purchase flow
directly, while multi-offer products retain explicit price/quantity choices. Purchase
confirmation is now a dimmed, accessible dialog with the product preview,
price, post-purchase balance, close/cancel controls, insufficient-funds guard,
and the existing name-change input. The underlying catalog becomes inert while
the dialog is open, and Escape dismisses the dialog before closing the store.
No gameplay or price authority moved client-side: the client still submits
only the selected server offer id and the server revalidates the purchase.

**Files**: `client/components/store/{StoreModal,StoreCategoryButton,StoreCategoryList,StoreProductRow,StorePriceButton,StorePurchaseConfirm}.tsx`,
`client/locales/{en,pt-BR}.json`, `client/stories/StoreModal.stories.tsx`,
`todo/{done,status}.md`.

**Verified**: focused ESLint and client TypeScript pass; the production
Storybook build passes; all 6 StoreModal stories pass in headless Chromium,
including direct product-click confirmation and the name-change submission.

**Residual risk**: none known.

## 2026-08-02 — Protocol strikes are now logged (stale-server ping rejections)

**Problem**: the "The game server rejected an invalid request." toast appeared
every ~10 seconds during play. Root cause was not a code bug at HEAD: the
local game server had been started (via the non-watch `start` script) minutes
before the commit that added the 2-second HUD latency `ping`, so its
still-loaded `clientMessageSchema` rejected every ping. Five silent strikes
later `Session.strike()` sent `invalid-message` and closed the socket, on
every reconnect, forever. Diagnosing this took a live WebSocket probe because
strikes were completely silent — nothing in the server log named the rejected
message.

**What changed**: `Session.strike()` now takes a reason and logs one
`console.warn` line per strike: violation count, remote address, and either
"unparsable JSON" or the rejected message's `type` — sanitized (truncated to
40 chars, non-`[\w-]` replaced) and never the payload, which may carry an
auth token. Log volume is bounded: at most `maxProtocolViolations` (5) lines
per connection, and connection/rate caps already bound connections per IP.
A future schema mismatch now announces itself as
`protocol strike 1/5 from <ip>: rejected message type "ping"` instead of
failing silently.

**Files**: `server/src/Session.ts`, `todo/done.md`.

**Verified**: server typecheck passes; `Session.test.ts` (4) and
`GameServer.test.ts` (31, includes the invalid-message strike path) pass.
Live reproduction confirmed separately: probing the stale running server with
6 valid pings returned exactly one `invalid-message` error then close; the
stale process was stopped gracefully (SIGTERM, saves ran).

**Residual risk**: strike logs identify the message type only; if a mismatch
ever hides in a field rather than the type, the log narrows it to the type
but the zod issue paths still have to be reproduced manually.

## 2026-08-02 — Ground item drags clean up and NPC atlas loads recover

**Problem**: dropping a ground item onto an inventory slot accepted the pickup
but left the custom map-drag sprite fixed to the screen. The slot stopped the
native `pointerup`, so `WorldRenderer` never received the window-level event
that removes its drag icon. Separately, a transient atlas request failure
caused every creature waiting on that shared sheet to be discarded by the
renderer for the rest of the session. This made a stable group of NPCs appear
not to spawn; in Darashia, Asima uses a different atlas sheet from the visible
Shalmar.

**What changed**: item slots now mark a handled pointer drop as prevented but
let it bubble to the renderer cleanup. `InventoryPanel` respects that marker,
so the item intent is still dispatched exactly once. Atlas sheet loads now
share one concurrency-safe retry after a failed request; all creatures waiting
on the sheet resolve from the same retry. Gameplay remains server-authoritative:
the drag change only fixes UI cleanup, and the NPC change only recovers visual
assets for creature states already sent by the server.

**Files**: `client/components/inventory/{ItemSlot,InventoryPanel}.tsx`,
`client/lib/render/{AssetStore,AssetStore.test}.ts`,
`client/stories/InventoryPanel.stories.tsx`, `todo/{done,status}.md`.

**Verified**: a real-map/content spawn diagnostic activated both Asima and
Shalmar at their committed Darashia slots; all 82 client unit files pass (354
tests); all 7 InventoryPanel stories pass in headless Chromium, including the
single-dispatch plus window-cleanup regression; client TypeScript and focused
ESLint pass.

**Residual risk**: a sheet that fails both attempts still logs the existing
creature-render warning and cannot be displayed because its pixels are
unavailable; later preload callers can try the sheet again.

## 2026-08-02 — Wakeable tick: intents no longer wait out the 25 ms interval

**Problem**: every client intent sat in its session queue until the next
fixed 25 ms interval tick — an artificial 0–25 ms (average ~12.5 ms) added
to every action's round trip on top of network latency. Canary avoids this
with a serialized dispatcher that wakes the moment a task arrives
(src/game/scheduling/dispatcher.cpp); our fixed interval was the polling
equivalent.

**What changed**: `TickLoop` gained `requestTick()`, and the intent-queued
callback in `GameServer.onConnection` (the same one that marks the session
tickable) now calls it. The woken tick is the same full `GameServer.tick()`:
all validation and mutation still happen synchronously inside the tick at
execution time, so charter rules 3–5 are untouched — only the scheduling
changed. Wake requests coalesce (any number of packets arriving before the
woken tick fires produce one tick, via `setImmediate`), and a wake keeps a
minimum 5 ms spacing from the previous tick, so a packet flood cannot turn
every message into its own full tick — the loop is bounded at 200 wakes/s
plus the 40/s interval, and the existing per-connection rate/size caps still
apply. The interval tick keeps driving timed and background systems. Net
effect: when the server is healthy the queue delay is gone (sub-millisecond
wake); under sustained input it is capped at ~5 ms instead of ~25 ms.

**Files**: `server/src/TickLoop.ts`, `server/src/GameServer.ts`,
`server/src/TickLoop.test.ts` (new), `server/src/GameServer.test.ts`.

**Verified**: 6 new TickLoop unit tests (immediate wake, coalescing,
ignore-before-start, stop cancels a pending wake, spacing floor, interval
unaffected); a new end-to-end regression starts the real server with
`tickMs: 200` and asserts five sequential authenticated pings each
round-trip in under 60 ms — without the wake each pong waits 0–200 ms for
the interval, so the old code fails it essentially always. Full server
suite: 1,535 passed / 252 skipped (the usual no-Postgres skips); typecheck
clean.

**Residual risk**: only network intents wake the loop. Async DB outcomes
(the ~30 `applyResolvedOutcomes` queues) are still applied by the next
interval tick, so multi-round-trip flows — login's ~28 sequential queries
above all — keep paying up to 25 ms of tick alignment per round trip.
Recorded in `TODO.md` under accepted gaps with the recommended fix.

## 2026-08-02 — Epic and legendary exercise weapons, sold only in the Mantus Store

**Problem**: the Mantus Store's Exercise Weapons shelf sold the same three
Canary tiers players already buy from NPCs and win from the daily reward
wall, so a store purchase bought convenience and nothing else. The store had
no offer of its own, and no exercise weapon trained faster than 7 tries per
hit at one hit per attack-speed interval.

**What changed**: two server-only tiers on top of Canary's four — epic
(14,000 charges, 30 Mantus Coins) and legendary (30,000 charges, 60 coins),
one per weapon family, sixteen items in total. Both train faster in the only
sense that matters: the interval between hits is divided by the tier's
multiplier, so the same 7 skill tries (or 600 mana) land per hit against the
same one charge, and the weapon burns through its charges just as much faster.
(Shipped at ten times; revised to twice in the second follow-up below.) The epic
tier draws `CONST_ME_PURPLE_ELECTRIC_SPARK` on the dummy (and a violet
`CONST_ANI_ENERGY` missile from bows/rods/wands), the legendary tier
`CONST_ME_ORANGE_ENERGY_SPARK` and an orange `CONST_ANI_FIRE` missile.

The sprite pack ends at appearance 51,950, so a custom item cannot invent
art. New types therefore take ids above that range and *alias* an existing
appearance: `protocol/src/customItemAppearances.ts` holds the id → appearance
pairs both sides must agree on, `AssetStore` registers the aliases when it
loads `objects.json`, and the server mints the types in `loadItemCatalog`
from the family's lasting tier. `buildCustomItemTypes` refuses to boot if a
custom type has no alias, collides with a catalog id, or copies an unknown
base — the client being unable to draw an item the server hands out is
exactly the failure worth refusing to start on.

`EXERCISE_WEAPON_FAMILIES` is now the single source for every exercise-weapon
id, reach and skill; the catalog, the store shelf and the training handler
all derive from it. `EXERCISE_WEAPON_CATEGORY` substitutes for the imported
`exercise-weapons` category in `storeCatalog.ts` rather than editing
generated data, keeping the shelf where the import put it in the tree. The
stock exercise, durable and lasting weapons stay everywhere else in the game
— NPC shops, quests, the daily reward chooser — they are simply no longer
sold for coins.

Two fixes came with it. Tooltips and look descriptions reported the *type's*
full charge count, not the instance's: both now go through `chargesOf`, so a
weapon's charges tick down live while training (each spent charge already
pushes a fresh inventory). And the training interval was scheduled from the
tick that fired rather than from the last due time, which rounded any
interval finer than the 25 ms tick up to a whole tick — at the epic tier's
40 ms that cost a fifth of the rate. It now accumulates from `nextAt`,
clamped to `now` so a stalled charge write is dropped rather than repaid as a
burst.

**Files**: `protocol/src/{customItemAppearances,index}.ts`,
`server/src/action/{EXERCISE_WEAPON_FAMILIES,CUSTOM_EXERCISE_TIERS}.ts` (new),
`server/src/action/{getExerciseWeaponDefinition,ExerciseTrainingHandler}.ts`,
`server/src/item/custom/{CustomItemType,CUSTOM_ITEM_TYPES,buildCustomItemTypes}.ts`
(new), `server/src/item/{loadItemCatalog,toItemTooltip,chargesOf}.ts`,
`server/src/look/describeItemLook.ts`,
`server/src/store/{EXERCISE_WEAPON_CATEGORY,storeCatalog}.ts`,
`client/lib/render/AssetStore.ts`, `client/components/store/StoreModal.tsx`,
`client/locales/{en,pt-BR}.json`,
`server/src/playtest/scenarios/exerciseTraining.ts` (new),
`server/package.json`, plus tests and `todo/{done,status}.md`.

**Verified**: a new playtest (`yarn playtest:exercise`) against the real
server, catalog and wire protocol — the shelf returns exactly the 16 epic and
legendary offers at 30 and 60 coins and nothing Canary sold, a purchase debits
30 coins and delivers to the store inbox, and training 4 s with each tier
side by side on a free dummy gives 10 stock hits against 100 epic hits with
charges falling one per hit in both, i.e. exactly 10.0× at the multiplier this
entry shipped — and against a *local* database, which is what hid the latency
bug the second follow-up below fixes. Unit coverage: the
catalog mints the tiers over the right appearance; the tooltip counts the
instance's charges; the shelf's grants agree with the catalog and the trainer;
the epic tier lands ten hits in a stock tier's one and draws effect 303, the
legendary bow missile 4 and effect 177; `AssetStore` resolves an aliased id
and still throws on an unaliased one. Full suites: 1,542 server + 355 client
passed, `yarn test:tools` and `yarn typecheck` clean. All five browser e2e
probes pass individually (item-icon animation, inventory FPS, game-freeze,
1000-monster FPS, world item animation skipped); running all five back to back
in one WSL session fails the game-freeze and 1000-monster probes on frame
budget. Not re-run against a clean tree, but both pass alone here and neither
touches the changed code paths.

**Residual risk**: every spent charge pushes a full `inventory-updated`, so an
epic weapon at 40 ms per hit sends ~25 inventory snapshots a second per
trainer — the same total traffic a lasting weapon sends over its life, but
ten times the burst. Recorded in `TODO.md` with a compact charge-delta message
as the recommended fix. The new tiers are also absent from the public site's
`wiki-items.json`, which is built from the ripped catalog and knows nothing of
custom types.

**Follow-up 2026-08-02** — a stale row crashed the server at login. Item
`b003f4c9…` in the dev database carries `item_type_id 60010`, a legendary
exercise weapon minted by an earlier, reverted attempt at this feature whose
ids were numbered differently (created 03:53 EDT, 314 charges spent by 04:29
EDT — both before this work started; the working tree was clean at 48b9b0d).
The catalog has no 60010, so `projectInventory`'s weight reduce hit
`catalog.require` and threw out of `CharacterHandler.enterWorld`, killing the
whole process every time that character tried to enter the world.

Until custom types existed this was unreachable: every `item_type_id` came
from the pinned Canary catalog, which only grows. `dropUnknownItemTypes` now
filters unresolvable rows out of both the carried load
(`ItemIntentHandler.load`) and the depot/inbox load (`DepotService.load`,
where the same row would have thrown out of `projectDepotState` inside the
tick when the player opened their depot). The rows stay in the database
untouched — nothing is destroyed to recover from a renumbering — they log a
warning and do not load, and a dropped container takes its contents with it so
no child is left in the cache with no reachable parent.

**Verified**: 3 unit cases (all-known rows returned unchanged by identity, an
unknown row hidden with a warning naming the type, a hidden container taking
its whole subtree), plus a read-only replay against the real database and the
real character: `projectInventory` throws `unknown item type 60010` on the raw
17 rows and projects 16 rows cleanly after the filter. Server suite 1,545
passed, typecheck clean.

**Follow-up 2026-08-02 (2)** — the tier trained at ordinary speed, and the
weapon looked like the one it copies. Two separate faults.

*Speed.* One charge write is a serializable transaction, and the handler
waited for each one before drawing the next hit, so the database round trip —
not the tier — set the training rate. Measured against the dev server's own
`DATABASE_URL` (a Supabase pooler): 95ms for a bare `SELECT 1`, **481ms** for a
charge-spend-shaped transaction. At that latency a tier meant to hit every
200ms and a stock tier hitting every 400ms both land ~2 hits a second, which is
exactly the "regular speed" reported. The earlier 10.0× measurement came from
the playtest's *local* database, where a transaction is ~1ms — the design was
never wrong, it was latency-bound, and the local playtest could not see it.

Charges are now bought in bundles: each write asks for as many charges as the
previous write's measured latency covers (`lastWriteMs / intervalMs`, capped at
64), the tick draws and paces the hits it has already paid for, and the bundle
collapses to a single charge when the database is quick, which is the old
behaviour exactly. Charges are deducted and the tries awarded *before* their
hits are drawn, so a crash or logout mid-bundle can only cost the player the
animation, never hand out an unpaid try. `ItemStore.consumeCharge` became
`consumeCharges(count)`, clamping to what the row really holds so the last
bundle of a dying weapon spends the remainder instead of failing.

*The weapon's own look.* The lightning was drawn on the dummy, not on the
weapon. Custom types borrow a stock appearance, so an epic exercise sword and
the lasting one it copies were the same pixels in a slot.

The first attempt overlaid a magic effect on the icon, which buried the weapon
under a second animation — not what was asked for. Exercise weapons already
animate: the art is a wooden weapon with a magenta spark crawling along it over
five phases, and *that* is the animation to recolour. The wood sits at hue
30–42 and the spark at a flat 320, so `tintSpritePixels` moves only the magenta
band to the tier's hue (purple 282; dark orange 26, darkened to 0.78 lightness
so it reads as orange rather than skin) and leaves saturation, lightness and
the weapon itself alone. `CustomItemAppearance` carries a semantic
`tint: "purple" | "dark-orange"`, and `spriteCellIconStore` bakes it into a
second cached crop per sprite — a CSS filter could not do this, it would drag
the wood along with the spark. Every DOM item icon picks it up: inventory,
store, tooltips.

The multiplier is 2× (was 10×, then 5×), on the user's call.

**Files**: `server/src/action/{ExerciseTrainingHandler,CUSTOM_EXERCISE_TIERS}.ts`,
`server/src/item/{ItemStore,ItemIntentHandler,PgItemStore,PgItemUseOps,MemoryItemStore}.ts`,
`server/src/store/EXERCISE_WEAPON_CATEGORY.ts`,
`protocol/src/customItemAppearances.ts`,
`client/lib/render/{tintSpritePixels,getItemTint}.ts` (new),
`client/lib/render/{spriteCellIconStore,useSpriteCellUrls}.ts`,
`client/components/inventory/SpriteIcon.tsx`, plus tests and the playtest.

**Verified**: an A/B against a local Postgres behind a TCP relay adding 50ms to
every response packet (~300ms per charge transaction, standing in for the
remote database). Bundling disabled: stock 5 hits, epic 5 hits in the same 4s
window — **1.0×**, the reported bug reproduced. Bundling on: stock 8, epic 14 —
**1.8×**. Against the local database the scenario reads a clean **2.0×** (10
stock hits, 20 epic). Browser e2e: the epic sword's icon resolves through the
alias, animates through ≥3 frames in 20s, and shares no frame with the stock
lasting sword it copies — the tint is baked per crop. Unit: the tint moves the
spark's hue and leaves the wood byte-identical; a write slower than the
interval buys a bundle of 4 rather than 1, and hits never outrun the charges
that paid for them. Suites 1,546 server + 360 client, typecheck and lint clean.

**Residual risk**: the tint is applied by the DOM icon path only — a
custom-tier weapon lying on the ground renders through Pixi with the stock
magenta spark. Awarding a bundle up front means a player who logs out
mid-bundle keeps the tries but loses the remaining animation; that direction is
deliberate.

## 2026-08-02 — Mantus experience stages, turned on and published

**Problem**: the server ran flat rates (`rates.experience: 2`) with the staged
tables disabled, and the stage table it carried was still Canary's stock
`data/stages.lua` curve (x7 → x2 by level 101). The world wanted a much faster
early game with a long taper, and the public site had no way to show a curve
even if one were enabled — `/server-info` advertised a single "Experience 2x"
row that would silently be wrong the moment stages were switched on.

**What changed**:

- `EXPERIENCE_STAGES` is now the Mantus curve: x50 (1–8), x80 (9–50), x60
  (51–100), x40 (101–150), x30 (151–200), x15 (201–300), x12 (301–400), x10
  (401–500), x7 (501–600), x6 (601–700), x5 (701–800), x4 (801–900), x3
  (901–1000), and an unbounded x2 band from 1001 up, so every level past 1000
  keeps x2 forever. Skill and magic stages are untouched.
- `config.yml` sets `progression.useStages: true`. The flat rates stay as the
  fallback `getStageRate` uses when a level matches no band (it never does for
  experience now, since band one starts at level 1 and the last is open-ended).
- The public server-info payload carries the tables it is actually applying:
  new `stages: { experience, skill, magic }` field on
  `publicServerInfoDataSchema` (rows are `{minLevel, maxLevel|null,
  multiplier}`, capped at `PUBLIC_WEBSITE_LIMITS.stageRows`), filled by
  `publicStageRates()` — which returns empty lists whenever stages are off, so
  the site can never advertise a curve that is not in effect (charter rule 8).
- `/server-info` renders a "Stage Rates" panel with the three bands tables, and
  the experience/skill/magic rows in "Game Rates" read "Staged" instead of the
  flat multiplier while the stage tables are live. Both locales updated.

**Files**: `server/src/progression/stageRates.ts`,
`server/src/progression/publicStageRates.ts` (new), `server/src/GameServer.ts`,
`protocol/src/publicWebsite.ts`, `config.yml`,
`client/components/public-site/ServerInfoPage.tsx`,
`client/components/public-site/ServerInfoStageTable.tsx` (new),
`client/locales/{en,pt-BR}.json`, plus tests.

**Verified**: stage-band tests now walk levels 1–2000 and assert no gap between
bands plus x2 past 1000; `getExperienceRate` reads x80 at level 30 and x2 at
level 2000, and composes 8000% × boost × stamina = 18000% (both protocol caps —
`basePercent` 100k, `totalPercent` 1M — have headroom). A probe loaded the real
`config.yml` and parsed the full public payload: `useStages true`, 14 bands
ending `1001-inf:x2`. Suites: 360 client passed; server 1,546 passed with the
4 pre-existing `exercise weapon` failures from b8f82b6 (reproduced on a clean
tree, unrelated). Typecheck and client lint clean.

**Residual risk**: the flat `rates.skill`/`rates.magic` still apply below the
first skill/magic band (skill stages start at skill level 10), and the site
labels those rows "Staged" without qualifying the gap. Live characters keep
their existing experience totals — the new curve only changes what future kills
award, so pre-change levels were earned on the old rates.

## 2026-08-02 — Item persists stop racing character saves; no more phantom world items

**Problem.** Live logs showed a repeating pair of errors: `item persist failed
for <character>: could not serialize access due to concurrent update`, each one
followed by a full cache resync, and then `decay failed for item <id>: item not
found` for the same three ids over and over. A read-only probe of the live DB
confirmed those three ids had **no `items` row at all**, while the character
they belonged to was on `characters.version` 1337.

Two linked causes:

1. *Contention.* `PgItemPersistOps.applyPlan` opens a SERIALIZABLE transaction
   whose first statement is `lockCharacterQuery` — `SELECT … FROM characters
   WHERE id = $1 FOR UPDATE`, whose result it never reads; it is purely a
   mutex. `CharacterPersistence` updates that same row on every progression
   award (`saveNow`: kill experience, magic progress, skill tries) plus the
   30 s interval save. When a save is in flight the persist waits on the row
   lock and is aborted with SQLSTATE 40001 the moment the save commits. The
   retry ladder (5 attempts inside `withSerializableTransaction` × 3 in
   `enqueuePersist`, all inside ~500 ms) is tuned for a local database; against
   the remote pooler in `DATABASE_URL` a single save transaction can outlive
   the whole ladder, so a looting player in combat burns every attempt.
2. *Orphaning.* A persist that fails poisons the character, and every write
   queued behind it — plus every new one until the resync finishes — is
   dropped. `DynamicMapItems.applyItemMutation` had already deleted the loot or
   seed origin of any memory-only world item in that plan, on the assumption
   the plan carries its row insert. A dropped plan therefore left a world item
   with no origin *and* no row: nothing could ever insert it, any guarded op
   against it missed (poisoning the next player to touch it), and
   `WorldItemDecayRunner` routed its decay to the store, got `item not found`,
   re-armed the record with a full duration, and repeated forever.

**What changed.**

- `CharacterWriteLane` (new) serializes, per character, the two lanes that
  write that character's row. `CharacterPersistence` takes it as a constructor
  dependency and holds it per save attempt (not across the retry backoff);
  `ItemIntentHandler.setCharacterWriteLane` receives the same instance from
  `GameServer` and holds it around each persist attempt. The two can no longer
  overlap, so the 40001 class disappears rather than being retried through. The
  wait is the one Postgres would have imposed on the row lock anyway.
- `restoreUnpersistedOrigins` (new) rebuilds the loot/seed origins a dropped
  plan was going to materialize, reading them back out of the plan's own
  `insert` row ops and `loot-created` audits. `enqueuePersist` gained an
  optional `onDropped` compensation that runs **inside the tick** on both drop
  paths — the write that failed and every write skipped because the character
  is poisoned — and the seven item-plan call sites now go through
  `enqueueItemPersist`, which wires it. Only items still present in world
  memory are restored; one the plan moved into an inventory is reconciled by
  the resync instead.
- `WorldItemDecayRunner` treats `item not found` as terminal via the new
  `isItemNotFoundError`: it drops the phantom from memory (version- and
  type-guarded, exactly like the in-memory decay path) instead of re-arming a
  record that can only fail again. `MemoryItemStore.decayWorldItem` now splits
  `item not found` from `stale item revision` the way the Pg store does, so the
  fake exercises the same branch.

**Files**: `server/src/character/CharacterWriteLane.ts` (new),
`server/src/character/CharacterPersistence.ts`,
`server/src/item/restoreUnpersistedOrigins.ts` (new),
`server/src/item/isItemNotFoundError.ts` (new),
`server/src/item/ItemIntentHandler.ts`,
`server/src/item/WorldItemDecayRunner.ts`, `server/src/item/MemoryItemStore.ts`,
`server/src/GameServer.ts`, plus
`CharacterWriteLane.test.ts`, `restoreUnpersistedOrigins.test.ts`,
`ItemIntentHandler.persistDrop.test.ts` (new) and a decay regression.

**Verified**: new tests cover the lane (same character never overlaps,
different characters still run concurrently, a rejection does not strand the
next write), the origin restore (world item re-marked, seed origin restored
from its insert, inventory-bound item left alone), the compensation wiring
(failed write and poisoned skip both compensate, a committed write does not),
and the phantom drop end to end — a corpse whose materializing plan never
committed now leaves the ground on its decay tick instead of logging forever.
Server typecheck clean; suite 1,556 passed with the same 4 pre-existing
`exercise weapon` failures from b8f82b6 (`loadItemCatalog`,
`EXERCISE_WEAPON_CATEGORY`, `ExerciseTrainingHandler` — `speedMultiplier` 5 vs
tests still expecting 2, untouched by this work).

**Residual risk**: the compensation restores an origin whenever the write did
not report success, including the ambiguous case where a connection drops after
`COMMIT` — the row would then exist while memory calls the item memory-only, so
the next touch hits a duplicate key, poisons once more and resyncs. Ambiguous
commits already diverged before this change; making the item inserts
idempotent (or refusing to retry a possibly-committed transaction) is the real
fix and is not done here. A dropped plan still *loses* the item leg it moved
(the accepted "intents in the window are lost, never duplicated" semantic) —
only the world side is now self-consistent. `WorldItemDecayRunner.start` still
checks only `lootOrigin`, not `seedOrigin`, so a decaying map-seed item that
was never materialized would be dropped rather than transformed; no such item
type ships today.

## 2026-08-02 — Character menu in the top bar and the imbuement tracker

The top navigation bar had grown to twenty-one flat icon buttons and there was
no way to see how much time was left on the imbuements a character is wearing
without walking to a shrine, or hovering each equipment slot one at a time.

**Character menu.** `client/components/navigation/CharacterMenuButton.tsx` is a
new top-bar button (character icon) that drops an anchored `role="menu"` panel
under itself: Kill Tracker, Imbuement Tracker, Battle List, Profile, Outfits,
Proficiency, Guild, Quests, Party, VIP List. It closes on outside pointerdown,
Escape, window blur, or picking a row. The panels behind it are toggles, so
every row is a `menuitemcheckbox` reporting its own open state, and the trigger
lights up while any of them is open. Those nine buttons were *removed* from the
flat row rather than duplicated — the row keeps the world and account panels
(character stats, inventory, house, highscores, wiki, wheel, forge, prey,
hunting tasks, hunt finder, map, market, settings). Icons live in
`CharacterMenuIcon.tsx` in the same 24×24 stroked style as the row, and the
entry shape in `CharacterMenuEntry.ts`.

**Imbuement tracker.** `client/components/imbuement/ImbuementTrackerPanel.tsx`
lists every equipped piece with imbuement slots and the time left on each
running imbuement, docked in the left tracker column under the kill tracker
(`GameTrackerOverlays` now owns that column and stacks both panels).
Empty slots keep their place as placeholders. Durations are colour-banded on
OTClient's thresholds (`imbuementTrackerTimeOf`): seconds and minutes red,
under three hours yellow, longer plain.

**Canary/OTClient parity and where we deviate.** Canary answers a client
`isTrackerOpen` byte (`parseInventoryImbuements`) by pushing the whole tracker
in packet 0x5D, re-sent roughly once a second while the window is open
(`Player::updateImbuementTrackerStats`, throttled at 1000 ms), each slot
carrying name, icon, duration and a "currently decaying" byte. We do not add
that packet. Our equipped imbuements already ride the inventory projection, and
`ImbuementService` checkpoints decay durably every 60 qualifying seconds, which
pushes `inventory-updated` — so the panel anchors on the server's numbers and
counts down locally between checkpoints (`useImbuementBurnClock`, the pattern
`OwnSkullIndicator` already uses for skull timers). Nothing about decay moved
client-side: a checkpoint that disagrees wins within the minute.

That local countdown needs to know which slots are burning, which is the one
thing the wire did not carry. `aggressive` was added to the projected imbuement
entry (`protocol/src/item.ts`), denormalized into the item's attribute bag at
apply time next to `name`/`iconId` (item projections run without the imbuement
catalog), and the client gates aggressive slots on its own `combat-lock`
condition plus `fightState.inProtectionZone` — the same rule
`ImbuementService.sweepCharacter` enforces. Legacy entries with no `aggressive`
project as aggressive, so a stale slot stalls rather than outrunning the server.

Row selection also deviates: OTClient narrows to six hardcoded inventory slots,
we keep Canary's rule (any equipped item that has imbuement slots) because
which of our types carry slots is catalog data.

Files: `protocol/src/item.ts`; `server/src/forge/itemImbuementsOf.ts`,
`server/src/item/projectItem.ts`, `server/src/imbuement/ImbuementService.ts`
(+`.test.ts`); `client/components/navigation/{CharacterMenuButton,
CharacterMenuIcon}.tsx`, `CharacterMenuEntry.ts`, `TopNavigationBar.tsx`;
`client/components/imbuement/{ImbuementTrackerPanel,ImbuementTrackerRow,
ImbuementTrackerSlot}.tsx`; `client/hooks/useImbuementBurnClock.ts`;
`client/lib/imbuement/{collectTrackedEquipment,imbuementTrackerTimeOf}.ts`
(+`collectTrackedEquipment.test.ts`);
`client/components/game-window/{GameTrackerOverlays,GameNavigation}.tsx` and the
store's `imbuementTrackerVisible` flag; `client/locales/{en,pt-BR}.json`;
`client/stories/{TopNavigationBar,ImbuementTrackerPanel}.stories.tsx` +
`imbuementTrackerFixtures.ts`.

Verified: `yarn typecheck` clean; `ImbuementService.test.ts` (9) asserts the
applied slot carries `aggressive: true` for an aggressive category;
`collectTrackedEquipment.test.ts` (5) covers row selection and every colour
band; both Storybook stories run in headless chromium — the nav story opens the
dropdown and asserts the picked row fires its handler and closes the menu, the
panel story asserts one label per band. Screenshot-checked at 960×720.

Residual risk: gear imbued before this change projects `aggressive: true`
regardless of its real category, so a non-aggressive imbuement on old gear
appears frozen out of combat until the next 60-second checkpoint corrects it —
same backfill that fixes the placeholder-icon gap (TODO.md) fixes this.
OTClient's four duration filters and the settings persistence behind them were
not ported; recorded in TODO.md.

## 2026-08-02 — Recurring map clean with a broadcast countdown

**Problem.** Nothing swept the ground: every item a player dropped or a monster
left behind stayed on its tile until something else touched it, growing the
dynamic world-item set (and its rows) without bound. Canary has this — `/clean`
(`Map::clean()` behind `Item::isCleanable`) plus the per-minute broadcast
countdown its global server save uses — and the server had neither.

**What changed.** A tick-owned scheduled sweep, off the same clock as every
other subsystem (charter rules 3 and 5: the countdown is checked against tick
time, the mutation is synchronous inside the tick, the row deletes trail on the
ordered write lane).

- `MapCleanupService` (new) runs the schedule: every `intervalMs` it announces
  the sweep once per remaining minute, then collects and drains it. Warnings
  collapse if a tick skips minutes (only the nearest is broadcast), the next
  countdown arms itself when a sweep finishes, and the sweep is drained at
  200 items per tick so a long-uncleaned map never stalls one. It announces
  `Cleaned N items from the map.` — Canary's `/clean` wording — or that there
  was nothing to clean.
- `collectCleanableWorldItems` (new) is the selection rule, mirroring Canary's
  `Item::isCleanable`: pickupable and movable, no `uniqueId`/`actionId`, and
  not loaded from the map — which here means no `seedKey`, so map furniture is
  never eaten. House tiles are excluded (a house floor is storage, not
  clutter), and protection zones are spared unless `cleanProtectionZones` is
  on, exactly as Canary's tile rule reads.
- `ItemIntentHandler.cleanWorldItems` applies the removals: each item is
  re-checked against live world state at execution (id, world location and
  version), its subtree goes with it, and the row deletes run through
  `runOrderedInternalOperation` — the same lane world decay uses — so they can
  never overtake a pending write for the same item. Memory-only loot simply has
  no row to drop. A failed delete is logged, not retried: the items are gone
  from memory either way and the next sweep re-collects the rows.
- `ItemStore.removeCleanedWorldItems` is the new store op. The Pg side
  (`PgMapCleanOps` + `deleteCleanedWorldItems`) does it in one serializable
  statement: a recursive CTE walks the contents (so the `container_id` restrict
  constraint never blocks the parent), the delete is guarded on
  `location_type = 'world'`, and the `item-destroyed` audit rows are inserted
  from its `RETURNING` — so exactly the rows that existed are audited, with
  `reason: 'map-clean'` (charter rule 11).
- `config.yml` gains `mapCleanup` (`enabled`, `intervalMs: 7200000`,
  `warningMinutes: 5`, `cleanProtectionZones: false`); the service is only
  constructed when it is enabled, so the playtest harnesses are unaffected.

**Files**: `server/src/world/MapCleanupService.ts` (new),
`server/src/item/collectCleanableWorldItems.ts` (new),
`server/src/item/PgMapCleanOps.ts` (new),
`server/src/item/sql/deleteCleanedWorldItems.ts` (new),
`server/src/item/ItemIntentHandler.ts`, `server/src/item/ItemStore.ts`,
`server/src/item/PgItemStore.ts`, `server/src/item/MemoryItemStore.ts`,
`server/src/world/DynamicMapItems.ts`, `server/src/World.ts`,
`server/src/GameServer.ts`, `server/src/config.ts`,
`server/src/loadServerConfig.ts`, `config.yml`, plus
`MapCleanupService.test.ts`, `collectCleanableWorldItems.test.ts`,
`ItemIntentHandler.mapClean.test.ts` (new) and two `PgItemStore.integration`
cases.

**Verified**: unit tests cover the countdown (5→1 broadcasts, collapse on
skipped ticks, re-arm after a sweep, the empty-map message), the selection
rules (seed items, house tiles, unique/action ids, a non-pickupable fresh
corpse and protection zones all spared; the opt-in flag flips PZ), and the
removal itself (tile and rows cleared with contents, a version-changed item
skipped, memory-only corpse loot swept with no rows). The new SQL was planned
against the live schema with `EXPLAIN` inside a rolled-back transaction —
recursive CTE, guarded delete and audit insert all resolve — and the two
integration cases assert the real behaviour when `TEST_DATABASE_URL` is set.
`loadServerConfig()` parses the real `config.yml` with the new section.
Typecheck clean; suite 1,566 passed with the same 4 pre-existing `exercise
weapon` failures from b8f82b6.

**Residual risk**: the integration cases have not run — no test database in
this environment — so the Pg path is verified by plan, not by execution.
Decayed corpse stages are pickupable, so a sweep can take a decayed corpse
that still holds loot; that is Canary's behaviour too, but it is the one case
where a clean destroys something a player might have wanted. There is no GM
`/clean` talkaction yet (Canary has one) and no admin visibility into the next
scheduled sweep beyond `MapCleanupService.scheduledAt`.

## 2026-08-02 — Walk animation matches OTClient frame for frame

**Problem**: characters walked with a visible shuffle that OTClient/Canary
does not have. `CreatureView` had ported OTClient's foot-delay *formula*
faithfully — for our classic 3-phase outfits (`objects.json` holds only
`phases: 1` or `3`, so OTClient's legacy `--footAnimPhases` path applies)
`footDelay = clamp(stepDuration / 2, 20, 205)` matched `Creature::
updateWalkAnimation` exactly — but the phase state machine around it did not.

Two divergences, both in `tick()`:

1. The walk phase snapped back to the idle phase the first frame `moveT >= 1`.
   OTClient does not: `Creature::terminateWalk` (creature.cpp:834) *schedules*
   the reset one server beat (50ms) later, and `Creature::walk`
   (creature.cpp:524) cancels that event when the next step starts. So a held
   walk in OTClient never returns to the standing pose; ours did, every step.
2. The foot timer only accrued `movementMs` and the phase restarted from 0
   each step, so every step began on the same foot. OTClient's `m_footTimer`
   is a free-running wall clock restarted only when a phase advances
   (creature.cpp:705-710), so it carries across the step boundary and the feet
   alternate.

A third divergence was found and deliberately **not** fixed — see residual
risk.

**What changed**: `tick()` now accrues the foot timer from `dtMs` on every
tick, walking or not (clamped to the largest delay it is compared against);
the return to the idle phase is deferred by a new
`WALK_FINISH_ANIMATION_DELAY_MS = 50` and cancelled by `applyMove` when the
next step arrives. `updateFrame()` draws `walkAnimationPhase` directly rather
than gating it on "is moving" — the phase itself is what OTClient's
`getCurrentAnimationPhase` returns, and `tick()` is now the only thing that
clears it. Teleports/snaps still zero the phase inline, so a floor transition
cannot show a stale walk frame.

**Files touched**: `client/lib/render/CreatureView.ts`,
`client/lib/render/CreatureView.test.ts`.

**Verified**: a standalone simulation of both algorithms (500ms steps, 30ms
packet gap, 60fps) now produces an identical phase-per-frame string to
OTClient's, where before the fix ours drew the standing sprite for 35 frames
mid-glide against OTClient's 12 (all of them the pre-walk ramp-up) and started
every step on phase 1 (`[0,0,0,0,0]` vs OTClient's `[0,2,1,1,1]`). Two tests
cover it: the idle reset now asserts the frame holds at 100ms and 149ms and
only flips at 150ms, and a new case walks two steps with a 16ms gap and
asserts no standing-pose flash plus a phase-2 resume on the second step (both
assertions fail against the old code). Client unit suite 366 passed / 84
files, typecheck clean. The repo-root run also sweeps the server suite, which
has pre-existing failures needing a test database; no server file imports
`CreatureView`.

**Residual risk**: diagonal steps are still wrong. The server sends the
3x-multiplied duration (`getStepDurationMs`, `DIAGONAL_COST = 3`) and
`pixelPosition()` interpolates position and animates feet across all of it, so
diagonals read as a slow smooth glide. OTClient derives pixel progress from
`getStepDuration(true)` — the *cardinal* duration (creature.cpp:788) — so the
creature crosses the tile at normal speed and then stands still for the
remaining 2x, with `updateWalkAnimation` forcing the idle phase during that
tail (creature.cpp:687-690). Fixing it is correct parity but makes diagonal
movement visibly jerkier, so it was left alone pending a call on the feel.
Also unfixed: when mounted, OTClient drives `footAnimPhases` from the
*mount's* phase count (creature.cpp:677) while we use the rider's — only
observable for a 1-phase mount under a 3-phase rider. Both are recorded in
`TODO.md`. `MAX_MULTI_PHASE_FOOT_ANIMATION_DELAY_MS` (80ms) stays unreachable
until a modern outfit re-rip introduces outfits with more than 3 phases.

## 2026-08-02 — Stage rate tables moved into config.yml

**Problem**: `config.yml` carried the `progression.useStages` toggle but not
the tables it switched on — the experience/skill/magic bands were hardcoded
constants in `server/src/progression/stageRates.ts`. Retuning the curve meant a
code change and a redeploy, and the config file advertised a staged server
without saying what the stages were.

**What changed**:

- `progression.useStages` became `progression.stages`, a block holding
  `enabled` plus the three tables (`experience`, `skill`, `magic`), each a list
  of `{minLevel, maxLevel?, multiplier}` rows. The committed values are the
  same curves as before: Mantus experience (x50 1–8 … unbounded x2 from 1001),
  Canary `skillsStages` and `magicLevelStages`.
- `loadServerConfig` validates each table: levels are integers 0–100000,
  multipliers reuse the 0–1000 `rateSchema`, at most
  `PUBLIC_WEBSITE_LIMITS.stageRows` (32) rows so the table always fits the
  public `/server-info` payload, bands must ascend and not overlap, and only
  the last band may omit `maxLevel`. `enabled: false` resolves to empty tables
  rather than a second flag, so every `getStageRate` lookup misses and falls
  back to the flat `rates.*` multiplier exactly as before.
- `stageRates.ts` keeps only `StageRow`, the new `StageTables`/`NO_STAGES`, and
  `getStageRate`; the tables themselves are gone from code. The `useStages`
  boolean threaded through `ProgressionSystem`, `Combat`, `DeathHandler`,
  `projectOwnProgression`/`getExperienceRate` and `publicStageRates` is
  replaced by the tables (`StageTables`, or `ReadonlyArray<StageRow>` where
  only the experience curve is needed). `/server-info`'s
  `systems.experienceStages` is now `stages.experience.length > 0`.

**Files**: `config.yml`, `server/src/loadServerConfig.ts`,
`server/src/config.ts`, `server/src/progression/{stageRates,getExperienceRate,
projectOwnProgression,publicStageRates,ProgressionSystem}.ts`,
`server/src/combat/{Combat,DeathHandler}.ts`, `server/src/GameServer.ts`,
`server/src/character/CharacterService.ts`,
`server/src/wheel/{WheelService,GemAtelierService}.ts`, playtest server
fixtures, plus tests.

**Verified**: `loadServerConfig.test.ts` now loads the committed tables and
asserts the first/last experience bands, that the experience bands leave no gap
(each `minLevel` is the previous `maxLevel + 1`), that `enabled: false` yields
empty tables, and rejects overlapping bands, an unbounded band before the last,
`maxLevel < minLevel`, and an out-of-range multiplier. `stageRates`,
`publicStageRates`, `getExperienceRate` and `ProgressionSystem` tests moved to
local fixture tables (they test the lookup, not the world's tuning). Server
suite: 1,573 passed, with the same 4 pre-existing `exercise weapon` failures
from b8f82b6 (reproduced with these changes stashed). Typecheck clean.

**Residual risk**: `writeParityConfig` in
`server/src/playtest/startPlaytestServer.ts` flattens `config.rates` to 1x for
parity playtests but leaves stages enabled, so staged multipliers still apply
there — true before this change too, and now a one-line
`config.progression.stages.enabled = false` away. Recorded in `TODO.md`.

## 2026-08-02 — Every castable spell has an action-bar icon

**Problem**: 20 of the 169 castable spells had no icon at all — `exani tera`
(Magic Rope), `utevo res`, `exeta res`, `utamo tempo`, `exevo ulus tera` and 15
more rendered as a bare `?` in the action bar, the spell picker and the spell
list. `getSpellIconArtwork`'s table had been written against an earlier spell
catalog and never grew with it; only 2 of the 20 were actually known
(`todo/status.md` carried them as "2 icons external").

**What changed**:

- 18 of the 20 do have artwork on the sheet the client already ships
  (`spell-icons-32x32.png`): their icon indexes were read from OTClient's own
  `modules/gamelib/spells.lua` (`clientId`, checkout at 465b7a2) and
  cross-checked against the legacy `SpellIcons` table, which agrees index for
  index on every spell old enough to appear in both. Added to
  `CURRENT_SPELL_ICON_INDEXES`.
- Neither OTClient sheet draws `adori blank` (Blank Rune) or `exevo gran con
  grav` (Conjure Royal Star) — they are absent from the modern `spells.lua`,
  from the generator's `MAP_ICON_INDEX`, and from the legacy icon table, and
  there is no free slot in either sheet holding their art. Rather than borrow
  an unrelated spell's icon, these two now draw what they conjure: the blank
  rune (client id 3147) and the royal star (25759), through the existing
  `SpriteIcon` item path.
- `SpellIconArtwork` became a discriminated union (`kind: "sheet" | "item"`)
  and `SpellIcon` renders either a sheet crop or a `SpriteIcon` inside the same
  frame. All five call sites spread the artwork, so none of them changed.

**Files**: `client/lib/combat/getSpellIconArtwork.ts`,
`client/components/spells/SpellIcon.tsx`,
`client/lib/combat/getSpellIconArtwork.test.ts`,
`client/stories/SpellIcon.stories.tsx` (new), `todo/status.md`.

**Verified**: the unit test now derives its expectations from the shipped
catalog — every `supported` spell in `content/spells/canary-spells.json` (169)
resolves to artwork, and every sheet index stays inside its sheet (0–186
current, 0–131 legacy), so a spell added without an icon fails the suite. Each
of the 18 sheet mappings was also eyeballed against the rendered sheet (rope,
bear head for Summon Creature, apple for Food, shield for Protector, and so
on). A new `SpellIcon` story renders all 20; its `ConjuredItems` play function
asserts in a real browser that the two conjures draw sprites 7614 and 24886.
Client suite: 368 unit tests passed; storybook project passes except
`ActionBar > Empty` and `SpellListModal > Knight`, both of which fail the same
way with these changes stashed.

**Residual risk**: OTClient's own table maps `exeta vis` (Enchant Staff) and
`exevo gran mort` (Conjure Wand of Darkness) to the same icon 141 while icons
139/140 (wand art) go unused, so one of those two is probably showing the
other's wand. Left as OTClient ships it rather than guessed at.

## 2026-08-03 — Reward wall says when a reward is claimable

**Problem**: inside the reward wall, a claimable day and a day still waiting
for the boundary drew identically — the same gold card over the same ticking
countdown plate. The only difference was the cursor, so the player could not
tell a reward was ready and only found out by clicking it, and the countdown
appeared stuck on a reward that was already unlocked. On top of that the
window's state was pushed once, at shrine use: if the server-local day flipped
while the window stood open, the countdown sat at zero and the wall kept
showing yesterday.

**What changed**:

- `getDailyRewardDayState` now puts the countdown on the day that is actually
  waiting. While today is claimable that is the day *after* it, so the timer
  moves off the reward you can take right now; once today's claim is in, the
  cycle position itself is the waiting day, as before. When the last day of a
  cycle is claimable nothing waits behind it and no card carries a countdown.
- `DailyRewardDay` draws a claimable day as a claim call — amber card, pulsing
  CLAIM plate, amber hover/focus — instead of another countdown, and only a
  `next` day draws the countdown.
- The window carries the deadline in words beside the streak ribbon: "Reward
  ready to collect! / Expires in …" while claimable, "Next reward in …"
  otherwise. That is also the only place the deadline shows on the last day of
  a cycle.
- New `daily-state-get` intent (`DailyRewardService.handleStateGet`): the open
  window asks for a fresh projection once its countdown crosses the day end,
  then every 10 s until the state advances, so a wall left open across
  midnight flips to claimable on its own. Same gate as the history request —
  the session must have opened a shrine, one request per second, own state
  only — and the claim itself still re-checks reach, the pool, the allowance
  and the once-per-day gate at execution time. This is Canary's reason for
  re-sending the wall on every `DailyReward.loadDailyReward` and pushing
  `sendDailyRewardCollectionState` at login (daily_reward.lua:234-252, 322).

**Files**: `protocol/src/{dailyRewards,clientMessages}.ts`,
`server/src/daily/DailyRewardService.ts`, `server/src/GameServer.ts`,
`server/src/daily/DailyRewardService.test.ts` (new),
`client/lib/daily/getDailyRewardDayState.ts` (+ test),
`client/lib/net/GameClient.ts`,
`client/components/daily/{DailyRewardDay,DailyRewardsModal}.tsx`,
`client/components/game-window/GameCommerceOverlays.tsx`,
`client/locales/{en,pt-BR}.json`,
`client/stories/DailyRewardsModal.stories.tsx`, `todo/status.md`, `TODO.md`.

**Verified**: protocol/server/client typechecks pass; client lint reports no
errors (17 pre-existing warnings). New `DailyRewardService` test covers the
already-claimed projection, the flip to claimable after the day boundary, the
refusal for a session that never opened a shrine, and the one-per-second
limit. Client unit suite 371 passed; the 7 reward-wall Storybook stories pass
in chromium, including a new last-day-of-cycle story. Screenshots of the
claimable, claimed and last-day states were rendered and eyeballed. Four
server failures (`loadItemCatalog`, `EXERCISE_WEAPON_CATEGORY`,
`ExerciseTrainingHandler`) fail identically with these changes stashed and are
unrelated exercise-weapon tier work.

**Residual risk**: a player still has no way to learn a reward is waiting
without walking to a shrine and opening the wall — Canary's golden icon
(`sendDailyRewardCollectionState` at login) has no counterpart here; recorded
in `TODO.md`. The 10 s refresh loop keeps polling while the window is open if
the client clock runs ahead of the server's day boundary; the server's
one-per-second limit bounds it and a fresh state stops it.

## 2026-08-03 — Combat try awards stop saving the character on every swing

**Problem**: `ProgressionSystem.persistAward` called `persistence.saveNow` on
every processed award, and try awards land on every auto-attack swing
(`PlayerAutoAttack`), every blocked hit (`DamageResolver`), and every spell
or rune cast (`SpellCaster`). Tries change on each swing, so the skills
fingerprint never suppressed the write and the 30 s `saveIntervalMs` cadence
was bypassed entirely for anyone in combat — the top code-side finding of the
2026-07-31 optimization audit ("the largest write reduction available",
todo/optimization.md §1b, recoverable at `99db5b2~1`). Against the
cross-region database (server dfw, Supabase Oregon, ~45 ms per round trip;
a save transaction measured in the hundreds of ms through the pooler) that
meant roughly one save transaction per combatant per swing: tens of
transactions per second at scale on a 10-connection pool, and every item
operation a fighting character made queued behind that character's pending
saves in `beginExternalMutation`/`CharacterWriteLane`.

**What changed**: `persistAward` takes an `immediate` flag. Experience awards
keep the in-place save (death durability; kills are far rarer than swings).
Skill-try and magic-progress awards mark the character dirty and ride the
30 s interval save instead — except when the award crosses a level boundary
(skill level or magic level up), detected with a cheap before/after read in
the system layer, which still saves immediately so a level-up is never left
in memory. The mana-already-spent edge branches (rate-scaled progress below
1, replayed event id after restart) keep their immediate save and their
documented ordering invariant. Everything that already guaranteed durability
elsewhere is untouched: atomic item/economy actions flush dirty state in
`beginExternalMutation`, logout/untrack flushes on the way out, death saves
via `syncPlayer(..., immediate)`, and `progression_events` idempotency
covers replay. Pending progression events accumulate between interval saves
and persist as one array-batched insert, so the bigger snapshot costs no
extra round trips.

**Files**: `server/src/progression/ProgressionSystem.ts`,
`server/src/progression/ProgressionSystem.test.ts`, `TODO.md`,
`todo/status.md`.

**Verified**: four new unit tests — an ordinary try award marks dirty and
never calls `saveNow`, a try award that levels a skill saves immediately, a
magic level-up saves immediately, an experience award saves immediately —
plus the five existing rate/replay cases still green. Full server suite:
1,581 passed with only the four pre-existing exercise-weapon failures from
`b8f82b6` (documented in done.md 2026-08-02, reproduced on a clean tree).
Repo typecheck clean.

**Residual risk**: a hard crash (power loss, OOM kill) can now lose up to
30 s of skill/magic *tries* — never a level-up, never experience — recorded
in `TODO.md` Accepted gaps. The bestiary and proficiency per-kill upserts
are the next write-coalescing candidates (audit §3 "coalesce per-kill
writes"), and the login statement collapse remains the biggest open
round-trip lever, still blocked on a reachable integration Postgres.

## 2026-08-03 — Resolved DB outcomes wake the tick instead of waiting out the interval

**Problem**: the 2026-08-02 wakeable-tick work covered queued client intents
only. The results of async work — the 43 `applyResolvedOutcomes` queues that
handlers fill when a DB read or write settles — were still applied only by
the next 25 ms interval tick, so every DB round trip paid up to 25 ms
(~12.5 ms average) of tick alignment on top of the ~45 ms cross-region
latency. Sequential flows compound it: login's ~28 serialized queries carried
~350 ms of pure alignment on average. Recorded as a TODO.md accepted gap
(Feature 106/107) with this exact fix specced.

**What changed**: new `ResolvedOutcomes<Args>` (`server/src/
ResolvedOutcomes.ts`) — the queue-of-settled-closures shape every handler
already hand-rolled (`push` from promise continuations, drained in order
inside the tick). Its `push` calls the new static `TickLoop.wakeAll()`, which
wakes every *running* loop through the existing `requestTick` path — so the
wake inherits the coalescing and the 5 ms minimum spacing that already guard
against wake floods, and no callback had to be threaded through the ~43
handler constructors (a wake is a hint; a spurious one, including a
cross-instance one in tests, is a bounded no-op tick). All 43 handler queues
were converted mechanically (`Array<(now: number) => void>` →
`ResolvedOutcomes<[number]>`, drain loop → `applyAll(now)`), and
`ItemOutcomeQueue` — the item path's identical hand-written wrapper — was
deleted in favor of the shared class (`ItemIntentHandler`,
`ItemOperationRunner`, `WorldItemDecayRunner`).

**Files**: `server/src/ResolvedOutcomes.ts` (+ test, new),
`server/src/TickLoop.ts` (+ test), 43 handler/service files (one-line
declaration + one-line drain each), `server/src/item/ItemOutcomeQueue.ts`
(deleted), `TODO.md`, `todo/status.md`.

**Verified**: 4 new `ResolvedOutcomes` unit tests (in-order apply with drain
args, one-shot drain, push-during-drain held for the next drain, push wakes a
running loop and not a stopped one) and a new `TickLoop.wakeAll` case
(running loop ticks once, stopped and unstarted loops do not). Full server
suite 1,586 passed with only the four pre-existing exercise-weapon failures
(`b8f82b6`); server typecheck clean over these changes — the full-repo
`yarn typecheck` run picked up an unrelated failure in
`server/src/deployCycleProbe.tmp.ts`, an untracked probe file another session
dropped mid-run, left untouched.

**Residual risk**: an outcome enqueued *during* a tick, in a phase after its
own drain point, schedules a wake ~5 ms out that mostly no-ops — bounded by
the wake coalescing, accepted. Background async completions (decay persists,
sweeps) now also wake the loop; a tick with nothing due is cheap (every phase
is time-gated), but if tick-rate telemetry ever shows sustained 200 Hz under
heavy async traffic, the wake could become selective. The 25 ms alignment is
gone per round trip, but login is still ~28 sequential round trips — the
statement collapse (audit §3) remains the big lever, blocked on a reachable
integration Postgres.

## 2026-08-03 — "NPCs not spawned after prod push" root-caused to client atlas discard

**Problem**: after some prod deploys, specific NPCs (classic case: Asima, the
Darashia potion seller) appeared missing — no sprite, no name plate. The
server was exonerated by a deep investigation: SpawnManager slot logic
survived static review plus a 30-seed churn simulation on the real map and
content, two full-stack deploy-cycle probes (real server + wire-protocol
client, including a player restored onto Asima's home tile from a
forced-logout save) always respawned her within `retryMs`, and the prod DB
showed no tile blockers while the audit log showed her trading again in the
current run. The real defect was the residual risk left by the 2026-08-02
atlas-retry fix: `WorldRenderer.addCreature` deleted a creature from
`pendingCreatures` when its atlas sheet fetch failed (the single immediate
retry in `AssetStore.preload` fails too inside a deploy/network outage
window), leaving every creature on that sheet invisible for the rest of the
session. NPC moves don't recover it (`applyCreatureMove` only updates
*existing* pending entries), so an idle shop NPC stayed "not spawned" until a
page reload — and deploys are exactly when reconnect-driven fetch bursts and
cache-busted asset versions make a failed sheet likely.

**What changed**: `AssetStore.preload` now makes up to 3 attempts per sheet
with 500 ms/1 s spacing (replacing the immediate double-attempt), and a
failed sheet is never poisoned — later callers fetch it fresh.
`WorldRenderer` no longer discards a creature whose load failed: it stays in
`pendingCreatures` and a per-creature timer retries the load with doubling
delay (2 s → 30 s cap) until it renders, the creature leaves view, or the
renderer is destroyed; success resets the backoff. Timers are cleaned up in
`removeCreature` and `destroy`.

**Files**: `client/lib/render/AssetStore.ts`,
`client/lib/render/WorldRenderer.ts`,
`client/lib/render/AssetStore.test.ts`,
`client/lib/render/WorldRenderer.test.ts` (new), `todo/{done,status}.md`.

**Verified**: new regression tests fail against the pre-fix renderer
(verified by stashing the fix) and pass with it — recovery on first retry,
doubling delays, retry stop on creature-left and destroy, and AssetStore
attempt-exhaustion recovery; full client unit suite 85 files / 376 tests
green; client `tsc --noEmit` and focused ESLint clean.

**Residual risk**: a creature whose outfit id is missing from the catalog
retries forever at the 30 s cap (cheap no-op lookups, but a console.warn per
attempt); map region fetches and combat-effect preloads keep their existing
single-shot behavior (regions self-heal on the next `refresh`, effects are
transient). Server-side spawn behavior is unchanged and now has a documented
clean bill of health for this symptom.

## 2026-08-03 — Equipment bonuses reach the character panel (and item speed finally reaches walk speed)

**Problem**: equipping gear changed nothing visible in Character Details.
Skill and magic-level modifiers from items were applied by the combat path
(`playerCombatSkill` / `playerMagicLevel`) but the panel projected
`player.skillLevel()` / a hand-rolled magic-level expression, both of which
exclude equipment — so a +5 sword ring moved damage but not the number the
player reads. Worse, the item `speed` attribute (35 catalog items, e.g. boots
of haste +20, time ring +30) was never applied at all: only imbuement
Swiftness fed `setEquipmentModifier`, so haste boots were pure decoration.

**What changed**:
- `playerEquipmentBonuses` (new, pure) aggregates equipped gear + running
  imbuements into skill/magic-level/speed deltas. Skills go through the new
  shared `equipmentSkillModifier`, which `playerCombatSkill` now also calls —
  the panel and the swing read one lookup, so they cannot drift.
- `ProgressionSystem.syncEquipmentStats` feeds item `speed` into the derived
  stat modifier (the gameplay fix) and stores the display deltas on the
  progression, so all four `projectOwnProgression` call sites get them without
  threading the item handler through.
- `projectOwnProgression` now emits `equipmentBonuses` (magicLevel, maxHealth,
  maxMana, capacity, speed, attackSpeedMs) and a per-skill `equipmentBonus`;
  `boostedLevel`/`boostedMagicLevel` now include equipment, matching combat.
- Client: `HoverTooltip` extracted from `ProgressionBar` into
  `components/ui/` and reused by the new `StatDetailRow` + `StatBreakdown`.
  It self-fits: a start/end/pointer anchor, then a measured nudge on both
  axes plus an above/below flip against the nearest clipping ancestor
  (`lib/ui/{clippingAncestor,fitsBelow}.ts`) — the details panel scrolls
  vertically, which clips the horizontal axis too, so an unfitted bubble got
  cut off. Every correction is derived from geometry that does not depend on
  the correction (unshifted edges, the *target's* box), which is what stops
  the measure/apply cycle from oscillating.
- Skill and magic-level rows now show the **effective** value (the one combat
  uses), tinted, with the delta chip beside the label; the details rows tint
  the same way. Hover gives base + equipment (+ a Boosts term for wheel and
  conditions, so the parts always sum to the displayed total). Added an XP
  rate row with a server-rate / XP-boost / stamina breakdown.

**Files**: `protocol/src/progression.ts`,
`server/src/{Player.ts,progression/{playerEquipmentBonuses,EquipmentSkillBonuses,CharacterProgression,ProgressionSystem,projectOwnProgression}.ts,combat/{equipmentSkillModifier,playerCombatSkill}.ts}`,
`client/components/{ui/HoverTooltip,inventory/{StatDetailRow,StatBreakdown,StatDetailRow,ProgressionBar,InventoryCharacterStats}}.tsx`,
`client/lib/inventory/formatSignedValue.ts`, `client/locales/{en,pt-BR}.json`,
story fixtures, plus tests.

**Verified**: new `playerEquipmentBonuses` tests pin the item-speed sum and
assert the skill delta equals `playerCombatSkill`'s own result (including the
aliased `dist`/`shield` catalog keys); new `projectOwnProgression` tests cover
the bonus split and the bare-character zero case. Full server suite 1593
passed, client unit 376 passed, Storybook 331 passed, `yarn typecheck` and
focused ESLint clean. Verified visually in headless chromium: both tooltips
render fully inside the scroll container, which clips horizontally — the new
story asserts that bound so the clipping cannot regress.

**Residual risk**: pre-existing and untouched — 4 server tests
(exercise-weapon catalog/charges) and 4 Storybook stories fail identically on
a clean tree. Equipment still cannot move regeneration, attack speed, or the
XP rate; see TODO.md.

## 2026-08-03 — Level ceiling raised to 50000, and the stat bounds it left behind

**Problem**: the character level ceiling was pinned at 1000 in three places
that had to agree — `MAX_CHARACTER_LEVEL`, `characters_level_check`, and
`characters_experience_check` (bounded by `getExperienceForLevel(1000)`).
Raising it to 50000 then exposed a second, unlinked pair: 007's
`characters_health_upper_bound` and `characters_mana_upper_bound` still capped
the stored pools at 100000. A level-5000 sorcerer has 150025 max mana, so once
its mana passed 100000 *every* save failed on the constraint — surfacing in
play as `potion persist failed ... violates check constraint
"characters_mana_upper_bound"` followed by `item persist failed; resyncing
caches from DB`.

**What changed**: migration 070 raised the level and experience bounds;
migration 071 raised the health and mana bounds to 5000000, re-derived from
`deriveCharacterStats` at the new ceiling (peak health 750135 Knight, peak
mana 1500025 Sorcerer/Druid) with better than 3x headroom for equipment,
imbuement, and wheel bonuses. `MAX_CHARACTER_LEVEL` moved to 50000 — a
technical ceiling, not a gameplay one: every experience path checks
`Number.isSafeInteger`, and `getExperienceForLevel` stops being exact above
level 81456. The hardcoded `max(1000)` level bounds in `highscores.ts` and
`publicWebsite.ts` now reference the constant instead.

**Files**: `protocol/src/{progression,highscores,publicWebsite}.ts`,
`server/db/migrations/{070_raise_character_level_cap,071_raise_health_mana_bounds}.sql`,
`tools/setCharacterLevel.mjs` + test,
`server/src/progression/characterStatBounds.test.ts` (new).

**Verified**: both migrations applied to the live database; the level-5000
character round-trips again. The new `characterStatBounds` test reads the
newest definition of each of the four constraints out of the migrations
directory and asserts it covers the peak `deriveCharacterStats` produces at
`MAX_CHARACTER_LEVEL` — confirmed it fails on exactly this bug by reverting
071's bound to 100000 (`expected 100000 to be greater than or equal to
1500025`) and passing once restored.

**Residual risk**: the four bounds are still only *implicitly* tied to
`MAX_CHARACTER_LEVEL` — the test is what links them, so a new level-derived
column bound would need adding to it by hand. Capacity has no stored column
and so no bound. Raising the ceiling past 81456 would silently break the
experience math; the constant carries that warning.

## 2026-08-03 — The level cap is gone: experience is bigint end to end

**Problem**: the previous entry raised the ceiling from 1000 to 50000 and
patched the constraints it had left behind. That was still the wrong shape.
Canary has no level cap at all — `uint32_t level`, `uint64_t experience`, and
`schema.sql` declares `level int(11)` / `experience bigint(20)` with no CHECK
on any of it. Every limit here was ours: DB check constraints, zod `.max()`
bounds, and `MAX_CHARACTER_LEVEL` itself. Only the last was real, and only
because the experience arithmetic ran in JS `number`, which stops being exact
at 2^53 — level ~81456. Past that, levels silently resolve wrong.

**What changed**:
- `getExperienceForLevel` returns `bigint` and is written in Canary's own
  order (`P / 6 * 100`, verified identical to the previous `P * 100 / 6` for
  every level to 200000). `getLevelForExperience` takes a `bigint` and finds
  its upper bound by doubling instead of searching up to a constant.
- `CharacterProgression` holds experience as `bigint`; awards, death loss
  (scaled integer arithmetic, no fractional multiply), and `loseExperience`
  all stay exact. `assertValidCharacterSaveSnapshot` compares bigints.
- Migration 072 drops all four upper bounds — level, experience, health, mana
  — leaving only `>= 0`. The column widths are the limit now, as in Canary.
- `MAX_CHARACTER_LEVEL` is replaced by `MAX_STORABLE_CHARACTER_LEVEL = 821009`:
  not a rule, just the highest level whose experience fits the signed 64-bit
  column, the same wall Canary's `uint64_t` hits. It exists so schemas and
  command input have a bound.
- Wire: `experience`, `experienceForCurrentLevel`, `experienceForNextLevel`,
  and the highscore `value` are decimal strings (JSON has no bigint). The
  client narrows only the *difference* for the XP bar via
  `experienceProgress`, which stays far inside the safe range at any level,
  and formats totals with `BigInt(...).toLocaleString()`.

**Files**: `protocol/src/{progression,highscores,publicWebsite}.ts`,
`server/src/progression/{getExperienceForLevel,getLevelForExperience,CharacterProgression,assertValidCharacterSaveSnapshot,getDeathLossPercent,projectOwnProgression}.ts`,
`server/src/{Player,gm/GmCommandHandler,social/*}.ts`,
`server/db/migrations/072_remove_progression_ceilings.sql`,
`server/scripts/migrate.ts`, `client/lib/inventory/experienceProgress.ts`,
`client/components/{inventory,wiki,social,public-site}/*`,
`tools/setCharacterLevel.mjs`, plus tests.

**Verified**: migration applied to the live database — all four constraints
now read `>= 0` only, and the level-5000 character persists mana of 135456,
past the old 100000 wall that had been failing every save. New
`uncappedProgression.test.ts` round-trips levels to 800000, asserts exactness
where `Number()` demonstrably rounds, and pins the storage ceiling;
`characterStatBounds.test.ts` was inverted to fail if an upper bound ever
returns. Server 1601 passed, client unit 376, Storybook 331, typecheck and
lint clean. The 4 server (exercise-weapon catalog) and 4 Storybook failures
are pre-existing and were confirmed against a clean tree earlier.

**Operational finding**: `yarn db:migrate` cannot run through Supabase's
transaction-mode pooler (port 6543). Its session-level advisory lock is taken
on one server connection while the next statement is handed another, so the
run deadlocks against its own lock and then strands that lock on a pooled
backend — which is exactly what happened here, and had to be cleared with
`pg_terminate_backend`. Migrations 070 and 071 only succeeded by luck.
`migrate.ts` now refuses port 6543 with the session-mode (5432) command to
use instead.

**Residual risk**: `awardExperience` still takes a `number` amount (kill
experience, capped at 1e9 per award) and converts inward; only the running
total is bigint. Level itself remains a `number` throughout, which is correct
— `integer` columns and `uint32_t` in Canary both stop far below 2^53.

## 2026-08-03 — Gem grant tool + Wheel revelation actives in the spell picker

**Problem**: (1) No operator tool existed for stocking a character's Gem
Atelier balances during testing. (2) The action-bar spell picker showed no
Wheel of Destiny spells for any vocation except the Druid Twin Bursts: the
other ten revelation actives (five avatars, Executioner's Throw, Divine
Grenade, Divine Empowerment, Great Death Beam, Spiritual Outburst) had never
been ported from Canary — they sat `supported: false` in the content catalog,
so the server catalog (`SpellRegistry.projectFor`) had nothing to send.

**What changed**: `tools/grantGems.mjs` (`yarn gems:grant "Name" [--count]
[--dry-run]`) tops up `character_gem_resources` (lesser/regular/greater) in
one serializable transaction, idempotent GREATEST semantics, reading
`WHEEL_BASE_VOCATION`/`GEM_VOCATION_NAMES` from protocol source so the
vocation gem-family naming can't drift; mirrors the unaudited
`creditGemDrops` path. Ran it for "Shui Sorc" (Master Sorcerer): 1000 Sage
Gems of each quality (was 20/1/5).

All ten revelation actives implemented server-side with Canary mechanics and
gated `wheelRevelation` stage checks: chain damage resolution (new
`SpellDefinition.chain`, hop-by-hop nearest-first with per-hop
LoS/harm checks) for Executioner's Throw (3-5 targets by grade, +100/125/150 %
execute below 30 % health via `wheelExecutionersThrow.ts`) and Spiritual
Outburst (6 targets, `flatDamageHealing` level baseline); a tick-owned fuse
queue (new `SpellDefinition.delayed` + `DelayedSpellDetonation`, drained in
`Combat.tick`) for Divine Grenade's 3 s clamped-position blast with all
targets re-validated at detonation; Great Death Beam as a BEAM6 death beam
whose grades lengthen to BEAM7/BEAM8 and which joins Beam Mastery's
per-target legs; Divine Empowerment as a 5 s self damage buff; avatars as a
new `playerAction: "avatar"` applying the real Canary outfit condition
(lookTypes 1593-1596/1823, all present in our assets) plus a
`Player.avatarStage/avatarUntil` window read by `playerSpecials` (100 % crit,
+5 %/stage crit damage) and `DamageResolver` (5 %/stage damage reduction),
with 2 h/1.5 h/1 h graded cooldowns. Grade/stage scaling rides
`wheelSpellAugments` entries; `executeWorldSpell` now applies augment
cooldown reductions (also fixes Divine Dazzle grade 2's missing reduction).
Protocol cooldown caps raised 1 h→2 h; `REVELATION_SPELL_GRADES` exported;
client icon map gained the ten indices from otclient `spells.lua`.

**Files**: `tools/grantGems{,.test}.mjs`, `package.json`,
`protocol/src/{combat,wheelSpellGrades}.ts`, `server/src/Player.ts`,
`server/src/combat/{Spell,SpellCaster,Combat,DamageResolver,DeathHandler,
PlayerSpellActions,PlayerAutoAttack,playerAttackPlan,playerSpecials,
wheelBeamMastery,wheelSpellAugments,wheelUpgradedAreas,
wheelExecutionersThrow,flatDamageHealing,DelayedSpellDetonation}.ts`, ten new
modules under `server/src/combat/spells/{attack,support}/`,
`SPELL_DEFINITIONS{,.test}.ts`, `client/lib/combat/getSpellIconArtwork.ts`.

**Verified**: new Combat tests (avatar buff window + graded cooldown, grenade
fuse-then-detonate through the tick queue, executioner chain + low-health
hit) and a definitions test asserting every castable revelation grant has a
definition for exactly its vocation pair with the right domain gate — 81
combat tests green; per-vocation tsx report confirms all revelation actives
now project into each vocation's picker; server suite green except the four
pre-existing exercise-weapon failures (confirmed on a clean stash); client
376 unit tests, `yarn test:tools` + `yarn parity:check` green; protocol,
server, client typechecks clean.

**Residual risk / deferred** (all in TODO.md): Divine Empowerment zone
semantics + stage-3 collapse, Spiritual Outburst harmony legs, Drain Body
leech passive, long-cooldown relog reset (avatar exploit), content-catalog
`supported` flags not regenerated (parity inventory undercounts), no chain
visuals/weapon-type missile, Cyclopedia not showing in-avatar crit.

## 2026-08-03 — Cooldowns survive relog + revelation actives marked supported

**Problem**: (1) All combat cooldowns lived only in `Session.combatCooldowns`,
so relogging cleared them — harmless at ≤30 min, an exploit once the avatars
shipped with 1-2 h cooldowns. (2) `content/spells/canary-spells.json` still
recorded the ten revelation actives as `supported: false`, so the parity
inventory undercounted shipped spells.

**What changed**: New `character_spell_cooldowns` table (migration 073,
applied to the dev database; `ready_at` epoch-ms like prey's timestamps,
`total_ms` capped at the 2 h protocol maximum) with a `CooldownStore`
trio (`Memory`/`Pg` + `sql/{select,replace}CooldownsQuery`, full-replace CTE
like `replaceCharacterStoragesQuery`) and a `CooldownTracker` whose
per-character write chain orders every logout flush ahead of the next
login's read. Flush points: `processDisconnects` (both the lingering and
leave-world branches), `evictExistingSession` (dual login), and a
`finishStop` sweep before sockets terminate; load in `resolveWorldEntry`'s
sequential block, applied in `enterWorld` before the welcome fight-state, so
the client's HUD shows restored timers immediately. Death still wipes the
map, and the unconditional full replace erases the rows on the next flush.
`persistableCooldowns` bounds what is written to what the table's checks
accept.

For the catalog: `parseCanarySpells.mjs` gained `reviewedWheelRevelation`
entries for all ten revelation actives plus special-combat entries
(executioner keeps its parsed skill formula with `allowsProceduralCombat`;
grenade/beam pin their level-magic formulas; Spiritual Outburst gets a
reference AST with the sub-500 flat leg; Divine Empowerment is its reviewed
condition; avatars are `playerCallback("avatar")`). Regenerated
`canary-spells.json` (179 supported / 56 disabled) + parity inventory,
reconciled the converter hash in `content/source-manifest.json`, and updated
the pinned budgets (`SPELL_DEFINITIONS.test.ts` byOwner/disabled/callbacks,
`getSpellIconArtwork.test.ts` 169→179).

**Files**: `server/db/migrations/073_character_spell_cooldowns.sql`,
`server/src/combat/{CooldownStore,MemoryCooldownStore,PgCooldownStore,
CooldownTracker,persistableCooldowns,sql/selectCooldownsQuery,
sql/replaceCooldownsQuery}.ts`, `server/src/{GameServer,CharacterHandler,
index}.ts`, `tools/parseCanarySpells.mjs`, `content/spells/canary-spells.json`,
`content/canary-parity-inventory.json`, `content/source-manifest.json`,
`server/src/combat/spells/SPELL_DEFINITIONS.test.ts`,
`client/lib/combat/getSpellIconArtwork.test.ts`, plus new tests.

**Verified**: new unit tests (tracker write-before-read ordering, empty-set
replace, persistable bounds), a Pg integration suite against a migrated
schema (round trip, wholesale replace, per-character scoping — run with
TEST_DATABASE_URL), and an end-to-end GameServer test that relogs twice and
asserts the welcome fight-state still carries a seeded 2 h avatar cooldown
and that the logout flush round-trips it. Full server suite: 1610 passed,
only the four pre-existing exercise-weapon failures. `yarn test:tools` +
parity check green after the regeneration.

**Residual risk**: cooldowns flush when the session leaves the world, not on
every cast — a hard crash between cast and logout loses at most that
session's cooldowns (same durability class as the character snapshot).
Death-while-lingering keeps the pre-death rows (death only clears the map
when a session is attached); cooldowns surviving death matches Canary, so
the wipe-on-death-with-session is the stricter branch.

## 2026-08-03 — Imbuement picker lists worn gear only, blank scroll dropped

**Problem**: the shrine's "Pick an item to imbue" grid was
`getInventoryItems(inventory).filter(slots > 0)` — every carried piece,
including the spare backpacks nested inside the worn one, and (because
`projectInventory` sends the equipped backpack's contents both as
`inventory.items` and as an open container) the same item twice with the same
React key. The grid also offered a blank-scroll tile whenever the player held
one, which nothing in the intended flow uses.

**What changed**: new `client/lib/imbuement/collectImbuableItems.ts` — keyed
by item id (so an open bag cannot list its contents twice), worn pieces
first, and containers only qualify while equipped, so exactly one backpack
can ever appear. It returns `{ item, equipped }`, and `ImbuementItemPanel`
renders a small "Equipped" badge on the worn ones (with an `aria-label` that
keeps the item's name as the button's accessible name). The blank-scroll tile
and the whole scroll branch of the window UI are gone:
`ImbuementItemPanel`'s scroll pane, `ImbuementModal`'s `onSelectScroll` /
`onForgeScroll` props and `mode` handling, `ImbuementApplyPanel`'s `mode`
prop, the two overlay handlers, and the `imbuement.blankScroll` /
`forgeScroll` / `forgeScrollWith` strings in both locales (new:
`imbuement.equipped`). Server and protocol are untouched — scroll forging
still exists, it just has no client entry point (recorded in `TODO.md`).

**Files**: `client/lib/imbuement/collectImbuableItems.ts` (+ test),
`client/components/imbuement/{ImbuementItemPanel,ImbuementModal,
ImbuementApplyPanel}.tsx`, `client/components/game-window/
GameForgeOverlays.tsx`, `client/locales/{en,pt-BR}.json`,
`client/stories/ImbuementModal.stories.tsx`.

**Verified**: 4 new unit cases (spare bags dropped while the worn one stays,
worn-first ordering with the `equipped` flag, an item listed once when its
bag is also open, no-slot pieces dropped); the six ImbuementModal stories
pass, with the PickItem story now asserting the "Equipped" badge renders;
`yarn typecheck` and `yarn lint` clean.

**Residual risk**: display only. The server still accepts an imbuement window
request for any carried item, a spare backpack included — nothing is gained
by imbuing one, so the filter was left on the client rather than narrowing a
server rule.

## 2026-08-04 — Hunting bot: sparse guide routes only, trace pipeline removed

**Problem**: opening a hunt (and "Reset to guide route") auto-fired a
`hunting-bot-trace`, and the traced reply replaced the just-seeded sparse
guide ring with a ~180-point tile-by-tile expansion — to the player, the
clean guide route flashed and then "reverted". The expansion was never
functionally needed: `HuntingBot` hands each waypoint to
`MovementHandler.walkPathTo` as a destination and the server pathfinds every
leg at execution time, so a sparse ring already walks correctly.

**What changed**: the whole trace pipeline is gone, end to end. Protocol:
`hunting-bot-trace` / `hunting-bot-traced` schemas, their types, and the
trace-only `HUNTING_BOT_LIMITS` (`maxTracePoints`, `traceCooldownMs`,
`maxTraceVisited`, `maxTraceLegVisited`, `traceAnchorSpacing`,
`maxLegSamples`, `maxWaypointSpacing`, `maxSnapRadius`) removed;
`traceLegMargin` renamed `pathSearchMargin` since its only remaining user is
runtime pathing. Server: `traceRouteLeg` / `buildRouteAnchors` /
`snapToWalkable` (+ tests) deleted, `HuntingBotHandler` handles only route
saves and arming, `Session` lost its three trace fields, `GameServer`
dropped the intent case. Client: routes now seed straight from the guide's
`RoutePath` and stay as drawn; the "Trace walkable route" button,
`traceHuntingBotRoute`, the `hunting-bot-traced` handler (which also saved
the replacement), `huntingBotTracing` / `huntingBotUnresolved` store state,
and all broken-waypoint (red dot) rendering in the editor, list, and
`drawMinimap(Waypoints)` are removed, along with the `trace`/`tracing`/
`unresolved*` locale strings. The playtest scenario saves the sparse
guide-style ring directly. Also this session: Darashia Dragon Lords'
floor-11 guide route replaced with a hand-tuned 11-point ring
(`hunting_places.json`; `huntingPlacesSha256` in
`content/source-manifest.json` recomputed — it had already drifted).

**Files**: `protocol/src/{huntingBot,clientMessages,serverMessages}.ts`,
`server/src/{GameServer,Session,MovementHandler}.ts`,
`server/src/huntingBot/{HuntingBotHandler,HuntingBotHandler.test,
HuntingBotIntentSchemas.test}.ts` (5 files deleted),
`server/src/playtest/scenarios/huntingBot.ts`,
`client/components/hunting-bot/*`, `client/components/game-window/
{GameHuntingBotOverlay.tsx,types/*,store/createGameWindowStore.ts,
messages/*,controllers/handleGameClientStatus.ts}`,
`client/lib/minimap/{drawMinimap,drawMinimapWaypoints}.ts`,
`client/lib/net/GameClient.ts`, `client/locales/{en,pt-BR}.json`,
`client/stories/HuntingBotModal.stories.tsx`, `client/ASSETS.md`.

**Verified**: typecheck clean in protocol, server, and client; server
hunting-bot suite (38 tests) and client hunt/minimap/game-window suites
pass; the schema test now asserts `hunting-bot-trace` is rejected. Full
server suite: 4 pre-existing exercise-training failures, confirmed present
on a clean tree via `git stash`.

**Residual risk**: a saved route that predates this change still holds its
dense traced chain until the player resets it — harmless, the bot walks it
the same way. Unreachable hand-placed waypoints are no longer flagged red in
the editor; the bot's runtime skip/`unreachable` stop reason is now the only
signal.

## 2026-08-04 — XP boost now refreshes the character panel the moment it lands

**Problem**: claiming the daily reward's XP boost (or buying the store
boost) mirrored the new deadline onto the live player but never pushed a
`progression-updated`, and `ProgressionSystem.tick` only re-projects when
regeneration/stamina actually change something. An idle full-health player
in a PZ saw a stale XP-rate panel — with the free 10-minute daily boost the
whole boost could expire without ever appearing. Same gap at login: the
`welcome` state is built before the streak row loads, so a boost surviving
a relog stayed hidden until the first tick.

**What changed**: `DailyRewardService.setRecord` (the single writer that
mirrors the boost/streak onto the player) now takes the tick timestamp and
calls a new optional `progressionHooks.notifyCommitted(player, nowMs)`,
wired in `GameServer` to `ProgressionSystem.notifyCommittedPlayer` (the
`PotionService`/`PromotionService` pattern). All three mirror paths are
covered: login attach, daily claim commit, and the store purchase —
`StoreLiveHooks.applyXpBoost` and `MantusStoreService.applyEffect` now
thread the committed timestamp through.

**Files**: `server/src/daily/DailyRewardService.ts`,
`server/src/store/{StoreLiveHooks,MantusStoreService}.ts`,
`server/src/GameServer.ts`, `server/src/daily/DailyRewardService.test.ts`.

**Verified**: server typecheck clean; new regression test asserts the
projection push on login mirror and on `applyXpBoost` with the mirrored
deadline; daily + store suites pass (14 tests). Full server suite: only the
4 pre-existing exercise-training failures, confirmed present on a clean
tree via `git stash`.

**Residual risk**: the panel countdown is still a snapshot — the client
does not re-request when the boost expires, so the boost line disappears on
the next progression push after expiry rather than at the exact second.

## 2026-08-04 — Exercise-weapon tiers retuned to 5x; charge audit

**Problem**: a charge-persistence audit (are exercise-weapon charges ever
reset?) found the persistence sound but the epic/legendary pace inconsistent:
`CUSTOM_EXERCISE_TIERS.ts` shipped with `speedMultiplier: 5` (and 5x tooltip
copy) while the handler tests, the store shelf blurb, the catalog test, and
the playtest scenario all still asserted the originally documented 2x —
two unit tests failed, and the store advertised a slower pace than sold.

**What changed**: 5x confirmed as the intended balance. The two
`ExerciseTrainingHandler` tests now expect the 5x cadence (bundle write buys
9 charges across a 3s round trip; epic lands 5 hits per stock hit,
fencepost-corrected), the store description derives its pace line from
`tier.speedMultiplier` instead of hardcoding "twice", the catalog test
expects the 5x description, the playtest ratio gate moved to 3–6 around 5x,
and the tier-file header comment says five times.

**Charge audit findings (no fixes needed)**: charges live in
`items.attributes.charges`, written by `jsonb_set` inside a serializable
row-locked transaction; the catalog-count fallback only applies to pristine
items that never spent a charge; spending clamps to what remains and the row
is deleted + audited (`charges-spent`) at zero; moves never touch attributes,
merges require identical attribute bags, trade copies attributes verbatim,
and the market escrows only pristine (empty-attribute) items, so a used
weapon can never re-mint at full charges.

**Files touched**: `server/src/action/{ExerciseTrainingHandler,EXERCISE_WEAPON_CATEGORY}`
tests, `server/src/store/EXERCISE_WEAPON_CATEGORY.ts`,
`server/src/item/loadItemCatalog.test.ts`,
`server/src/playtest/scenarios/exerciseTraining.ts`,
`server/src/action/CUSTOM_EXERCISE_TIERS.ts` (comment only), `todo/status.md`.

**Verified**: full server unit suite green (233 files, 1597 tests; DB-gated
integration tests skipped as usual).

**Residual risk**: the exerciseTraining playtest scenario was not re-run
(needs a live server); its 3–6 ratio window is generous to absorb the 4s
window's fenceposts and network jitter.

## 2026-08-04 — Underground minimap: solid rock painted brown instead of black

**Problem**: On underground floors (z8+) the minimap looked "inverted" —
the whole map was a dirt-brown mass with cave rooms as black holes ringed
in red. `tools/buildMinimapTiles.mjs` classified every `ground` item by
sprite hue, so the solid-earth cave filler (item 101 and friends,
`ground + notWalkable + blockProjectile`, ~25k of 47k tiles in the
Rookgaard z8 region) painted as walkable dirt, and natural cave-wall faces
painted red like city walls.

**What changed**: `tileColor()` now takes an `underground` flag (folder
z ≥ 8). Underground, ground items that are `notWalkable + blockProjectile`
paint automap black (`AUTOMAP.solid`), and wall-like items paint black
instead of red/gray. Water/lava are unaffected: they are `notWalkable` but
do not block projectiles, so the flag pair uniquely identifies solid rock.
Surface floors are untouched (mountains stay gray, city walls red).
Rebuilt all tiles via `yarn minimap:build`; `minimapVersion` bumped to
`155dad44f2ae` so client caches bust.

**Files touched**: `tools/buildMinimapTiles.mjs`,
`client/public/assets/map/otservbr/minimap/**` (regenerated),
`client/public/assets/map/otservbr/manifest.json` (minimapVersion).

**Verified**: visually compared baked tiles before/after for z8/z10
(black rock + brown tunnels + lava/floor-change accents, classic automap
look) and z7 (unchanged: green land, blue sea, gray mountains, red walls).

**Residual risk**: brick-walled dungeon rooms underground now also outline
black rather than red; matches tibia-style automaps but is a deliberate
simplification.

## 2026-08-05 — Item rarity & affixes for equipable gear (drops, stats, tooltip, market)

**Problem**: No item-rarity system existed — every drop of a type was
identical, the equipment tooltip was common-only, and per-instance gear
could never be listed on the market.

**What changed**:

- **Rarity domain** (`server/src/rarity/`): uncommon/rare/epic/legendary
  grades rolling 1/2/3/4 affixes from a 12-affix pool (max HP/mana, attack
  speed, attack, defense, life/mana leech, crit chance/damage, weapon
  skill, magic level, elemental resistance). Values scale ×1/×1.5/×2.25/×3
  by grade; `magicLevel` is rare+. Stored compactly on
  `items.attributes` (`{rarity, affixes:[{id, value, element?, skill?}]}`),
  read by validating readers modeled on `itemTierOf`/`itemImbuementsOf`.
  No DB migration needed for items.
- **Drops**: `rollMonsterLoot` grades eligible gear (non-stackable
  equipment, `isBossEquipmentReward` filter minus stackables) with
  `CombatFormula` RNG; prey/boosted extra rolls and boss reward bags
  (`rollBossRewardLoot` + parameterized reward insert) participate. Chances
  live in `config.yml` (`rarity: {uncommon: 5, rare: 1, epic: 0.2,
  legendary: 0.04}` percent, per-100k thresholds, best grade first);
  absent block = off; all-zero draws no RNG so seeded parity stays
  byte-identical. Parity playtests pin the block off
  (`writeParityConfig`). Loot-created audits carry the grade.
- **Stats**: `playerAffixEffects` aggregate (memoized per inventory cache
  like imbuements) wired into attack plan (flat attack; wand min/max),
  defense/shield/mitigation legs, always-on auto-attack leech beside
  imbuement leech, crit specials, skills + magic level (melee, spells,
  requirements), elemental absorb, and progression: max HP/mana ride the
  equipment `DerivedStatModifier` (constructor-seeded at login from the
  loaded inventory, snapshot `equipmentBonus` extends the save invariant
  exactly like `wheelBonus`), attack speed gets its first modifier input
  (percent, capped at 50% of vocation base) and fills the reserved
  `equipmentBonuses.attackSpeedMs` wire field. Caps: attack speed 50%,
  leech 100%. Character Details shows the bonuses with hover breakdowns
  (attack-speed row gained one); cyclopedia combat sums include affixes;
  look text gains "It is an epic item (+40 Maximum Health, ...)".
- **Tooltip refactor**: protocol `itemTooltipSchema` gained `rarity`,
  `worth` (NPC sale value merged into the catalog from
  `canary-shops.json` as `ItemType.npcValue` — `worth` stays coins-only),
  and structured `imbuementSlots`; `itemAffixSchema` gained
  `kind: imbuement|rolled`. The old "Imbuement Slots N" line became a
  Canary-style `Imbuements: (Powerful Scorch 19:58h, Empty Slot)` line
  (purple), rolled affixes lead the list in green, rarity tints the
  border/header gradient (grey/yellow/purple/dark orange tokens in
  `globals.css`), and a gold-coin footer shows the NPC value.
  `itemImbuementSlotCountOf` reads the structured field instead of regex.
  Storybook stories per grade.
- **Market**: rarity items list as unique amount-1 sell offers bound to
  the exact depot item (`market-create-offer.itemId`, `attributed` escrow
  path re-verifying grade + whole-row escrow in the transaction). Browse
  joins escrow attributes and serves the item's real tooltip on the offer
  (anonymous); `ownAttributedItems` powers a "list this specific item"
  picker in the sell ticket; own offers color by grade. Buy offers stay
  pristine-only — an attributed item can never fill one. `market_history`
  gained a `rarity` column (migration 074) recorded on fills;
  `averagePrices` filters graded sales out of the per-type average.
- **NPC shops**: bulk sales skip rarity-graded rows
  (`CarriedItemDraft.sellableRows`), so a legendary can't be vendored at
  base price.

**Files touched**: `protocol/src/{item,market,progression}.ts`;
`server/src/rarity/*` (new); `server/src/combat/{rollMonsterLoot,
createMonsterCorpse,DeathHandler,Combat,playerAttackPlan,PlayerAutoAttack,
DamageResolver,SpellCaster,combineSkillBoosts}.ts`;
`server/src/item/{toItemTooltip,CorpseCreator,LootItemCreation,ItemType,
loadItemCatalog,ItemIntentHandler,CarriedPersistPlan,PgItemPersistOps,
plan/appendUnpersistedLootInserts,sql/insertLootCreatedAudit}.ts`;
`server/src/progression/{CharacterProgression,ProgressionSystem,
playerEquipmentBonuses,projectOwnProgression,
assertValidCharacterSaveSnapshot}.ts`; `server/src/{Player,
CharacterHandler,GameServer,config,loadServerConfig}.ts`;
`server/src/character/{Character,CharacterPersistence}.ts`;
`server/src/reward/{rollBossRewardLoot,RewardChestService,PgRewardStore,
sql/insertRewardChildQuery}.ts`; `server/src/market/*`;
`server/src/economy/{loadNpcSaleValues,plan/CarriedItemDraft}.ts`;
`server/src/cyclopedia/CyclopediaService.ts`;
`server/src/look/describeItemLook.ts`; `server/db/migrations/074_*.sql`;
`config.yml`; client tooltip/auction/character-stats components, market
session hook, `GameClient`, locales, stories.

**Verified**: protocol/server/client typechecks; server unit suite (1619
passing incl. new rarity/tooltip/loot/affix/config/draft tests); client
unit suite (380) and Storybook build; Pg integration: market (45 incl. 5
new unique-listing tests: round-trip with attributes, cancel return,
pristine-path rejection, grade requirement, buy-offer fill rejection) and
reward store. Pre-existing integration failures in guild/social/one
item-store clean-sweep test reproduce on a clean tree and are unrelated.

**Residual risk / deferred** (also in TODO.md): affix leech is
auto-attack-only (mirrors imbuement leech today); rarity is invisible on
ground tiles (`mapItemStateSchema` carries no attributes); world-decay
transforms mint empty bags (deliberate for corpse owner-expiry; no
unequipped gear decays today); graded items are stash/NPC-sale excluded by
design; bestiary drop-chance colors overlap the rarity palette with
different semantics; no manual e2e playtest run yet.

## 2026-08-05 — Rarity follow-ups: crit visuals, hundredths tooltips, live combat stats in Character Details

**Problem**: (a) Player-dealt critical hits multiplied damage but never
showed the crit burst — only monster-ability crits broadcast effect 173.
(b) Tooltips and look text printed Canary's hundredths-of-a-percent crit/
leech values raw ("Critical Hit Chance +1000%" on a sanguine coil instead
of +10%), and showed vestigial leech-chance lines whose catalog data mixes
two scales (100 and 10000, both meaning "always"). (c) The wiki > Character
combat tab only requested state when its cache was empty, so equipping
gear never refreshed crit/leech numbers. (d) Character Details (C) had no
combat block at all.

**What changed**:

- `DamageResolver` owns the crit burst now: `broadcastCriticalEffect`
  (Canary CONST_ME_CRITICAL_DAMAGE 173) fires inside `applyDamage` for
  every request-carried crit (wands, spells, monster abilities — Combat's
  local broadcast removed), and `PlayerAutoAttack` calls it when the
  weapon-roll crit procs (melee/distance roll outside the request).
- `toItemTooltip` and `itemLookSegments` divide crit chance/damage and
  leech amounts by 100 ("Critical Hit Chance +10%", "Critical Extra Damage
  +12%", "Life Leech +2%"); leech-chance lines dropped like the modern
  client. Regression test pins the sanguine-coil numbers.
- `WikiCharacter` re-requests the combat view on every tab visit (cached
  copy renders while pending).
- Character Details gained a Combat section: crit chance/damage, life/mana
  leech, and per-element resistances, served on `ownProgressionState.combat`
  (new optional `equipmentCombatStatsSchema`). Computed in
  `ProgressionSystem.syncEquipmentStats` with the same sums the cyclopedia
  combat view uses (equipment + wheel + imbuements + affixes; proficiency
  stays in its own panel, gem resistances still only in mitigation),
  value-diffed on `CharacterProgression.setEquipmentCombatStats` so any
  change pushes a fresh progression. `ABSORB_ELEMENTS` extracted to
  `combat/absorbElements.ts` and shared with the cyclopedia. The panel body
  was already scrollable; the new section scrolls with it.

**Files touched**: `server/src/combat/{DamageResolver,PlayerAutoAttack,
Combat,absorbElements}.ts`, `server/src/item/toItemTooltip.ts`,
`server/src/look/itemLookSegments.ts`,
`server/src/progression/{CharacterProgression,ProgressionSystem,
projectOwnProgression}.ts`, `server/src/cyclopedia/CyclopediaService.ts`,
`protocol/src/progression.ts`, `client/components/wiki/WikiCharacter.tsx`,
`client/components/inventory/InventoryCharacterStats.tsx`, locales.

**Verified**: full server suite (1622 passing) + client suite (380) +
typechecks. Manual: pending live playtest.

**Residual risk**: heal crits still show no burst (damage-only broadcast);
the Character Details combat block updates on the tick after an equipment
change (same cadence as every equipment bonus); cyclopedia combat still
sums without `now` (no in-avatar 100% crit display, pre-existing TODO).

## 2026-08-05 — Rarity e2e playtest suite (`yarn playtest:rarity`), /rare dev command, and the two bugs it caught

**Problem**: No in-game verification existed that rarity affixes actually
reach combat and the panels; affix stats were only unit/integration tested.

**What changed**:

- **`/rare` GM command** (dev-only, DEV_COMMANDS servers):
  `/rare <grade> <item name|id> [affix=value,...]` conjures a graded item —
  rolling from the live config tables, or from an explicit spec
  (`maxHealth=40,resistance=fire:6,skill=sword:2`) for deterministic
  assertions. Validates grade, eligibility, affix ids/values/parameters,
  and duplicates. Implemented by threading an optional attribute bag
  through the conjure stack (`ItemStore.conjure` → Pg/Memory stores +
  `insertConjuredItem` now parameterizes attributes); spell/tool conjuring
  passes none and is unchanged.
- **Playtest harness**: `startPlaytestServer` accepts `rarityChances` and
  `lootRate` (parity runs still delete the block / pin loot to 1x).
- **Scenario** `src/playtest/scenarios/rarityAffixes.ts` (31 checks over
  the real wire): per-grade affix counts on tooltips; all 12 affixes
  equipped one by one with assertions on progression max HP/mana, attack
  speed (1800ms from a 10% roll), cyclopedia attack/defense deltas, the
  combat block (crit/leech/resists), skill and magic-level bonuses;
  bonuses revert on unequip; edge cases — 50% attack-speed floor from an
  80% roll, 100% leech cap from a 150 roll, two-slot stacking, unequip at
  full health clamps current health, /rare refuses ineligible items
  (stackables) and duplicate-affix specs; live-combat crit-burst checks for both melee (knight/sword) and the
  resolver path (sorcerer/wand);
  a real minotaur kill dropping forced-legendary gear through auto-loot;
  and an affix-max-health relog at full health.
- **Real bug #1 (caught by the crit check)**: one-shot-kill crits never
  showed the burst — death processing tore the victim out of every
  session's known-creature set before the effect broadcast, whose
  relatedCreatureId filter then swallowed it. The burst now broadcasts
  before death handling and as a plain tile effect
  (`DamageResolver.broadcastCriticalEffect`).
- **Real bug #2 (found chasing the relog check)**: a progression tick
  running between inventory detach and the final logout save read "no
  equipment", zeroed the modifier, and clamped an affix-boosted health
  right before persisting. `syncEquipmentStats` now treats a missing
  inventory cache as unknown (`ItemIntentHandler.hasLoadedInventory`).

**Files touched**: `server/src/gm/GmCommandHandler.ts`,
`server/src/item/{ItemStore,PgItemStore,PgItemCreationOps,MemoryItemStore,
ItemIntentHandler,sql/insertConjuredItem}.ts`,
`server/src/combat/{DamageResolver,PlayerAutoAttack,SpellCaster}.ts`,
`server/src/action/ToolUseHandler.ts`,
`server/src/progression/ProgressionSystem.ts`, `server/src/GameServer.ts`,
`server/src/playtest/{startPlaytestServer,scenarios/rarityAffixes}.ts`,
`server/package.json` (`playtest:rarity`).

**Verified**: consecutive clean full-suite scenario runs (31/31, ~25s);
full unit suite green (1,622). Scenario gotchas baked in: busy-retry
around GM/equip intents (trailing persists), drop pacing under the
per-session intent rate cap, drops spread over a tile ring (10-item tile
cap), a pre-boot wipe of unseeded ground items near the test spot
(playtest world persists between runs), and waiting for the 100ms
equipment-sync tick before healing against a new maximum.

**Residual risk**: the wipe assumes the probed Thais spot; moving SPOT
moves the box. Heal crits still show no burst (deliberate, damage-only).

## 2026-08-05 — Client FPS optimization pass (measured, probe-gated)

**Problem**: Steady-state FPS in crowded scenes degraded with creature count
(29.2 avg FPS at the monsterPerformance 1000-butterfly stage, p95 frame 50 ms,
software renderer baseline).

**What changed** (each kept only after 2× before/after probe runs showed a
gain beyond the ±0.3 FPS run-to-run noise, plus a green full suite):

1. **Store notify skip + own-creature guard** — `createGameWindowStore` wraps
   `set` to skip the notify when every resolved key is `Object.is`-equal, and
   `handlePlayerStateMessage` no longer calls `setOwnCharacter` for other
   creatures' moves/state changes (each of which was re-running all ~341
   mounted selectors). +2.3 FPS @1000.
2. **Render-path allocation cuts** — `MapView` memoizes the visible-floor
   list/Set per center floor (was one `getVisibleFloors` array per creature
   per frame) and keys the tile-elevation cache by packed numbers (was 4
   string keys per creature per frame); `CreatureView.updateFrame` memoizes
   baked frame textures per packed (direction, pose, phase) — safe because
   appearance is constructor-immutable and appearance changes recreate the
   view. +1.25 FPS @1000, p95 frame 50→33 ms.
3. **Minimap decoupled from the rAF flood** — creature markers redraw at
   ~10 Hz via `useThrottledValue` in `GameMinimapOverlay` (trailing edge, so
   the last state always lands), `MinimapPanel` is `memo`ed with stable
   callbacks, and the canvas bitmap is no longer reset when dimensions did
   not change. +2.0 FPS @1000 (draw throttle) plus +1.05 (render memo),
   biggest single win.

**Net effect**: 29.2 → 35.8–36.2 avg FPS at 1000 monsters (+23%), combat
29.5 → 34.1–35.6, p95 frame 33.4 ms at every stage. e2e gates raised
(MIN_AVERAGE_FPS 15→20, MAX_P95_FRAME_MS 100→75) to lock the gains in.

**Tried and reverted** (measured, no probe-visible gain; analyses kept in
`gaps/gap-8.md`): chat-channel memo split in `GameHudOverlay` (combat-log
volume in the probe is too low to register) and routing 13 creature-viewer
`world.canSee` sites through the cached `canCreatureSee` (single-player load
scenarios exercise ~0.03 ms/tick of canSee — needs the combined
players+monsters harness, `gaps/gap-6.md`).

**New tests**: `handlePlayerStateMessage.test.ts`,
`createGameWindowStore.test.ts` (notify semantics),
`MapViewElevationAndFloors.test.ts`, CreatureView bake-count test,
`toChatMessage.test.ts`, `World.test.ts` canCreatureSee-equivalence, minimap
`AtSpawn` canvas-pixel play assertion. The unit project now also collects
`components/**/*.test.ts`.

**Verification**: full `yarn test` + `yarn typecheck` green; monsterPerformance
(software profile) ×2 per kept change; gameFreeze e2e (worst stall 71 ms,
bar 250); inventoryPerformance + itemIconAnimation e2e green; storybook lane
has 4 pre-existing reds + 1 flake, reproduced on a clean tree and recorded in
`gaps/gap-7.md`/`gap-9.md`.

**Residual risk**: minimap markers now trail live positions by up to ~100 ms
(matches the classic automap feel; pan/zoom/floor changes stay immediate).
Verified gaps found along the way live in `gaps/gap-1.md`…`gap-9.md`.

**Files touched**: `client/components/game-window/store/createGameWindowStore.ts`,
`client/components/game-window/messages/handlePlayerStateMessage.ts`,
`client/components/game-window/GameMinimapOverlay.tsx`,
`client/components/minimap/MinimapPanel.tsx`,
`client/lib/minimap/useThrottledValue.ts`, `client/lib/render/{MapView,CreatureView}.ts`,
`client/e2e/monsterPerformance.e2e.test.tsx`, `client/vitest.config.ts`,
`client/stories/MinimapPanel.stories.tsx`, plus the test files above.

## 2026-08-05 — Public website: Wiki dropdown in the landing nav + /wiki/items rarity & affix guide

**Problem**: The public site had no wiki. The item rarity system (shipped
2026-08-05) was undocumented for players: nothing public explained the four
grades, how many affixes each rolls, or the affix pool and its value bands.

**What changed**: Added a collapsible "Wiki" group to the landing sidebar
nav (Tibia-style dropdown: chevron header button, closed by default, opens
automatically on `/wiki` routes) with its first entry, Items, and a new
public page at `/wiki/items`. The page shows the four rarity grades as
cards — grade name in its rarity color, rolled-affix count, affix power
multiplier, and a real `ItemTooltip` render of an example graded item
(reusing the `TIBIA_TOOLTIP_ITEMS` fixtures, sprites drawn live from the
atlas via `SpriteIcon`) — plus an affix table listing all 12 affixes with
their roll range on every grade, computed with the server's exact scaling
(`max(1, round(value × multiplier))`) and per-affix caveats (attack-speed
cap, auto-attack-only leech, Rare+ magic level, resistance elements,
weapon-skill matching). Localized in en and pt-BR; affix names stay in
English to match in-game tooltip text. The nav link rows shared by the
static groups and the new dropdown were extracted into `LandingMenuLink`.

**Files**: `client/components/landing/{LandingNavigation,LandingMenuLink,LandingWikiMenu}.tsx`,
`client/components/public-site/{ItemsWikiPage,RarityGuideCard,AffixGuideTable}.tsx`,
`client/app/wiki/items/page.tsx`,
`client/lib/wiki/{wikiAffixGuide,wikiRarityGuide,formatAffixRange,isAffixOnGrade}.ts`
(+ `formatAffixRange.test.ts`), `client/stories/ItemsWikiPage.stories.tsx`,
`client/locales/{en,pt-BR}.json` (`landing.menu.wiki`, `websiteWikiItems`).

**Verified**: `formatAffixRange` unit tests against the server rounding
(incl. ×2.25 and the flat magic-level band); full client suite 403/403;
tsc + lint clean; headless screenshots of the built Storybook
(`ItemsWikiPage` story at 1440/768, `LandingPage` story with the dropdown
closed and clicked open — the 768px pass caught a heading/tooltip overlap,
fixed by stacking the card below `lg`, and mid-range line wraps, fixed
with `whitespace-nowrap`). Storybook's `next/navigation` mock returns
`null` from `usePathname` (typed `string`), which crashed every
`PublicSiteLayout` story until `LandingWikiMenu` guarded the null.

**Residual risk**: the page hand-mirrors the `config.yml` rarity tuning
and goes stale if tuning changes — recorded in TODO.md (owner: rarity
system) with the recommended fix (public API endpoint or protocol move).

## 2026-08-05 — Public wiki: PvP page (/wiki/pvp) on the full-damage PvP stance

**Problem**: Nothing public told players that Mantus drops classic Tibia's
PvP formula (player-vs-player damage halved) or what the PvP design goal is.

**What changed**: Second entry in the landing-nav Wiki dropdown and a new
`/wiki/pvp` page with three sections: classic Tibia halves damage between
players and Mantus removes that rule entirely (full damage in PvP, same as
against monsters); the goal is PvP where 1v1s are genuinely worth fighting
and high-level characters actually feel — and are — strong; and vocation
damage/game balance will keep being tuned toward that. Localized en + pt-BR.
The claim was verified against `server/src/combat/DamageResolver.ts:179`,
where the Canary-parity halving exists but is deliberately disabled.

**Files**: `client/components/public-site/PvpWikiPage.tsx`,
`client/app/wiki/pvp/page.tsx`, `client/components/landing/LandingWikiMenu.tsx`
(links const), `client/stories/PvpWikiPage.stories.tsx`,
`client/locales/{en,pt-BR}.json` (`landing.menu.wiki.pvp`, `websiteWikiPvp`).

**Verified**: tsc + lint clean (same 20 pre-existing warnings); Storybook
built; headless screenshots of `PvpWikiPage` at 1440/420 and the landing
dropdown open showing Items + PvP. No residual risk — static editorial
content; if the halving stance ever changes in `DamageResolver`, update
this page with it.

## 2026-08-05 — Public guild directory (/guilds) + Tibia-style guild rosters, no login

**Problem**: The landing nav's Community → Guilds link was a placeholder
pointing at /play (the logged-in game), recorded in TODO.md as a provisional
Feature 110 destination. There was no public way to browse guilds or see a
guild's members and ranks, and the guild store had no public read methods at
all (its GuildService caches only cover guilds with online members).

**What changed**: Full public read path, modeled on tibia.com's guild pages
(list = name + description rows; guild page = info block + members table with
Name and Title | Vocation | Level | Joining Date | Status, each rank rendered
as a full-width section-header row above its members). Server: two new GuildStore reads — `loadDirectory()`
(alphabetical, member counts, LIMIT 500) and `loadPublicGuild(name)`
(case-insensitive normalized-name lookup; roster joins characters for
vocation/level and guild_ranks for rank names, selects the previously-unread
`guild_members.joined_at` and `guilds.created_at`, and excludes namelocked
characters like the public profile lookup) — implemented in PgGuildStore
(three new sql/ files) and MemoryGuildStore (which grew createdAt/joinedAt
and optional per-character vocation/level registration). PublicApi gained
`/api/public/guilds` and `/api/public/guilds/:name` (strict zod projections
in protocol `publicGuildsDataSchema` / `publicGuildProfileDataSchema`,
60 s DB-cache TTL, per-member online flags from the existing `isOnline`
session check, 404 on unknown names, 400 on malformed/oversized names, 503
without a store; no characterIds, balances, invites, or wars are exposed).
GameServer passes the already-present `deps.guild` into PublicApi. Client:
`/guilds` (GuildsPage: name + motd, member count, founded date) and
`/guilds/[name]` (GuildProfilePage: guild header with motd/founded/guild
level/members-online, rank-grouped roster with character-profile links,
nicks in parentheses, online dots), nav link switched to /guilds, en+pt-BR
`websiteGuilds` namespace, stories with a scoped fetch mock (guild endpoints
served from fixtures, all else passes through).

**Files**: `protocol/src/publicWebsite.ts`,
`server/src/guild/{GuildStore,PgGuildStore,MemoryGuildStore}.ts`,
`server/src/guild/sql/{guildDirectoryQuery,publicGuildRowByNameQuery,publicGuildMembersQuery}.ts`,
`server/src/{PublicApi,GameServer}.ts`, `server/src/PublicApi.test.ts`,
`server/src/guild/PgGuildStore.integration.test.ts`,
`client/components/public-site/{GuildsPage,GuildProfilePage}.tsx`,
`client/app/guilds/{page.tsx,[name]/page.tsx}`,
`client/components/landing/LandingNavigation.tsx`,
`client/stories/{GuildsPage,GuildProfilePage}.stories.tsx`,
`client/locales/{en,pt-BR}.json`, `TODO.md`, `todo/status.md`.

**Verified**: new PublicApi unit test (directory + roster shapes, normalized
lowercase lookup, online flags, 404, and a no-private-fields assertion on the
raw body); new Pg integration test for both queries passes against the local
DB (the 3 pre-existing guild-bank failures remain and are unrelated); full
suites green (server 1625 passed, client 403 passed); tsc clean in both
packages; lint 0 errors; headless Storybook screenshots of both pages at
desktop and 420px.

**Residual risk**: roster online flags are computed inside the 60 s cached
projection, so a member's online dot can lag up to a minute (same tradeoff
as the character profile endpoint). Guild emblems/logos don't exist anywhere
in the schema — the directory is text-only until an emblem system lands.

## 2026-08-05 — Rarity display: "Common" grade on equipment tooltips, uncommon recolored green

**Problem**: Ungraded equipment tooltips showed no rarity subtitle and no
header tint, so common gear read as a different kind of item rather than the
bottom grade of the same ladder; uncommon's grey (#a8adb5) barely read as a
grade at all.

**What changed**: New protocol enum `ITEM_DISPLAY_RARITIES` ("common" +
the four rollable grades) backs `itemTooltipSchema.rarity`; the rollable
`ITEM_RARITIES` (affix rolls, configs, GM /rare, market offers) is untouched.
`toItemTooltip` labels rarity-eligible gear (`isRarityEligible`) with no
rolled grade as "common" — instance and catalog-only calls alike, so market
browse/shop tooltips agree with inventory. Client: `--color-rarity-common`
takes the old grey, `--color-rarity-uncommon` becomes green (#7bb356, ARPG
convention between grey commons and gold rares); ItemTooltip gained the
common style row; AuctionRarityBadge explicitly skips "common" so market
rows only badge graded listings; en/pt-BR "Common"/"Comum"; the 13 plain
equipment Storybook fixtures now carry `rarity: "common"`. The /wiki/items
rarity guide gained a leading Common baseline card (Leather Armor example,
0 affixes, affix power "—"): RarityGuideCard now takes `ItemDisplayRarity`
with an optional valueMultiplier, while `WIKI_RARITY_GUIDE` stays
rolled-grades-only so the affix table keeps its four columns; both locales'
grade-section copy reworded (common no longer "carries no grade").

**Files**: `protocol/src/item.ts`, `server/src/item/toItemTooltip.ts`,
`server/src/item/toItemTooltip.test.ts`, `client/app/globals.css`,
`client/components/inventory/{ItemTooltip.tsx,tibiaTooltipItems.ts}`,
`client/components/auction/AuctionRarityBadge.tsx`,
`client/components/public-site/{ItemsWikiPage,RarityGuideCard}.tsx`,
`client/locales/{en,pt-BR}.json`.

**Verified**: toItemTooltip tests updated (eligible gear → "common",
non-gradable items still omit rarity) and passing alongside catalog,
bestiary, rarity, and market suites (55 tests); client unit suite 403
passed; tsc clean in protocol, server, and client.

**Residual risk**: none known — market unique-listing semantics key off the
market schema's rollable-grade field, not the tooltip, and were left as-is.

## 2026-08-05 — Inventory Stack & Sort buttons (whole-container server sweeps)

**Problem**: `InventoryPanel` shipped with Stack/Sort buttons as unwired
optional props (translations included) and `todo/status.md` listed container
sorting as a Canary-parity gap — no protocol message, server handler, or
client caller existed.

**What changed**: Two new client intents, `stack-container` and
`sort-container` (`{ type, containerId }`, strict, no client-authored
outcome), modeled on `quick-loot`. Server handles them in
`ItemIntentHandler` as whole-container sweeps of ordinary container moves:
each step re-reads the live inventory cache, plans one `planMoveToContainer`
op with full version guards, applies it in-memory and enqueues its own
persist — no new SQL or store methods. Stack repeatedly merges the earliest
partial stack that can absorb a later same-type stack
(`findContainerMergeStep`, honoring `canMergeItems` attribute equality and
per-type `maxCount`, partial merges included). Sort is a selection sort over
slots using a canonical server order (`compareContainerSortOrder`:
primaryType, name, count desc, id) that compacts gaps and reuses
swap/merge/plain-move semantics; already-tidy containers are silent no-ops,
a container not in the character's own cache errors. Client: `GameClient`
gained `stackContainer`/`sortContainer` senders; `InventoryPanel`'s
`onStack`/`onSort` props now receive the visible container's id (backpack or
drilled-into container) and the buttons hide without a live drop container;
`GameInventoryOverlays` wires both to the senders.

**Files**: `protocol/src/clientMessages.ts`, `server/src/item/ItemIntent.ts`,
`server/src/GameServer.ts`, `server/src/item/ItemIntentHandler.ts`,
`server/src/item/plan/{containerChildren,findContainerMergeStep,compareContainerSortOrder}.ts`,
`server/src/item/{ItemIntentSchemas,ItemIntentHandler}.test.ts`,
`client/lib/net/GameClient.ts`,
`client/components/inventory/InventoryPanel.tsx`,
`client/components/game-window/GameInventoryOverlays.tsx`.

**Verified**: new schema-bounds test (uuid required, no rider fields) and
three handler tests (partial+full stack consolidation to [100, 50] gold,
sort to contiguous slots + idempotent second sort sends nothing, foreign
container id rejected for both intents); server suite 1630 passed, client
unit suite 403 passed, tsc clean in protocol, server, client.

**Residual risk**: sort emits one `inventory-updated` per step (same shape
as quick-loot; bounded by container capacity). World/loot container windows
(`ContainerInventorySection`) intentionally have no Stack/Sort buttons —
carried containers only.

## 2026-08-06 — Exercise-weapon chooser: unclickable dropdown replaced by animated item art

**Problem**: on an exercise-weapon reward day the chooser could not be used at
all. Its `Dropdown` was rendered dimmed and inert: `components/ui/Dropdown.tsx`
puts `has-disabled:pointer-events-none has-disabled:opacity-45` on the `<label>`
wrapping the `<select>`, and the chooser passed a *disabled* placeholder option
("Select an exercise weapon"). A disabled `<option>` matches `:disabled`, so
`:has(:disabled)` killed pointer events on the whole control — the trap the
component's own comment warns about. The player also had to read names instead
of seeing the weapons.

**What changed**: the dropdown is gone. The chooser now shows the eight
server-projected weapons as a grid of `SpriteIcon` tiles, so each one renders
its real, animated item art (same phase cycling as in the world and inventory);
click selects, double-click claims outright, and the claim button stays disabled
until something is picked. Selection state is a plain `aria-pressed` toggle
button per tile, matching `ActionBarItemPicker`. No other `Dropdown` caller
passes a disabled option, so the shared component was left alone.

The pool is unchanged and still regular-tier only: `EXERCISE_WEAPON_POOL` is the
500-charge `canaryIds[1]` entry of every family (28552-28557, 44065, 50293) —
no durable/lasting tiers and none of the store-only epic/legendary ids
(60001-60008 / 60101-60108).

**Files**: `client/components/daily/ExerciseWeaponSelectionModal.tsx`.

**Verified**: client TypeScript and focused lint passed. Storybook build served
headless and driven with Playwright: opening `Game/DailyRewardsModal →
ExerciseWeaponDay` and clicking today's card renders 8 animated weapon tiles,
clicking one sets `aria-pressed="true"` and enables "Claim Weapon" — screenshot
confirmed the sprites and the selected-tile highlight.

**Residual risk**: none new. The claim path is untouched and the server still
re-validates pool membership, count, capacity, reach, and the daily gate.

## 2026-08-06 — Action bar/bot object buttons no longer blank out at carried count 0

**Problem**: assigning a health potion to an action button (or bot rule) looked
like it "vanished": the moment the character's carried count for the type hit 0
— e.g. the freshly enabled below-80%-health rule legitimately drinking the last
potion — the slot lost its sprite and the bot rule row degraded to "? Object
#266". Every renderer resolved the action's name and icon exclusively from the
live `InventoryState.carried` summary, which only contains types the character
currently owns, so a still-assigned action for an out-of-stock object had
nothing to draw. Real Tibia keeps the greyed object with a 0 count.

**What changed**: object actions now carry a server-derived `display`
(`name`/`clientId`/`spriteId`). `sanitizeActionBarAction` stamps it from the
item catalog on every bar/bot update (overwriting anything the client sent, so
nothing client-supplied is ever trusted or persisted), `withActionDisplay`
backfills it at login for rows persisted before the field existed, and
`createItemAction` seeds it optimistically client-side. Renderers fall back to
the stored display when the type is absent from the carried summary: the HUD
slot keeps its sprite greyed out with a 0 badge, and the bot rule row keeps the
item's icon and name.

**Files**: `protocol/src/actionBar.ts`, `server/src/sanitizeActionBarAction.ts`,
`server/src/character/withActionDisplay.ts` (new), `server/src/CharacterHandler.ts`,
`client/lib/action-bar/createItemAction.ts`,
`client/lib/action-bar/getActionBarActionName.ts`,
`client/lib/action-bar/getActionBarActionArtwork.ts` (new — the icon
fallback as a pure rule so it stays unit-testable),
`client/components/action-bar/ActionBarActionIcon.tsx`,
`client/components/GameHud.tsx`, plus tests
(`server/src/sanitizeActionBarAction.test.ts`,
`server/src/character/withActionDisplay.test.ts`,
`client/lib/action-bar/getActionBarActionName.test.ts`,
`client/lib/action-bar/getActionBarActionArtwork.test.ts`, updated
`ActionBarHandler`/`ActionBotHandler`/`createActionBotAction` tests).

**Verified**: full server unit suite (241 files) and client unit suite (92
files) pass; server and client typechecks clean apart from unrelated in-flight
huntingBot WIP; focused eslint clean.

**Residual risk**: actions saved before this fix only gain a display after the
next login (the `withActionDisplay` backfill) or the next bar/bot edit; until
then an out-of-stock object still shows the "Object #N" fallback. Types
removed from the catalog keep rendering their last stored display, which is the
desired behaviour.

## 2026-08-06 — Feature 111 follow-up: hunts generated from the world's own spawn data

**Problem**: the Hunt Finder shipped RubinOT's 132 hand-written guides, so a
region got as many hunts as that guide happened to document. Darashia is the
clearest case: one "Darashia Rotworm Caves" entry, while the map holds six
separate rotworm cave systems around the city. Every uncovered cave is a hunt
the finder cannot show and the hunting bot cannot be seeded with, and no amount
of hand-copying scales to a map with thousands of spawn clusters.

**What changed**: `tools/buildHuntingPlaces.mjs` (`yarn hunts:build`) writes
hunts from data the repo already owns. `content/spawns/world-spawns.json` says
where creatures stand, `server/data/otservbr.map.bin` says which tiles a
character may walk, and clustering the first against the second finds the caves:

- `clusterSpawnGroups.mjs` unions spawns within 12 tiles on a floor and merges
  vertically overlapping groups, so one cave dug through three floors is one
  hunt rather than three.
- A cave already covered by a hand-written route is skipped, matched on both
  geometry *and* creatures — a minotaur route two floors above a worm cave
  shares coordinates without sharing a hunt.
- Per floor, spawn homes snap to walkable tiles, the biggest shared cavern is
  flood-filled, anchors are thinned to 6 tiles apart, and `orderHuntRing.mjs`
  (nearest-neighbour then 2-opt over *walked* distances) closes the loop. Every
  leg is then re-proved solvable under the bot's own runtime budget
  (`pathSearchMargin` 40, `maxRuntimeVisited` 4000) by `findWalkPath.mjs`,
  which mirrors `findRoutePath`'s step rules; a leg that fails is split at
  tiles cut from the generous path, and an oversized ring is dropped whole
  rather than truncated with an unproven closing leg.
- `WayPath` is traced backwards from the ring through the map's own ladders,
  holes, ropes and floor-change transitions, and a cave whose way down does not
  actually open into the ring is rejected outright.
- Creatures, resistances and valuable drops come from the monster and item
  catalogs, counted only for spawns sharing the walked cavern. Level, xp/hour,
  supplies, imbuements and equipment are inherited from the hand-written hunt
  with the closest creature match, with a difficulty floor from a level-vs-xp
  curve fitted over the curated catalog — a shared wall can otherwise put a
  4800-xp creature on a "level 8" patrol.

Entries carry `"Generated": true`; hand-written ones always win a rerun, and
the catalog is rewritten by splicing curated entries in byte for byte, so a
rerun diffs as the hunts it changed. The Hunt Finder card and detail header
show an "Estimated" badge, since the route is real geometry but the hourly
figures are inherited.

First batch: the three uncovered Darashia rotworm cave systems (North,
NorthEast, NorthWest — 74, 73 and 55 spawns), 135 hunts total.

**Files**: `tools/buildHuntingPlaces.mjs`, `tools/clusterSpawnGroups.mjs`,
`tools/orderHuntRing.mjs`, `tools/findWalkPath.mjs`,
`tools/readMapGeometry.mjs` (+ three `.test.mjs`),
`client/public/assets/hunting/hunting_places.json`,
`client/lib/hunt-finder/{HuntingPlace.ts,parseHuntingPlaces.ts}`,
`client/components/hunt-finder/{HuntingPlaceCard,HuntingPlaceDetails}.tsx`,
client locales, `server/src/huntingBot/generatedHuntRoutes.test.ts`,
`server/src/playtest/scenarios/generatedHuntRoute.ts`, root and server
`package.json`.

**Verified**: `server/src/huntingBot/generatedHuntRoutes.test.ts` walks every
generated ring through the *server's* `findRoutePath` over the real map — 22
checks, all green — and was proved able to fail by moving one waypoint 500
tiles (2 failures, restored). `yarn test:tools` (13 new tool tests), client
hunt-finder/hunting-bot suites, and `yarn typecheck` are clean. End to end,
`yarn workspace server playtest:generated-hunt` seeded the bot with "Darashia
Rotworm Cave North" exactly as the Hunt Finder does: it armed on the generated
ring, walked 37 single-tile steps, advanced a waypoint and engaged 10 rotworms
in a cave that had no hunt at all before.

**Residual risk**: xp/hour and loot/hour on generated hunts are inherited, not
measured (TODO.md). Only the Darashia rotworm batch is generated so far; the
rest of the world's uncovered caves wait on `TARGETS` (TODO.md). Arming inside
a freshly spawned, crowded cave can be refused with "out of range" when
creatures block the joining walk (TODO.md).

## 2026-08-06 — NPCs and monsters permanently deleted by a dormant "blockpath" tile

**Problem**: reported as "the Asima NPC in Darashia is sometimes not spawned",
the same symptom that was blamed on the client's atlas discard on 2026-08-03.
That client fix was real, but a second, purely server-side fault was still
live: once it hit, the NPC was gone for the whole life of the process, so a
player only ever saw an empty shop.

`SpawnManager.trySpawn` gated a spawn on `world.isPathable(position)`, while
creature movement gates on `world.isWalkable(position)`. The two disagree on
"blockpath" tiles — walkable ground a table, counter or stone pile makes
unpathable (`appearance.flags.notPathable` → `blocksPath` in the converter,
Canary's `TILESTATE_BLOCKPATH`). Asima's home is 33220,32403,7; the counter
tile one step west, 33219,32403,7 (items 2434 + 2816), is `walkable=true,
pathable=false`. Her idle walk (radius 1) may step onto it — but when the last
player left the area and the slot went dormant *there*, the restore kept
retrying that one tile every `retryMs` forever: `slot.dormantCreature.position`
never resets, so she never came back.

Systemic, not one NPC: over the world spawn file, **8,275 of 83,576 enabled
slots (9.9 %), 168 of them NPCs**, have a blockpath tile inside their wander
box and could be deleted this way, and **79 slots could never spawn at all**
because their home tile is blockpath (lion warlock, several dragon lords, fire
elementals).

**Canary** (a879c93): `Map::placeCreature` calls
`tile->queryAdd(0, creature, 1, FLAG_IGNOREBLOCKITEM | FLAG_IGNOREFIELDDAMAGE)`
— no `FLAG_PATHFINDING`, so blockpath never blocks a placement (tile.cpp:741
only refuses it *with* that flag), and it then falls back to a shuffled ring of
neighbours. `SpawnNpc::spawnNpc` always places at the slot's own `sb.pos` and
passes `forced=true`; Canary never remembers where a creature was standing.

**What changed**: `SpawnManager.trySpawn` now asks `spawnPositionFor(slot)`,
which prefers the dormant creature's own tile and falls back to the slot home,
each checked by `canPlaceAt` = tile exists + `isWalkable` + not occupied
(Canary's placement gate). The chosen tile is applied with `creature.moveTo`
before `world.addCreature`. `gridMapData` gained a `blocksPath` list so the
fixture map can model those tiles.

**Files**: `server/src/spawn/SpawnManager.ts`,
`server/src/spawn/SpawnManager.test.ts`, `server/src/gridMapData.ts`,
`server/src/playtest/scenarios/npcSpawnCycle.ts` (new), `server/package.json`.

**Verified**: three new SpawnManager cases — restore from a dormant blockpath
tile, fall back to home when that tile is taken, and spawn on a blockpath home
tile — all three proved able to fail by restoring the old `isPathable` gate (3
failures, then 15/15 green). End to end, the new `yarn workspace server
playtest:npc-spawn` drives the real server over the real map through eight
phases (first approach, 10 dormancy cycles, 10 instant cycles, standing on her
home tile, 3 relogins, a floor round trip, two clients, and a 60 s idle watch),
replaying the client's own creature model to decide whether she is on screen,
and greeting her ("hi" ignores the client's known-creature set) to tell a spawn
fault from a visibility fault. Before the fix it failed every phase after the
first with "SPAWN FAULT: she is not in the world"; after it, all eight pass.
Full server suite (1660) and `yarn typecheck` clean.

**Residual risk**: a running production server still has whatever creatures it
already stranded — they come back on the next restart. NPCs idling *onto*
tables at all is still a parity gap (Canary's `Npc::canWalkTo` refuses tiles
with `hasHeight(1)`); recorded in TODO.md.


## 2026-08-06 — Feature 111 follow-up: a city's caves are one hunt with pickable entrances

**Problem**: the first generated batch shipped Darashia's three uncovered
rotworm caves as three cards, so the Hunt Finder listed four near-identical
"Darashia Rotworm ..." tiles with the same creatures, level, gear and drops.
The catalog is browsed by hunt, not by cave; four cards for one hunt is noise.

**What changed**: caves gather onto the hunt that describes them. A hunting
place may now carry `SpotName` (what to call its own cave), `SpotPosition`
(where that cave is entered) and `Spots` — the other caves, each with its own
entrance and route. `huntingSpots` normalises any entry into a list of caves,
own cave first, so a hunt with a single cave needs no special case anywhere.

Picking a multi-cave hunt now asks *which* cave on a map of every entrance:
`HuntSpotMap` draws the surface around them, pins each entrance with its name
and a tooltip carrying the walk-to coordinates, and clicking one opens that
cave's waypoints in the route editor. Saved routes name the cave they came
from (`Darashia Rotworm Caves · North Cave`), which `parseHuntRouteName` reads
back so reopening the window lands on the same cave; a route saved before this
existed still matches its hunt.

Entrances are traced to the surface rather than left underground: the
generator walks its descent chain up through the map's ladders, holes and
ropes and pins the tile on open ground, so the picker shows where a player
starts walking rather than a tile inside the rock two floors down. The map
fills its container and reserves pixel room at the edges so a pin's name is
never clipped.

**Files**: `tools/buildHuntingPlaces.mjs`,
`client/public/assets/hunting/hunting_places.json`,
`content/source-manifest.json`,
`client/lib/hunt-finder/{HuntingPlace.ts,parseHuntingPlaces.ts,huntingSpots.ts,
spotMapView.ts}`, `client/lib/hunting-bot/{guideRouteFor,huntRouteName,
parseHuntRouteName}.ts`, `client/components/hunt-finder/{HuntSpotMap.tsx,
HuntingPlaceDetails.tsx}`, `client/components/hunting-bot/{HuntingBotModal,
HuntingBotRouteEditor}.tsx`, client locales, plus tests
(`huntingSpots.test.ts`, `spotMapView.test.ts`, `huntRouteName.test.ts`,
`HuntingBotModal.stories.tsx` ChooseCave, updated
`server/src/huntingBot/generatedHuntRoutes.test.ts` and the
`generatedHuntRoute` playtest, which now address caves by name).

**Verified**: the Darashia catalog collapsed from 4 cards to 1 with 4 caves
(`NorthWest`, `North`, `NorthEast`, `Far NorthWest`), every entrance on floor
7. The server gate re-walks all 3 generated rings *and* their entrances
through `findRoutePath` (25 checks). A headless-Chromium Storybook run drives
the whole flow — search → one card → pin → editor titled "Darashia Rotworm
Caves · North Cave" with the matching saved route — and a screenshot of that
step confirmed the map fills the panel with every pin labelled. Client unit
(28 hunt tests), `yarn test:tools`, and `yarn typecheck` clean.

**Residual risk**: cave names are compass-derived ("Far NorthWest Cave"), not
what players call them. The picker shows every cave of a hunt at once, so a
hunt gathering a dozen caves would crowd its labels — none does today.


## 2026-08-06 — Feature 112 follow-up: the route map shows one hunt, not the whole floor

**Problem**: a cave floor on the baked minimap is a warren of unrelated caves
that all look alike, so the route being edited was lost among a dozen
neighbours — most of the map was ground the hunt never touches.

**What changed**: `maskOutsideRoute` lights only what the route reaches. The
lit shape is a round-capped stroke along the waypoint ring (closing leg
included) plus a disc on the character, drawn 14 tiles wide; everything else
becomes the automap's own unexplored black. It runs after the map is drawn and
changes no state, so panning, zooming and dragging behave exactly as before —
and because the shape follows the waypoints, a waypoint being dragged carries
its lit ground with it and editing never happens blind.

The hunting-bot editor isolates by default behind an "Isolate hunt" checkbox,
and the Hunt Finder isolates its "Hunt route" view while leaving "How to get
there" as the wide-context map it needs to be.

The lit shape is composited once from an off-screen stencil: `destination-in`
clips to whatever it is handed, so drawing the ring and then the character's
disc straight onto the map erased the ring instead of joining it — which is
exactly what the first attempt did, leaving a lone circle of cave.

**Files**: `client/lib/minimap/maskOutsideRoute.ts` (new),
`client/components/hunting-bot/{HuntingBotRouteMap,HuntingBotRouteEditor}.tsx`,
`client/components/hunt-finder/{HuntRouteMap,HuntingPlaceDetails}.tsx`, client
locales, `client/stories/HuntingBotModal.stories.tsx` (IsolatedRoute).

**Verified**: a headless-Chromium story reads the map canvas back and asserts
that unchecking the box more than triples the lit pixels; screenshots of both
states confirmed the isolated view shows the cave and its numbered ring on
black. Client unit suite (409), `yarn typecheck` clean.

**Residual risk**: isolation is geometric, not a cave flood fill — the client
has only baked colour tiles, no walkability — so a neighbouring cave within 14
tiles of the ring stays partly lit.


## 2026-08-06 — Astral sources explain themselves: item cards on the imbuing window

**Problem**: the imbuing window lists the astral sources an imbuement needs,
but hovering one showed nothing beyond a browser `title` with its name — no
weight, no gold value, no description, while every other item in the client
(inventory, bestiary loot, market, auctions) opens a proper card on hover.

**What changed**: `ImbuementMaterial` now carries the same server-authored
`tooltip` the inventory sends. `buildImbuementOptions` fills it from
`toItemTooltip(itemType)` — type-level only, since an astral source is a stack
the player may not own yet, so there is no instance to project; the field stays
optional and is omitted for the `name: "unknown"` case where the item catalog
has no such type (the `title` fallback survives for that). The material box
renders `ItemTooltip` through a portal on hover and on keyboard focus, with the
stash share of what is held spelled out on a chip below the card, so the hint
that used to live in `title` is not lost.

Placement differs from the inventory's cards on purpose: those sit in a narrow
right-hand panel and open to their left, which inside the shrine's max-w-6xl
dialog dropped the card on top of the very sources it describes. Here it is
centred on the hovered box and anchored by its *bottom* edge whenever the row
sits in the lower half of the screen — where the apply panel always is — so a
card of any height clears the row without being measured first, and flips
below only when the panel is near the top of a short viewport.

**Files**: `protocol/src/imbuements.ts`,
`server/src/imbuement/buildImbuementOptions.ts`,
`client/components/imbuement/ImbuementMaterialBox.tsx`, client locales (en,
pt-BR: `imbuement.materialStashShare`), `client/stories/forgeFixtures.ts`,
`client/stories/ImbuementModal.stories.tsx` (MaterialTooltip).

**Verified**: a headless-Chromium story hovers the intricate tier's bloody
pincers, asserts the card and the "4 of these come from your stash." line
appear and that both vanish on unhover; a screenshot confirmed the card clears
the source row. Server imbuement suite (18) and client unit suite (425) pass,
`yarn typecheck` clean.

**Residual risk**: the window now carries one card per material row (144 rows
across the whole pinned catalog, ~20 KB) instead of a name. It is sent on
open/apply/clear only, so no tick cost — but if the catalog grows much larger
this is the field to dedupe by item type.


## 2026-08-06 — Feature 112 follow-up: a cave's floors are one route

**Problem**: a generated cave describes a ring on each floor it occupies, but
seeding took one floor only. The editor offered floor 8 and floor 9 buttons
while floor 9 was empty, so half of every multi-floor cave was invisible and
unhuntable — and the hand-written guides (49 of 131 cover several floors) had
the same hole.

**What changed**: `guideRouteFor` seeds every floor the cave describes, one
floor's ring after another, with the character's own floor leading so arming
joins the nearest one. The bot then walks the ring belonging to the floor the
character is standing on and steps over the rest in the same tick
(`nextIndexOnFloor`), rather than burning its skip budget on waypoints it can
never path to and stopping with "unreachable". Climb a ladder yourself and the
ring below takes over; a floor the route never visits still stops the bot
exactly as before.

The editor's waypoint list dims the rows belonging to floors the map is not
showing, and the isolation mask already worked per floor, so each floor draws
its own lit cave.

**Files**: `server/src/huntingBot/HuntingBot.ts`,
`client/lib/hunting-bot/guideRouteFor.ts`,
`client/components/hunting-bot/{HuntingBotWaypointList,HuntingBotRouteEditor}.tsx`,
plus tests (`HuntingBot.test.ts` ×3, `guideRouteFor.test.ts` new,
`HuntingBotModal.stories.tsx` ChooseCave) and the `generatedHuntRoute`
playtest, which now seeds all floors and dives to the lower one mid-run.

**Verified**: seeding the Far NorthWest cave yields 7 waypoints on floor 8 and
23 on floor 9 (was 7 and none); screenshots of both floors show each ring
drawn, numbered and isolated. Server unit tests cover walking the standing
floor, picking up the other ring after a floor change, and still stopping on a
floor the route never visits. End to end, `playtest:generated-hunt` armed on
floor 8, then `/goto` to floor 9 mid-hunt and the bot kept hunting there
instead of giving up. `yarn typecheck` and the client/server suites are clean.

**Residual risk**: the bot still cannot use the ladder between the rings — the
player makes the climb (TODO.md, Feature 112).

## 2026-08-06 — Action bot: area spells wait for a crowd

**Problem**: an action bot rule fired its spell the moment the trigger held,
so an area spell (exori, the waves, avalanche runes) burned its mana and
cooldown on a single monster — or on nothing at all when the attack target
stood outside the area. There was no way to say "only exori when three of
them are on me".

**What changed**: a rule may now carry `monstersAround` — a comparison
(`at-least` / `at-most` / `exactly`) and a count up to 12. The bot counts the
monsters the action's own combat area covers, live, every tick: the spell (or
the rune's spell), its wheel-augmented area, the aim direction the cast would
use, and `creaturesInArea` — the same resolution the real cast performs — then
filters to living monsters this session already knows about and excludes the
player's own summons. Nothing about the count comes from the client. An
action with no area of its own falls back to the eight surrounding tiles.

The setting shows in the rule row only for area actions, which the client
recognises from the new `areaShape` field on the spell catalog entry. Picking
a single-target action drops the setting rather than leaving a hidden gate;
picking an area action seeds it at "at least 1". The Action Bar modal moved
from `wide` to `full` (up to 1920px, like the Hunt Finder and Store) and the
rule grid from 12 to 16 columns to seat the new column.

**Files**: `protocol/src/{actionBar,combat}.ts`,
`server/src/combat/{ActionBot,Combat,SpellRegistry}.ts`,
`client/components/action-bar/{ActionBotRuleRow,ActionBotSettingsPanel,ActionBarModal}.tsx`,
`client/lib/action-bar/getActionBotAreaSpell.ts` (new), both locales, plus
the story/test catalog literals that gained `areaShape`.

**Verified**: a new `Combat.test.ts` case arms an exori rule at "at least 3",
ticks with two monsters adjacent (no cast, bystander untouched), adds a third
(both bystanders take damage), then flips the rule to "at most 1" and ticks
again with the same crowd (no further cast). `yarn typecheck`, the client
suite (428) and the action-bot server suites (119) are clean; the new
`grid-cols-16` / `col-start-15` utilities were compiled against Tailwind 4.3
to confirm they generate.

**Residual risk**: the count is taken when the bot evaluates the rule, and the
cast happens in the same tick, so it cannot drift — but a monster that walks
out between two ticks simply means the next evaluation sees the smaller crowd,
as intended.


## 2026-08-06 — Feature 111: the whole map's hunting grounds, generated

**Problem**: the generator proved itself on Darashia's rotworm caves, but the
rest of the map still had only what the 132 hand-copied guides happened to
document. Measured against the world's own spawn data, that is a fraction of
it: 846 spawn populations of 20 creatures or more exist, and most had no Hunt
Finder entry and nothing for the hunting bot to walk.

**What changed**: `yarn hunts:build --world` sweeps the whole map. Everything
the batch mode did per region now runs over every huntable population —
hostile, worth at least 15 experience — with the pieces that only mattered at
scale added:

- **Clustering scales.** A spatial hash replaces the pairwise scan (80k
  spawns), and floors merge only when the smaller footprint is half covered by
  the larger. The old "touching is enough" rule chained cave into cave across
  whole continents — one "cluster" held 14,929 spawns. A field still too wide
  to patrol (over 140 tiles) is diced into hunt-sized pieces.
- **Hunts, not clusters.** Caves are grouped by the town they are hunted from
  and the creature that dominates them, then named after the creature the
  route actually meets — a cluster spanning two caverns must not advertise a
  creature its ring never passes. Tutorial-island temples are excluded from
  the naming.
- **Caves gather.** A cave whose ground a hand-written route already walks
  joins that hunt as a spot; otherwise the biggest cave of a group hosts the
  rest, up to six per hunt. A route index (32-tile buckets, grown as caves are
  added) answers "is this ground already hunted?" without walking hundreds of
  routes, which also lets the hand-listed batches run before the sweep without
  either pass generating the same cave twice.
- **Difficulty for creatures no guide covers.** When nothing in the catalog
  fights this cave's creatures, the hunt of the closest difficulty lends its
  gear, supplies and imbuements, and the level comes from the curve fitted
  over the curated catalog.
- **Surface hunts and untraceable entrances ship.** Demanding a traced way
  down dropped every open-ground hunting spot, and 94 more caves are entered
  through something the tracer cannot follow; those keep their ring and pin
  the entrance on the ring itself.
- **The catalog stays fetchable.** Routes are written one line each, so the
  file holding 320 hunts is 2.7 MB (229 KB gzipped) rather than the ~17 MB a
  pretty-printed sweep would have produced. The parser's catalog cap moved to
  2,000 entries.

Result: **317 hunts — 132 hand-written and 185 generated — over 28 regions,
310 caves in all, with 21 hand-written hunts gaining caves they never
described.** The catalog is 2.7 MB, 226 KB over the wire.

**Files**: `tools/buildHuntingPlaces.mjs`, `tools/clusterSpawnGroups.mjs`
(+ tests), `tools/readMapGeometry.mjs` (protection zones),
`client/public/assets/hunting/hunting_places.json`,
`content/source-manifest.json`,
`client/lib/hunt-finder/parseHuntingPlaces.ts`.

Two faults the sweep exposed, both fixed:

- The ring builder shipped legs it could not repair. `legFillers` returned an
  empty list both for "already fine" and for "cannot be fixed", so nine rings
  went out with a leg the walker fails at. It now returns null for the second
  case and the ring drops that anchor — including, if need be, from the
  closing leg.
- Waypoints sat on spawn tiles, which is exactly where a creature that never
  moves stands forever. Anchors now prefer a walkable tile that is nobody's
  home, and the bot skips a waypoint occupied by a creature at once instead
  of waiting five repaths for a tile that will never clear.

**Verified**: the server gate re-walks every generated ring and entrance
through the real `findRoutePath` — 2,206 checks green, 4 s — and it is what
caught the nine broken rings. Live, `playtest:generated-hunt` armed and hunted
brand-new hunts outside Darashia (Kazordoon dwarf guards: 112 steps, 5
waypoints, 9 targets, and the floor change). Client unit suites, browser
stories, `yarn test:tools` and `yarn typecheck` clean.

**Residual risk**: ~140 caves are still dropped because the way in traced to
somewhere the ring cannot be reached from, and a few more have no walkable
ring at all. Hunts inside quest-locked or instanced areas cannot be told apart from
ordinary ones by spawn data, so a few may be unreachable in practice — they
are marked "Estimated" like every generated hunt. Levels and hourly figures
remain inherited estimates.


## 2026-08-06 — Feature 112 follow-up: the hunt probe tells a death from a bad route

**Problem**: `playtest:generated-hunt` reported "the server stopped the bot on
this route: unreachable" for a crystal-golem cave. The route was fine — the
probe character, level 200 with no equipment, had been killed and respawned at
Thais temple, floors away from its ring, where of course nothing was
reachable. A probe that blames the content for its own death is worse than no
probe.

**What changed**: the scenario watches its own health, and on death says so
and stops judging the route rather than failing it. The teleport back to the
temple is no longer counted as a walking step, and the run ends without
waiting for a stop the server has already performed. `PLAYTEST_LEVEL` sets the
probe's level, and `PLAYTEST_DEBUG=1` prints the status and movement trace
that made this diagnosable in the first place.

**Files**: `server/src/playtest/scenarios/generatedHuntRoute.ts`.

**Verified**: the crystal-golem hunt now reports "the probe died in this hunt
(level 200, no equipment) — route not judged" and exits clean; hunts the probe
survives still assert every step, waypoint and target as before.

**Residual risk**: hunts above the probe's survivable tier are checked
statically only — every leg through the server's pathfinder — never walked.

## 2026-08-06 — Auto-loot becomes a pick-up list, per rarity, with tooltips and a drop browser

**Problem**: the loot filter was a blacklist — "sweep everything except
these" — which is backwards for how players hunt: you know the handful of
things worth carrying, not the hundreds worth leaving. It could not tell a
legendary dragon slayer from a common one, its tiles were bare sprites with no
stats to judge them by, and the only way to list a drop was to already know
its name.

**What changed**:

- `lootFilterSchema` now carries `pickupRules`: one rule per item type, with
  an optional set of rarity grades. Absent grades means the whole type, which
  is the only reading for items that never roll one. The server sweeps only
  what a rule names, and reads each drop's grade off the live item
  (`itemDisplayRarityOf`), never off the request; `lootFilterTakes` is the
  single predicate, and a grade list on a type that cannot roll one is
  stripped at save time so it can only ever narrow the sweep.
- `075_character_loot_pickup_filter.sql` resets every stored filter to the
  disabled default (a blacklist cannot be honestly inverted) and raises the
  column cap to 32 KB. A regression test pins the worst legal list under the
  16 KB transport cap.
- `loot-filter-items` now sends a server-composed `tooltip` per type, and the
  generated `creature-loot-items.json` carries one for all 1,511 creature
  drops — built by `server/scripts/buildCreatureLootCatalog.ts` under tsx so
  the tooltips are `toItemTooltip`'s, not a second implementation of them.
  A tooltip with a rarity on it is also how the client knows a type can roll
  a grade, so the search pane draws five cells for it and one for everything
  else.
- The window: hover tooltips on every cell (`useItemTooltipAnchor` +
  `ItemTooltipPortal`, now shared with `BestiaryLootItem` and `ItemSlot`),
  grade-coloured tiles, a "pick up list" pane, and a full-width creature-drop
  browser that reuses the bestiary's own creature entries and monster
  request — same server-composed drop tables, no new protocol. The browser
  shows one thing at a time: a wall of creatures, or one creature's drops
  behind a back button, and a new search drops out of whatever was open.
- The two panes answer different questions, so the listing has two shapes.
  `carried` is what the character actually holds, split by the grade each
  stack rolled — a legendary sword in the bag draws as a legendary sword, not
  as five hypothetical grades of "sword". `types` is one ungraded entry per
  type carried or listed, and that is what the search pane expands into grade
  cells and what the pick-up list reads its names from.
- Rarity now tints items everywhere, not just here: `ITEM_RARITY_STYLES` is
  shared, and any slot holding gear above common gets a ring and a soft inner
  glow — inventory, equipment, trade offers. "Common" is deliberately
  untinted, since every ordinary sword and helmet reads as one, and the grade
  is never spelled out on the cell: the ring colour carries it, the tooltip
  names it, and the accessible label says it in full.
- One component draws every item in the game now. `ItemCell` owns the frame,
  sprite, stack badge, rarity ring and hover tooltip; `ItemSlot` (inventory,
  equipment, trade), `BestiaryLootItem` and `LootFilterItemTile` are thin
  wrappers over it that supply what a click means and their own drag
  handlers. The bestiary keeps its own ring colours through one documented
  override — it grades drops by drop chance, not by item rarity.

**Files**: `protocol/src/lootFilter.ts`; `server/src/LootFilterHandler.ts`,
`server/src/item/{lootFilterTakes,itemDisplayRarityOf,ItemIntentHandler}.ts`,
`server/src/character/parseLootFilter.ts`, `server/src/CharacterHandler.ts`,
`server/db/migrations/075_character_loot_pickup_filter.sql`,
`server/scripts/buildCreatureLootCatalog.ts` (replacing
`tools/buildCreatureLootCatalog.mjs`),
`server/src/playtest/scenarios/rarityAffixes.ts`;
`client/components/loot-filter/*`, `client/lib/loot-filter/*`,
`client/lib/items/itemRarityStyles.ts`,
`client/hooks/useItemTooltipAnchor.ts`,
`client/components/inventory/{ItemCell,ItemTooltipPortal,ItemSlot}.tsx`,
`client/components/bestiary/BestiaryLootItem.tsx`,
`client/components/game-window/{GameLootFilterOverlay,GameHudOverlay}.tsx`,
store/state/message files, both locale files, and the window's stories.

**Verified**: server suite (3,816 tests) and client unit suite (441) green,
including new cases for grade-scoped sweeps — a `rarities: ["rare"]` rule
takes the rare axe off a corpse and leaves the epic and the ungraded one —
and for the toggle algebra (carving one grade out of a whole type, collapsing
five back into one, the entry cap). Eight browser stories drive the real
window: picking one grade of an item, removing a listed type, adding a drop
straight out of a creature's table, coming back out of a drop table, clearing
the creature search, and the carried pane showing a legendary axe and a
common one side by side rather than five grade cells. `yarn typecheck`, `yarn test:tools`
and prettier clean; the rebuilt asset resolves the same 1,511 items as before.

**Residual risk**: stored filters are reset by the migration, the creature
browser lists a whole type rather than a grade, and the search pane caps at 60
item types per query — all recorded in `TODO.md`.

## 2026-08-07 — Ground food, water that destroys, and blueberry bushes

**Problem**: three map interactions existed only in fragments. Eating worked
solely on carried items (`use-item` resolves against the carried cache; the
position-based `use-map` had no food branch, so clicking a ham on the floor
did nothing). Trashholder destruction was fully implemented in the plan layer
but could never fire on the live map: the void-ocean fix (2026-07-20) keeps
liquid grounds out of every server-visible surface, so thrown items simply
piled up on the ocean — and the effect was always the generic poff rather
than water's blue rings. Blueberry bushes were baked draw-only scenery.

**What changed**:

- **Eat from the ground** — new `food` world-action kind: `resolveWorldAction`
  maps a tile item with `type.food` to it (scripted placements fail closed),
  the shared requirements table gives it adjacency/stale-item/house/busy
  checks, and `planEatMapItem` consumes one unit atomically (stack shrinks in
  place; the last unit removes the item; a fully eaten pristine seed writes
  no row — the in-memory removal hides the seed for this uptime and a reboot
  restores the map placement, Canary's own restart semantics). Satiation
  (`canFeed`/1,200 s cap) and the "Munch." message mirror the carried path;
  the existing client use-map + auto-walk-adjacent flow needed no changes.
- **Water destroys thrown items** — the OTBM converter now emits every
  static trashholder (water/lava/tar/swamp grounds, dustbins) as a new
  classification-3 entry in `items.bin` (2,212,433 entries, +20 MB); they are
  *not* MapItems (no tile-states bloat, no double-render, no void-ocean
  regression — regions/navigation bins byte-identical on conversion) but
  surface through `MapData.getTrashholderTypeId` → `World.trashholderTypeAt`
  → the planners' `trashholderTypeAt()` check. `planDrop`/`planMoveMapItem`
  now destroy onto these tiles, and the effect comes from the trashholder's
  own items.xml `effect` (new catalog field `trashEffectId`: water=2 blue
  rings, lava=16 fire, swamp=9 green rings, tar=3 poff; dustbins keep the
  generic poff — a deliberate feedback deviation from Canary's silence).
  Pristine map items thrown into trash are now destroyed too (previously
  they were placed on the trash tile) with the same no-row seed semantics.
- **Blueberry bushes** — new `harvest` world-action kind driven by
  `HARVEST_DEFINITIONS` (3699 → depleted 3700 + 3 blueberries dropped on the
  tile, Canary's blueberry_bush.lua). `planHarvestMapItem` transforms the
  bush and inserts the audited (`creation`/`harvest`) fruit row in one plan;
  regrowth is the depleted type's existing catalog decay (300 s → 3699)
  through the world decay runner. 3699/3700 joined `MUTABLE_ITEM_IDS`, so
  the map's 703 bushes are now server-owned; blueberries are food, so the
  new ground-eat action covers eating them straight off the bush tile.

**Files**: `server/src/action/{WorldAction,resolveWorldAction,
worldActionPreconditions,WorldActionRegistry,handleFoodEat,handleHarvestUse,
harvestDefinitions}.ts`, `server/src/item/plan/{planEatMapItem,
planHarvestMapItem,isTrashholderTile,planDrop,planTrashDrop,planMoveMapItem,
WorldItemsView}.ts`, `server/src/item/{ItemType,CarriedPersistPlan}.ts`,
`server/src/{loadMapItems,loadMapData,MapData,World,gridMapData}.ts`,
`server/src/world/overrideMapData.ts`, `tools/{convertOtbm,
getMapItemSemantics,parseCanaryItemSemantics,buildItemCatalog}.mjs`;
regenerated `content/canary-item-semantics.json`,
`server/data/{item-catalog.json,otservbr.items.bin,otservbr.map.json}` and
the region/minimap tiles that lost their baked bushes.

**Verified**: server suite green (3,826 passed); new regression tests cover
eating an adjacent ground stack (row shrinks), the last-unit removal (no row,
seed stays hidden on re-use), the satiation refusal, out-of-reach rejection,
drop-into-static-water destruction with effect 2 reaching the session,
pristine-throw-into-water leaving zero rows, bush picking (fruit + depleted
bush in one plan and both rows persisted), the depleted bush resolving to
nothing, and scripted bushes failing closed. Real-map smoke: ocean tile
(33871,31489,1) reports trashholder 622 with zero map items; bush tile
(32141,32173,3) serves MapItem 3699 with no trashholder.

**Residual risk**: harvest yields never merge into an existing same-type
stack on the tile (a full 16-slot tile fails the pick); the client context
menu still labels ground food with the generic "Use" rather than "Eat";
dustbins poff where Canary is silent (deliberate).

## 2026-08-07 — Sickle, fire bug, and waking the dormant harvests

**Problem**: scythe/machete/pick harvest handlers shipped earlier but were
dormant on the real map — none of their targets (wheat, sugar cane, reed,
jungle grass, diggable earth) were in `MUTABLE_ITEM_IDS`, so the server owned
no map item to cut (the same data-dormancy trap the water trashholders had).
The sickle did not exist at all, and sugar cane could never reach its
harvestable stage because nothing could ignite the standing field.

**What changed**: added the sickle (3293, `handleSickleUse`: ripe cane 5463 →
harvested 5462 + a bunch of sugar cane on the tile, Canary sickle.lua) and
the fire bug (5467, `handleFireBugUse`: 60% roll ignites — webs burn, coal
basins light, standing cane 5465 → burning 5464, which decays in 10 s to the
sickle-able 5463 — otherwise a poff fizzle). Wheat (3651/3652/3653), the full
cane cycle (5462/5463/5464/5465/5470), and reed (30623/30624) joined
`MUTABLE_ITEM_IDS`, so the map now serves 2,278 ripe wheat, 2,565 standing
cane, and 559 reed placements as server-owned items with catalog decay
driving regrowth. Also ran `db:reconcile-world-seed` twice for the two map
regenerations this session (8 + 1 stale rows, audited).

**Files**: `server/src/action/{handleSickleUse,handleFireBugUse,fireBugTable,
harvestTables,ToolUseHandler}.ts`, `server/src/item/getToolDefinition.ts`,
`tools/getMapItemSemantics.mjs`, regenerated map binaries/regions/minimap.

**Verified**: ToolUseHandler suite (27 tests) including new cases: sickle
cuts ripe cane and drops the bunch; sickle refuses burning/unripe cane; fire
bug across six RNG seeds either ignites or fizzles and never destroys the
field. Full server suite green.

**Residual risk**: fire bug's rare Canary outcomes (bug crumbles 10%,
explodes for 5 fire damage 10%) are collapsed into the fizzle — the tool
context has no consume-carried or direct-damage hook yet. Machete jungle
grass, wild growth, pick digs/crushable stone, and fire-bug webs/coal basins
remain dormant (targets not in `MUTABLE_ITEM_IDS`); adding them is the same
one-list change + map regen, deferred because jungle grass volume shifts many
tiles from static regions to tile-states.

## 2026-08-07 — Trash-destroyed throws clear on the client immediately

**Problem**: throwing an item into water destroyed it server-side, but the
thrower kept seeing it float until relog. The client renders every drag
optimistically as a tile override and only reverts it when an authoritative
`tile-states` arrives for that tile — and a trash destruction never sent one,
because the destination tile's state genuinely did not change.

**What changed**: `CarriedPlan` gained an optional `refreshTiles` list;
`planTrashDrop` and `planMoveMapItem`'s trash branch set it to the
destination tile, and both apply paths (`ItemIntentHandler.handle`,
`applyWorldPlan`) re-broadcast those tiles via `onMapItemsChanged` after the
mutation, so every viewer's optimistic preview reconciles against the real
(empty) tile.

**Files**: `server/src/item/plan/{CarriedPlan,planTrashDrop,
planMoveMapItem}.ts`, `server/src/item/ItemIntentHandler.ts`.

**Verified**: water drop test now asserts the session receives
`tile-states { visible: [{ position: waterTile, items: [] }] }` alongside the
blue-rings effect; full server suite green.

## 2026-08-07 — Gold Pouch becomes the Item Pouch: infinite slots, loot flows into it

**Problem**: the store's Gold Pouch was a coins-only-by-description, 20-slot,
unmovable container with no behaviour of its own. Wanted: rename it to Item
Pouch, make it hold items of any kind with slots that never run out, and give
it a purpose — while it is carried in the backpack, everything looted (auto
loot and the corpse "Loot all" sweep) lands inside it.

**What changed**:

- Catalog: `content/canary-item-semantics.json` entry 23721 renamed to
  "item pouch" (article "an"), new description, `containerSize` 20 → 500,
  `movable` false → true (it must be placeable inside the backpack);
  `yarn items:catalog` regenerated `server/data/item-catalog.json` (only
  23721 changed) and `client/public/assets/wiki-items.json` (name-sorted, so
  the rename shifted array positions).
- Store: `tools/importCanaryStoreCatalog.mjs` gained an `OFFER_OVERRIDES`
  table (the same corrected-at-import pattern as `ITEM_ID_CORRECTIONS`) that
  renames the offer and swaps the description; regenerated
  `storeCatalogData.ts`. The sub-offer id `item-23721-1` — what purchases
  reference — is unchanged; only the display product id moved
  (`useful-things-gold-pouch` → `useful-things-item-pouch`).
- "Infinite" slots: capacity 500 equals the server's `MAX_CARRIED_ITEMS`
  cap, so slots are genuinely never the binding constraint — weight and the
  500-row carry cap bind first. The wire caps moved to match: new
  `MAX_CONTAINER_CAPACITY = 500` in `protocol/src/item.ts` bounds container
  slot indexes (was 99), container-state capacity/items (was 100), the
  presentation `containerCapacity`, and the client's aimed-destination slot
  (`clientMessages.ts`).
- Presentation: a container whose capacity reaches the max renders as
  unlimited — the open-container grid draws only the used rows plus one
  spare drop row with an "n / ∞" header (`ContainerInventorySection`), the
  tooltip says "Capacity: unlimited slots" (new `containerSlotsUnlimited`
  locale key, en + pt-BR), and the look line prints `Vol:∞`
  (`itemLookSegments`).
- Loot routing: new `server/src/item/plan/planItemPouchPlacement.ts` — when
  a pouch (`ITEM_POUCH_TYPE_ID`, new `item/itemPouchTypeId.ts`) sits
  anywhere in the equipped backpack tree, destination-less loot placement
  targets it exclusively: top up a partial stack already in the pouch, else
  first free pouch slot; deliberately does *not* top up stacks in other
  containers, so loot never splits away from the pouch. Wired as the first
  choice in `planLoot`'s no-destination branch, falling back to
  `planBackpackPlacement`; that branch serves auto loot, quick loot, and
  hand loot without an aimed slot, so an explicit drag to a chosen slot
  still goes exactly where the player aimed. Ordinary pickups, potion-flask
  returns, and purchases keep normal backpack fill.

**Files**: `content/canary-item-semantics.json`,
`tools/importCanaryStoreCatalog.mjs`, `server/data/item-catalog.json`,
`server/src/store/storeCatalogData.ts`, `protocol/src/{item,clientMessages}.ts`,
`server/src/item/{itemPouchTypeId.ts,plan/planItemPouchPlacement.ts,plan/planLoot.ts}`,
`server/src/look/itemLookSegments.ts`,
`client/components/inventory/{ContainerInventorySection,ItemTooltip}.tsx`,
`client/locales/{en,pt-BR}.json`, `client/public/assets/wiki-items.json`.

**Verified**: four new regression tests — auto loot sweeps gold + an axe into
the pouch and leaves the backpack holding only the pouch; a partial gold
stack in the *backpack* is left alone while the pouch opens its own stack
(anti-split rule); a partial stack *inside* the pouch tops up 50 → 60; a
"Loot all" quick-loot sweep lands both items in the pouch. Full suites green:
server 3,833 passed / 263 skipped, client 441 passed; protocol + server +
client typecheck clean; eslint clean on touched client files.

**Residual risk**: the 23721 semantics entry is a hand edit to a generated
file — a future `yarn items:convert` would silently revert the pouch to
Canary's gold pouch (recorded in `TODO.md` accepted gaps). Players who
bought the Gold Pouch before this change keep the same item row; it simply
starts routing loot once moved into the backpack.

## 2026-08-07 — Real Tibia lighting: day/night cycle + client lightmap (Feature 87, lighting slice)

**Problem**: the world rendered at full brightness forever. Light data was
already flowing everywhere — item light flags in `objects.json`, monster
base light and spell light conditions in creature state, `utevo lux/gran
lux` applying conditions — but nothing consumed it: no ambient light
concept, no day/night cycle, and the client's only nod to light was a
placeholder yellow alpha circle under glowing creatures.

**What changed**:

- **Protocol**: new `world-light` server message `{level 0-255, color
  0-255}` (color is an 8-bit Tibia palette index, always 215/white from
  the cycle).
- **Server**: `world/WorldLightCycle.ts` reimplements Canary's cycle
  verbatim — one game day per real hour, checks every 10s, sunrise at game
  minute 360 / sunset at 1050, ramping between 250 (day) and 40 (night) in
  steps of 7 (~5 real minutes per transition). GameServer broadcasts on
  change to every playing session (`registry.all()` + playerId — NOT
  `tickable()`, which is only the drained intent work-queue); the login
  flow sends the current light right after `welcome`. Dev-only `/light
  <0-255|day|night>` GM command forces a level for testing.
- **Client**: `render/LightOverlay.ts` is an OTClient-faithful lightmap:
  one RGB pixel per visible tile, painted from `computeLightmapPixels`
  (per-channel `max(ambient, (intensity − distance) · 0.2)` radial
  falloff, 8-bit palette via `from8bitColor`), held in a tiny 2D canvas
  texture, bilinearly upscaled and drawn over the world with `multiply`
  blend — under the speech/nameplate layers, so text stays bright.
  `MapView` records per-tile static item lights and "shade" tiles (any
  ground) as it draws; the per-frame pass walks visible floors deepest
  first, resetting shaded pixels so lights can't bleed up through floors
  (OTClient's `resetShade`), then adds item lights, creature lights, and
  the own player's minimum glow (intensity 2 when ambient < 64 or
  underground). Underground ambient is 0 regardless of the surface cycle.
  The pixel buffer only recomputes when a fingerprint of its inputs
  changes. The old placeholder glow circle in `CreatureView` is gone;
  creature light is now state consumed by the lightmap.
- **Playtest**: `server/src/playtest/lightingProbeServer.ts` (port 4127,
  `yarn playtest:lighting-probe:server`) seeds "Light Probe" on open
  ground 35+ tiles from any map light plus a "Gm Helper" on a second
  account (same-account logins kick each other); the browser e2e
  `client/e2e/worldLighting.e2e.test.tsx` drives `/light` through the
  helper's own socket and asserts canvas brightness: night < 50% of day,
  above pitch black (player glow), and `/light day` restores ≥ 90%. It
  also saves `__screenshots__/lighting-{day,night}.png` artifacts.

**Files**: `protocol/src/serverMessages.ts`,
`server/src/world/WorldLightCycle.ts` (+test), `server/src/GameServer.ts`,
`server/src/CharacterHandler.ts`, `server/src/gm/GmCommandHandler.ts`,
`server/src/GameServer.test.ts`, `server/src/playtest/lightingProbeServer.ts`,
`client/lib/render/{LightOverlay,computeLightmapPixels,from8bitColor}.ts`
(+tests), `client/lib/render/{WorldRenderer,MapView,CreatureView}.ts`,
`client/e2e/worldLighting.e2e.test.tsx`.

**Verified**: WorldLightCycle unit tests (ramp shape, catch-up ticks,
forced-level broadcast-once); GameServer integration test asserts the
world-light lands right after welcome; client unit tests for the palette
decode and lightmap math (falloff, radius cutoff, per-channel max,
shading); the browser e2e passes end to end against the probe server, and
the monster-performance e2e still holds ~36 FPS at 1000 monsters with the
overlay active. Protocol/server/client typechecks and full unit suites
green (the 4 storybook failures and 2 e2e-under-load failures pre-exist on
main).

**Residual risk / deferred** (recorded in `TODO.md` accepted gaps):
equipped torches don't light the carrier (server items carry no light
metadata yet); effect/missile flashes emit no light; no minimum-ambient
comfort setting; shade predicate treats any ground as fully covering. Two
debugging traps worth remembering: the Thais temple viewport is fully
torch-saturated, so a correct lightmap there multiplies by ~1.0 and looks
like a no-op — verify lighting on open ground; and chat-UI automation in
browser e2e is unreliable (composer/canSend races) — drive GM commands
through a second-account socket instead.

## 2026-08-08 — VIP (premium) account bonuses + /vip-account page

**Problem**: premium time existed (store-sold `premium_until`, tier in every
auth/welcome message) but granted almost nothing in play, and the public site
never explained it. Wanted: the classic VIP benefit sheet — wheel cooldowns,
protected imbuements, exp/crit/exercise/proficiency/regeneration bonuses —
plus a landing page under the Game menu.

**What changed**: a single `PREMIUM_BENEFITS` constant in
`protocol/src/premiumBenefits.ts` now feeds both the server enforcement and
the public page. Eight bonuses shipped, each gated on
`player.isPremiumAt(now)` at execution time inside the tick: (1) +10 hp /
+20 mana every 3 s as a separate regen channel in
`CharacterProgression.tick` — needs no food, works in PZ, stops on premium
lapse (the long-dead `getAccountRegeneration` tier hook was left as-is; the
channel is account-level, not vocation-level); (2) Protected Imbuement —
`ImbuementService` now passes a `passiveBurns` flag so wall-clock categories
(speed/capacity/paralysis deflection) pause inside protection zones for
premium wearers; (3) +10% kill exp in `DeathHandler.awardHuntExperience`,
mirrored in the XP-rate panel via a new `premiumPercent` protocol field;
(4) +3% crit chance in `playerSpecials` (inherited by auto-attack, spell,
and both display paths — `ProgressionSystem`/`CyclopediaService` now pass
`now`); (5) +10% exercise-weapon pace in `ExerciseTrainingHandler`
(re-read every tick, so a lapse slows mid-session); (6) +10% proficiency
exp via a `premiumOf` hook on `ProficiencyService`; (7) −30% Gift of Life
cooldown at proc time in `DamageResolver`; (8) −30% avatar cooldown via a
post-floor `spellMultiplier` on `applySpellCooldowns` (the half-base floor
already swallowed grade-3 avatars, so the multiplier applies after it).
The public site gained `/vip-account` (nav entry in `LandingNavigation`,
`VipAccountPage` rendering the benefits table from `PREMIUM_BENEFITS`,
en/pt-BR locales); the four unbuildable benefits (familiars, full bless,
login priority, house absence) render as "coming soon" and have plan files
`todo/vip-{familiar-optimization,full-bless,login-priority,house-absence}.md`.

**Bug found and fixed in passing**: `ImbuementService.tick` never stored its
per-character sweep baseline (`lastSweepAt` defaulted to `now` every tick),
so elapsed seconds were always 0 and **imbuement decay never ran at all**.
The first tick now seeds the baseline; the new decay tests are the first
coverage of the sweep actually burning time.

**Files**: `protocol/src/{premiumBenefits,index,progression}.ts`,
`server/src/progression/{CharacterProgression,getExperienceRate,projectOwnProgression,ProgressionSystem}.ts`,
`server/src/imbuement/ImbuementService.ts`,
`server/src/proficiency/ProficiencyService.ts`,
`server/src/action/ExerciseTrainingHandler.ts`,
`server/src/combat/{DeathHandler,playerSpecials,DamageResolver,applySpellCooldowns,SpellCaster}.ts`,
`server/src/cyclopedia/CyclopediaService.ts`, `server/src/GameServer.ts`,
`client/components/public-site/VipAccountPage.tsx`,
`client/app/vip-account/page.tsx`,
`client/components/landing/LandingNavigation.tsx`,
`client/components/wiki/XpGainRatePanel.tsx`,
`client/locales/{en,pt-BR}.json`, story fixtures, `todo/vip-*.md`.

**Verified**: new premium-vs-free regression tests in
`CharacterProgression.test.ts` (regen channel with lapse),
`ImbuementService.test.ts` (3 decay cases), `ProficiencyService.test.ts`,
`ExerciseTrainingHandler.test.ts` (1818 ms vs 3000 ms second swing),
`playerSpecials.test.ts` (new file, +3% and avatar override),
`applySpellCooldowns.test.ts` (new file, post-floor multiplier),
`getExperienceRate.test.ts` (premiumPercent composition). Full suites:
server 3,845 passed / 263 skipped, client 441 passed; protocol + server +
client typecheck clean. Root `yarn test` still fails earlier at
`test:tools` on a pre-existing converter-hash mismatch (TODO.md).

**Residual risk**: premium extra regen is not shown in the character panel's
regeneration figures (single-channel protocol shape — TODO.md); the
per-path crit-chance source inconsistency predates this work and is now
recorded in TODO.md; cooldowns already running when premium is bought are
not retroactively shortened (decided at proc/cast time only).

## 2026-08-08 — VIP benefit: house absence eviction (7 days free / 10 premium)

**Problem**: the `/vip-account` page advertised "House Absence" as coming
soon with nothing behind it. Houses were only ever lost through missed rent;
nothing evicted an owner for staying logged out, so there was no rule for
premium to relax (`todo/vip-house-absence.md`, now deleted). Canary ships
this as `houseLoseAfterInactivity` (30 days in `config.lua.dist`, checked in
`payHouses` against `lastLoginSaved`) plus an all-or-nothing `vipKeepHouse`
exemption; the adopted design is the tiered middle ground: 7 days offline
for free accounts, 10 for premium, judged at scan time.

**What changed**: three new `HOUSE_LIMITS` constants
(`absenceWarningDays: 5`, `absenceEvictionDays: 7`,
`premiumAbsenceEvictionDays: 10`) feed both the server scan and the public
page. `HouseService.scanAbsence` (same off-tick shape as the rent scan,
60 s interval, batch of 20) asks the store for absence-due houses —
`characters.last_seen_at` (the Feature 18 save anchor) joined with
`accounts.premium_until`, guildhalls excluded — and skips any owner with a
live session, because `last_seen_at` goes stale for online-but-idle players.
`processAbsence` (Pg + Memory stores) re-reads the anchor and the premium
tier inside one serializable transaction: past the tier threshold it evicts
through the existing `evictItems`/`deleteHouseQuery` path with a
`house-eviction` audit row (`reason: "absence"`, no new event type needed);
past day 5 it mails one stamped warning letter per absence episode
(delivery key and new `houses.absence_warned_for` column both carry the
`last_seen_at` they warned for, so replays skip and a fresh login re-arms).
Migration `076_house_absence.sql` adds the column. The `/vip-account` row
flipped to live and renders both day counts from `HOUSE_LIMITS`.

**Files**: `protocol/src/house.ts`, `server/db/migrations/076_house_absence.sql`,
`server/src/house/{HouseService,HouseStore,PgHouseStore,MemoryHouseStore,absenceWarningLetterText}.ts`,
`server/src/house/sql/{absenceDueHouseIdsQuery,houseOwnerAbsenceQuery,updateHouseAbsenceWarnedQuery,houseRowForUpdateQuery}.ts`,
`client/components/public-site/VipAccountPage.tsx`,
`client/locales/{en,pt-BR}.json`, tests.

**Verified**: 5 new unit tests in `HouseService.test.ts` (free-tier warning
at day 5 once per episode + eviction at exactly day 7 with items mailed and
replay no-op; premium 10-day window with re-warn on a new episode; premium
lapse mid-absence judged by the free rule at scan time; online owner with a
30-day-stale anchor never evicted or warned; guildhall exemption at the
store). 3 new Pg integration tests in `PgHouseStore.integration.test.ts`
(warn/evict/audit-reason/item-conservation/replay; premium tier at scan
time incl. lapse; guildhall never listed) — full integration file 16/16
against the local docker Postgres. Server suite 3,850 passed /
266 skipped; protocol + server + client typecheck clean; client page lint
clean.

**Residual risk**: recorded in `TODO.md` — the online-owner protection is
the in-process session registry (multi-process worlds would need shared
presence), and an owner already past the threshold who logs in during the
scan's commit window is still evicted (correct outcome, abrupt timing).
No client-side countdown is shown for an absent owner (absence is not in
`houseStateSchema`); the warning letter is the only in-game notice.

## 2026-08-08 — Blessing purchases + VIP full bless (Feature 72 slice)

**Problem**: blessing *acquisition* did not exist. The math library
(`blessings.ts` catalog/curves, `getDeathLossPercent.ts` 8%-per-bless
discount) was typed data with zero producers: `Player.blessings` was
hard-coded to 0, there was no DB column, no NPC dialogue action, and the
`fullBless` VIP benefit sat "coming soon" on `/vip-account`
(`todo/vip-full-bless.md`).

**What changed**: blessings persist as Canary's bitmask in a new
`characters.blessings` column (migration 077, plus `bless-purchase`
audit/ledger types), load with the character, ride the save snapshot, and
are consumed on death right after `applyDeathPenalty` reads the count
(ids 2–8 spent, Twist of Fate bit kept — its PvP semantics stay with the
PvP path). A new `bless` dialogue action (`DialogueGraph`/loader/executor),
`BlessService`, and `PgBlessStore` mirror the spell-teacher purchase shape:
every gate re-checked at execution time, price recomputed from the locked
DB row (level + mask, already-held ids skipped and never charged), carried
coins before bank, mask OR + version bump + audit row in one SERIALIZABLE
transaction. Henricus (already spawned at the Thais inquisition post) got a
reviewed dialogue: the five regular blessings sold singly at the plain
Canary price to everyone, and a premium-only **full bless** bundle granting
all missing ones at Canary's Inquisition price (singles × missing × 1.1 —
the advertised 110000 gold at level 120). `|BLESSCOST|` renders the
execution-time quote in dialogue. `/vip-account` flips `fullBless` to live
(en/pt-BR copy updated). Canary's Inquisition-quest gate is intentionally
dropped (quest not imported); premium is our own gate — Canary has no VIP
bless benefit at all.

**Files**: `server/db/migrations/077_blessings.sql`,
`server/src/progression/planBlessingPurchase.ts` (new),
`server/src/npc/{BlessService,BlessStore,PgBlessStore,findBlessAction}.ts`
(new), `server/src/npc/{DialogueGraph,loadNpcDialogueGraphs,NpcDialogueExecutor,NpcHandler,renderNpcDialogueText}.ts`,
`server/src/{Player,GameServer,index}.ts`,
`server/src/combat/DeathHandler.ts`,
`server/src/character/{Character,CharacterRow,toCharacter,CharacterPersistence,PgCharacterStore,CharacterService}.ts`
+ `sql/{characterColumns,updateCharacterSnapshotQuery}.ts`,
`server/src/progression/assertValidCharacterSaveSnapshot.ts`,
`server/src/economy/BankLedgerEntryType.ts`,
`content/npcs/canary-dialogues.json` (reviewed henricus def),
`client/components/public-site/VipAccountPage.tsx`,
`client/locales/{en,pt-BR}.json`.

**Verified**: new tests — `planBlessingPurchase.test.ts` (curves, skip-owned,
110000 parity, floor), `BlessService.test.ts` (execution-time premium gate,
already-blessed, commit/fail outcome paths), `henricusBlessContent.test.ts`
(offer shape, keyword reachability, |BLESSCOST| quotes),
`PgBlessStore.integration.test.ts` (carried+bank split, missing-only charge,
insufficient funds leaves nothing, already-blessed, racing confirmations
charge once), death-consumption case in `deathPenalty.test.ts`. Server suite
3,860 passed / 268 skipped; client 441 passed; both typechecks clean.
`PgCharacterStore.integration.test.ts` "commits conjuring resources" fails
identically on main (pre-existing, unrelated).

**Residual risk**: equipment/container drop into a player corpse still does
not exist (no player corpses yet) — the `equipmentLossChancePercent` table
remains consumer-less; Amulet of Loss and Twist of Fate PvP-death semantics
unimplemented; temple single-bless NPCs (27 `StdModule.bless` keyword
imports) still unconverted, so the parity-gate ceiling is unchanged. All
recorded under the TODO.md blessings entry (owner: Feature 72).

## 2026-08-08 — Bound container, Loot Pouch rework, and the Portable Seller

**Problem**: the Item Pouch was a 900-coin store purchase living loose in the
backpack tree, and there was no concept of character-bound items. Wanted: the
pouch renamed Loot Pouch, free for every character, locked to a new
character-bound container (opened from a button above the backpack slot), and
a new store item — the Portable Seller (900 Mantus Coins) — that vendors the
pouch's contents automatically every 10 minutes or on right-click with a
1-minute cooldown, playing its sale animation when it fires.

**What changed**:
- New `bound` equipment slot (Canary's store-inbox slot): a per-character
  container (23396, renamed "bound items") whose direct children are
  character-bound. Planner guards deny moving them out (reorder inside is
  fine), swaps that would displace them outward, drop/equip/split/
  depot-deposit/stash/trade, and any ingress except the allowlisted types
  (pouch 23721, seller 60109 — a one-way door via `BOUND_ITEM_TYPE_IDS`).
  Pouch contents (grandchildren) stay fully normal. `planTradeReservation`
  also gained the guard — it accepted equipment rows and never checked
  `movable`, so the whole bound tree was tradeable without it.
- Loot Pouch: renamed in semantics + regenerated catalogs, identity also
  pinned by a new `ITEM_OVERRIDES` entry (name/description/capacity 500/
  `movable:false`) so `items:convert` can no longer revert it at runtime;
  store offer removed via a type-id filter in `storeCatalog.ts` (survives
  `store:catalog`, which was re-run); granted inside the bound container by
  the starter set; `planItemPouchPlacement` now finds the pouch anywhere
  equipment-rooted instead of only the backpack tree.
- Portable Seller: custom item type 60109 (aliases watch 2906 for the
  engine; the DOM icon renders its own 4-frame 32px PNG strip at
  `client/public/assets/store/items/portable_seller.png`), hand-authored
  store product `useful-things-portable-seller` (900, unique, home page),
  `useKind: "activate"`. `PortableSellerService` in the tick loop: 10-min
  auto sweep per online character, 5s busy-retry, manual trigger with
  server-enforced 60s cooldown; the sale plan mirrors NPC bulk-sale
  exclusions (no rarity-graded items, no filled containers, `npcValue`
  pricing), credits the bank, and persists deletes + bank leg +
  `portable-seller-sale` audit in one serializable transaction (new
  `CarriedDestructionReason`, `EconomyPersistAudit` variant,
  `BankLedgerEntryType`, audit/bank CHECK restated in migration 076 with the
  `bound` slot). A `portable-seller-triggered` message (sent only on real
  sales, per-session monotonic saleId) drives the client's one-shot
  frame 1→2→idle animation, a combat-log proceeds line, and bank refresh.
- Client: bound button above the backpack slot (paperdoll's spacer slot),
  bound window is view-only at the root (no drag-out/no drops, pouch inside
  opens and behaves normally), `validateItemOp` pre-rejects hopeless bound
  moves ("bound-item" rejection), `SpriteIcon` dispatches to a custom-art
  renderer for 60109 everywhere (slots, store, tooltips), locale strings in
  en + pt-BR.
- Backfill `yarn db:backfill-bound` (server/scripts/backfillBoundContainers
  .ts): per-character serializable transaction, creates the bound container,
  moves an existing pouch into it (same row id — no dupe window) or creates
  one, audits as `bound-backfill`, refuses to run with players online,
  idempotent.

**Files**: protocol/src/{item,portableSeller,serverMessages,
customItemAppearances,index}.ts; server/db/migrations/076_*.sql;
server/src/item/{boundItemTypeIds,boundContainerTypeId,getItemUseKind,
getStarterSet,StarterSet,CarriedPersistPlan}.ts, item/plan/{findBoundRoot,
isBoundLockedItem,planItemPouchPlacement,planMoveToContainer,planSplitStack,
planDrop,planEquip,planUnequip,planLoot,planPickup}.ts, item/custom/*,
item/overrides/*; server/src/economy/{PortableSellerService,
EconomyPersistPlan,PgEconomyPersistOps,BankLedgerEntryType}.ts,
economy/plan/planPortableSellerSale.ts, economy/sql/
insertPortableSellerSaleAuditQuery.ts; server/src/trade/
planTradeReservation.ts; server/src/depot/planDepotDeposit.ts;
server/src/character/insertStarterSet.ts; server/src/store/
{storeCatalog,PORTABLE_SELLER_PRODUCT}.ts; server/src/GameServer.ts;
server/scripts/backfillBoundContainers.ts; tools/importCanaryStoreCatalog
.mjs; content/canary-item-semantics.json (+ regenerated item-catalog,
wiki-items, storeCatalogData); client: EquipmentPaperdoll, InventoryPanel,
SpriteIcon → Atlas/CustomArt split, getCustomItemArt, validateItemOp,
handleCommerceMessage, handleGameClientError, game-window store/types,
locales.

**Verified**: 19 new planner/plan tests (bound exploit paths, sale rules) +
6 PortableSellerService tests (interval, cooldown, busy-retry, empty sweep)
+ 4 new validateItemOp tests; full suites green (server 3871, client 445,
3× typecheck); PgMantusStore integration suite passes against local docker
Pg with the new offer; migration 076 + backfill exercised end-to-end on a
scratch DB (legacy pouch moved keeping its row id, re-run is a no-op). The
`PgCharacterStore` "conjuring audit" integration failure reproduces
identically on main (pre-existing, unrelated); `yarn parity:check` remains
red on main from the unpinned buildItemCatalog hash (TODO.md).

**Residual risk / deferred** (all in TODO.md): Portable Seller timers are
in-memory (relog re-arms auto, clears manual cooldown — judged benign);
seller is delivered to the store inbox rather than straight into the bound
container; wiki-items.json regeneration would resurface the old pouch name
until the semantics converter gains an override table.

## 2026-08-08 — Store→bound delivery, seller cooldown UX, tooltip art, slot-bounds fix

**Problem**: store purchases still went to the depot inbox; the bound
container was 20 slots; a Portable Seller click on cooldown gave no feedback
beyond a log line; its tooltip drew the aliased watch sprite; and container
`slot_index` was still DB-capped at 99 — a pre-pouch bound that would have
poisoned the persist lane at the 101st occupied pouch/bound slot.

**What changed**: `deliverBoundItem` replaces `deliverInboxItem` for
item/stackable/charges/house-item grants — rows land as bound-container
children in the purchase transaction (lazy root creation, recursive-CTE
unique re-check that sees container-located rows, 500-carried-row budget,
same idempotency keys), applied to the live inventory in-tick via the
routed `injectDelivery` hook; `PgMantusStore.facts` went recursive for the
same reason. Bound semantics relaxed to type-based locks: only the pouch and
seller are pinned (`isBoundLockedItem`), deliveries drag out/equip/split
freely, arbitrary ingress still refused; client validator, bound-window
drag gating, and tests mirror it. Bound container capacity 500 (∞), new
description; `store-purchase-completed.deliveredToInbox` renamed
`deliveredToBound` with a success-banner note. Cooldown clicks now send
`portable-seller-cooldown {remainingMs}` → centered screenMessage countdown
text (error-code path removed). Tooltips carry `clientId` so the seller's
tooltip draws its idle PNG frame. Migration 079 raises container/corpse
slot bounds to 0..499 (and the move-item wire cap follows
MAX_CONTAINER_CAPACITY).

**Verified**: all three typechecks; server 3871 + client 446 suites; the
rewritten PgMantusStore integration suite (21/21, incl. bound delivery,
carried-cap rollback, replay, recursive unique facts) on local docker Pg;
migration chain through 079 on a scratch DB.

**Residual risk**: carried rows written outside the item lane during
purchases (TODO.md); `{storeinbox}` description markers in imported catalog
copy still name the old inbox.

## 2026-08-09 — Coins on the default auto-loot pick-up list

**Problem**: every character's auto-loot pick-up list started empty, so a
fresh character (and anyone who never opened the loot-filter window) got
nothing from enabling the sweep until they hand-picked items — and the one
thing effectively everyone wants swept is money.

**What changed**: gold (3031), platinum (3035), and crystal (3043) coins are
now the default pick-up list. `createDefaultLootFilter()` in
`protocol/src/lootFilter.ts` (rules from `DEFAULT_LOOT_PICKUP_TYPE_IDS`,
sweep still disabled) is used at character creation and as
`parseLootFilter`'s corrupt-row fallback; `DEFAULT_LOOT_FILTER` stays the
empty placeholder for session/store initial state. Migration 080 sets the
matching column default and backfills existing characters, appending only
the denominations a list is missing (dedup-safe, `enabled` untouched,
deterministic order) and skipping lists over 197 rules so no row can be
pushed past the 200-rule schema cap and degrade at login. Players remove
the coins like any other rule.

**Files**: `protocol/src/lootFilter.ts`,
`server/src/character/CharacterService.ts`,
`server/src/character/parseLootFilter.ts` (+ new test),
`server/src/character/CharacterService.test.ts`,
`server/db/migrations/080_default_loot_coins.sql`.

**Verified**: protocol + server typechecks; parseLootFilter,
CharacterService, LootFilterHandler, and auto-loot suites (32 tests); the
migration replayed by the Pg integration harness; the backfill UPDATE
exercised case-by-case (empty list, partial list, all coins present,
legacy blacklist shape, 198-rule near-cap list) against local Postgres.

**Residual risk**: characters sitting at 198+ rules without coins are
skipped by the backfill by design; they add coins manually.

## 2026-08-09 — Login queue with premium priority (VIP Login Priority unblocked)

**Problem**: at capacity (`maxSessions`) the connection handler closed the
socket with no message — no server-full reason, no waiting list — so the
advertised VIP "Login Priority" benefit had nothing to attach to
(`todo/vip-login-priority.md`, now deleted).

**What changed**: a full held-socket waiting list modeled on Canary's
`WaitingList` (`waitlist.cpp`), adapted from its disconnect-and-retry
protocol to our persistent WebSocket. New `server/src/LoginQueue.ts`: two
FIFO lanes (premium, free); the premium lane drains entirely before the
free lane, arrival order kept per lane, so positions only improve.
`AuthHandler` decides at auth-apply time (tier is only known once the
account row is loaded, inside the tick): seats drain strictly through the
queue — a fresh login never overtakes it even if a seat is free that tick;
a same-account relogin swaps into its old session's seat, and a
reconnecting queued account keeps its place in line (`LoginQueue.replace`).
Admission = the normal `auth-ok`, sent by `AuthHandler.tickQueue` each tick
as seats free. New `queue-position {position, total}` server message
(bounded by `PROTOCOL_LIMITS.maxLoginQueueSize`), pushed only on change
with per-session dedupe. Queue capacity is `network.maxLoginQueueSize`
(config.yml, default 200); beyond it the socket gets a new `server-full`
error — also sent pre-session when the socket cap
(`maxSessions + maxLoginQueueSize`) is hit, replacing the old mute close
(`httpServer.maxConnections` got +64 slack so refusals happen at the WS
layer, not as a TCP hang-up). While queued, only the `ping` keepalive is
served — a modified client sending `list-characters`/`select-character` is
ignored (charter rule 8); the existing 30 s heartbeat reaps dead queued
sockets and `processDisconnects` removes them from the line. New
`login.bypass` capability (gamemaster, admin) mirrors Canary's GM bypass.
Client: `queue-position` lands in `handleCharacterSessionMessage` →
`loginQueue` store state → `CharacterSelectScreen` shows "You are at place
N of M" (+ premium-priority note), cleared on `character-list`/disconnect;
the pre-character-list screen now also shows the `serverError` text (e.g.
server-full, logged-in-elsewhere) instead of a bare "Disconnected".
`/vip-account` Login Priority row flipped to live (en/pt-BR copy updated).

**Files**: `protocol/src/{serverMessages,limits}.ts`,
`server/src/{LoginQueue,AuthHandler,GameServer,Session,config,loadServerConfig}.ts`,
`server/src/auth/AccountRole.ts`, `config.yml`,
`client/components/game-window/{types/GameWindowState,types/GameWindowStoreActions,store/createGameWindowStore,messages/handleCharacterSessionMessage,controllers/handleGameClientStatus,CharacterSelectionOverlay}.ts*`,
`client/components/characters/CharacterSelectScreen.tsx`,
`client/components/public-site/VipAccountPage.tsx`,
`client/locales/{en,pt-BR}.json`.

**Verified**: 6 new `GameServer.test.ts` integration tests (premium admitted
ahead of free across seat churn; queued session refused everything but ping
until admission; `server-full` at queue cap; reconnect keeps the queue spot;
two logins racing the last seat → exactly one seated; GM bypass with the
queue untouched) — full server suite 3902 passing; protocol/server/client
typechecks; client unit suite 446 passing (storybook/e2e lane failures
pre-exist on main).

**Residual risk**: unauthenticated handshaking sockets count as seated, so
at the margin a queued player waits up to `authTimeoutMs` (10 s) longer —
conservative, never overshoots `maxSessions`. Queue positions push only on
change (no periodic re-send; the WS heartbeat covers liveness). The public
API still reports `maxPlayers` only — queue length is deliberately not
exposed.

## 2026-08-09 — Quest-chest/key-door Canary parity (cultist key chain live)

**Problem**: Using the Carlin cultist-key box (Theater Avenue, Canary
ChestUnique 5018) — and quest chests generally — diverged from Canary. The
chest table shipped (Feature 50) but: key rewards were granted without their
door ActionId (`isKey`/`keyAction` parsed then dropped at load); Canary's
`door_key.lua` startup table (door-position → ActionId) was never imported,
and there was no key-on-door unlock flow at all, so the cemetery crypt doors
were dead ends; reward messages lacked articles/plurals ("You have found
gold coin.") and the already-looted reply was a generic "It is empty.";
Canary's quest_system1 (aid 2000: map item's contents ARE the reward, uid =
storage) and quest_system2 (aid 2001: inline config) had no implementation —
147 + 36 stamped map chests failed closed; and `WorldContainerViews.open`
would open a quest-registered container as plain storage, letting the first
player steal the embedded reward items outright.

**What changed**:
- Importer/parser: `isKey` now stamps `keyActionId` from the chest storage
  (Canary's `setActionId(storage)`); rewards carry per-item `actionId`
  (key-type ids only) — `chests.json` regenerated, 26 key rewards stamped.
- `ChestDefinition`/`loadChestDefinitions`: per-reward `actionId`/`text`
  (text ≤ 3500 chars; items.attributes jsonb caps at 4096 bytes), and the
  loader now merges `quest-chests.json` beside `chests.json` (position
  conflicts throw).
- `ChestService`/`PgChestStore`: attributed rewards grant as their own rows
  (never merged into stacks) with attributes persisted; Canary message
  parity — "You have found a bone key." / "You have found 3 gold coins."
  (plural defaults to name+"s") / "The box is empty." / weight and no-room
  variants.
- Door keys: `tools/importCanaryDoorKeys.mjs` + `parseCanaryDoorKeys.mjs`
  import `door_key.lua` (35 actions, 49 door positions) into
  `server/data/door-keys.json`; `loadDoorKeyActions` feeds `ToolUseHandler`.
- Key-on-door: key item ids (2967–2973, 21392) are use-with tools now;
  `handleKeyUse` mirrors Canary `key_door.lua` — matching key opens a locked
  door, re-locks a closed/open one, mismatch says "The key does not match.",
  no ActionId fails closed.
- quest_system1/2: `server/scripts/buildQuestChests.ts` (+ pure
  `buildQuestChestDefinitions`) generates chest definitions from the map's
  own aid-2000/2001 items (contents → rewards incl. actionId/text; bag 2853 /
  backpack 2854 / self-copy wrap rules; specialQuests aids resolved;
  Canary's uid-before-aid dispatch honored by skipping ChestUnique-shadowed
  positions) joined with `tools/importQuestSystem2.mjs`'s parsed config
  (13/31 entries importable) → `server/data/quest-chests.json`, 45 live
  chests, every skip reasoned.
- Exploit fix: `isQuestRegisteredSource` blocks world-container opening of
  quest-registered containers (aid 2000/2001/specialQuests, uid in
  quest-reward ranges) in `WorldContainerViews`.
- Parity ledger: quest_system1/2 flipped to implemented (25 total).

**Files**: `tools/{parseCanaryChestTables,importCanaryChests,
parseCanaryDoorKeys,importCanaryDoorKeys,parseQuestSystem2,
importQuestSystem2,classifyWorldActionRegistration}.mjs` (+tests),
`server/src/action/{ChestDefinition,loadChestDefinitions,loadDoorKeyActions,
handleKeyUse,ToolUseHandler}.ts`, `server/src/chest/{ChestService,ChestStore,
PgChestStore,buildQuestChestDefinitions}.ts` (+tests),
`server/src/item/{getToolDefinition,isQuestRegisteredSource,
WorldContainerViews}.ts`, `server/src/GameServer.ts`,
`server/scripts/buildQuestChests.ts`,
`server/src/playtest/scenarios/cultistKeyChest.ts`,
`server/data/{chests,quest-chests,door-keys}.json`,
`content/items/{canary-chests,canary-door-keys,canary-quest-system2}.json`,
`content/{source-manifest,canary-world-action-parity}.json`.

**Verified**: `yarn playtest:cultist-key` end to end (box → "You have found
a bone key." → key with ActionId 3520 in backpack → "The box is empty." →
crypt door 6248 "It is locked." → key unlocks to 6250 → walk through); live
probe of generated chest 9281 ("You have found a bag." / "The chest is
empty."); server suite 3909 passing + 17 new builder tests + 4 key-door
tests + container-guard test; `PgChestStore` integration suite incl. new
ActionId-persistence case; tools tests 125 passing; server typecheck clean.

**Residual risk**: TODO.md 2026-08-09 entries — 22 non-mutable quest-item
hosts (needs MUTABLE_ITEM_IDS + map reconvert), six importable
quest_system2 uids with no map host, pre-change keys lacking ActionIds
(prod backfill note), deferred quest_system2 state-machine entries and
quest_system1 side tables (tutorial/hota/quest-log/pit-door), and the
deferred-ChestUnique shadow-check blind spot. Canary's `parity:check`
buildItemCatalog hash drift pre-exists on main and is untouched.
## 2026-08-09 — Memory-first Mantus Store purchases

**Problem.** Buying from the store on production felt slow: every purchase
was one SERIALIZABLE transaction of ~15–20 *sequential* round-trips (account
+ character `FOR UPDATE`, replay guard, a recursive whole-inventory CTE used
only for its row count, 3 inserts per delivered stack, balance/ledger/audit
writes) that the reply waited on — 400–800 ms against remote Postgres, worse
when a concurrent character save aborted it with 40001 and the 5-attempt
retry re-ran everything. It was the one purchase path not using the
memory-first shape `ShopService` already established.

**What changed.** Purchases are now decided, applied and answered inside the
tick, and made durable behind it on the item persist lane:

- `planStorePurchase` (pure) re-derives every rule the transaction enforced —
  balance, premium cap, outfit/mount/unique ownership, wildcard cap, slot
  availability, the XP boost's escalating price and daily cap — from live
  caches (`InventoryCache`, outfit/prey/hunting services, a per-character
  store-facts cache seeded once per session on first store-open). Item offers
  are placed by `planBoundItemDelivery` into exact bound-container slots with
  pinned item ids.
- The tick applies the outcome (coins, premium, entitlements via new
  `applyOutfitGrant`/`applyMountGrant`/`nextLocked*Slot` hooks, injected
  items) and sends `store-purchase-completed` immediately; no protocol
  changes.
- `PgMantusStore.persistPurchase` runs one transaction that *asserts* what
  memory decided: request-key replay is a no-op, the debit is relative and
  guarded (`WHERE mantus_coins >= price`), the legacy delivery legs re-check
  their own rules against locked rows (refusals become thrown errors), and
  the XP boost counter must equal what the price was derived from. Any
  assertion failure poisons the character via `enqueuePersist`, which resyncs
  from committed state — memory and database cannot silently drift.
- Name/sex changes (need the DB's global name-uniqueness answer) and any
  purchase raced in before facts load still use the legacy DB-first path,
  which now applies its result *relatively* (as do operator grant/refund via
  the new `refunded` field) so it composes with queued memory-first persists.
- `refreshFacts` (2 queries incl. the recursive inventory scan per purchase
  *and* per store-open) is gone; facts update incrementally in-tick.

**Files.** `server/src/store/` (`MantusStoreService`, `PgMantusStore`,
`planStorePurchase`, `planBoundItemDelivery`, `StorePurchasePlan`,
`StoreLiveHooks`, `StoreOperatorService`, `MantusStoreStore`,
`delivery/persistStoreDelivery`, `sql/decrementStoreBalanceQuery`),
`OutfitService.applyStoreGrant/applyStoreMountGrant`,
`PreyService.nextLockedSlot`, `HuntingTaskService.nextLockedSlot`,
`GameServer` wiring (equipment-located deliveries now land in the carried
inventory — the created bound root).

**Verified.** 9 new planner unit tests (price curve, caps, stack splitting
around occupied slots, row budget); 4 new service tests (same-tick answer +
single queued persist with pinned rows, in-tick insufficient-coins after the
balance is spent, legacy fallback before facts load, mount entitlement
applied in-tick); 6 new Pg integration tests for `persistPurchase`
(atomicity, replay no-op, refuse-below-zero rollback, **two plans racing for
one balance commit exactly one**, XP-boost counter drift dies, second mount
purchase refused instead of charged). Full server suite 3,915 passed; full
typecheck clean. The 8 pre-existing integration failures (guild bank ledger
check constraint, conjuring audit, highscore value types, item sweep slot
conflict) fail identically on `main` — unrelated.

**Residual risk.** Store facts are session-pinned (destroying a unique store
item mid-session leaves its offer greyed until relogin); prey-wildcard live
counter can transiently disagree if a daily-reward claim races a queued store
persist (DB converges — both writes are relative/capped); recorded in
TODO.md. A persist assertion failure disconnects the buyer (deliberate: the
session's memory was wrong).

## 2026-08-09 — Right-click on quest chests stolen by neighbouring furniture sprites

**Problem**: Right-clicking the Carlin cultist key box in the real client did
nothing (user report, reproduced in a browser e2e): the client sent use-map
for (32377,31802) — one tile east of the box. `resolveInteractiveTile`
redirects clicks to the anchor of a "covering" multi-tile sprite even when
the clicked tile itself holds the item the player sees; here the
neighbouring house's wide counter sprite stole the click through the wall,
so the server never saw the box use. The sewer-grate special case was an
earlier instance of the same bug.

**What changed**: `resolveInteractiveTile` takes a `hasDirectTarget`
predicate; `MapView.interactiveTileFor` passes "the clicked tile holds a
server-tracked item" (`topServerItem`). A tile with a dynamic world item
(chest, door, dropped loot) now keeps the click; tiles with only static
scenery still redirect to covering 2x2 gates as before.

**Files**: `client/lib/render/resolveInteractiveTile.ts`,
`client/lib/render/MapView.ts`, `client/lib/render/resolveInteractiveTile.test.ts`,
`client/e2e/questChestRightClick.e2e.test.tsx` (new browser e2e: mounts the
real GameWindow against the real server, teleports beside the box,
dispatches an actual right-click on the canvas, asserts "You have found a
bone key." then "The box is empty.").

**Verified**: the new e2e passes repeatedly (fresh account+character per run
— the e2e DB persists and the box is once-per-character); client unit suite
452 passing; client typecheck clean.

**Residual risk**: a click on the visible pixels of a 2x2 gate that overlap
a tile holding a dropped item now prefers the dropped item's tile; that
matches "click what you see on the tile" but differs from the old
always-redirect. E2e camera gotcha for future scenarios: compute click
offsets from the live own position at click time (the /goto lands via
intermediate movement messages), and the camera centers the live tile.

## 2026-08-09 — Cults of Tibia touch torch + position-keyed quest touch actions

**Problem**: Canary's Cults of Tibia touch
(`data-otservbr-global/scripts/quests/cults_of_tibia/actions_torch.lua`) had
no counterpart: using the torch bearer at (32400,31793,8) must remove the
decaying stone wall (item 1295) at (32396,31806,8) for five minutes behind a
world-shared 306 s cooldown. Nothing could reproduce it — the torch is baked
static scenery (ids 2928-2931 are not even in the item catalog: the catalog
builder drops appearances whose first sprite id is 0) and the wall was baked
into the static map and walkability bitset, so no world item existed to
remove.

**What changed**: New reusable position-keyed quest-touch infrastructure:
`QUEST_TOUCH_ACTIONS` table (`server/src/action/questTouchTables.ts`, keyed
by positionKey with removals/message/effect/cooldown/restore),
`QuestTouchService` (world-shared in-memory cooldown + tick-driven restore
drained from `applyResolvedOutcomes` in the game tick — never a timer),
`handleQuestTouchUse` + `"quest-touch"` WorldAction kind wired through
`resolveWorldAction` (position branch before the per-item loop, like
chests), `WorldActionRegistry`, `WorldActionContext`, and the preconditions
table (adjacent reach, exclusive, no placed-item re-check — made the
`itemStillPlaced` check tolerate item-less kinds by failing closed).
Cooldown semantics mirror Canary exactly: cooldown running → poff at the
player only; wall present → poff at the wall, remove, grinding message,
cooldown now+306 s, restore after 300 s; wall gone + no cooldown → silently
consumed. The wall became server-owned via a new position-scoped converter
override (`MUTABLE_POSITIONS` in `tools/getMapItemSemantics.mjs`, position
threaded from `tools/convertOtbm.mjs`), and its tile passability is overlaid
by `QUEST_TOUCH_WALL_TILES` in `DynamicMapItems.refreshTileOverride`
(present → blocked as baked, absent → walkable), then `yarn map:convert`
regenerated the map artifacts (wall now classification "mutable" in
items.bin; dropped from the client's static draw layer). Parity: the
`data-otservbr-global/scripts/quests` tree is now scanned by
`buildWorldActionParityInventory` (1367 registrations, all quest scripts
deferred to todo-20) with a specific rule marking `actions_torch.lua`
implemented (owner agents/quest-touch-actions).

**Files**: `server/src/action/questTouchTables.ts`,
`questTouchWallTiles.ts`, `QuestTouchService.ts`, `handleQuestTouchUse.ts`,
`QuestTouchService.test.ts` (all new); `WorldAction.ts`,
`WorldActionContext.ts`, `WorldActionRegistry.ts`, `resolveWorldAction.ts`,
`worldActionPreconditions.ts` (+test), `server/src/world/DynamicMapItems.ts`,
`server/src/GameServer.ts`, `server/src/playtest/scenarios/cultistKeyChest.ts`;
`tools/getMapItemSemantics.mjs` (+test), `tools/convertOtbm.mjs`,
`tools/classifyWorldActionRegistration.mjs`,
`tools/buildWorldActionParityInventory.mjs`;
regenerated `server/data/otservbr.items.bin`/`otservbr.map.json`,
`client/public/assets/map/otservbr/*`, `content/canary-world-action-parity.json`.

**Verified**: 6 new unit tests (removal+message+poff, world-shared cooldown
across characters, silent fall-through, tick-drain restore then re-use,
out-of-reach rejection, shipped-table shape); full server suite 3,945
passing, typecheck clean, `getMapItemSemantics` node tests 11 passing.
Extended `yarn playtest:cultist-key` passes end to end on both a fresh and a
persistent playtest DB: grinding message verbatim, poff-only silence inside
the cooldown, wall tile absent from fresh tile-states, and the player steps
through the removed wall (the scenario now also tolerates the crypt door's
persisted unlocked/open states and lowercases its generated character
names). Playtest DBs needed `db:reconcile-world-seed` once after the map
version changed.

**Residual risk**: cooldown/restore are memory-only (restart closes the wall
early — TODO.md); only this one quest-touch entry ships (table seeds future
imports); torch ids 2928-2931 remain out of the item catalog (zero
first-sprite drop, TODO.md).

## 2026-08-09 — Rookgaard starter quest pack (quest levers, movement gates, rapier chest)

**Problem**: The quest-parity triage's most player-visible cluster (§10b #3)
— the Rookgaard starter quests — was entirely deferred: rapier chest, bear
room, katana room, sewer bridge, level bridge, premium bridge. No engine
mechanic existed for stateful quest levers (toggle + remove/create/transform
+ creature relocation) or for fixed step-in gates with a fail destination.

**What changed**:
- New quest-lever system: `server/src/action/questLeverTables.ts`
  (position-keyed `QUEST_LEVER_TRIGGERS`, branch ops with per-branch
  `requiresPrimaryTarget` mirroring each Canary script's guards),
  `QuestLeverService.ts` (in-tick state machine; lever item id carries the
  state; relocations split players/monsters like Canary's sewer script),
  `handleQuestLeverUse.ts`, new `"quest-lever"` WorldAction kind resolved
  ahead of generic door/lever behaviours. Covers: bear room stone (aid
  30006), katana lever/door (uid 30029/22006, incl. the door-use forced
  close + lever re-arm), sewer drawbridge (aid 50239, both levers flip
  together).
- `questTilePassability.ts` generalizes the quest-touch wall overlay into
  blocking-item / required-item rules with an optional walkable ground-speed
  overlay (drawbridge 90 over speedless water); `DynamicMapItems` +
  `overrideMapData` consume it (replaces `questTouchWallTiles.ts`).
- Movement gates: `movementGateTables.ts` (level bridge aid 50998, premium
  bridge aid 50241) enforced at the top of `PressurePlateRegistry.onStepIn`
  with a fixed fail position, effect and Canary message.
- Rapier chest uid 14042 imported via `SCRIPT_ANSWERED_CHESTS` in
  `tools/importCanaryChests.mjs` (reward transcribed from rapier_quest.lua).
- `MUTABLE_POSITIONS` += bear stone 1791, sewer rails 4634/4636; map
  reconverted.
- `/premium <days>` dev-only GM command (in-memory premium for playtests).
- Parity ledger: +7 implemented, +4 excluded as **dead content** — uid 1056
  (bear_room_quest_lever), uids 14049/14050 (goblin temple), aid 30492
  (wooden-sword chest) are stamped nowhere at canary a879c931 (not in the
  OTBM, not in any startup table), so Canary itself never fires them.
  Re-pinned two converter hashes that had already drifted at HEAD
  (buildWorldActionParityInventory, convertOtbm).

**Verified**: 6 new QuestLeverService unit tests + 5 movement-gate tests;
full server suite 3,956 passing; typecheck + parity:check + test:tools
clean. New e2e `yarn workspace server playtest:rookgaard` drives two real
clients through all six quests — chest grant + "The box is empty.", stone
removal/walk-through/relocation, katana open/close/doorway push/door-use
re-arm, drawbridge extend/walk-over-water/retract-relocation/rails restore,
level-1 bounce with the Canary line then level-2 pass, silent free-account
bounce then premium pass — and passes repeatably against the persistent
playtest DB (state normalization first). Playtest DB needed one
`db:reconcile-world-seed` after the map version changed.

**Residual risk**: created span items are memory-first, so a restart
retracts the bridge while persisted levers stay pulled — the next pull
self-repairs (ops are idempotent); loose ITEMS on the span are not relocated
on retraction (Canary moves them); a relocation whose destination is
occupied leaves the creature in place (Canary push-moves); the extended
bridge renders as a drawbridge item over the water ground rather than a
ground transform (recorded in TODO.md).

## 2026-08-09 — Quest e2e sweep: every chest, key door, and quest scenario driven end to end

**Problem**: quest content shipped piecemeal (chest tables, door keys,
levers, touches, gates) with spot-check playtests only; nobody had driven
*all* of it end to end, so silently-dead content could hide in the data
tables, and two of the three existing quest playtests had quietly rotted
(cultist-key could no longer log in, gate could no longer pass).

**What changed**:

- New data-driven e2e `playtest:quest-chests`
  (`server/src/playtest/scenarios/questChestSweep.ts`): sweeps every chest
  in `chests.json` + `quest-chests.json` — teleports beside each placement,
  uses it, classifies the outcome against the exact Canary lines
  (found/empty/too-heavy/no-room), verifies the reward (or its wrapping
  bag) lands in the inventory, re-uses expecting "The … is empty.", honors
  shared-`lootedKey` pairs, and finishes by asserting the quest log over the
  wire. Runs on a dropped-fresh `playtest_quest_sweep` DB, rotates
  characters every 6 chests (slot pressure), `/heal`s through spawn aggro,
  retries once when aggro drags the sweeper out of reach, and prints a
  machine-readable findings report (`SWEEP_REPORT_JSON`).
- New data-driven e2e `playtest:quest-doors`
  (`server/src/playtest/scenarios/questDoorKeySweep.ts`): for all 35 doors
  in `door-keys.json`, finds the chest rewarding the key with the matching
  ActionId, loots it (opening the reward bag when the chest wraps its
  rewards), uses the key on every door position, expects the transform, and
  walks through cardinally-reachable doors. Fresh `playtest_quest_doors` DB.
- Fixed `cultistKeyChest.ts`: fixed dev token filled its account's character
  slots after a few runs; now per-run.
- Fixed `gateOfExpertise.ts`: second use-map fell inside the 200 ms use
  exhaust (silently degrades to a walk-click) and the persistent
  character/world broke the level-1 leg on reruns; now waits out the
  exhaust and runs on a dropped-fresh `playtest_gate` DB.
- `todo/quests.md` (new): full verified findings backlog — 30 dead chest
  placements (scenery hosts absent/classification-2 in `otservbr.items.bin`,
  with the full host/position table and the `MUTABLE_POSITIONS` +
  `map:convert` fix path), 10 key doors uncompletable behind those dead
  chests, 3 doors that open but stay impassable (aids 4603/909/3600,
  elimination notes included), 12 doors with no obtainable key, and the
  e2e-confirmed fact that all 51 catalog quests are display-only (0
  started quests after looting every working chest; nothing writes quest
  storage yet).

**Files**: `server/src/playtest/scenarios/questChestSweep.ts` (new),
`server/src/playtest/scenarios/questDoorKeySweep.ts` (new),
`server/src/playtest/scenarios/cultistKeyChest.ts`,
`server/src/playtest/scenarios/gateOfExpertise.ts`, `server/package.json`
(2 new scripts), `todo/quests.md` (new), `todo/status.md`, `TODO.md`.

**Verified**: `playtest:rookgaard` PASS; `playtest:cultist-key` PASS;
`playtest:gate` PASS; `playtest:quest-doors` — 25 door positions unlocked,
remaining findings are the real content gaps above; `playtest:quest-chests`
— 328 chests grant+empty cleanly plus 18 correct shared-`lootedKey`
empties; the 42 findings are exactly the 30 dead placements (confirmed
independently by a static `otservbr.items.bin` classification audit) plus
12 chests unlootable from the charged-amulet count import bug (also in
`todo/quests.md`: Canary charge counts imported as item counts; 2 further
chests multiply amulets instead of failing); server typecheck clean.

**Residual risk**: the sweeps take ~30–40 minutes combined and are not part
of any CI gate — they are on-demand suites; ambient-damage lines are
skipped by pattern, so a chest that answered with a *new* non-Canary line
would be reported as no-outcome rather than unexpected-message.

## 2026-08-09 — Quest-fix pass: dead chests, charged rewards, "impassable" doors, keyless-door triage

**Problem**: the 2026-08-09 quest e2e sweep left a findings backlog in
`todo/quests.md`: 30 chest placements were dead (baked scenery hosts never
became world items, so `resolveWorldAction` never saw them and 10 key doors
were uncompletable), 14 chests imported Canary charge counts as item counts
(12 permanently unlootable "no room", 2 granting five amulets where Canary
grants one with 5 charges — an economy-relevant multiplication), 3 opened
doors deterministically refused the walk-through, 12 doors had no obtainable
key, and chest 6249 was unreachable.

**What changed**:

- **Chests resolve positionally** (`resolveWorldAction.ts`): a registered
  chest now fires from the position table alone, exactly like quest touches
  — the sweep's suggested `MUTABLE_POSITIONS` route would have pulled 30
  pieces of scenery/ground out of the baked client draw (the void-ocean
  class of converter bug) to surface items the chest handler never reads.
  The `item` field left `WorldAction`'s chest variant (nothing consumed it),
  chest preconditions became `itemStillPlaced: false` (house check kept),
  and the old "rejects a chest whose registered item type is not on the
  tile" test flipped into the baked-host regression test. No map or
  world-seed regeneration was needed at all.
- **Charged rewards** (`tools/importCanaryChests.mjs`): a non-stackable
  reward whose catalog type declares `charges` and whose count exceeds 1 now
  imports as count 1 with a `charges` attribute — mirroring Canary's
  `addItem`, where that count is the charge subtype of a single item.
  `charges` flows end to end: `ChestDefinition.ChestReward`,
  `loadChestDefinitions` validation, `ChestService`'s attribute bag (an
  attributed reward already grants as its own row), and
  `buildQuestChestDefinitions`' content-attribute allowlist. Exactly the 14
  affected chests changed in the regenerated `chests.json`;
  `quest-chests.json` was rebuilt unchanged. Converter re-pinned in
  `content/source-manifest.json` (`parity:check` green).
- **"Impassable" doors were wildlife, not walls**: live execution of the
  real `World`/`MovementRules`/`DynamicMapItems` pipeline at all three tiles
  (aids 4603/909/3600) proved every gate passes — the deterministic refusal
  was the seeded monster AI parking the same monster in the same doorway
  every run. `startPlaytestServer` gained `disableCreatures` (sets
  `creatures.enabled: false` in the parity config) and the door sweep uses
  it; it also now asserts unlocks by the catalog's OPEN door id, reports the
  wire `position-correction` reason on refusals, and drops each spent
  key/bag after its door (25+ accumulated grants overflowed the sweeper's
  top-level slots and hid later keys inside the bag).
- **Keyless doors decided per door** (now in `todo/quests.md`): 3610 healed
  with the chest fix; 3001/3003–3007/808 sealed (no source exists in Canary
  either); 3002 sealed (Canary's own chest entry is broken upstream);
  3012/3940/3142/3666 recorded as NPC-dialogue imports with exact Canary
  refs. Doors 3301/3302 turned out to sit on custom 12035 doors whose key is
  inert in Canary too — they open by plain use, and the sweep now mirrors
  that fallback.
- **Chest 6249 demystified**: not dead geometry — its pocket is gated by
  quest-variant door 5104 at (32876,31957,11), which fails closed until
  quest storage ships. Recorded under the quest-state project; needs no
  map change.
- Chest sweep reward check also consults the carried summary
  (`inventory.carried`), which sees closed-bag contents top-level slots
  cannot. Two TODO.md entries added: the door-open override never supplies
  a ground speed, and `overrideMapData.isWalkable` shadows `blocksPath`
  for pathfinding whenever an override exists.

**Files**: `server/src/action/{resolveWorldAction,WorldAction,worldActionPreconditions,ChestDefinition,loadChestDefinitions}.ts`,
`server/src/chest/{ChestService,buildQuestChestDefinitions}.ts`,
`server/src/playtest/{startPlaytestServer.ts,scenarios/questDoorKeySweep.ts,scenarios/questChestSweep.ts}`,
`tools/importCanaryChests.mjs`, `server/data/chests.json`,
`content/items/canary-chests.json`, `content/source-manifest.json`, tests.

**Verified**: `playtest:quest-chests` 387/388 chests grant+empty correctly
(367 direct + 20 shared-key empties; sole finding is quest-door-gated 6249);
`playtest:quest-doors` PASS — every reachable key door opens and walks
through (34 by key, 2 by plain use, 12 decided no-key-source);
`playtest:rookgaard`, `playtest:cultist-key`, `playtest:gate` all PASS;
server unit suite (3 957 tests), tools tests, `parity:check`, typecheck all
green.

**Residual risk**: chest use no longer requires the host item on the tile —
acceptable because the position table is server data, reach/visibility/house
checks still run, and the durable per-character looted gate lives in the
chest store; a count-1 charged reward still grants catalog-default charges
where Canary would grant a 1-charge item (no such reward ships today).

## 2026-08-10 — Cults of Carlin hideout exit portal (players were trapped)

**Problem**: stepping on the exit portal at (32351,31679,8) in the Carlin
cultist hideout did nothing, stranding players in the hunt area. The OTBM
stores that teleport with destination 0,0,0 — Canary drives it from a Lua
MoveEvent (`movements_movement-cults-of-carlin-teleport.lua`) — so the map
converter dropped it as `missing-destination` and no transition existed.

**What changed**: added `QUEST_TELEPORTS`, a position-keyed table of
script-driven step-in portals (destination + landing effect), applied by
`PressurePlateRegistry.onStepIn` right after movement gates and before
plate/trap handling. First entry: the Carlin hideout exit, returning the
player to the crypt at (32403,31813,8) with the teleport effect at the
landing, matching the Canary script. Parity ledger entry for the Lua flipped
to `implemented`.

**Second trap on the same path**: the returning player then faces the
decaying wall from the south, and only the north torch at (32400,31793,8)
was registered in `QUEST_TOUCH_ACTIONS` — but the OTBM stamps aid 5524 on a
second sconce at (32395,31808,8) inside the corridor. Registered that
position on the same shared `QuestTouchDefinition` and added an optional
`cooldownKey` to the definition (used by `QuestTouchService` in place of the
touched tile's position key) so both sides share one cooldown, mirroring
Canary's single global storage.

**Files**: `server/src/action/questTeleportTables.ts` (new),
`server/src/action/{PressurePlateRegistry,questTouchTables,QuestTouchService}.ts`
(+ their tests), `server/src/playtest/scenarios/cultsCarlinPortal.ts` (new),
`server/package.json`, `content/canary-world-action-parity.json`.

**Verified**: `yarn playtest:carlin-portal` PASS end to end — enters the
hideout via the static crypt portal's destination, steps onto the exit tile,
lands at (32403,31813,8), touches the inside sconce (grinding line), and
walks north through the removed wall tile; `yarn playtest:cultist-key` still
PASS (north torch chain); `PressurePlateRegistry` 15/15 and
`QuestTouchService` 7/7 vitest; server typecheck clean.

**Residual risk**: only this one portal ships in the table; the ~45 other
movement-triggered tiles (triage bucket D) and ~25 teleport-on-use E entries
remain deferred in `todo/quest-parity-triage.md`. QUEST_TELEPORTS entries are
unconditional (no storage/level gating) — storage-gated portals must not be
added to it until quest storage ships.

## 2026-08-10 — Spell cooldowns: persist failure (duplicate key) and clock-skew restore cap

**Problem**: exevo gran mas vis / exevo gran mas flam appeared stuck on
cooldown forever (both buttons frozen at "36" — the shared `group:focus`
entry, 40 s base minus the 4 s wheel grade-2 reduction; the action bar clamps
the displayed remaining to `totalMs`, so any absurdly long cooldown renders
as a full, motionless overlay). The server also logged
`failed to persist cooldowns for <id>: duplicate key value violates unique
constraint "character_spell_cooldowns_pkey"` on every disconnect whose flush
shared a key with the previous rows.

**Root causes**: (1) `replaceCooldownsQuery` did the full replace as
`WITH deleted AS (DELETE ...) INSERT ...`; the sub-statements' execution
order is unspecified, so re-inserting a key that already had a row raised
duplicate_key and the whole flush failed — cooldowns silently stopped
persisting once any key survived a relog (charter rule 8 leak: relogging
could shed a cooldown). (2) The login restore trusted persisted `ready_at`
unbounded. `monotonicNow()` is `performance.timeOrigin + performance.now()`,
and the monotonic clock stalls while the host sleeps (WSL2 laptop), so the
in-process clock lags wall time; a row written before a sleep then sits far
in the *future* of the lagged clock and restored as an hours-long cooldown
on a 36 s spell.

**What changed**: `replaceCooldownsQuery` rewritten as upsert-incoming +
delete-keys-that-dropped-out (the two legs touch disjoint rows, so the
same-statement hazard cannot recur); `CharacterHandler` login restore now
caps `readyAt` at `now + totalMs` so no restored cooldown can exceed the
spell's own total.

**Files**: `server/src/combat/sql/replaceCooldownsQuery.ts`,
`server/src/CharacterHandler.ts`,
`server/src/combat/PgCooldownStore.integration.test.ts` (regression:
same-key replace), `server/src/GameServer.test.ts` (regression: restored
cooldown capped at its total).

**Verified**: new integration test reproduced the exact duplicate-key error
before the fix and passes after (4/4 against local docker Postgres); new
GameServer relog test passes plus the existing carry-across-relog test
(40/40); server typecheck clean.

**Residual risk**: `monotonicNow()` drift across host sleeps is systemic
(recorded in TODO.md); the cap only bounds the damage for cooldowns.

## 2026-08-10 — Server crash under kill bursts: pooler exhaustion + unhandled save rejection

**Problem**: Killing many cultists in Carlin crashed the whole server with
`EMAXCONNSESSION` ("max clients reached in session mode"). Two stacked bugs:
(1) `server/.env` (the file `yarn dev` actually loads — not the root `.env`)
pointed at the Supabase *session-mode* pooler (port 5432) with
`PG_POOL_MAX=25`, but session mode pins one backend per pool client and caps
clients at pool_size 15, so a save burst fatally rejected client #16.
(2) That rejection escaped as an unhandled promise rejection and killed the
process: `beginExternalMutation` promises are handed fire-and-forget to
combat lanes (`conjureForCombat`, `usePotionForCombat`), whose early-return
paths never attach a handler; `SpellCaster.executeConjure` also ignored
`conjureForCombat`'s return value, leaving `externalMutationPending` stuck.

**What changed**: `server/.env` now uses the transaction pooler (6543,
matching the root `.env` and its comment) so client connections multiplex
over the backend pool and bursts queue instead of erroring;
`CharacterPersistence.beginExternalMutation` pre-attaches a no-op catch to
the promise it returns (real consumers still see the rejection; a dropped
promise can no longer crash the process); `SpellCaster.executeConjure` now
cancels the external mutation and returns false when the item lane refuses
the op; `isTransientDatabaseError` treats Supavisor "max clients reached"
(generic XX000) as transient so saves back off and retry instead of
poisoning the character.

**Files**: `server/.env`, `server/src/character/CharacterPersistence.ts`,
`server/src/combat/SpellCaster.ts`,
`server/src/character/isTransientDatabaseError.ts`,
`server/src/character/CharacterPersistence.test.ts` (regression: dropped
begin promise after a failed save must not raise unhandledRejection).

**Verified**: regression test fails with the guard removed and passes with
it; full character + combat unit suites pass (14/14 and 172/172); server
typecheck clean; live `SELECT 1` against the 6543 transaction pooler OK.

**Residual risk**: env-file edits don't hot-reload — `yarn dev` must be
restarted to pick up the new `DATABASE_URL`. Dev Supabase's pool_size 15 is
still small; real player-scale load wants a bigger pooler/DB tier (prod
sizing is a deploy concern, not a code change).

## 2026-08-10 — Adventurer's stone: bound-slot grant for every character

**Problem**: Canary's adventurer's stone (16277, used in a city temple to
travel to the Adventurers Guild) existed in our catalog but nobody owned
one, and the parity ledger defers its use effect. Requested: every
character — new and existing — carries one permanently.

**What changed**: new characters get an adventurer's stone seeded next to
the Loot Pouch in the bound container (`getStarterSet` COMMON_BOUND_CONTENTS);
the stone joined the bound-item allowlist on both server and client mirror,
so like the pouch/Portable Seller it may enter the bound root but never
leave it (move/drop/trade/depot all refuse); a catalog override pins it
`movable: false` and trims the "replacement available at temples" line from
the description; `scripts/backfillBoundContainers.ts` was generalized from
pouch-only to a `BOUND_STARTER_ITEMS` list (pouch + stone) so one
`yarn db:backfill-bound` run seeds any missing bound starter item, moving a
stray existing copy into the bound root instead of duping.

**Files**: `server/src/item/adventurersStoneTypeId.ts` (new),
`server/src/item/getStarterSet.ts`, `server/src/item/boundItemTypeIds.ts`,
`client/lib/inventory/boundItemTypeIds.ts`,
`server/src/item/overrides/utilities/adventurers-stone.ts` (new) +
`ITEM_OVERRIDES.ts` + `bound-items.ts` description,
`server/scripts/backfillBoundContainers.ts`, tests in
`getStarterSet.test.ts` and `boundSlotRules.test.ts`.

**Verified**: new bound-slot cases (stone locked in: move-out/drop/trade
refused; one-way entry allowed) plus updated starter-set assertions pass;
full server (3967) and client (463) unit suites green; both typechecks
clean; backfill run against the dev DB with the game server stopped —
9 stones created for 9 characters, and a second run reported 0 created /
18 already in place (idempotent).

**Residual risk**: the stone's temple-teleport use effect is still deferred
(`canary-world-action-parity.json` `adventurersStone`, todo-13 Feature 51) —
the item is inert until that lands, though its description already promises
the teleport. Production has NOT been backfilled: after deploying, stop the
prod server (or verify 0 online via PUBLIC_API_URL) and run
`yarn db:backfill-bound` there.

## 2026-08-10 — Key mapping wired for real: rebindable controls (Feature 87, hotkey slice)

**Problem.** The settings dialog's "Hotkey Mapping" view was a preview: a
local `useState` of seven dropdowns whose footer admitted the mappings
"do not change runtime controls yet". Real key handling was hardcoded in
six places (`HOTKEY_BINDINGS`, movement `KEY_DIRECTIONS`, turn
`TURN_DIRECTIONS`, action-bar reserved list, navbar `hotkey` label props,
the modal's own `DEFAULT_HOTKEYS`), and most top-navbar panels had no key
at all.

**What changed.** One vocabulary (`client/lib/hotkeys/keyBindings.ts`)
now defines every rebindable action — movement (4), all 23 panel toggles
(every top-navbar button and character-menu entry, incl. quests, battle
list, minimap, market, store, highscores, wiki, wheel, forge, prey,
hunting tasks, hunt finder, tracker, imbuement tracker, profile, outfits,
proficiency), game menu, and bug report — in three UI categories, with
historical defaults (WASD, I, C, P, G, H, V, Esc, Ctrl+Z) and everything
else unassigned. Bindings persist in a localStorage zustand store
(`useKeyBindingsStore`, key `mantus-key-bindings`); assigning a key
steals it from its previous owner; a persisted-snapshot merge backfills
actions added later. `resolveHotkey` matches serialized combos (modifier
combos now supported), movement/turn handlers derive their key maps from
bindings — arrows + numpad diagonals stay built-in unless the user binds
them to something else. Panel open/close behavior (with first-open
fetches) moved to `createPanelActions.ts`, shared by GameNavigation and
the hotkey controller so keyboard and navbar can't drift. The settings
view is a categorized press-a-key capture UI (Esc cancels, Backspace
clears); navbar/character-menu tooltips show live binding labels.

**Files.** `client/lib/hotkeys/{keyBindings,serializeKeyBindingEvent,formatKeyBinding,resolveHotkey}.ts`
(deleted `hotkeyBindings.ts`), `client/lib/movement/{getMovementKeyDirections,getHeldMovementDirection,getKeyboardTurnDirection}.ts`,
`client/stores/useKeyBindingsStore.ts`, `client/hooks/useHotkeys.ts`,
`client/components/game-window/{createPanelActions.ts,GameNavigation.tsx,controllers/GameWindowHotkeyController.tsx,controllers/GameWindowConnectionController.tsx}`,
`client/components/settings/{KeyBindingsView,KeyBindingCaptureButton,GameMenuModal}.tsx`,
`client/components/navigation/TopNavigationBar.tsx`, locales (en/pt-BR
`hotkeys.*` rebuilt), `client/vitest.config.ts` (unit include +
`stores/**`). Merged via `agents/key-bindings` (686cf63f).

**Verified.** `yarn typecheck`, `yarn test` (476 tests; new suites for
combo serialization, hotkey resolution incl. rebinds/clears, movement key
maps incl. arrow-release/steal, store conflict-stealing/reset),
`yarn build`; lint clean on touched files (2 pre-existing errors
elsewhere untouched).

**Residual.** (1) Bindings are per-device (localStorage), unlike the
server-persisted action bar — fine for now, revisit if cross-device sync
is wanted. (2) Action-bar slot hotkeys and the keymap store don't check
each other for conflicts (action bar wins at runtime via its
capture-phase listener; its reserved list still hardcodes bare WASD
rather than the live movement bindings). (3) While the game-menu modal is
open, panel hotkeys are ignored (previously only the C key worked there).
(4) Behavior change: toggling stats via hotkey now mirrors the navbar
button exactly (opens inventory alongside stats).

## 2026-08-10 — Minimum ambient light: night and caves no longer near-black

**Problem**: after the world-lighting merge, deep night (ambient 40/255 ≈
16%) and especially caves (ambient 0 — pure black outside light radii)
were judged too dark to play comfortably.

**What changed**: `client/lib/render/WorldRenderer.ts` gained
`MINIMUM_AMBIENT_LEVEL = 64` — a fixed comfort floor under the frame's
ambient level (the concept behind OTClient's `m_minimumAmbientLight`).
Night now bottoms out at 64/255 ≈ 25% brightness and underground floors use
the same floor instead of 0. Server world light is untouched (Canary
parity: day 250 / night 40 still broadcast); the own-player minimum glow
still keys off the raw pre-floor level so it appears at night and
underground as before. TODO.md's world-lighting gap entry updated — the
remaining deferral is a player-adjustable slider, not the floor itself.

**Verified**: client typecheck clean; WorldRenderer + computeLightmapPixels
suites pass (9/9).

**Residual risk**: none beyond taste — if 64 feels too bright/dark it is a
one-constant tune.

## 2026-08-10 — Minimum ambient light becomes a settings slider (OTClient parity)

**Problem**: the night/cave comfort floor added earlier today was a hard
constant (64/255); OTClient exposes the same knob as a player-adjustable
"minimum ambient light" setting.

**What changed**: the settings modal gained a "Graphics" section with a
0–100% `RangeSlider` (default 25% = the old constant). The value persists
in `useGameSettingsStore` (localStorage `mantus-game-settings`, client-only
— deliberately not server `uiSettings` since it is a per-device render
preference). `WorldRenderer` turned the constant into a field with
`setMinimumAmbientLevel()` (clamped 0–255, applies next frame);
`minimumAmbientLevelFromPercent` maps slider % → level.
`GameSettingsOverlay` pushes changes live to the renderer;
`GameWindowConnectionController` pushes the persisted value once at
renderer creation. Locale strings added in en + pt-BR
(Gráficos / Luz ambiente mínima).

**Files**: `client/stores/useGameSettingsStore.ts`,
`client/lib/render/WorldRenderer.ts`,
`client/lib/render/minimumAmbientLevelFromPercent.ts` (+ test),
`client/components/settings/GameMenuModal.tsx`,
`client/components/game-window/GameSettingsOverlay.tsx`,
`client/components/game-window/controllers/GameWindowConnectionController.tsx`,
`client/locales/{en,pt-BR}.json`,
`client/stories/GameMenuModal.stories.tsx`, `TODO.md` (slider deferral
removed from the world-lighting gap entry).

**Verified**: client typecheck clean; unit tests 7/7
(minimumAmbientLevelFromPercent + WorldRenderer); GameMenuModal storybook
interaction tests 5/5 (Settings play drags the slider and asserts the
callback); eslint clean on all touched files.

**Residual risk**: at 100% the lightmap ambient is 255 — the overlay still
renders (dark flag keys off the server level) but multiplies by ~1.0,
wasting a little GPU for a player who maxes the slider; harmless.

## 2026-08-10 — Adventurer's stone use: temple ↔ Adventurers Guild teleport

**Problem**: right-clicking the adventurer's stone (16277, granted to every
character 2026-08-10) did nothing — the Canary `adventurersStone` action was
deferred in the parity ledger, and the item had no use kind, so the client
did not even offer "Use".

**What changed**: `getItemUseKind` returns `activate` for the stone, and a
new `AdventurersStoneService` sits in the `use-item` dispatch chain beside
the Portable Seller (`GameServer.ts`). The pure rule lives in
`resolveAdventurersStoneTeleport`: usable only on a protection-zone tile
that is not in a house and never while pz-locked (Canary's exact gate);
inside one of the 17 Canary temple boxes (`adventurersStoneTables.ts`,
coordinates verbatim from `adventurers_stone.lua`, each with its town's
temple from `otservbr.map.json`) it teleports to the guild arrival tile
32210,32300,6, storing the town id in `Quest.U9_80.AdventurersGuild.Stone`;
inside the guild PZ box it returns to the stored temple (home-town temple,
then world temple, as fallbacks) and clears the storage. Refusal mirrors
Canary: poff effect + "Try to move more to the center of a temple…" via
combat-log. Teleporting reuses the store's temple-teleport recipe, extracted
as `GameServer.teleportPlayerTo` (find free tile radius 2, clear
movement/attack, `onPlayerTeleported`, markDirty); teleport magic effect
plays at both ends. **Deliberate deviation**: Canary's return trip is a
step-in tile (aid 4253) — ours is using the stone again at the guild, which
also functionally covers `movements/teleport/adventurers_guild.lua`. The
guild magic door (17318/17319) stays deferred.

**Files**: `server/src/action/AdventurersStoneService.ts`,
`resolveAdventurersStoneTeleport.ts`, `adventurersStoneTables.ts` (new) +
tests; `server/src/GameServer.ts` (wiring + `teleportPlayerTo` extraction),
`server/src/item/getItemUseKind.ts`,
`server/src/playtest/scenarios/adventurersStone.ts` (new,
`yarn playtest:adventurers-stone`); parity ledger entry flipped to
implemented; triage rows updated in `todo/quest-parity-triage.md`.

**Verified**: 14 new unit tests (decision rules, inclusive Canary box
corners, table integrity against `otservbr.map.json` towns, service
effects/storage/failure paths); full server suite 3981 passed; typecheck
clean; live e2e playtest on the real map — refusal on a Thais street,
temple → guild lands exactly on 32210,32300,6, guild → back to the Thais
temple.

**Residual risk**: the guild "at the guild" detection is a hand-probed PZ
box (32195-32230 × 32285-32315, z6) around the arrival tile — a player who
wanders off the guild island's PZ (or upstairs) gets the refusal hint until
they walk back. Characters GM-teleported to the guild with no stored town
return to the world spawn temple (home town 1 has no temple box).

## 2026-08-11 — Exercise training never stopped when the trainer walked away

**Problem**: starting a run on an exercise dummy and then walking off kept the
training going — charges kept burning and skill tries kept landing from
anywhere, as long as the player stayed inside some protection zone. Nothing in
`ExerciseTrainingHandler`'s tick looked at where the trainer was standing;
reach was validated only when the use intent arrived (charter rule 4, missed).

**Canary**: `Creature::onCreatureMove` (`src/creatures/creature.cpp`) clears
the flag on any *self* move — `if (player->isExerciseTraining())
player->setTraining(false)` — and the next `exerciseTrainingEvent` tick sees
`player:isTraining() == 0`, says "You have stopped training." and tears the
event down. So a single step ends the run in Canary, whatever the weapon's
reach was when it started (rods, wands and bows can *start* up to 7×5 tiles
away, but they cannot follow the player). There is no distance re-check in the
loop at all; movement is the rule.

**What changed**: `ActiveTraining` now records `trainerPosition` — the tile the
player stood on when training started — and the tick ends the run with Canary's
"You have stopped training." as soon as `player.position` differs from it.
Because it compares positions rather than hooking the walk path, it also covers
teleports, pushes and any other way the player leaves the tile. The check sits
*after* the protection-zone check on purpose: a step that also left the zone
keeps the more specific "You are no longer in a protection zone, the training
has stopped." message (in Canary that message is effectively unreachable, since
the move flag fires first).

**Files**: `server/src/action/ExerciseTrainingHandler.ts` (+ its test).

**Verified**: 2 new unit tests — a step to a neighbouring tile that is still in
the protection zone *and* still adjacent to the dummy stops the run and spends
no further charges (it fails on the pre-fix handler, checked by stashing the
change), and a far-use rod keeps training from 3 tiles away while the trainer
stands still. Full server suite 3986 passed, 0 failed; typecheck clean.

**Residual risk**: a player who steps off and back onto the same tile inside a
single server tick would not be caught — physically impossible at walk speed,
but it is the one behavioural gap versus Canary's flag-on-move.

## 2026-08-11 — The Adventurers Guild exit portal did nothing, and 74 more map portals with it

**Problem**: stepping into either shimmering portal north of the Adventurers
Guild hall (32209/32210,32292,6) did nothing at all — the player just stood on
it. The stone gets you *to* the guild, but the way Canary players leave is that
step-in portal, and ours was dead. Auditing it turned up the same failure across
the map: the OTBM item carries teleport destination 0,0,0 (Canary drives the
destination from Lua), or it carries a real destination plus an action/unique id,
which makes `tools/convertOtbm.mjs` drop it as `requires-content-action`.

**Canary** (`a879c931`): three mechanisms feed one behaviour.
`movements/teleport/adventurers_guild.lua` (aid 4253, stamped onto the map item
by `startup/tables/teleport.lua`) reads
`Storage.Quest.U9_80.AdventurersGuild.Stone`, teleports to that town's temple
and resets the storage. `scripts/movements/others/teleport.lua` applies
`TeleportUnique[38001-40000]` — a pure data table of destination + effect with no
condition at all. And the C++ `Teleport::addThing` (`src/game/movement/teleport.cpp`)
teleports on any tile whose item has a non-zero destination, regardless of the
action id a Lua script may also be registered on — so "has an aid" is not a
reason to disable a portal, only "a script claims that aid" is. The elemental
shrine flames (`shrine_entrance.lua`/`shrine_exit.lua`) are a fourth case: they
are registered on bare positions and carry no OTBM teleport item at all, so the
converter never sees them.

**What changed**:
- `AdventurersGuildExitService` (new) resolves the guild exit destination inside
  the tick from the player's own storage — stored town, else their home town,
  else the world temple — teleports through `GameServer.teleportPlayerTo` (which
  lands on the nearest free tile, so a crowded temple cannot swallow the trip),
  clears the storage and flashes the teleport effect at both ends. The temple
  resolution moved into `resolveStoredTempleDestination` and is now shared with
  the stone's return leg.
- `QUEST_TELEPORTS` grew from 1 to 77 rows: all 38xxx/39xxx `TeleportUnique`
  destinations reachable on foot (Deeper Fibula, Draconia, Demon Helmet,
  Alawar's Vault, the Paradox Tower, Faceless Bane, the 20-portal Grave Danger
  maze), the unconditional Lua step-ins (Vengoth castle, Dreamer's court and
  death ring, White Pearl, the deathling sanctums, the Port Hope waterfall
  cave, the Secret Library pair, the Essence of Malice exit, the banshees' last
  seal), and the 11 map-destination portals no Canary script claims (Deeper
  Banuta's element pairs, the Ape City catacombs, the library's Liquid Death
  wing, the Cults of Tibia Sandking exit, a Ferumbras habitat corridor, the
  Formorgar lift). `effectId` is now optional, because some Canary handlers play
  nothing. Deeper Banuta's death portals (aid 64022/64023) are the one
  deliberate deviation: both OTBM destinations are solid mountain wall (ground
  1128 + wall 23828), which Canary force-moves the player into, so each row
  lands on the open floor beside the paired portal instead.
- `ElementalShrineService` + tables (new): the 52 city flames and 13 shrine
  flames. Level 30 or the stepper is pushed back where they came from with
  Canary's line; the city index is remembered in `ShrineEntrance` storage and
  the shrine flames return the player to it (home temple when unset).

**Files**: `server/src/action/AdventurersGuildExitService.ts`,
`resolveStoredTempleDestination.ts`, `ElementalShrineService.ts`,
`resolveElementalShrineStep.ts`, `elementalShrineTables.ts`,
`questTeleportTables.ts`, `adventurersStoneTables.ts` (guild exit portals),
`resolveAdventurersStoneTeleport.ts`, `PressurePlateRegistry.ts` (optional
effect), `GameServer.ts` (two step-in hooks), `server/src/readMapWalkability.ts`,
`server/src/playtest/gotoTile.ts`, playtest scenarios
`questTeleportSweep.ts`/`elementalShrines.ts` (+ `adventurersStone.ts` third
leg), and the four new test files.

**Verified**: `yarn playtest:adventurers-stone` now walks out through the exit
portal to the Thais temple; `yarn playtest:quest-teleports` (new) walks into all
77 table portals in the real world and 76 teleport correctly (the Dreamer's
death-ring exit is sealed behind quest scenery, so no tile beside it is walkable
— reported, not skipped silently); `yarn playtest:shrines` (new) proves the
level-30 refusal, the ice-shrine trip and the return to Thais;
`yarn playtest:carlin-portal` still passes. Table tests assert every source and
destination is a walkable tile in `otservbr.map.bin` and that no row duplicates
a static map transition. Server suite 4005 passed, 0 failed; typecheck clean.

**Residual risk**: the ported scripts do only the teleport — Canary's side
effects (banshee seal storages, Dreamer's tree regrowth, White Pearl's pot
variant) are not modelled. Everything still dead is listed tile by tile in
`todo/teleport-gaps.md` and summarised under "Accepted gaps" in `TODO.md` (gated portals, use-activated teleports, citizen tiles,
swimming-only vortices, two blocked-destination portals, and ~1,140 unattributed
zero-destination placements).

## 2026-08-12 — Monsters spawned, walked and were summoned inside protection zones

**Problem**: monsters could stand in town. Thirteen enabled monster spawn
points sit on protection-zone tiles in the imported map (fauns and boogies in
Feyrist, snakes and rabbits outside Thais and Carlin, a blood crab under
Rookgaard), and nothing stopped the rest from walking in: `MovementRules`
enforced the protection zone only against pz-locked *players*, so any lured
monster, any monster summon and any wandering creature could follow someone
into a temple or depot and park there. `/spawn` inside the Thais temple placed
a rat on the spot, which is how the report came in.

**Canary**: `Tile::queryAdd` (`src/items/tile.cpp:664`) refuses a monster on a
tile flagged `TILESTATE_PROTECTIONZONE` outright — placement *and* movement,
the only exception being familiars whose master is not attacking (we have no
familiars). Monster pathfinding runs every candidate tile through the same
check (`Map::getPathMatching`, `src/map/map.cpp:138`, and
`Monster::canWalkTo`), so a chase routes around a town rather than dead-ending
at its border. `utevo res` places with `force=false`
(`data/scripts/spells/support/summon_creature.lua`), so summoning inside a
protection zone fails for lack of room. The one place Canary contradicts
itself is the runtime respawn: `SpawnMonster::spawnMonster` calls
`placeCreature(..., forceLogin=true)` (`spawn_monster.cpp:225`), which skips
`queryAdd` entirely — that is exactly how monsters end up standing in a town
there. Its *startup* path (`internalPlaceCreature`, `force=false`) refuses
them. We follow the startup rule in both cases; the deviation is deliberate
and commented at the call site.

**What changed**:

- `MovementRules.monsterZoneBlocked` refuses any `Monster` step onto a
  protection-zone tile — ordinary steps, chases, and forced fear movement.
- `World.canCreaturePathTo` rejects protection-zone tiles for monsters, so
  paths route around a town instead of piling up on its border. It now reads
  the tile once for both flags (it runs per visited node of every path search).
- `World.canMonsterOccupy` is the single "may a monster stand here" predicate;
  `TileOccupancy.findUnoccupiedPosition` takes an optional filter so monster
  placements can pass it.
- `SpawnManager` drops monster spawn slots whose home is a protection zone at
  load (13 of 83,369 on the world map; NPC slots — 234 of 1,008 sit in towns
  by design — are untouched), refuses to place a monster on one at spawn time,
  and applies the same rule to GM `/spawn`, world-event spawns, player summons
  (`utevo res`) and monster-to-monster summons.
- `MonsterEventService`'s "teleport to the player" event skips the relocation
  when the target reached a town during its two-second warning.
- GM `/spawn` inside a zone now answers "Monsters cannot stand in a protection
  zone." instead of the generic no-free-tile line.
- `playtest:look` stood in the Thais temple to summon its rat; it now steps
  out to 32369,32260,7 for the spawn and returns.

**Files**: `server/src/world/MovementRules.ts`, `server/src/World.ts`,
`server/src/world/TileOccupancy.ts`, `server/src/spawn/SpawnManager.ts`,
`server/src/creature/MonsterEventService.ts`,
`server/src/gm/GmCommandHandler.ts`,
`server/src/playtest/scenarios/lookDescriptions.ts` (+ tests in
`SpawnManager.test.ts` and `MonsterBrain.test.ts`).

**Verified**: 4 new unit tests — a monster spawn point inside a zone never
spawns while an NPC point beside it still does; ad-hoc, event and player
summons inside a zone are all refused while the same summon works one tile
outside; a monster whose target flees into a zone never sets foot inside it
across 113 brain ticks and drops the target; and a monster step, a feared step
and a monster path into a zone are all refused while a player walks in
unhindered. Each fails on the pre-fix code (checked by stubbing the guard).
Full server suite 4009 passed, 0 failed; typecheck clean. Live against the
real map (throwaway playtest probe on the local playtest DB): `/spawn rat`
standing in the Thais temple is refused, the same command on the zone border
places the rat on the first tile outside it, a rat spawned outside chased and
wandered for 12 s across 16 steps without ever entering the zone — and the
identical probe run against `main` spawns the rat inside the temple.

**Residual risk**: a monster that is somehow already inside a zone (a quest
lever relocation, a boss-room script) can still stand there; it can walk out
but cannot path through zone tiles to do so. Nothing in the current content
does that.

## 2026-08-28 — Production database moved from Supabase to Fly Postgres in dfw

**Problem**: the game machine sat in dfw while every query crossed to
Supabase in `aws-1-us-west-2` (~45 ms round trip), and login alone is ~28
sequential round trips. The DB endgame was open because Fly Managed Postgres
has no dfw region.

**What changed**: created the unmanaged Fly Postgres app `mantus-db`
(Postgres 18.1, `shared-cpu-1x`, 3 GB volume, dfw), a `mantus` login role
that owns the `mantus` database (the `postgres` superuser is not used by the
app), and migrated the data with the server stopped: `pg_dump -Fc --no-owner
--no-privileges -n public` from the Supabase session port, run on the
`mantus-db` machine itself (the flex image ships the pg 18 tools; nothing is
installed locally), `pg_restore` as `mantus`, then an exact per-table
`count(*)` diff across all 73 public tables (6 accounts, 11 characters, 256
items, 16 062 audit rows, migrations at 79) — identical both in a live
rehearsal and in the final run. No extensions or Supabase schemas were in
use, so the schema restored unchanged. Prod `DATABASE_URL` now points at
`postgres://mantus:…@mantus-db.flycast:5432/mantus` (Fly secret only);
`SUPABASE_URL` stays for JWT verification. Volume snapshot retention raised
from 5 to 14 days. Downtime 20:38–20:42 UTC; auto-start was disabled on the
game machine for the window so an inbound connection could not revive it
mid-copy, then restored.

**Files**: `server/.env.example` (connection guidance), `TODO.md` (backup
gap replaces the region gap; connection-budget note updated),
`docs/server-capacity.md` (decision note), `gitworktree.md`.

**Verified**: server booted against the new DB (world-seed check passed),
TCP health check passing, `/api/public/highscores` serves the migrated
characters, `pg_stat_activity` shows the app's pool connected as `mantus`.
Dump files were deleted from the DB machine afterwards.
`yarn db:migrate` run through `fly proxy 15432:5432 -a mantus-db` found and
applied `080_default_loot_coins.sql` — prod had been one migration behind
head since 2026-08-09 (the migration is a column default plus an idempotent
loot-filter seed, so running it live was safe). Migration checksums 001–079
matched the restored `schema_migrations`.

**Residual risk**: single-node cluster with snapshot-only backups (TODO.md).
Local `.env` still targets the old Supabase project, which now serves as the
dev database and a frozen archive of the pre-move data; delete it only after
the logical-backup job exists.

## 2026-08-30 — Raid spawns were handed protection-zone tiles (rats in the Thais temple)

**Problem**: Thais' rat plague was seen spawning rats inside protection
zones on prod. Two causes. (1) The 2026-08-12 protection-zone exclusion
(`agents/monster-pz-exclusion`) was never pushed: `origin/main` sat at
`9f83542c` (Aug 11) and prod v96 was built from that sha, so the deployed
server still had no monster/zone rule at all. (2) Even at head,
`WorldEventManager.randomAreaPosition` only checked walkability and
occupancy. The Thais raid area spans the whole town — 2005 of its 5333
walkable tiles are protection zone — so ~38% of picks landed in the temple
or depot and were handed to `SpawnManager.spawnEventMonsterNear`, which
either shifted them up to 3 tiles (piling rats along the zone border) or
returned `no-space` and silently lost the spawn.

**What changed**: `randomAreaPosition` retries a pick that fails
`world.canMonsterOccupy` (Canary `Tile::queryAdd`, tile.cpp), so the event
manager only ever hands the spawner a tile a monster may stand on. Added
`test/makeMonsterType.ts` (the `makeNpcType` counterpart) for tests that
need a real `SpawnManager`.

**Files**: `server/src/event/WorldEventManager.ts`,
`server/src/event/WorldEventManager.test.ts`,
`server/src/test/makeMonsterType.ts`, `gitworktree.md`, `todo/status.md`.

**Verified**: new test "never hands a raid spawn a protection-zone tile"
fails at the previous head (picks at (5,6), (2,4), (4,5) inside the zone)
and passes with the fix; new end-to-end test wires `WorldEventManager` to a
real `SpawnManager` the way `GameServer` does on a town map and asserts all
8 raid monsters stand outside the zone; `yarn vitest run src/event
src/spawn` 61/61, `tsc --noEmit` clean. Real-map PZ coverage of the raid
area confirmed by loading `data/otservbr` and counting tile flags.

**Residual risk**: none in code; the fix (and the 2026-08-12 one) only
reaches players once main is pushed and the Fly deploy runs.

## 2026-08-30 — Landing page redesign (`agents/landing-redesign`)

- **Problem:** the landing page was a three-column portal of framed panels,
  red banner headers and uppercase kicker labels; the key art was hidden
  behind them and the copy was long and generic ("Citadel", "From the
  realm", "Chronicles of Mantus").
- **What changed:** landing page no longer uses `PublicSiteLayout`. New
  `LandingHero` (full-bleed art, one headline, Play Free CTA, live player
  count, quick links), `LandingFeatures` (three short pillars + road art),
  hairline-divided `LandingNews`/`LandingNewsRow`, and a slim
  `LandingWorldPanel` (status, top 5, boosted). Copy rewritten in en and
  pt-BR; unused `landing.*` keys dropped. `mantus-citadel-hero.webp` renamed
  to `mantus-hero.webp`. `Button` gained an `lg` size; `PublicAuthAction`
  gained `guestLabel`. Other public pages keep `PublicSiteLayout` untouched.
- **Verified:** tsc, eslint, client unit tests, storybook build +
  headless screenshots at 1440px and 390px.
- **Residual:** none.

## 2026-08-30 — Pix payments: real-money Mantus Coin top-ups (Mercado Pago)

- **Problem:** there was no way to buy Mantus Coins with real money; "payment
  provider" had been open on the store status row since the catalog shipped.
- **What changed:** server-pinned package catalog (7 tiers at 10 coins per
  real, R$10→100 up to R$1000→10000) in
  `server/src/payments/PIX_COIN_PACKAGES.ts`; `pix_orders` table (migration
  081) with a one-pending-order-per-account partial unique index, a unique
  provider-payment index, a one-way status machine
  (pending→paid→credited / cancelled / expired / refunded) and five new audit
  event types. `PixOrderService` handles the `coin-order-open/create/cancel`
  intents (per-account cooldown, resume lane for orders stranded before the
  provider answered, provider-cancel-before-local-cancel so the pay race can
  never lose money), `MercadoPagoProvider` is a fetch-based client
  (X-Idempotency-Key = order id, integer centavos converted at the boundary,
  snapshot whitelisted under the 8 KB jsonb cap), `PixWebhookApi` validates
  the HMAC x-signature, rate-limits, acks then hands off — the webhook is
  only a hint; settling always re-fetches the payment from the API.
  `PgPixOrderStore.settleApproved` credits in ONE transaction (order flip +
  account balance + coin-ledger row keyed `pix-credit:<order>` + audit row),
  refuses amount mismatches, parks credits that would breach the balance cap
  as `paid`, and refunds claw back min(balance, coins) with the shortfall
  audited. A 60 s reconciliation sweep expires stale orders (best-effort
  provider cancel) and settles payments whose webhooks were lost. Client: a
  Get Coins button in the store opens `CoinOrderDialog` — package grid → QR
  rendered locally from the brcode (`qrcode` dep) with copia-e-cola copy and
  cancel — and `coin-order-completed` updates the live balance. i18n en +
  pt-BR.
- **Files:** `protocol/src/coinOrders.ts` (+ message unions),
  `server/db/migrations/081_pix_orders.sql`, `server/src/payments/*` (+ 4
  test files), GameServer/index wiring, `server/.env.example`
  (MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET,
  PIX_NOTIFICATION_URL, PIX_PAYER_EMAIL_FALLBACK),
  `client/components/store/CoinOrderDialog.tsx` / `PixQrCode.tsx`,
  StoreModal/GameCommerceOverlays/game-window store state,
  `client/lib/store/formatCentavosBRL.ts`, locales.
- **Verified:** protocol/server/client typecheck; 33 payment unit tests
  (signature vectors incl. forged/tampered secrets and replays; webhook
  forged-signature, oversized body, rate limit, non-numeric id; service
  catalog pinning, cooldown, cancel-vs-pay race, mismatch-never-credits,
  refund clamp); full client suite (479) and lint on every touched file.
  `PgPixOrderStore.integration.test.ts` (13 fraud/concurrency cases:
  duplicate-webhook race credits exactly once, create race leaves one pending
  order, cancel/expiry races still credit paid money, refund race refunds
  once and clamps at zero, balance-cap parking then credit) is wired into
  `test:integration` but was NOT run in this session — the local docker
  Postgres is unavailable in this WSL distro.
- **Residual risk:** amount-mismatch and balance-cap-parked orders only log
  `PIX ALERT` — no operator UI; refunds are claw-back only (no MED dispute
  flow); the payer-email fallback is a placeholder domain; production still
  needs Fly secrets, the MP webhook registration, and migration 081 applied.

## 2026-08-30 — Pix payments: defensive test sweep, forensic logging, refused-order state

- **Problem:** the Pix coin-purchase flow shipped the same day with 33 unit
  tests and a 13-case DB suite that had never executed (no Postgres in this
  WSL distro); several transitions were unlogged (order created, charge
  attached, cancel, expiry, credit success, webhook accept/reject); an
  approved payment reporting no amount would have been credited; the
  provider's `external_reference` and `currency_id` were never cross-checked
  against the order; an amount mismatch left the order `pending`, re-alerted
  every sweep for an hour, then vanished with no audit row; a webhook burst
  for one payment fanned out into N provider fetches + N serializable
  transactions; an order cancelled while its charge was being created left a
  payable orphan at the provider; an expiry whose provider-cancel was refused
  (paid at the deadline) was dropped from every future sweep; and the webhook
  buffered up to 16 KB of unauthenticated body before checking the signature.
- **What changed:** `logPix` (`server/src/payments/logPix.ts`) emits one
  grep-able `pix.<event> k=v` line per transition — order-created/resumed,
  charge-attached, charge-orphaned, order-cancelled, cancel-refused-by-
  provider, payment-fetched, credited, settle-refused (error), credit-parked
  (error), settle-replayed, refunded, refund-refused, cancelled-by-provider,
  order-expired, expire-cancel-refused, reconcile-sweep, webhook-accepted/
  rejected/ignored/rate-limited, intent-rate-limited/unauthenticated,
  operation-failed — never a brcode, e-mail, signature, body or token.
  `settleApproved` now takes amount+currency+externalReference and refuses
  (`refused` result with reason amount-mismatch | amount-unknown |
  currency-mismatch | reference-mismatch) into a new terminal `refused` order
  status with ONE `pix-settle-refused` audit row (migration 082 also adds
  `pix-credit-parked`, written once when a credit parks at the balance cap);
  `markRefunded` refuses a reference mismatch; every credit/refund audit row
  now carries previousStatus + balanceBefore/After. `PixOrderService`
  coalesces concurrent `notify` calls per payment id, cancels the provider
  charge when `attachCharge` finds the order no longer pending, re-checks a
  payment when the expiry cancel is refused, and sweeps its per-account
  throttle maps past 10k entries. `PixWebhookApi` verifies the signature
  before reading the body and logs every outcome with ip + request id.
  `MercadoPagoProvider.getPayment` returns `currency`. index.ts logs the pix
  config state at boot.
- **Files:** `server/db/migrations/082_pix_refused_orders.sql` (new),
  `server/src/payments/{logPix,PixOrderService,PgPixOrderStore,PixOrderStore,
  PixProvider,MercadoPagoProvider,PixWebhookApi}.ts`, `server/src/index.ts`;
  tests: `PixOrderService.test.ts` (65), `PgPixOrderStore.integration.test.ts`
  (52), `PixWebhookApi.test.ts` (25), `verifyMercadoPagoSignature.test.ts`
  (18), `MercadoPagoProvider.test.ts` (20, new, stubbed fetch),
  `coinOrderSchemas.test.ts` (9, new), `logPix.test.ts` (3, new).
- **Verified:** 192 payment tests green; the DB suite ran for the first time
  on an embedded Postgres 18 stood up from the `embedded-postgres` npm
  package in the session scratchpad (no docker needed:
  `TEST_DATABASE_URL=postgres://tibia:tibia_dev_only@127.0.0.1:54329/tibia`).
  DB cases now cover: create race (one pending order), one payment → two
  orders refused by the unique index, attach after cancel refused + settle
  finds nothing, cross-account cancel/open refused, duplicate-webhook race
  credits once, cancel-vs-settle and expiry-vs-settle races credit exactly
  once with one ledger row, two orders of one account cannot double-credit,
  six accounts settling concurrently stay isolated, pre-existing ledger
  request key blocks a re-grant, under/over/unknown amount + foreign currency
  + foreign reference all refused with zero ledger rows, refused order still
  credits after a corrected report, refund race clamps at balance with
  shortfall audited, approved replay after refund never re-credits, refund
  of never-credited/parked order touches no balance, refund-vs-credit race
  ends consistent, clawback vs concurrent spend never goes negative, expiry
  sweeps race-safe, reconciliation listing excludes every terminal state and
  bounds its batch. Full server unit suite 4151 passed; full
  `test:integration` 305 passed with the 8 pre-existing main failures (guild
  ledger ×3, conjuring audit, highscores ×3, item sweep — unrelated,
  recorded 2026-08-09). Server typecheck clean.
- **Residual risk:** see the TODO.md "Accepted gaps" Pix entry (no operator
  resolution command, partial refunds undetected, open outside the action
  cooldown, 24 h signature replay window that can only re-fetch). Migration
  082 must land on prod before this server build.

## 2026-08-30 — Pix payments: second hardening pass (every remaining gap from review)

- **Problem:** the post-review list still had real holes. The webhook rate
  limiter keyed on `x-forwarded-for` while prod (`server/fly.toml`
  `TRUST_PROXY=1`) only makes `fly-client-ip` trustworthy — a flood could
  pick its own bucket and burn the global ceiling so real MP notifications got
  429. The reconciliation sweep listed 50 orders by `created_at` with no
  check stamp, so ≥50 abandoned pending orders starved newer lost-webhook
  payments for an hour. One account could mint a provider charge per second
  forever (create→cancel loop). A payment approved for an order whose
  `attachCharge` never committed (restart, or a payer faster than the commit)
  matched nothing and stayed money-without-coins. Partial refunds (MP keeps
  `status=approved`, moves `transaction_amount_refunded`) were invisible.
  Refused/parked orders had no operator surface. A single webhook secret
  could not be rotated without downtime, and a captured notification could
  be replayed for the whole 24 h tolerance. A brcode longer than the wire cap
  (1024 vs the 2048 DB cap) would have been a payable QR the client silently
  dropped.
- **What changed:** migration `083_pix_hardening.sql` (`last_checked_at`,
  `refunded_centavos`, reconcile index, four audit event types).
  `PixWebhookApi`: `fly-client-ip` buckets (same source as the WS layer),
  `secrets: string[]` (env is comma-separated, new first), in-process replay
  cache of accepted `v1` digests (ack 200, no dispatch, `pix.webhook-replayed`).
  `PgPixOrderStore`: `createOrder` locks the account row and refuses past
  `maxPerHour` (`too-many-orders` → client `rate-limited`;
  `MAX_ORDERS_PER_ACCOUNT_PER_HOUR = 10`); `claimForReconciliation` claims
  with `FOR UPDATE SKIP LOCKED` ordered never-checked-first then
  least-recently-checked and stamps the claim (also multi-instance safe);
  `adoptPayment` pins an unmatched payment onto the stranded
  pending/expired/cancelled order its `external_reference` names (never onto
  an order that already has a charge; unique index still forbids sharing a
  payment) and the ordinary settle — with every cross-check — then decides;
  `attachCharge` is idempotent for the same payment id whatever the status so
  the late create flow reports "no open order" instead of cancelling a paid
  charge; `markRefunded` takes the cumulative `refundedCentavos`, claws back
  `ceil(coins·refunded/amount)` minus what earlier levels already took,
  keyed `pix-refund:<order>:<level>`, flips to `refunded` only when complete;
  `operatorCredit` (refused orders only, same `pix-credit:<order>` ledger key,
  cap-respecting, `pix-operator-credit` audit), `orderById`,
  `recentOrdersForAccount`, `accountIdByCharacterName`,
  `recordOperatorInspect`; money paths retry serialization aborts with an
  outer jittered loop (4×5 attempts). `PixOrderService`: hourly-cap answer,
  oversized-brcode close, late-attach answer, adopt-then-settle fallback,
  partial-refund application after settle, and the operator API
  (`inspect`/`credit`/`refund` — refund calls the new
  `PixProvider.refundPayment` under `pix-operator-refund:<order>` idempotency
  then claws back with `operatorCharacterId` audited as
  `pix-operator-refund`). `AccountRole`: `payments.inspect` (gamemaster,
  admin) and `payments.operate` (admin). `AdminCommandHandler`: `/pixorders
  <name>`, `/pixorder <id>`, `/pixcredit <id>`, `/pixrefund <id>` — invisible
  to anyone without the capability, audited (`pix-operator-inspect`).
  `COIN_ORDER_LIMITS.maxBrcodeLength` 1024→2048 to match the DB.
- **Files:** `server/db/migrations/083_pix_hardening.sql`,
  `protocol/src/coinOrders.ts`, `server/src/payments/{PixOrderStore,
  PgPixOrderStore,PixOrderService,PixProvider,MercadoPagoProvider,
  PixWebhookApi}.ts`, `server/src/auth/AccountRole.ts`,
  `server/src/admin/AdminCommandHandler.ts`, `server/src/GameServer.ts`,
  `server/.env.example`; tests in `server/src/payments/*.test.ts`,
  `server/src/admin/AdminCommandHandler.test.ts`.
- **Verified:** 256 tests across payments/admin/auth green, the DB suite (73)
  four times in a row on the embedded Postgres (a first version of the burst
  test asserted how losers were refused rather than the row invariant and
  was corrected; a 12-way settle race exhausted the shared helper's 5 retries
  once — hence the local outer retry). Covered: XFF spoofing cannot split
  buckets; replayed digest acked but dispatched once and a fresh-timestamp
  retry still dispatches; rotated secrets; hourly cap incl. cancelled orders,
  a burst never exceeds the cap, expiry of the window; adoption onto
  pending/expired/cancelled stranded orders, refused for charged/settled/
  foreign ids, adoption-vs-attach-vs-settle race converges on one credit;
  claim rotation order and two concurrent sweeps never share an order;
  partial refund 300→505→full claws 30/21/49 once each, replays and lower
  levels are no-ops, race applies once; operator credit only on refused,
  idempotent under race, cap-respecting, audited; operator refund refuses
  when the provider refuses. Full server unit suite and full
  `test:integration` results are in the session recap.
- **Residual risk:** see TODO.md Pix entry (open outside cooldown, 24 h
  tolerance with an in-process replay cache, placeholder payer e-mail, no
  dispute workflow, whole-payment operator refunds). Migrations 082+083
  applied to prod 2026-08-31 03:28 UTC via `fly proxy` + `yarn db:migrate`;
  the server build still needs deploying.


## 2026-08-30 — Store catalog: real art for service offers, every product described (`agents/store-catalog-polish`)

- **Problem:** audit of all 631 store products (17 categories). Eight
  service offers and five categories (Premium Time, XP Boost, Character
  Name/Sex Change, Prey Wildcard, Permanent Prey Slot, Permanent Hunting Task
  Slot, Temple Teleport) had no image — `StoreProductIcon` drew a Unicode
  glyph in a box. The Ultimate Mana Keg had an empty description (Canary ships
  none), and 326 house furniture/decoration products carried only tag lines
  (`{house}\n{box}…`) with no sentence of their own. Along the way three
  Canary item-id bugs surfaced: "Oven" delivered 37272 (a confetti cannon;
  the kitchen oven is 34272), and Colourful/Flowery Carpet pointed at each
  other's rolled-up kit; plus two name typos ("Ice_Chandelier", "Arrival The
  Thais Paint").
- **What changed:** `tools/importOtclientStoreAssets.mjs` now also imports
  OTClient-mehah's bundled 64×64 store product art (`modules/game_shop/images`,
  incl. the unnamed CipSoft `ex/` files identified by eye: 00012 prey slot,
  00045 prey wildcard — Canary's `Prey_Bonus_Reroll` art for that offer —
  00058 hunting-task slot) into `client/public/assets/store/products/
  <symbol>.png`; the protocol's symbol enum split `prey` into `prey-wildcard`
  and `prey-slot`; `StoreProductIcon` renders a symbol as that PNG via
  `next/image` (pixelated at ≥64px). `tools/importCanaryStoreCatalog.mjs`
  gained: an `OFFER_OVERRIDES` description for the Ultimate Mana Keg (sibling
  kegs' text) and renames for the two typos; `HOUSE_ITEM_ID_CORRECTIONS` for
  the oven and carpets (offer ids follow the corrected item id:
  `house-item-34272-1`, and the two carpets' offer ids swapped); and
  `withItemProse`, which gives a tag-only description an opening sentence —
  the item's in-game description from the pinned item catalog when it has one
  (47 items: "It depicts the two suns of Tibia…"), otherwise a templated line
  from the store name and kind (279 items: seats "take a seat…", tables,
  floor coverings, lights, wall art, furnishings, multi-part pieces naming
  their part, and anything with `containerCapacity` stating its slot count).
  Catalog and assets regenerated; regen was a verified no-op beforehand.
- **Files:** `protocol/src/store.ts`, `tools/importCanaryStoreCatalog.mjs`,
  `tools/importOtclientStoreAssets.mjs`, `server/src/store/storeCatalogData.ts`
  (generated), `client/components/store/StoreProductIcon.tsx`,
  `client/public/assets/store/products/*.png` (8 new),
  `client/lib/store/storeProductArt.test.ts` (new: every protocol symbol has
  a PNG), `gitworktree.md`.
- **Verified:** every item/outfit/mount icon in the catalog resolves in
  `objects.json`/atlas (script check, 631/631); protocol/server/client
  typecheck; tools tests (126) + `parity:check`; server store suite (25);
  client store suites (32 + 8 new); eslint on the icon component;
  `assertStoreCatalog` booted against the real item catalog with 0 empty and
  0 tag-only descriptions left; all 279 templated sentences read through by
  hand; exported PNGs inspected visually.
- **Residual risk:** the oven correction picks 34272 over the other kitchen
  oven (34324) — both are `wrapableto` kits, the digit-transposition reading
  is the likelier intent. Any historical purchase of the old
  `house-item-37272-1` / swapped-carpet offer ids stays in `store_history`
  under the old id (nothing is re-delivered). Templated lines are
  deliberately plain; a hand-written line for any item goes in
  `OFFER_OVERRIDES`.

## 2026-08-30 — Store shelf rows show a one-line product summary (`agents/store-row-summary`)

- **Problem:** the product list never showed any description — the
  protocol sends full descriptions only for the selected product (detail
  pane), so after the catalog description pass the shelf still read as bare
  names with empty cards.
- **What changed:** `storeProductSchema` gained an optional `summary`
  (≤ `STORE_LIMITS.maxSummaryLength` = 240); `toStoreProduct` fills it via
  `server/src/store/storeProductSummary.ts` — the description's first
  non-tag line, cut at a word boundary — and `StoreProductRow` renders it
  under the name (two-line clamp). Full descriptions still travel on select.
- **Files:** `protocol/src/store.ts`, `server/src/store/storeProductSummary.ts`
  (+ test), `server/src/store/storeCatalog.ts`,
  `client/components/store/StoreProductRow.tsx`,
  `client/stories/StoreModal.stories.tsx`.
- **Verified:** typecheck; server store suite (29) and client store suites
  (40); eslint; a script projected every real category page through
  `toStoreProduct` + `storeOffersMessageSchema` with an 80-char disabled
  reason on each product — worst page well under the 16 KB
  `maxMessageBytes` cap.

## 2026-08-30 — Mantus Store in Portuguese: catalog copy, tag captions, disabled reasons (`agents/store-pt-br`)

- **Problem:** nothing in the store was localised — every description, tag
  caption ("only usable by purchasing character") and greyed-out reason was
  an English string from the server, and `storeProductSummary` could surface
  a bare `{info}` marker on a shelf row.
- **What changed:** catalog text is now `LocalizedText` (`en` + `pt-BR`) for
  every product description and category name, generated by
  `tools/importCanaryStoreCatalog.mjs` from a hand-translated table
  (`tools/storeTranslations.pt-BR.json`, 276 distinct English texts keyed by
  exact English) plus bilingual house-item templates; the run fails and
  writes `storeTranslations.missing.json` if any non-templated description
  lacks an entry. The server projects the account's language
  (`session.account.language`, kept live by `LanguageHandler`) into
  `storeCategoryTree` / `toStoreProduct` / `store-description-state`; the
  hand-authored Exercise Weapons and Portable Seller shelves carry both
  languages. `disabledReason` became a `StoreDisabledReason` enum the client
  renders via `store.offerDisabled.*`; tag captions moved into the locale
  files (`store.tags.*`) and `parseStoreDescription` takes a caption
  resolver. Summary picker prefers plain prose and strips a leading tag.
  Item/outfit/mount/product names stay English by design.
- **Files:** `protocol/src/store.ts`, `server/src/store/{storeCatalog,
  storeOfferAvailability, assertStoreCatalog, MantusStoreService,
  EXERCISE_WEAPON_CATEGORY, PORTABLE_SELLER_PRODUCT, storeProductSummary}.ts`,
  `server/src/store/storeCatalogData.ts` (generated),
  `tools/importCanaryStoreCatalog.mjs`, `tools/storeTranslations.pt-BR.json`
  (new), `client/lib/store/parseStoreDescription.ts`,
  `client/components/store/{storeDescriptionTags,StoreDescription,
  StorePriceButton}.tsx`, `client/locales/{en,pt-BR}.json`, stories/tests.
- **Verified:** typecheck; full server suite (4186) and client suite (487);
  tools tests + parity; eslint; `assertStoreCatalog` booted with both
  languages; every translation checked for tag multiset + newline parity;
  0 untranslated prose in the generated catalog; sample read for quality.
- **Residual risk:** translations are hand-written (agent-produced, spot
  checked) — wording nits belong in `storeTranslations.pt-BR.json`, then
  `yarn store:catalog`. Adding a third language means a new table + template
  strings in the importer, nothing on the client.

## 2026-08-30 — Store copy: premium benefits from the website, cosmetics text-free, exercise summaries (`agents/store-premium-copy`)

- **Problem:** Premium Time still carried Canary's generic pitch ("access to
  Premium areas, ships, more spells…"), none of which is what this server's
  VIP grants; outfits and mounts carried lore paragraphs nobody reads; the
  exercise-weapon row summary said "Use it to train…" without the two facts
  that matter (speed, charges).
- **What changed:** `tools/importCanaryStoreCatalog.mjs` now runs under tsx
  (`yarn store:catalog`) and builds the Premium Time description from the
  website's own `vipAccount` locale copy + `PREMIUM_BENEFITS`/`HOUSE_LIMITS`
  (mirrors `VipAccountPage.tsx`; "coming soon" benefits excluded), so
  store, site and server share one benefit list. Outfits/addons have no
  description; mounts only state their speed bonus ("Grants +10 speed while
  mounted." — every catalog mount has speed 10). Exercise-weapon text opens
  with "Trains <skill> 5x as fast as an ordinary exercise weapon — 14,000
  charges." (locale-formatted numbers). The importer prunes translation-table
  entries no longer referenced (276 → 115).
- **Files:** `tools/importCanaryStoreCatalog.mjs`, `package.json`,
  `server/src/store/storeCatalogData.ts` (generated),
  `tools/storeTranslations.pt-BR.json`, `server/src/store/EXERCISE_WEAPON_CATEGORY.ts`.
- **Verified:** typecheck; server store suite (30); client store suites (40);
  tools tests + parity; eslint; `assertStoreCatalog` booted, premium text
  1412/1555 chars (limit 2048), summaries sampled in both languages.
- **Residual risk:** the premium text is regenerated only by
  `yarn store:catalog` — editing `vipAccount` copy or `PREMIUM_BENEFITS`
  needs a regen to reach the store.

## 2026-08-31 — Store rows show the full description; premium prices say their days (`agents/store-row-description`)

- **Problem:** the shelf showed only a one-line summary, so Premium Time's
  benefit list (the reason it was rewritten) was never visible without
  opening the purchase dialog; premium price buttons read "250 / 750 / 1.500
  / 3.000" with no hint of what each buys.
- **What changed:** `storeProductSchema` carries `description` (the
  one-line `summary` and `storeProductSummary` are gone); `StoreProductRow`
  renders it with `StoreDescription` (tag icons + localised captions).
  `assertStoreCatalog` now projects every category page in every language
  with the widest possible per-offer fields and refuses to boot if one
  exceeds `PROTOCOL_LIMITS.maxMessageBytes` (real worst ≈ 8 KB of 16 KB).
  Premium sub-offers carry `count = days`; `StorePriceButton` takes the
  product `kind` and renders "30 dias" / "30 days" (`store.days`,
  `store.priceLabelWithDays`) instead of "30x". `store-description-state`
  stays for the purchase dialog.
- **Files:** `protocol/src/store.ts`, `server/src/store/{storeCatalog,
  assertStoreCatalog, MantusStoreService.test}.ts`,
  `tools/importCanaryStoreCatalog.mjs`, `server/src/store/storeCatalogData.ts`
  (generated), `client/components/store/{StoreProductRow,StorePriceButton}.tsx`,
  `client/locales/{en,pt-BR}.json`, `client/stories/StoreModal.stories.tsx`.
- **Verified:** typecheck; server store suite (25); client store suites (40);
  eslint; boot assertion incl. the new page-budget check.

## 2026-08-31 — New characters start at level 8 with Canary's mainland loadout (`agents/level-8-start`)

- **Problem:** new characters were created at level 1 with a Rookgaard-style
  kit (sabre / combat knife / sickle, leather armor) and the vocation wand
  or rod sat in the backpack because it needs level 6; the DB also carried
  a dozen pre-rework test characters.
- **What changed:** `STARTING_LEVEL = 8` (`server/src/character/startingLevel.ts`);
  `CharacterService.create` stores `level 8`, `experience 4200`
  (`getExperienceForLevel(8)`, same as Canary's `schema.sql` samples) and
  full health/mana derived for that level. `getStarterSet` now mirrors
  Canary `send_first_items.lua` (mainland level-8 kit): mages get mage hat,
  magician's robe, studded legs, spellbook and an **equipped** wand of vortex
  / snakebite rod plus 10 mana potions; knight gets brass set, steel axe,
  dwarven shield with a jagged sword + daramanian mace spare; paladin gets
  legion helmet, ranger's cloak/legs, spears, dwarven shield, bow + 50 arrows;
  monk gets brass set, two-handed jo staff and a dwarven shield in the bag.
  Everyone gets a scarf (amulet), leather boots, backpack, bound container
  (loot pouch + adventurer's stone) and the existing common supplies.
  New admin script `yarn db:delete-all-characters [--commit]` wipes every
  character (items, depot/inbox/stash, bank, market offers, house auctions;
  houses/guilds cascade) in one SERIALIZABLE transaction, keeps every
  account, audits `item-destroyed` / `bank-withdraw` /
  `market-offer-cancelled` rows first, dry-runs (rollback) unless
  `--commit`, and refuses while anyone is online when `PUBLIC_API_URL` is
  set.
- **Deviation from Tibia:** stats are derived from the chosen vocation from
  level 1 (there is no vocationless Rookgaard phase here), so a fresh level-8
  knight has 255/90/575 rather than the 185/90/470 a Rookgaard graduate
  carries; identical to what a level-1-created character reaches at 8.
- **Files:** `server/src/character/{startingLevel,CharacterService,
  CharacterService.test}.ts`, `server/src/item/{getStarterSet,
  getStarterSet.test}.ts`, `server/src/GameServer.test.ts`,
  `server/src/playtest/scenarios/{rookgaardQuests,gateOfExpertise}.ts`,
  `server/scripts/deleteAllCharacters.ts`, `server/package.json`.
- **Verified:** server typecheck; `CharacterService`, `getStarterSet`,
  `deriveCharacterStats`, `GameServer` suites; full server unit run
  (4183 passed); wipe script typechecked and dry-run against the dev DB
  (11 characters / 239 items reported, rolled back).
- **Residual:** the Rookgaard level-2 bridge bounce line can no longer be
  asserted from a fresh character (level 8 clears it and `/level` only
  raises) — recorded under Accepted gaps in `TODO.md`.

## 2026-08-31 — Players can permanently delete a character from the select screen

- **Problem:** there was no way for a player to remove a character; unwanted
  characters sat in the account's five slots forever.
- **What changed:** new `delete-character { characterId }` client message
  (`protocol/src/clientMessages.ts`). `CharacterHandler.handleDelete` refuses
  while joined (`already-joined`), while the character is in the world or
  lingering after an in-fight disconnect (`character-delete-online`, via
  `registry.sessionFor` + a new `isLingering` hook from `GameServer`), and
  otherwise runs `CharacterService.delete` under the per-session
  `characterOperationPending` gate, answering with the shrunken
  `character-list`. `PgCharacterStore.delete` →
  `deleteCharacterInTransaction`: one transaction that locks the account and
  the character row (`FOR UPDATE`, scoped to the session's account — never a
  body-supplied account id), refuses guild leaders / house owners / top
  house-auction bidders / open market offers (`character-delete-*` errors),
  audits `item-destroyed` for the whole nested item closure (carried, depot,
  inbox, trade/market escrow) plus `bank-withdraw` and stash rows with
  `reason: character-deleted`, deletes the restrict-FK dependants and the
  character; everything else cascades. Client: a trash icon button on each
  roster row (`CharacterListItem`, right of the selection marker; the row is
  now a div with two sibling buttons since buttons cannot nest) opens a
  confirmation view showing the character and the warning "Are you sure you want to permanently delete
  your character?" with "Cancel" / "Delete" ("Cancelar" / "Deletar"); en + pt-BR
  copy for the view and the six new server errors; Storybook
  `CharacterSelectModal › DeleteCharacter`.
- **Files:** `protocol/src/{clientMessages,serverMessages}.ts`,
  `server/src/{CharacterHandler,GameServer}.ts`,
  `server/src/character/{CharacterError,CharacterStore,CharacterService,
  PgCharacterStore,deleteCharacterInTransaction}.ts`,
  `server/src/test/InMemoryCharacterStore.ts`, `client/lib/net/GameClient.ts`,
  `client/components/characters/{CharacterListItem,CharacterSelectModal,CharacterSelectScreen}.tsx`,
  `client/components/ui/TrashIcon.tsx`,
  `client/components/game-window/CharacterSelectionOverlay.tsx`,
  `client/locales/{en,pt-BR}.json`, `client/stories/CharacterSelect*.stories.tsx`.
- **Verified:** protocol/server/client typecheck + eslint; new tests —
  `CharacterService.test` (own delete, cross-account refusal),
  `GameServer.test` (raw socket create → delete → empty roster → second
  delete refused; in-world refusal from own and another session),
  `PgCharacterStore.integration.test` (full closure + bank + stash + audit
  counts with a sibling character untouched; guild-leader / house-owner /
  other-account refusals) against embedded Postgres; full server (4187) and
  client (487) unit runs.
- **Residual:** no grace period / undo (Tibia schedules deletion); a relogin
  on the same account evicts the deleting session but the in-flight delete
  still commits — see Accepted gaps in `TODO.md`.

## 2026-08-31 — Forged-iron loading spinner + `Button busy`

- **Problem:** the "loading icon" on Enter World / Create / Delete / Sign in
  was a spinning rotated square (`rotate-45 border-t-transparent`), and the
  busy button was `disabled` so the whole thing faded to 40 %.
- **What changed:** `client/components/ui/Spinner.tsx` — SVG spinner in
  `currentColor`: sunken track, bright 255° arc with a fading tail and a
  glowing ember at its head (0.9 s), plus a slow counter-rotating inner rune
  ring; unique gradient/filter ids via `useId`; `label` prop for standalone
  use, otherwise `aria-hidden`. `Button` gains `busy`: renders the spinner
  before the label, sets `disabled` + `aria-busy`, and swaps the
  `disabled:opacity-40` fade for `cursor-progress` so the busy plaque stays
  legible (`buttonStyles.ts` now exports `BUTTON_DISABLED_CLASS` /
  `BUTTON_BUSY_CLASS`). `CharacterSelectModal`, `CreateCharacterForm` and
  `LoginPanel` use `busy={busy}` instead of hand-rolled spinners. Stories:
  `Spinner` (Large / Sizes / InButtons), `CharacterSelectModal › Deleting`.
- **Verified:** client typecheck + eslint; client unit suite; Storybook built
  and screenshotted headlessly (spinner sizes, buttons, deleting modal).

## 2026-09-01 — Depot "Store" for items in closed containers

- **Problem:** a player reported being unable to put potions into the depot
  ("não consigo colocar items no dp"). The depot window lists every carried
  item, including the contents of containers the client has not opened (the
  loot pouch after a hunt, a bag inside the backpack), but the deposit path
  in `GameWindowSessionController.tsx` looked the item up with
  `getConfirmedItem`, which only sees equipment, the backpack grid, and open
  containers. For anything else the lookup missed, no `depot-deposit` intent
  was sent, and the modal showed "The depot could not complete that action."
  every time. The server never heard about it, which is why the prod logs
  were empty for the session.
- **What changed:** `client/components/game-window/controllers/GameWindowSessionController.tsx`
  — deposit and stash-deposit fall back to the depot state's own carried
  entry when the confirmed lookup misses (same `InventoryItem` shape, id +
  revision fresh as of the last depot state; a drifted revision comes back
  as "stale" with a refresh). New browser e2e
  `client/e2e/depotClosedContainerDeposit.e2e.test.tsx`: real GameWindow
  against the real server, potions moved over the wire into the closed loot
  pouch / a closed bag, depot opened by right-click, "Store" clicked; plus an
  open-backpack control.
- **Verified:** the e2e file failed 2/3 before the fix (alert shown, zero
  deposit intents sent, no server failure) and passes 3/3 after; client
  eslint + typecheck; client unit suite. Run from `client/` with
  `PLAYTEST_ADMIN_URL=<local pg admin url> yarn vitest run --project e2e e2e/depotClosedContainerDeposit.e2e.test.tsx`.
- **Residual:** the "crashou tudo" part of the same report is unexplained —
  no server log line and no machine restart at the time; candidates are a
  browser-side crash or the silent socket terminate on outbound-buffer
  overflow / missed pong. Fly keeps only a small in-memory log buffer and no
  shipper is configured, so older server output is unrecoverable.
