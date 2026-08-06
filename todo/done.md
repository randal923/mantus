
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
equipment Storybook fixtures now carry `rarity: "common"`.

**Files**: `protocol/src/item.ts`, `server/src/item/toItemTooltip.ts`,
`server/src/item/toItemTooltip.test.ts`, `client/app/globals.css`,
`client/components/inventory/{ItemTooltip.tsx,tibiaTooltipItems.ts}`,
`client/components/auction/AuctionRarityBadge.tsx`,
`client/locales/{en,pt-BR}.json`.

**Verified**: toItemTooltip tests updated (eligible gear → "common",
non-gradable items still omit rarity) and passing alongside catalog,
bestiary, rarity, and market suites (55 tests); client unit suite 403
passed; tsc clean in protocol, server, and client.

**Residual risk**: none known — market unique-listing semantics key off the
market schema's rollable-grade field, not the tooltip, and were left as-is.
