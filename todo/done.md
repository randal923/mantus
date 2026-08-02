
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
