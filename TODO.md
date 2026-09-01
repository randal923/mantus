# TODO

The backlog for full parity with the pinned Canary baseline lives under
[`todo/`](todo/README.md). Restructured 2026-07-24 from a full audit;
2026-07-25 the completion wave closed 34 features and the backlog was
consolidated into 13 merged area files with all implementation detail
inline:

- [`todo/done.md`](todo/done.md) — the single permanent record of everything
  shipped (the former `todo/completed/` logs were folded in and removed).
- [`todo/todo-1.md`](todo/todo-1.md) … [`todo/todo-13.md`](todo/todo-13.md) —
  the merged areas; each open feature is a `## Feature N` section carrying
  its remaining work, file surface, Canary references, and required
  exploit/regression tests. 68 of 107 features remain open; numbers are
  stable and never reused, new work gets 108+.
- [`todo/client/`](todo/client/README.md) — the single index of all
  outstanding client-side work (panels for shipped server features plus
  pointers to the mixed tracks).

Start with the [overview](todo/README.md) for the pinned upstream snapshots,
rewrite boundary, cross-cutting rules, known blockers, and recommended order.
Feature 1 (the Canary parity ledger) is the cross-cutting completion contract;
Feature 100 (testing and release gates) is the final pre-launch gate.

Add a newly discovered gap to the narrowest matching todo area; add it here
only when it needs a new area or changes the implementation order. Known
limitations accepted during a session are recorded in the owning feature file
(per `AGENTS.md`).

## Accepted gaps

- **Character deletion is immediate and can race a same-account relogin**
  (2026-08-31). `delete-character` hard-deletes after the client's
  confirmation; Tibia instead schedules deletion with an undo window. The
  handler checks "in world / lingering" in the tick, then the DB transaction
  runs asynchronously; a second login on the same account evicts the
  deleting session (newest login wins) and could select the character in
  that window, entering the world on a row the transaction then removes
  (its saves fail with `version-conflict`; nothing dupes). Fix: a
  `deletion_scheduled_at` column + sweep (gives the undo window for free)
  and a `FOR UPDATE` on the character row in the login load path.

- **Rookgaard level-bridge bounce is untestable from a fresh character**
  (2026-08-31). New characters start at level 8
  (`server/src/character/startingLevel.ts`), above the level-2 bridge gate in
  `playtest:rookgaard`, and `/level` only raises a level, so the scenario now
  only checks the pass-through; the Canary "You need to be at least Level 2"
  line is still produced by the movement gate but has no e2e assertion.
  Fix: a GM `/level` that can lower a character (or a playtest-only
  `experience` override at creation) and restore the bounce step.

- **Map teleport audit: what is still dead after the 2026-08-11 sweep**
  (2026-08-11). Every teleport-type item placement in the OTBM (2,438 tiles)
  was cross-referenced against Canary `a879c931` (`startup/tables/teleport.lua`,
  `teleport_item.lua`, all 366 `MoveEvent` scripts). Live now: 788 static map
  transitions, 77 `QUEST_TELEPORTS` rows, the 2 Adventurers Guild exit portals,
  and the 65 elemental shrine flames. Every tile that is still dead is listed
  with its coordinates and gate in
  [`todo/teleport-gaps.md`](todo/teleport-gaps.md); by category:
  - **~370 storage/boss/level-gated portals** (227 storage, 106 boss+storage,
    20 boss, 16 boss+level, 14 level, 3 level+storage). These need the quest
    storage/boss-cooldown platforms, not a data row — they are bucket C/D work
    in [`todo/quest-parity-triage.md`](todo/quest-parity-triage.md). Fail-closed
    today (the portal does nothing), which is the safe direction.
  - **~10 world-state portals**: Dreamer's Challenge wall/stone/riddle tiles,
    the Shattered Isles sacrifice, Yalahar's demon soil gates, Draconia's lever
    exit, Grave Danger's Zelos tile (skips while the knights live), Oramond's
    seacrest dive (requires an underwater helmet), Soul War's reward portal.
    Each reads live map/inventory state; port them with the condition, never
    unconditionally.
  - **4 use-activated teleports** (Canary `TeleportItemUnique` 15001-15004:
    two Kilmaresh boats, an Issavi ladder-ish item, the Faceless Bane
    entrance). They are `Action` handlers, not step-ins, so they belong on the
    quest-touch/world-action `use` seam, not in `QUEST_TELEPORTS`.
  - **6 water-vortex portals in the Trapwood water-elemental cave**
    (uid 39001-39006) sit on water tiles no one can stand on without swimming,
    which we do not implement; one dry sibling (39003) is live.
  - **Deliberate deviation, not a gap**: Deeper Banuta's death portals (aid
    64022/64023) aim at tiles that are solid mountain wall in the OTBM, so both
    rows land the player on the open floor beside the paired portal instead —
    Canary force-moves them into the rock. Any other portal that turns out to
    aim into scenery should be nudged the same way rather than hand-editing the
    hash-pinned map (that would mean a full `map:convert` + `minimap:build` +
    world-seed reconcile and a divergence from the pinned Canary baseline).
  - **Citizen tiles (uid 9056-9068, 9240, 9500, 9510, 9515 + aid 30032)** — the
    "become a citizen of X" flames in every city temple. Blocked on mutable,
    persisted `Player.townId`: the field is `readonly`, and the character save
    snapshot (`CharacterPersistence.snapshot`) and `PgCharacterStore` UPDATE do
    not carry `town_id`. Fix: add a town setter + snapshot field + SQL column
    write, then a step-in table mapping tile -> town (Svargrond additionally
    demands the Barbarian Test storage, so it should fail closed to
    "teleport to the temple without citizenship").
  - **A `QUEST_TELEPORTS` portal does nothing while its destination tile is
    occupied.** The plate registry teleports through
    `MovementHandler.teleportPlayer`, which refuses an occupied or non-walkable
    landing; Canary's `Teleport` stacks the arrival instead. Only the two
    player-dependent services (guild exit, shrines) take the nearest free tile.
    Fix if it ever bites: give the registry the same nearest-free-tile hook.
  - **~1,140 zero-destination teleport-type placements with no attributable
    Canary handler** (431 small boats, 258 magic forcefields, 100 carved stone
    tiles, ...). Canary's `Teleport::addThing` skips destination (0,0,0), so an
    unclaimed one is inert there too — but the 258 forcefields deserve a second
    pass, since some are probably driven by a script our position/aid/uid index
    could not attribute. Re-run the audit with
    `server/src/readMapWalkability.ts` plus a fresh OTBM dump if this comes up.

- **World lighting: equipped light items don't glow yet** (2026-08-07). The
  lighting pass renders map-item lights, creature `light` state (monster
  base light + spell light conditions), and the own player's darkness
  minimum — but a player holding a torch/lamp emits nothing, because the
  server's item catalog carries no light metadata to feed
  `Creature.toState()` (Canary: `Player::updateItemsLight` takes the max
  over the ten equipment slots). Fix: export light intensity/color into the
  server item catalog (the client's `objects.json` already has both) and
  fold the equipped max into the player's broadcast light. Also deferred:
  magic-effect/missile flashes emit no light (OTClient does light them);
  the floor-shade predicate treats any ground
  tile as fully covering, so a translucent-roof edge case may over-darken.

- **Memory-first store purchases: three bounded staleness windows**
  (2026-08-09). (a) Per-character store facts (owned unique items, XP boost
  day counter) load once per session on first store-open and then update
  only from purchases — destroying or trading away a unique store item
  mid-session leaves its offer greyed until relogin (wrong-refusal only; the
  persist's ownership assertion still blocks the dupe direction). (b) A
  daily-reward wildcard claim applies its absolute post-transaction balance
  to the live counter and can transiently disagree with a queued store
  wildcard persist; the DB converges (both writes are relative and capped),
  the display heals on relogin — fix by making the prey apply relative too.
  (c) The client still re-sends `store-open` on every window toggle and the
  server recomputes `adjustmentsFor` over all 670 offers per list draw —
  CPU-only now (no DB), a client session cache + per-character adjustment
  memo is the follow-up. Owner: Mantus Store (43).

- **Login-queue seat accounting counts unauthenticated handshaking sockets
  as seated** (2026-08-09). Admission checks `registry.size - queue.size <
  maxSessions`, and `registry.size` includes sockets still inside the 10 s
  auth window, so at the margin a queued player is admitted up to
  `authTimeoutMs` late. Deliberately conservative — the world can never
  overshoot `maxSessions`. If handshake churn ever gets heavy enough to
  starve admissions, count only account-bound sessions as seated (the
  registry already tracks `sessionsAwaitingAuth` separately). Also: queue
  positions are pushed only on change (the WS heartbeat covers liveness),
  and the public API deliberately reports `maxPlayers` without queue depth.
  Owner: network/resource limits (93).

- **Absence eviction protects online owners via the in-process session
  registry only** (2026-08-08). `characters.last_seen_at` is a durable-save
  anchor and goes stale for an online-but-idle owner, so
  `HouseService.scanAbsence` skips any owner with a live session before the
  `processAbsence` transaction. Two windows remain: an owner already past
  the threshold who logs in between that check and the commit is still
  evicted (the outcome is correct, only abruptly timed — Canary behaves the
  same way); and if the game ever runs multiple world processes against one
  database, the in-process check stops protecting owners connected to
  another process — the scan would need a shared presence source. Also: an
  absent owner gets no client-side countdown (absence is not part of
  `houseStateSchema`); the day-5 letter is the only in-game notice. Owner:
  houses.

- **The premium extra regeneration is invisible in the character panel's
  regeneration figures** (2026-08-08). VIP accounts regenerate +10 hp /
  +20 mana every 3 s (`CharacterProgression.tick` premium channel), but the
  panel's `healthRegeneration`/`manaRegeneration` protocol fields are a
  single `{amount, intervalMs}` channel fed from the vocation table, so the
  extra channel cannot be expressed there. The XP-rate panel does show the
  premium +10% (new `premiumPercent` field). Fix if wanted: add an optional
  premium channel to `OwnProgressionState` and render a second line. Owner:
  progression display.

- **Critical-chance aggregation differs per damage path** (pre-existing,
  observed 2026-08-08 while adding the premium +3%). The weapon path
  (`playerAttackPlan.ts`) sums equipment + imbuement + affix + proficiency
  crit chance; the spell paths (`SpellCaster.ts:283, 418`) add only
  equipment specials + wheel augment, dropping imbuement/affix/proficiency
  crit for spells; `ProgressionSystem`'s display mirror omits proficiency
  while the Cyclopedia's includes it. The premium +3% was added inside
  `playerSpecials` so all paths inherit it, but the older sources still
  disagree. Fix: decide the canonical source list and use it in all four
  places. Owner: combat.

- **`yarn parity:check` fails on an inherited hash mismatch** (pre-existing,
  observed 2026-08-08). `tools/buildItemCatalog.mjs` differs from its pinned
  manifest hash (edited in commit `2c61432 "updates"` without a re-pin), so
  `yarn test` at the root fails at `test:tools` before reaching the suites.
  Server/client suites and typecheck are unaffected. Fix: re-pin the
  converter hash per the parity-inventory procedure. Owner: content
  pipeline.

- **The Loot Pouch's semantics live as a hand edit to a generated file**
  (2026-08-07, narrowed 2026-08-08). `content/canary-item-semantics.json`
  entry 23721 (renamed Loot Pouch: `containerSize` 500, new description)
  deviates from Canary's items.xml, and `tools/convertCanaryItems.mjs` has
  no override table — a future `yarn items:convert` regenerates the file
  from Canary sources and would revert the entry. The runtime is now safe
  regardless: the `lootPouch` entry in
  `server/src/item/overrides/ITEM_OVERRIDES.ts` reasserts name, description,
  capacity 500 and `movable: false` at catalog load, and the store side
  survives via `OFFER_OVERRIDES` plus the type-id filter in
  `server/src/store/storeCatalog.ts`. Residual exposure: the generated
  `client/public/assets/wiki-items.json` is built from the raw catalog JSON
  (no overrides), so a regeneration would show the stale name on the public
  wiki until the semantics entry is re-edited. Fix: give the semantics
  converter a corrected-at-import override table.

- **Portable Seller timers are in-memory only** (2026-08-08). The 10-minute
  auto-sell timer re-arms from zero at login and the 1-minute manual
  cooldown clears on relog (`PortableSellerService` maps, wiped in
  `detachCharacter`). Relogging therefore *delays* the auto sweep (no gain)
  and can shave the tail off a manual cooldown at the cost of a full
  reconnect — judged not exploitable enough to persist. Fix if it ever
  matters: store both as epoch-ms rows like `character_spell_cooldowns`
  (migration 073), flushed on disconnect.

- **Store item deliveries write carried rows outside the item lane**
  (2026-08-08). `deliverBoundItem` inserts bound-container children inside
  the purchase transaction while the buyer is online; the in-memory cache is
  updated in-tick afterwards (`injectDelivery` → `applyCommittedMutation`).
  A player move racing the same bound slot loses on the
  (container_id, slot_index) unique index and resyncs — rare (only the
  pouch/seller may be player-moved into the bound root) and self-healing,
  but it is the one place two writers share a container. Revisit if resync
  poisonings ever show up in logs around purchases.

- **`yarn items:catalog` fails at its last step** (pre-existing, observed
  2026-08-07). The script still chains `node tools/buildItemAnimations.mjs`,
  but that file was deleted in commit 7c77494 ("add item effect"). Every
  earlier step (item catalog, wiki catalog, creature loot, proficiency
  sprites) completes before the failure, so regenerated data is fine — but
  the non-zero exit makes the run look broken. Fix: drop the step from
  `package.json` or restore the script.

- **Fire bug rare outcomes are a fizzle; several tool targets stay dormant**
  (2026-08-07). The fire bug ignites (60%) or poffs — Canary's 10% "bug
  crumbles" and 10% "explodes for 5 fire damage" branches need a
  consume-carried helper and a direct-damage hook on `ToolUseContext` that
  don't exist yet. Separately, machete jungle grass / wild growth, pick digs
  and the crushable stone, and fire-bug spider webs / coal basins never fire
  on the real map because their target ids are not in `MUTABLE_ITEM_IDS`
  (tools/getMapItemSemantics.mjs) — the fix is adding them to that list plus
  a `yarn map:convert` + `db:reconcile-world-seed`, deferred because jungle
  grass moves many tiles from baked client regions into tile-states.

- **Imbuement scrolls can no longer be forged from the client** (2026-08-03).
  The shrine window's blank-scroll tile was removed on request, and with it
  the only UI that sent `imbuement-scroll-create`. The server side (forging a
  scroll, applying a filled one) is untouched and still tested, so restoring
  the flow is a UI change — give it its own surface rather than a tile in the
  "pick an item to imbue" grid, which is what made it confusing.

- **A hard crash can lose up to 30 seconds of skill/magic tries**
  (2026-08-03). Try awards no longer save the character per swing — they mark
  it dirty and ride the 30 s interval save (see `todo/done.md` 2026-08-03),
  which is what stops combat from generating one save transaction per
  combatant per swing against the cross-region database. Level-ups,
  experience, deaths, logouts, and atomic actions all still save in place, so
  only ordinary tries inside the current interval are exposed, and only to a
  hard process kill — a clean shutdown flushes every dirty character.
  Accepted deliberately; Canary's periodic player save has the same window.
  Revisit only if crash reports show try loss in practice — the fix would be
  a flush-on-combat-end trigger, not a return to per-swing saves. Owner:
  Feature 106/107 (performance budgets).

- **A long-backgrounded tab can still be discarded by the browser**
  (2026-08-01). The client now stays correct while its tab is hidden
  (cosmetic effects skip creation, the creature-store flush has a timeout
  fallback, world load no longer stalls on a frozen animation frame), and
  gameplay was always server-side, so AFK bot hunts survive tab switches.
  But Chrome's Memory Saver may unload a background tab entirely after
  enough idle time — a full page discard, which disconnects the session.
  Page JS cannot veto it. Players hunting AFK for hours should exempt the
  game site from Memory Saver (chrome://settings/performance). Possible
  softener: detect the discard on restore (`document.wasDiscarded`) and
  auto-reconnect straight back into the world. Owner: client/game-window.

- **The mailbox window can only mail top-level backpack items** (2026-08-01).
  The depot's carried pane is now server-projected recursively
  (`carriedItems` on `depot-state`), but `MailboxModal` still receives the
  client's `inventory.items` — the equipped backpack's direct contents — so a
  parcel inside a bag must be moved up before it can be sent. Low impact
  (parcels are normally carried top-level) and mail eligibility differs from
  deposit (containers with contents are the normal case), so it was left
  as-is. Recommended fix: reuse `listCarriedDepotItems` in a
  `mailbox-opened`-adjacent state message, or push it on open, and render it
  in `MailboxModal` the way `DepotModal` now does. Owner: depot/mail.

- **145 spawn populations still have no generated hunt** (2026-08-06, Feature
  111). The world sweep drops a cave when the way in it traced does not open
  into the ring (142 caves) or when no walkable ring can be built at all (3).
  The tracer follows ladders, holes, ropes and floor changes within 80 tiles
  and 8 hops; teleports, quest doors and long shaft chains defeat it.
  Recommended fix: fall back to a reachability flood fill from the nearest
  town over the whole floor stack, or let a target name the entrance by hand.
  Owner: Hunt Finder (111).

- **Generated hunts cannot be told apart from quest-locked ground**
  (2026-08-06, Feature 111). Spawn data says where creatures stand, not
  whether a player may go there, so a hunt generated inside an instanced or
  quest-gated area looks like any other. None is known to be wrong today, but
  nothing checks it. Recommended fix: cross the entrance tile against the
  quest/teleport tables the map already carries, and drop or flag the ones
  behind a gate. Owner: Hunt Finder (111).

- **Generated hunts inherit xp/hour, loot/hour and level rather than measuring
  them** (2026-08-06, Feature 111). A generated entry copies those figures from
  the hand-written hunt whose creatures match most closely, raised by a
  level-vs-experience curve fitted over the curated catalog when something far
  stronger shares the cave. Spawn density, respawn time and walking distance —
  all of which the generator knows — do not move the numbers, so a cave with
  twice the worms claims the same xp/hour as its neighbour. The Hunt Finder
  marks these entries "Estimated". Recommended fix: scale the inherited rate by
  spawn count and creature experience per ring length, or measure it in a
  playtest and write the measured value back. Owner: Hunt Finder (111).

- **Generated cave names are compass bearings, not what players call them**
  (2026-08-06, Feature 111). A gathered cave is named from its bearing and
  distance out of town — "North Cave", "Far NorthWest Cave" — which is
  unambiguous but not the name in anybody's head. The picker draws them on a
  map, so the bearing is mostly redundant. Recommended fix: allow a name
  override per cave in the tool's `TARGETS`, and use it when set. Owner: Hunt
  Finder (111).

- **Arming the bot inside a crowded cave can be refused as "out of range"**
  (2026-08-06, Feature 112). Arming proves a walk from the character to the
  nearest waypoint through live occupancy, so a route tile with a creature
  standing on it — and a `/goto` or a step that lands the character in a
  one-tile pocket behind it — refuses with `hunting-bot-out-of-range`. It was
  hit repeatedly on a freshly spawned rotworm cave (74 spawns), where the
  message reads as "you are too far away" while the character stands one tile
  from the route. The same root cause can stop a *running* bot: a crowded
  cave that blocks eight waypoints in a row ends the hunt with "unreachable",
  seen once in a 74-spawn rotworm cave. Recommended fix: distinguish "no walk
  right now" from "too far", and either retry the join for a few ticks or say
  that something is in the way; consider not counting creature-blocked
  failures toward the give-up budget. Owner: hunting bot (112).

- **The hunting bot only walks; it never uses a ladder, hole, rope or door**
  (2026-08-01, Feature 112). Floor changes come in two shapes on this map:
  ramps are step-activated transitions, which the route search follows, but the
  8805 ladders, dropdowns, rope spots and rope holes are `use`/`use-with`
  actions that need their own intent, and a closed door needs opening. A route
  leg that depends on one cannot be traced (about 5 % of the 1669 legs across
  all 131 guides) and, if hand-placed anyway, is skipped at run time. Since
  2026-08-06 a multi-floor guide seeds every floor's ring into one route and
  the bot walks the ring of whichever floor the character stands on, so the
  gap is now only the climb itself: the player takes the ladder, the bot
  takes it from there. Recommended fix: extend the waypoint chain with a typed
  `use` waypoint that the bot executes through the existing `use-map` /
  `use-with` paths, and let the tracer emit one when a leg's only connection
  is an action tile.
- **The hunting bot's per-tick path budget is unprofiled at scale**
  (2026-08-01, Feature 112). Each running bot spends up to 4000 search nodes
  (~1.5 ms) once per waypoint, paced by a 400 ms cooldown, and the tick is
  25 ms. That is comfortable for a handful of bots but nothing measures what
  happens when many re-plan on the same tick, and the budget was raised 5×
  from its original 800 so the bot can actually path the legs real routes
  contain (rejoining after a chase, hand-placed waypoints tens of tiles
  apart). The same applies to the chase searches added alongside it: a
  failed player chase burns a full ±12 box (625 nodes) every 250 ms, and the
  monster AI work budget went 512 → 2048 nodes per tick so one chase search
  (`maxPathNodes: 640`) no longer starves the whole spawn's brains.
  Recommended fix: give the bot the shared per-tick work ceiling the monster
  AI already uses (`maxAiWorkPerTick`), round-robin across sessions, and add
  a perf gate beside the existing pathfinding one in
  `CreaturePerformance.test.ts`.
- **The hunting bot can still stare forever at a target no path reaches**
  (2026-08-01, Feature 112). Auto-targeting picks the weakest visible
  monster with no reachability check, and the bot stands down while any
  target is alive. Chase now covers everything inside the Canary ±12 search
  box, so this only bites when the target is genuinely uncrossable from the
  player's side (a ladder, a rope spot, hole-separated ledges) — then the
  bot waits, the monster stares back, and the route never resumes.
  Recommended fix: when the auto-target has been neither hit nor approached
  for a few seconds, drop it and ignore that creature id for a while so the
  ring continues.
- **Data catalogs under `/assets/*` ride a day-long browser cache**
  (2026-08-01, Feature 112 follow-up). `next.config.ts` sends
  `max-age=86400, stale-while-revalidate=604800` for everything under
  `/assets`, which is right for atlas sheets and map tiles but hid a same-day
  `hunting_places.json` edit from players for up to a day. The hunt and wiki
  catalogs now fetch with `cache: "no-cache"`; `proficiencies.json`,
  `proficiency-sprites.json`, `creature-loot-items.json` and
  `npc-shop-categories.json` still use the cached default and will show the
  same staleness after a content regen. Recommended fix: give data JSON its
  own `no-cache` header rule (more specific `source` after the general one)
  or version the URLs.
- **Carnisylvan Sapling remains a dynamic monster mechanic** (2026-08-01,
  Feature 9/26). The pinned Canary definition has zero XP, no bestiary or loot,
  and its registered `sapling explode` spell schedules the creature's removal.
  Canary's world spawn XML does not place it. It is therefore the only Hunt
  Finder monster deliberately excluded from persistent static spawn coverage;
  making it permanent would change the hunt. Recommended fix: implement the
  registered self-destruct callback and the quest/monster trigger that creates
  the sapling, then add a regression proving it cannot persist or award loot.
- **Six RubinOT-only Hunt Finder item labels use text fallbacks**
  (2026-08-01, Feature 111). The copied guide catalog names 499 distinct
  recommended/valuable/equipment entries; 492 resolve to Mantus' validated
  item catalog. `Rubini Backpack`, `Dragon Trophy`, `Sai`, `Demonic Core
  Essence`, `Demonic Matter`, and the source typo `Stalight Vial` have no
  matching item, so their complete guide text remains visible but the tile
  uses a monogram instead of inventing a sprite id. Recommended fix only if
  those custom items join the game: add them to the authoritative item
  catalog, then the existing name resolver will pick up their sprites without
  a Hunt Finder special case.
- **A map re-import needs `db:reconcile-world-seed` on every database**
  (2026-07-31, see `todo/done.md`). Making the imbuing shrines server-owned
  changed the map version, and the server refuses to boot against a database
  holding world-item deltas from the previous one
  (`persisted world items require reconciliation for this map version`). Run
  `yarn workspace server db:reconcile-world-seed` with the server down before
  deploying this. Recommended fix so it stops being a manual step: fold the
  reconciliation into the migration path, or gate boot on a map-version row
  the migration writes.
- **Imbuing has no success roll and no protection option** (2026-07-31, see
  `todo/done.md`). The pinned Canary applies every imbuement unconditionally;
  `imbuements.xml`'s `percent` and `protectionPrice` are read but never used,
  so the window deliberately shows no odds and no protection checkbox rather
  than printing a number that does not govern anything. Recommended fix if a
  later Canary bump reintroduces the roll: add the roll server-side first,
  then surface the chance and the protection purchase together — never the UI
  alone, or the client would be promising a mechanic the server does not run.
- **Imbuement icons on gear imbued before 2026-07-31 show the placeholder**
  (2026-07-31, see `todo/done.md`). `iconId` is denormalized into the item's
  imbuement attribute at apply time so item projections need no imbuement
  catalog; entries written earlier have only `name` and fall back to icon 0 on
  the inventory badge until the imbuement is re-applied. Recommended fix if it
  matters before those decay: a one-off backfill mapping stored `imbuementId`
  to `iconid + (baseid - 1)`.
- **The same gear also projects `aggressive: true` regardless of category**
  (2026-08-02, see `todo/done.md`). `aggressive` is denormalized alongside
  `iconId` for the same reason, and entries written before the imbuement
  tracker shipped have neither. The safe default makes the tracker's display
  countdown stall out of combat rather than run faster than the server's decay
  ledger, so it self-corrects at the next 60-second checkpoint — but a
  non-aggressive imbuement on old gear looks frozen until then. Recommended
  fix: the same one-off backfill, writing `aggressive` from the imbuement's
  category in the same pass.
- **The imbuement tracker has no duration filters** (2026-08-02, see
  `todo/done.md`). OTClient's tracker offers four persisted checkboxes —
  show under 1 h, 1–3 h, over 3 h, and items with no active imbuement — behind
  a context-menu button on the mini-window. Our panel always shows every
  equipped piece with slots. Recommended fix if the list gets long: add the
  four toggles to `ImbuementTrackerPanel` and persist them in `uiSettings`
  next to the other client-side display preferences, not in a new store.
- **The Postgres connection budget is per-process, not shared** (2026-07-26,
  updated 2026-08-28). Production now talks to unmanaged Fly Postgres
  (`mantus-db`, dfw) over a direct connection — no pooler, so every pooled
  client is a real backend. Each server process still budgets `PG_POOL_MAX`
  independently (prod: unset → 10); a second world or a rolling deploy that
  overlaps machines must stay under the cluster's `max_connections` (300 on
  the flex image). Fly secrets do not track `.env` — any `DATABASE_URL`
  change must be applied with `fly secrets set -a mantus` as well.
- **A potion flask is destroyed when the drinker has no room for it**
  (2026-07-31, see `todo/done.md`). Canary's `player:addItem(potion.flask, 1)`
  defaults `canDropOnMap = true`, so a flask that fits nowhere in the
  backpack tree lands on the ground under the drinker. Our `discard` potion
  plan drinks the potion and destroys the flask instead, because dropping it
  would mean creating a world item inside the potion transaction. Recommended
  fix when the world-item write joins that transaction: turn `discard` into a
  ground placement at the drinker's tile.
- **The production database has volume snapshots but no logical backups**
  (2026-08-28). Prod moved from Supabase (`aws-1-us-west-2`, ~45 ms/query
  from dfw) to unmanaged Fly Postgres `mantus-db` in dfw (~1 ms; machine
  `1857604dc29068`, volume `vol_r7yd3x69229m89nr`, Postgres 18.1). Unmanaged
  means Fly Support does not cover it: the only recovery today is the volume's
  scheduled daily snapshot (retention raised to 14 days), and a lost or
  corrupted volume loses up to a day of play — a rollback that would also need
  reconciling against the audit log. The old Supabase project keeps a frozen
  copy of the 2026-08-28 data. Recommended fix: a scheduled Fly machine in the
  `mantus-db` app (`fly machine run --schedule daily`) that runs
  `pg_dump -Fc` to a Tigris bucket with 30-day retention, plus a documented
  restore drill. Also open: `mantus-db` is a single node, so a machine or host
  failure is downtime until the snapshot is restored (`fly postgres` supports
  a 2- or 3-node repmgr cluster if that matters before the second world).
- **Four pre-existing Postgres integration failures at HEAD** (updated
  2026-07-26: the six `PgChestStore.integration.test.ts` failures are
  fixed — the store was always correct; the tests asserted `character_id`
  on container rows, which the schema keeps NULL). Three in
  `PgGuildStore.integration.test.ts` — `bank_ledger_amount_check`
  violations from `appendBankLedger` (recorded on Feature 58, todo-9). One
  in `PgSocialStores.integration.test.ts` — the staff-highscore test inserts
  a non-DEFAULT value into the generated `is_staff` column (fixture broken
  since the roles migration; owner: Feature 96, todo-12). Everything else in
  `test:integration` passes.
- **Daily rewards deviations** (2026-07-26, Feature 84, all recorded in
  done.md): reward items grant into carried slots via the chest pattern
  instead of Canary's store inbox (inbox routing can ride Feature 43/49);
  the day boundary is the server-local calendar day instead of Canary's
  25 h server-save window (mantus has no global save — charter rule); the
  day-7 XP boost drains by wall clock while Canary drains it with hunting
  time only; offline boss-fight participants collect base reward rolls
  because bosstiary slot records only exist for attached characters;
  day-6 training weapons grant without Canary's 50-charge stamp (charges
  are not modeled on these items yet). Panel (non-shrine) claiming needs
  Feature 43's collection tokens.
- **No claimable-reward indicator outside the reward wall** (2026-08-03,
  Feature 84): Canary pushes `sendDailyRewardCollectionState` (0xDE) at login
  and after every claim, and OTClient lights the reward-wall button gold while
  the day is uncollected (daily_reward.lua:251, 322-331). Mantus has no
  equivalent: the wall's state is only projected when a shrine is used, so the
  only way to learn a reward is waiting is to walk to a shrine and open the
  window. The wall itself now says so clearly and refreshes across midnight
  (done.md 2026-08-03), but the out-of-window signal is missing. Fix: push the
  claimable flag on login and after each claim, keep it in the game-window
  store separately from the open-window state (today `dailyRewards !== null`
  *is* "window open", so a login push would pop the window open), and hang a
  badge off a HUD affordance — or, cheapest, a login message pointing at the
  nearest shrine. Panel claiming stays shrine-only until Feature 43's
  collection tokens land.
- **Protection-zone regeneration now needs a reward streak** (2026-07-30,
  Feature 84): `CharacterProgression.tick` transcribes Canary
  condition.cpp:1490-1535, which *blocks* base health regeneration inside a
  protection zone below streak level 2 (mana below 3) rather than only adding
  the doubling at 5/6. This is a live behaviour change: a character who never
  touches a reward wall stops regenerating in temples and depots, and two
  claims are the minimum to unlock it. Kept for parity; the additive-only
  variant — keep base PZ regeneration and apply only the doubling — is a
  one-line change to `restingHealthBlocked`/`restingManaBlocked` if the nerf
  is unwanted.
- **Daily-reward history integration tests are unrun** (2026-07-30, Feature
  84): the three new cases in `PgDailyRewardStore.integration.test.ts` (the
  history row rides the winning claim only, is newest-first/capped/
  owner-scoped, and is absent after a rollback) have never executed — this
  environment has no Docker and `DATABASE_URL` points at a hosted Supabase
  pooler rather than a local Postgres. Both new SQL statements were validated
  against the live schema inside a rolled-back transaction, and migration 065
  is applied. Run `yarn test:integration` wherever a local Postgres exists.
- **Five Storybook story files fail, unrelated to daily rewards** (observed
  2026-07-30, pre-existing): `SpellListModal` cannot find the "Wound
  Cleansing" spell, `ProficiencyModal` cannot find its "Unlocks at ... XP"
  row, `ActionBar` never fires `onConfigure` on an empty-slot click, and
  `GameHud` fails a chat focus and a dock-class assertion; `LandingPage` fails
  only inside the full parallel run and passes alone. None touch the reward
  wall (its 6 stories pass). Owner unassigned — likely fallout from the spell
  and item-icon commits that precede this work.
- **Podium display rendering** (2026-07-26, Feature 86 → 87): the tile
  overlay bakes a static south-facing outfit frame — stored direction,
  mounts, lookTypeEx monsters, and the platform-hide flag are not
  rendered yet; map-side right-click rotation is not wired (the edit
  window's direction buttons cover rotation).
- **Premium outfits and mounts are not gated** (2026-07-28, Features 70/71):
  the imported catalog records Canary's `premium="yes"` flag per outfit and
  mount, but nothing enforces it — every starter outfit is granted at
  creation regardless, and `OutfitService` never consults the account tier.
  Accounts already carry `premiumUntil`/`accountTier`, so the fix is a tier
  check at grant *and* at selection time (execution-time re-check, since
  premium can lapse while online), plus a premium-lapse fallback to a free
  outfit. Owner: Feature 70.
- **Chest quest-flag window** (2026-07-26, Feature 104): a chest's
  `storageWrites` are audited inside the grant transaction but applied to
  the live player in the resolved outcome; a crash between commit and the
  next character save can keep the item grant while losing the flag
  transition. The chest gate stays claimed either way (no re-grant), and
  the window is the same class as the shipped progression persist flow.
- **Prey/hunting-task gold is bank-only, not carried-coins-first**
  (2026-07-26, Features 74/75). Canary's `removeMoney(..., useBalance=true)`
  spends inventory coins before the bank; mantus charges list
  rerolls/cancels from the bank balance alone, matching the shipped
  gem-atelier pattern (whose identical deviation is recorded under Feature
  81). Retire together with Feature 81's payment-leg unification.
- **Prey hunting time drains whenever prey is enabled, not only under
  `STAMINA_SYSTEM`** (2026-07-26, Feature 74). Canary couples the 60/120 s
  exp-gain drain to the stamina helper (data/events/scripts/player.lua),
  so with stamina off prey never expires there; mantus drains on every
  kill-experience gain regardless of `progression.staminaSystem`, keeping
  the 2 h hunting-time semantics on stamina-less worlds. Deliberate.
- **Prey option renewals charge optimistically** (2026-07-26, Feature 74).
  An auto-reroll/lock expiry renews the bonus in-tick from the in-memory
  wildcard balance and settles the durable debit asynchronously; if the DB
  debit reports insufficient funds the service erases the bonus and
  restores the balance next tick. The drift window is one in-flight write;
  intent-driven spends stay fully transactional.
- **No chat-line notices for prey/task events** (2026-07-26, Features
  74/75). Canary sends flavor text ("Your prey bonus has expired.", claim
  congratulations); mantus pushes the full state message instead and the
  client windows render the change. Add strings if playtesting misses them.
- **Shop carry capacity is re-checked only in the tick precheck, not inside the
  transaction** (2026-07-25, Feature 46). `ShopPrechecks` compares projected
  weight against `capacityMax` in the tick immediately before the transaction
  is enqueued, so the stale window is one tick — but it is still stale
  validation (charter rule 4). The fix is cheap now that grants descend the
  carried subtree: `coinOwnedItemsQuery` already loads every owned row inside
  the transaction, so weight can be summed there; `capacityMax` needs to ride
  along on the server-built `ShopPurchaseRequest`. Owner: Feature 46.
- **The Mantus Store's integration tests have never been executed**
  (2026-07-29, Feature 43). All 20 cases in
  `server/src/store/PgMantusStore.integration.test.ts` — every delivery leg's
  transaction, the racing-purchase and replay-guard assertions, the
  inbox-full rollback, the escalating XP-boost price — were written against
  the new store but skipped, because no Postgres was reachable in the
  environment where they landed (Docker is unavailable from this WSL distro).
  The store's unit-level behaviour and the boot catalog gate are covered and
  passing; its *transactional* behaviour is asserted only on paper. Run
  `yarn test:integration` before relying on it. Owner: Feature 43.
- **A store sex change can be undone by a concurrent character save**
  (2026-07-29, Feature 43). `deliverSexChange` writes `characters.sex`,
  `outfit_look_type` and `outfit_addons` inside the purchase transaction but
  does not bump `version`, and the tick applies the same values to the live
  player afterwards. A snapshot save landing in that sub-tick window would
  write the pre-change look type back over the committed one (the sex column
  itself is not in the snapshot query, so it would survive). Fix by bumping
  `version` in the delivery, or by having the snapshot save leave outfit
  columns it did not author alone. Owner: Feature 43.
- **A store name change needs a relog to take effect in the world**
  (2026-07-29, Feature 43). `Creature.name` is immutable, so the renamed
  character keeps its old name in other players' views until the next login
  reads the row back. This matches Canary, which says so in the offer's own
  description, and is recorded as a deviation rather than a bug — but a live
  rename would need a mutable creature name and a name-change broadcast.
  Owner: Feature 43.
- **No low-level experience bonus term** (2026-07-29, Feature 43). Tibia's XP
  Gain Rate panel lists a "Low Level Bonus" row; mantus has no such term in
  the kill-experience path, so `getExperienceRate` omits the row entirely
  rather than always showing 0%. Adding the bonus is a progression change
  (owner: Feature 72/the progression curve work); the panel picks it up for
  free once the term exists.
- **`/coins` and `/storerefund` are dev-only GM commands, not real operator
  tooling** (2026-07-25, Feature 43). They credit and refund the *operator's
  own* account only, are audited with the operator's character id, and exist
  only when the server runs with `DEV_COMMANDS=1` — so they are not a
  player-reachable surface. Feature 96 shipped the role-authorized surface they
  should move onto (2026-07-25); they need an `economy.grant` capability added
  to `AdminCapability` and a handler on `AdminCommandHandler`.
- **Inbox-overflow spillover deviates from Canary** (2026-07-25, Feature 64).
  Items that do not fit an evicted owner's inbox stay on the house tiles and
  are counted in the eviction audit row. Canary mails them with `FLAG_NOLIMIT`,
  ignoring the inbox cap; matching that exactly would let an eviction push a
  character past `DEPOT_LIMITS.maxInboxItems`, i.e. unbounded per-connection
  storage, which charter rule 10 forbids. Feature 64 closed 2026-07-25 with
  this recorded as a permanent audited deviation — not open work.
- **Roles have no operator tooling** (2026-07-25, Feature 96; supersedes the
  earlier staff-flag gap). `accounts.role` now authorizes every admin action
  and `is_staff` is a generated column derived from it, so the two truths are
  gone — but the role itself is still only settable with direct SQL. A real
  admin console or CLI is the remaining half of "never hand-edit production
  data as routine administration". Owner: Feature 96.
- **Content/event controls are still dev-only** (2026-07-25, Feature 96).
  `/raid`, `/coins` and `/storerefund` live in the `DEV_COMMANDS`-gated
  `GmCommandHandler` rather than the role-authorized surface. Each needs a
  capability (`world.content`, `economy.grant`) before it can move. Owners:
  Feature 43 (coins/refund), Feature 54 (raid).
- **Namelock has no rename flow** (2026-07-25, Feature 67). A namelocked
  character is held out of the world with `character-namelocked`, which is the
  enforcement half; nothing clears the flag in-game. The rename infrastructure
  is Feature 2. Owner: Feature 67.
- **Outfit/mount rendering has not been eyeballed in the running client**
  (2026-07-26, Features 70/71). Mounted rendering, the riding pose
  (pattern-Z 1), and the addon-compositing preview shipped with unit tests,
  but a wrong pattern index is invisible to tests — the feature files always
  called for a visual pass with `/run` or Storybook, which this session's
  no-dev-servers rule skipped. Fix: eyeball a mounted walk cycle and an
  addon toggle once in-game; `node client/tools/spritetool.mjs render outfit
  128 out.png --x 2 --z 1 --phase 1` spot-checks frames offline.
- **Fields cannot be implemented from the pinned assets** (2026-07-25,
  Feature 50). The item catalog imports `kind: "magicfield"` for 45 types but
  no `field` payload; `ItemType.field` is declared and always undefined, so
  there is no damage or duration data to drive a field handler. The importer
  must emit it first. Owner: Feature 50.
- **`m_transformOnUse` / `ignoreLook` still unparsed** (2026-07-25,
  Feature 52). Capturing them means regenerating `objects.json` and the sprite
  atlases from the pinned `Tibia.dat`/`.spr`, which live outside the repo; that
  regeneration was deliberately not attempted while shipping the registry
  guarantees, because it rewrites every client asset. Canary's own bidirectional
  transform tables (`carpets.lua`, `windows.lua`, the trap-disarm action) are an
  alternative source needing no DAT change. Owner: Feature 52.
- **World events have no reward step kind** (2026-07-25, Feature 54). No pinned
  raid grants an item or currency, so the engine's step kinds are announce and
  spawn only. Restart-safety for rewards is therefore structural rather than
  exercised; the first reward step must commit inside a run-keyed transaction
  (the `character_chest_loot` pattern). Owner: Feature 54.
- **`/raid` is a dev-only GM command, not real operator tooling** (2026-07-25,
  Feature 54). Same shape as `/coins` and `/storerefund`: it exists only under
  `DEV_COMMANDS=1` and the attempt is audited against the operator's own
  character. Feature 96's role-authorized surface shipped 2026-07-25; this
  needs a `world.content` capability and a handler on `AdminCommandHandler`.
- **The party analyzer's "market" price mode uses catalog `worth`**
  (2026-07-25, Feature 55 — closed; gap accepted). Canary reads live market
  statistics; there is no market price index to read. The `npc` mode uses real
  shop sell prices, so the toggle is not a no-op. Also accepted: supplies
  count runes, ammunition and potions only — food and other consumables are
  not observed. Revisit if a market price index (Feature 49's catalog work)
  ever lands.
- **Party-finder visibility defaults to listable** (2026-07-25, Feature 56).
  `PartyHandler` consults a `finderVisible(characterId)` hook at query execution
  time, but the friend-system privacy setting it should read does not exist yet.
  Owner: Feature 65.
- **Guild withdrawal is leader-only, not rank-gated** (2026-07-25, Feature 58).
  Canary gates it on a rank capability; there is no permission model on
  `guild_ranks` yet, so the guild leader is the only withdrawer. Owner:
  Feature 58.
- **The combat-logout linger window is not covered end to end** (2026-07-25,
  Feature 59). `LingeringPlayers.test.ts` pins the window's bookkeeping, but the
  real exploit (killer disconnects, victim dies, frag recorded) needs two
  headless clients in a fight — a playtest scenario, not a unit test. Also: the
  item cache detaches with the session, which is only safe because a player
  corpse drops nothing today; when Feature 32's death loss drops items, the
  lingering entity must keep its inventory attached. Owner: Feature 59.

- **Economy transactions retry only on `40001`/`40P01`, not on connection-level
  transients** (2026-07-25, Feature 31). `item/withSerializableTransaction`
  retries the broader `isTransientDatabaseError` set because every item op is
  expected-version guarded, so an ambiguous re-run misses instead of
  double-applying. Money legs in `economy/runSerializableTransaction` are not
  version-guarded, so retrying an `ECONNRESET`/`08*` whose COMMIT may already
  have landed could apply a transfer twice. Serialization aborts and deadlocks
  are guaranteed rollbacks and are retried. Fix if connection-level retry is
  ever wanted: give the money legs an idempotency key (the market replay-guard
  pattern) first. Owner: Feature 97 (server error handling owns retryability
  classification and ambiguous-COMMIT handling; reassigned when Feature 47
  closed 2026-07-25).
- **Untouched corpses and their loot vanish on restart** (Feature 31,
  re-affirmed 2026-07-25). Intended, matches Canary — memory-first corpses have
  no DB row until first touch. Not a bug.
- **World decay deadlines are derived from `items.updated_at`, not a stored
  `decay_at`** (2026-07-25, Feature 34). A deadline is always
  `last-mutation-time + duration(type)`, so the column would be redundant and
  would cost a DB write per world-item mutation. The derivation depends on
  every `UPDATE items` bumping `updated_at`;
  `server/src/item/updatedAtInvariant.test.ts` enforces that. If a future
  decay ever needs a deadline that is *not* "full duration from the last
  mutation" (a paused/stop-condition decay — Feature 33), that item does need a
  stored deadline; add the column then, for those items only.

- **Two WOD-graded combat areas still wait on their spells** (2026-07-26,
  narrowed from the 2026-07-25 Feature 25 entry). Energy Beam, Energy Wave,
  Great Energy Beam, and Sap Strength now pick their upgraded areas from
  `player.wheelBonuses` at cast time (`server/src/combat/wheelUpgradedAreas.ts`
  + `wheelSpellAugments.ts`/`wheelBeamMastery.ts`). Great Death Beam
  (per-grade `AREA_BEAM6/7/8`) and Mass Healing remain at nothing rather than
  base grade because both spells are unsupported catalog entries; their areas
  land with the spells. Owner: Feature 79 (via Feature 24's disabled-spell
  bucket).

- **38 pinned monster loot entries can never drop** (2026-07-25, Feature 29).
  Twelve items (darklight/inferniarch-era drops) exist in the pinned Canary
  monster tables but not in the pinned Tibia 15.11 item catalog, so the roll
  skips them. The budget is pinned by `monsterLootParity.test.ts`, which fails
  if a thirteenth appears. Fix: a newer asset era, not a code change.
- **Blessings protect experience but not yet equipment** (2026-08-08,
  Features 32/72; supersedes "Blessings are always zero"). Purchase,
  persistence (`characters.blessings` bitmask, migration 077), the death-loss
  discount, and PvE death consumption shipped with the VIP full bless
  (Henricus dialogue, `BlessService`/`PgBlessStore`). Still open, in Canary
  order of impact: (1) items/containers never drop into a player corpse —
  player corpses don't exist, so `equipmentLossChancePercent` has no
  consumer; (2) Amulet of Loss and Twist of Fate PvP-death semantics (ToF is
  not sold and its bit survives every death); (3) temple single-bless NPCs —
  27 imported NPCs still carry unsupported `StdModule.bless` keyword actions
  (parity-gate ceiling unchanged at 611); (4) the adventurer's-blessing
  free-below-level rule. Owner: Feature 72.
- **Ignore lists are memory-only** (2026-07-25, Feature 35 — single owner
  after the 2026-07-25 restructure; the duplicate Feature 65 entry was
  merged here). They survive a relogin (keyed by character id for the
  server's lifetime) but not a restart. Fix: a per-character table loaded at
  attach alongside the durable mute; the suppression path itself needs no
  change.
- **Chat flood escalation is memory-only** (2026-07-25, Feature 36). The
  repeat-offender counter behind escalating mutes is keyed by character id for
  the server's lifetime, so it survives relogging but a restart forgives every
  offender. Accepted deliberately over persisting it: the counter now decays on
  a schedule (`chat.escalationDecayMs`), so its worst case is one forgiven
  escalation step, and keeping it out of the database keeps the chat hot path
  free of I/O. Fix if abuse warrants: a `character_chat_escalation` row loaded
  at login next to the durable mute (`ModerationService.attachCharacter`) and
  written behind the tick when a mute is issued. Owner: Feature 35 (chat
  remainder; Feature 36 closed 2026-07-25 with this accepted).

- **233 rope holes have no reachable landing tile** (2026-07-25, Feature 51/4).
  Canary's `holeId` list now drives 4,968 working `rope-hole` actions, but 233
  placements are disabled because no neighbour of the hole is walkable (207
  blocked, 74 missing, 53 at z15 with no floor below). These need map-content
  review rather than code; they are pinned by kind and reason in
  `server/src/mapParityCeiling.test.ts`. Owner: Feature 4.
- **Two "Harlow" NPC definitions collide upstream** (2026-07-25, Feature 10).
  `harlow.lua` and `harlow_trade.lua` both register the Canary type name
  "Harlow"; the world placement resolves to `harlow.lua` by file-name match.
  Every other former duplicate was Canary's location-variant convention and is
  now addressable by its own id. Owner: Feature 10.
- **67 NPC location variants are recorded but not imported** (2026-07-25,
  Feature 10). `variantFamilies` in the world import report lists each variant
  with a stable id; they have no map placement because the quest scripts that
  spawn them are not converted. Owner: Features 103-105.
- **Canary's Crypt Warrior has an unusable bestiary entry** (2026-07-25,
  Feature 9). Its `Bestiary` block declares no `monster.raceId`, so there is no
  id to track kills against — an upstream data defect, reported as
  `status: "upstream-defect"` and capped at one monster.
- **Fluid containers are unimplemented and blocked on three prerequisites**
  (2026-07-25, Feature 11). No `fluidSource` in the item catalog, no
  fluid-subtype model on carried items, and no non-tile `use-item-with` target
  kind. The full assessment and implementation order are in
  `todo/todo-4.md` (Feature 11). Owner: Feature 11.

- **A future map-version upgrade needs an explicit seed reconciliation
  migration** (recorded with Feature 7's world-seed path; carried out of
  Feature 15 when it closed 2026-07-24). `db:reconcile-world-seed` reconciles
  against the *current* seed fixtures; upgrading the map/content version needs
  a deliberate migration step that re-runs reconciliation against the new
  seed, not an implicit boot-time fix-up. Owner: Feature 98 (migration
  policy).
- **Conservation sweep conditionals** (carried out of Feature 44 when it
  closed 2026-07-25). Escrow is reported, not re-derived — it leans on the
  `market_offers` check constraint; if escrow ever stops being
  `remaining_amount × unit_price`, add a fourth invariant. Tracked rares are
  not covered; extend the sweep's shape to a rare-item watchlist once one
  exists. Owners: Feature 99 (reconciliation jobs), Feature 96 (operator
  surface).
- **The NPC importer still drops travel keywords silently** (2026-07-26,
  found while fixing Chemar). `parseCanaryNpcDialogues.mjs` only matches
  `keywordHandler:addKeyword` calls written at column 0, so the 56 NPCs that
  register rides through a file-local `addTravelKeyword` helper lose every
  route — and the import report records `unsupportedKeywordActions: []` for
  them, so the ledger reads as a clean import. The carpet network (9 pilots)
  and the boat network are now carried as reviewed route content
  (`carpetTravelRoutes.ts`, `boatTravelRoutes.ts`), which covers the NPCs the
  pinned world spawns, but the hole itself is open: a re-import will keep
  dropping helper-registered keywords without saying so. Recommended fix:
  teach the parser to inline a local travel-keyword helper (substituting the
  call site's literal arguments for its parameters) and to report what it
  still cannot type, so the route content can shrink back toward zero. Owner:
  `todo/todo-12.md` (world actions/NPC parity).
- **Uzon's Edron ride no longer advances The Postman Missions** (2026-07-26,
  with the carpet routes). The pinned `uzon.lua` passes an `action` callback
  that moves `Quest.U7_24.ThePostmanMissions.Mission01` from 2 to 3 when the
  player flies to Edron. `DialogueEffect` is an unconditional `set-storage`,
  so applying it as-is would stomp the mission from any other value; the
  effect is omitted instead and the ride works without it. Nothing else in
  the server drives that quest today, so nothing regressed. Recommended fix:
  give `DialogueEffect` the same optional `conditions` the offers already
  carry, evaluated in `NpcDialogueExecutor.applyEffects`. Owner: Feature 40
  (dialogue-graph engine).
- **`StdModule.kick` with a list of destinations is not imported**
  (2026-07-26, seen on `tanyt` and `ziyad`). Both register
  `keywordHandler:addKeyword({ "kick" }, StdModule.kick, { destination = {
  Position(...), Position(...) } })`, and neither baseline graph has a
  teleport branch — the importer types a single `Position` but not a table of
  them. Low impact (the kick is a convenience exit from the carpet landing
  pad), but it is a dropped branch, not a deliberate omission. Owner:
  `todo/todo-12.md` (world actions/NPC parity).
- **A blocked travel branch answers with the generic refusal line**
  (2026-07-26, with the carpet Farmine/Eclipse gates). `NpcDialogueExecutor`
  says "I cannot help you with that right now." for every failed node
  condition, where the carpet pilots say "Never heard about a place like
  this." Shared by all 93 gated baseline nodes, so it is a per-node
  refusal-message field, not a per-NPC fix. Deliberately vague messages are also what keeps a gate from
  leaking its storage key (charter rule 6), so any per-node message must stay
  content-authored, never derived from the condition. Owner: Feature 40
  (dialogue-graph engine).
- **The kill tracker panel overlaps the left HUD indicator column**
  (2026-07-26). `GameTrackerOverlays` docks at `top-24 left-4` and
  `GameWorldOverlayParent` paints after `GameWorldHudParent` at the same
  `z-20`, so an open tracker covers the protection-zone / condition / skull
  stack `GameHud` renders at the same origin. Pre-existing, but now reachable
  on demand since the panel no longer hides itself when nothing is tracked.
  Recommended fix: give the left column and the tracker distinct docks (or
  flow the tracker below the indicator stack) rather than nudging `top-*`.
  Owner: `todo/client/`.
- **Proficiency perk percent display inflates whole-number values**
  (2026-07-27, noticed while rebuilding the proficiency window). The percent
  perk families in `content/proficiencies.json` mix fractional values (0.05
  → "+5%") with values ≥ 1: `skill-percentage-spell-healing` reaches 10
  (rendered "+1000% of Magic Level to Spell Healing"), and 1–2 appear in six
  more families. `formatProficiencyPerkValue` multiplies every percent-family
  value by 100, matching only the fractional entries. Display-only today:
  the server applies just `skill-percentage-auto-attack` (all fractional)
  and ignores the rest, so nothing mis-executes. Recommended fix: determine
  the intended unit per family from pinned Canary's weapon_proficiency.cpp
  consumption and normalize at import (`importCanaryProficiencies.mjs`),
  not with a display heuristic. Owner: Feature 86 (inert perk families).
- **OTClient art gaps in the prey/proficiency windows** (2026-07-27). The
  mehah/otclient image set we imported has no hunting-task flag, so active
  task cards fly the grey "?" no-bonus flag; elemental perk entries carry no
  `element` field at this content pin, so their icons fall back to the
  sheet's first (physical) cell; and const.lua maps armor-penetration and
  alpha/omega strike at x 1216–1344, past the 1216px icons-0 sheet, so those
  three fall back to the attack icon (`getProficiencyPerkIcon.ts`).
  Recommended fix: rip the task flag + a wider icons-0 from a newer client
  build, and carry `Element` through `importCanaryProficiencies.mjs` if a
  later Canary pin provides it. Owner: `todo/client/`.
- **Change Character leaves the world by dropping the socket** (2026-07-28).
  The game menu's Change Character reuses `reconnect(null)`: the client tears
  down the connection and the server sees an ordinary disconnect. So changing
  character mid-fight parks the character in the combat-logout linger window
  (it keeps taking damage while its owner sits at the character list) instead
  of being refused the way Canary refuses a logout during a fight, and the
  round-trip pays a fresh WebSocket handshake plus token verification.
  Recommended fix: a `leave-world` client message in `protocol/` (schema, max
  size, rate expectation) whose handler refuses while `combat-lock` is
  running, otherwise runs `GameServer.leaveWorld`, wipes the session's
  character-scoped fields the way `CharacterHandler.evictExistingSession`
  does, unbinds the player and replies `character-list` — with a client-side
  reset that clears `ownCharacter` without rebuilding the socket. Owner:
  Feature 59 (session/logout lifecycle).
- **A bought spell changes nothing** (2026-07-29). `SpellTeacherService` takes
  the money and writes `Spell.<spell_id>` to `character_storages`, but nothing
  reads that key back: `SpellRegistry.projectFor` hands the client every spell
  of the character's vocation and `SpellCaster.spellRejectionCode` has no
  learned-spell gate (its one `spell-not-learned` return is the wheel
  revelation check). So spells are castable without buying them, and the only
  effect of a purchase is the gold leaving the player. Recommended fix: gate
  both the projection and the cast on `player.storageValue(
  learnedSpellStorageKey(spell.id)) > 0` for spells Canary sells, seeding the
  free starter spells at character creation so existing characters are not
  stripped mid-flight; the migration for already-created characters needs its
  own backfill. Owner: Feature 40 (NPC dialogue/typed commands) with the cast
  half in the combat features (22–28).
- **~130 imported spell offers have no confirmation branch** (2026-07-29). In
  `content/npcs/canary-dialogue-baseline.json` some "Would you like to learn
  {x} for N gold?" nodes carry no child holding the `learn-spell` action (e.g.
  `muriel/dialogue-17` "explosion", 3 of Muriel's 34 offers; every teacher has
  a handful). The player says yes and nothing happens. The importer is
  dropping the confirmation node rather than the engine failing, so the fix is
  in `tools/importCanaryNpcs.mjs` plus a re-import; a parity assertion that
  every "would you like to learn" node has a `learn-spell` child would keep it
  fixed. Owner: Feature 38/40 (NPC content grind).
- **Reviewed NPC dialogues still shadow richer imported ones** (2026-07-29).
  `loadNpcDialogueGraphs` now refuses an override that *drops an action*, but
  an override may still discard imported flavour and quest branches:
  `quentin` 22 nodes → 10, `frodo` 44 → 3, `gorn` 23 → 3. Recommended fix:
  re-check whether those four hand-written entries are still needed now that
  the importer wires shops, and delete the redundant ones the way `elane` was
  deleted. Owner: Feature 40.
- **Map click routing has no test harness** (2026-07-29). The fix keeping HUD
  right-clicks out of the world (`WorldRenderer.secondaryPressOnCanvas`) is
  unit-testable only by standing a Pixi `Application` up in vitest; every test
  in `client/lib/render/` covers pure helpers instead. Recommended fix: extract
  the pointer routing decisions into a pure module (`shouldResolveMapClick`,
  taking button/target/drag state) that both the renderer and a unit test can
  call. Owner: `todo/client/`.
- **Exercise-weapon charge spend is untested against Postgres** (2026-07-29).
  `PgItemUseOps.consumeCharge` decrements `attributes.charges` and deletes the
  row on the last charge inside one serializable transaction, but no Postgres
  is reachable in this environment, so only the `MemoryItemStore` twin is
  exercised. Recommended fix: add a `PgItemStore.integration.test.ts` case that
  races two charge spends against one weapon and asserts exactly one charge
  goes, plus one that asserts the last charge deletes the row and writes the
  `item-destroyed` audit. Owner: Feature 72.
- **House exercise dummies skip the house-membership check** (2026-07-29).
  Canary refuses a house dummy to anyone not inside that house and caps
  trainers per dummy; only the cap is implemented, so a player standing in a
  protection zone beside a house dummy could train on it. Recommended fix:
  resolve both tiles' houses through `HouseService` at execution time in
  `ExerciseTrainingHandler.handle`. Owner: Feature 72.
- **A few icon surfaces still resolve appearances by bare sprite id**
  (2026-07-30). `SpriteIcon` resolves an item's appearance from its `clientId`,
  threaded through inventory, containers, action bar, depot, mailbox, shop,
  market, forge and the store. Surfaces whose protocol rows carry no client id —
  bestiary loot, daily rewards, wiki, auction browser, forge banner — fall back
  to `itemIconAnimationStore`'s first-sprite index, so the handful of
  appearances sharing a first sprite draw static and unpatterned. Recommended
  fix: add `clientId` to those schemas when touching them. Owner: `todo/client/`.
- **Stack sizes reach icons, fluid subtypes do not** (2026-07-30). Item icons and
  ground items now pick Tibia's pile art from the stack count
  (`getStackCountPattern`), but splashes and fluid containers pattern by their
  *fluid subtype*, which no protocol row carries — `mapItemStateSchema.count` is
  a stack size — so every puddle and vial draws the first cell. Recommended fix:
  project the subtype for splash/fluid items and map it through Canary's fluid
  colour table. Owner: `todo/client/`.
- **Permanent magic effects play once** (2026-07-30). 13 of Tibia's 198 animated
  effects declare an infinite loop; OTClient marks those `m_permanent` and keeps
  drawing them until the server removes the thing. We have no effect-removal
  message, so `CombatEffectRenderer` plays one pass and destroys them rather than
  leaking sprites forever. Recommended fix: add a remove-effect server message
  (or a duration) for persistent effects, then honour the loop type. Owner:
  `todo/client/`.
- **House decoration kits cannot be wrapped back** (2026-07-29). Store-bought
  furniture unwraps on an owned house tile (`handleDecorationKitUse`), but
  Canary's reverse op — wrapping placed furniture back into a kit via its
  `wrapableto` id — does not exist, so furniture cannot be moved between
  houses or sold back. Recommended fix: import `wrapableto` into the item
  catalog and add the inverse transform behind the same decorate
  authorization. Owner: Feature 43.
- **House-kit store delivery is untested against Postgres** (2026-07-29).
  `deliverInboxItem` now delivers `house-item` grants as decoration kits with
  `unwrapTo`/`description` attributes; the integration case exists in
  `PgMantusStore.integration.test.ts` but no Postgres was reachable in this
  environment, so only unit-level coverage ran. Run the integration suite
  before trusting the store. Owner: Feature 43.
- **Creatures have no idle animation, and outfit walk timings are invented**
  (2026-07-30). Real Tibia animates a standing creature from its *idle* frame
  group (`Creature::getCurrentAnimationPhase`: idle animator while
  `walkAnimationPhase == 0`, then `walkPhase + idlePhases - 1` while moving), and
  times the walk from the group's own per-phase schedule. Our pinned legacy
  Tibia.dat cannot express either: measured against Canary's protobuf, outfits
  there carry an idle group plus a moving group whose phases the DAT disagrees
  with entirely — outfit 2 has 3 DAT phases against 1 idle + 8 moving in the
  protobuf, and only 160 of 1,443 outfits even satisfy `dat == idle + moving`.
  The idle sprites are simply not in this rip, so `getOutfitAnimationFrames`
  keeps its own `WALK_FRAME_DURATION_MS`. Recommended fix: re-rip outfits from
  the modern frame-group assets (`--enhanced-animations` with frame groups, or
  the protobuf + sprite sheets directly), then pick the group by creature state.
  Owner: `todo/client/`.

- **Spell modules no longer diff against the Canary dump** (2026-07-29).
  Formulas now live in `server/src/combat/spells/**` as editable TypeScript;
  `content/spells/canary-spells.json` is kept only as the upstream reference.
  `SPELL_DEFINITIONS.test.ts` catches a *missing* spell id but not an upstream
  change to a spell we already tuned. Recommended fix: a report mode in
  `tools/buildSpellReport.mjs` that lists per-field divergence between the
  modules and the dump, run from `parity:check` as advisory output rather than
  a gate. Owner: Feature 26 (spell report gate).
- **Item overrides carry the whole item record** (2026-07-29).
  `yarn item:override` scaffolds every field, including `spriteId`, `render`
  and `elevation`, so an override pins that item's asset-derived fields against
  a future `yarn items:catalog` re-import. Only scaffold items being tuned, and
  trim untouched fields. Recommended fix: an optional `--stats-only` flag that
  emits just the gameplay fields. Owner: Feature 43.

- **Look at static scenery trusts a validated client id** (2026-07-29).
  The server only tracks mutable/interactive world items, so a look at a tile
  whose top sprite is static scenery is answered from the client-supplied
  client id in the `look` intent. It is validated against the pinned catalog,
  the tile must be inside the session's current view range, and an
  authoritative world item on that tile always wins — so the id can only pick
  which catalog description is read back, never create or reveal state.
  Recommended fix (only if it ever matters): emit the full static stack into a
  server-side artifact and drop the field. Owner: Feature 52.
- **`yarn playtest:look` is unrun** (2026-07-29). The end-to-end look scenario
  (own character before/after a promotion, a summoned rat, a dropped fire
  sword, static scenery, a real house door, a silent out-of-view refusal) is
  written but never executed: this environment has neither Postgres nor Docker. Run it
  once a database is reachable. Owner: Feature 52.
- **Item look flags our catalog does not carry** (2026-07-29). Canary's
  `showAttributes` is absent, so `describeItemLook` merges its two
  parenthesised stat passes into one group instead of reproducing both; ring
  effect flags (`invisible`, `manaShield`, `hard drinking`, faster
  regeneration) and `ignoreLook` are not in the pinned catalog either, so those
  suffixes and the skip-this-type rule are missing. Recommended fix: capture
  the flags in the asset/`items.xml` import pass. Owner: Feature 108 (asset
  regeneration).
  Ammunition also reports no stat group, because Canary's look chain skips
  `WEAPON_AMMO` entirely (it shows the attack only in the inspection window,
  which our hover tooltip already covers). If the official client turns out to
  print `(Atk:25)` on an arrow look, add an ammunition branch to
  `itemLookSegments` — our catalog carries `attack` and `maxHitChance` for every
  ammo type. Owner: Feature 52.

- **Memory-first economy SQL is unrun against a database** (2026-07-30).
  Shop buy/sell and bank deposit/withdraw moved to memory-first, and the whole
  durable half now goes through the new `PgEconomyPersistOps` — guarded bank
  deltas keyed on `expectedBalanceAfter`, guarded finite-stock decrements, and
  the shop/bank audit and ledger inserts. Its 10-case integration suite
  (`server/src/economy/PgEconomyPersistOps.integration.test.ts`) plus the
  reworked `PgBankStore` and `CurrencyReconciler` suites have never executed:
  this environment has neither Docker nor a local Postgres, and the configured
  `DATABASE_URL` is the hosted Supabase pooler, which is not a test target.
  Everything below the planners is therefore proven only by typechecking.
  Recommended fix: run `yarn test:integration` with `TEST_DATABASE_URL`
  pointing at a local Postgres before this reaches production, and treat a
  failure there as blocking. Owner: Feature 46.

- **Auto-loot migrations `066_character_loot_filter.sql` and
  `075_character_loot_pickup_filter.sql` are unapplied** (added 2026-07-30,
  extended 2026-08-06). `characters.loot_filter` is read by `toCharacter` and
  written by `PgCharacterStore.updateLootFilter`, but neither migration has
  run: this environment has no Docker and no reachable Postgres. Both are
  reviewed but unexecuted, so every loot-filter save will fail against a
  database that has not been migrated (the handler rolls the session back and
  reports `loot-filter-update-failed`, so it degrades rather than corrupts).
  Recommended fix: run `yarn db:migrate` before this reaches any live server.
  Owner: the auto-loot work recorded in `todo/done.md` (2026-07-30, 2026-08-06).
- **Every stored auto-loot filter is reset by the pick-up-list switch**
  (accepted 2026-08-06). The filter went from a blacklist ("skip these") to a
  whitelist ("take these"), and 075 rewrites every row to the disabled default
  rather than inverting it — an inverted list would either take what the
  player chose to leave or leave what they chose to take. Players who had
  configured auto-loot must open the window and pick again; auto-loot stays
  off until they do, so nothing is swept unasked. Recommended fix: none —
  announce it with the release. Owner: the loot filter work (2026-08-06).
- **A creature's drop table can reach 320 cells** (accepted 2026-08-06).
  `LootFilterCreaturePanel` expands every gradable drop into five grade cells,
  so a table at the protocol's 64-drop ceiling draws 320 of them. Real tables
  are a fraction of that (a rotworm: 14) and the panel scrolls, so it is left
  alone. Recommended fix if a boss table makes it crawl: collapse each drop to
  one cell with a grade strip on hover. Owner: the loot filter work
  (2026-08-06).
- **The loot-filter search draws at most 60 item types per query** (accepted
  2026-08-06). A one-letter query matches hundreds, and each gradable one is
  five cells; the cap keeps that under ~300 tiles. Types past the cap are
  dropped silently rather than paged. Recommended fix: a result count with a
  "refine your search" note, or paging like the wiki bestiary's. Owner: same.
- **Auto-loot needs the killer within one tile of the corpse** (accepted
  2026-07-30). `ItemIntentHandler.autoLoot` reuses `isNear`, the same reach
  rule a hand-made loot move obeys, so a ranged or run-away kill auto-loots
  nothing. This is deliberate — the alternative is a reach exemption that
  only auto-loot enjoys — but Canary's quick-loot is more forgiving, so
  revisit if playtest finds it annoying. Recommended fix if changed: widen
  the check inside `autoLoot` only, never in `planLoot`. Owner: same.
- **Auto-loot has no per-category container routing** (accepted 2026-07-30).
  Everything on the pick-up list goes through `planBackpackPlacement`, which fills
  the equipped backpack and every bag nested inside it depth-first — correct
  and recursive, but it cannot send gold to one bag and gems to another.
  `planLoot` already accepts an explicit `destination`, so routing is a matter
  of extending `lootFilterSchema` with a category→container map and passing it
  through. Owner: same.
- **An action-bar button for an object the character carries none of still
  draws `?` instead of the greyed sprite** (accepted 2026-07-31).
  `InventoryState.carried` (Canary's `sendInventoryIds`) now keeps the icon
  alive for anything in a closed backpack, but once the last one is gone the
  type leaves the summary and the client has no server-id → appearance map of
  its own, so `ActionBarActionIcon` falls back to `?`. Canary's client reads
  the sprite from Tibia.dat and only greys it. Recommended fix: have the
  server include the action bar's own item types in `carried` with count 0
  (`sanitizeActionBarAction` already resolves each type against the catalog),
  and relax `carriedItemSummarySchema.count` to non-negative. Owner: the
  action-bar work recorded in `todo/done.md` (2026-07-31).
- **Public-website editorial destinations are provisional** (2026-07-31,
  Feature 110). The portal layout, live world status, boosted rotation,
  highscores, online list, character lookup/profile, server-info, and vocation
  guide pages are real, but the featured Astral Vault dispatch is explicitly a
  development preview. The news archive does not yet have a durable content
  source. Recommended fix: replace the preview with approved launch copy and
  add that bounded read-only page as its server projection becomes available.
  (The public guild directory + rosters shipped 2026-08-05 — see done.md.)
  Owner: public website.
- **Public sibling-character lists need an explicit account opt-in**
  (2026-07-31, Feature 110/101). The Tibia-style profile preserves the
  Characters section but does not reveal which characters share an account:
  the current account model has no public-visibility preference, and exposing
  that relationship by default would disclose private ownership metadata.
  Recommended fix: add an authenticated account privacy setting, persist it,
  and expose a bounded sibling projection only when the owner opted in.
  Owner: public website/auth.
- **Six gold sinks never report the balance they charged** (2026-08-01). The
  bank, shop, market, imbuement, gem atelier, guild bank, and player transfers
  all push `bank-updated` and refresh `InventoryCacheManager.bankBalance`, so
  the wallet counter in the top bar and every affordability plan follow them.
  Prey list rerolls, hunting-task rerolls/cancels, bosstiary slot removals,
  forge fusion/transfer, house rent/purchase/transfer, and NPC travel fares
  debit `bank_accounts` inside their own transaction and tell nobody: the
  cached balance and the client's counter keep the pre-charge number until the
  next bank/shop/market/imbuement/gem/guild event or relog. Not an economy
  hole — `debitBankBalanceQuery` guards with `balance >= $2`, so a stale (too
  high) cache can only make an action fail, never overdraw. Recommended fix:
  the prey, hunting-task and boss-slot stores already return `goldAfter`, so
  their services only need `items.setBankBalance` + a `bank-updated` send;
  forge, house and NPC travel additionally have to return the post-debit
  balance their SQL already reads. Owner: economy/bank.
- **A training exercise weapon pushes a full inventory per charge write**
  (2026-08-02). Every charge write commits through `ItemIntentHandler
  .consumeCharges`, and `ItemOperationRunner` answers every committed mutation
  with a whole `inventory-updated` — equipment, open containers and the carried
  summary, tens of kilobytes. Bundling capped how often that happens (one
  message per bundle, not per hit: ~5/s at the epic tier's 200 ms pace against
  a fast database, fewer against a slow one), so this is no longer urgent, but
  it still scales with the number of players training at once. No correctness
  risk: the charge spend is one serializable transaction and the client applies
  each snapshot through the optimistic queue as before. Recommended fix: a
  compact `item-charges { itemId, revision, charges }` server message that
  patches the one item in place, sent instead of the full snapshot while the
  item survives — with the full `inventory-updated` kept for the write that
  destroys it, and the client patch routed through `actions.inventory` so the
  optimistic queue still sees the revision bump. Owner: items/inventory.
- **A custom item tier's tint is applied by DOM icons only** (2026-08-02).
  `spriteCellIconStore` bakes `CustomItemAppearance.tint` into the crop it
  makes, so the epic and legendary exercise weapons animate their spark in
  purple and dark orange in the inventory, the store and tooltips. The Pixi
  world renderer bakes its own frames in `AssetStore.bakeFrame` and knows
  nothing of tints, so one of these weapons lying on the ground still shows the
  stock magenta spark. Cosmetic only. Recommended fix: `bakeFrame` already
  takes an optional colour transform for outfit masks — give it the same
  `tintSpritePixels` pass keyed by the item's client id, and have the frame
  cache key include the tint. Owner: client/rendering.

- **An item persist that dies at `COMMIT` can still orphan or duplicate a
  world item** (2026-08-02). Dropped persist plans now put back the loot/seed
  origins they were going to materialize (`restoreUnpersistedOrigins`), so a
  failed or skipped write leaves the corpse/field memory-only instead of
  row-less. The one case that stays wrong is the ambiguous commit:
  `withSerializableTransaction` retries connection-class errors (`08*`,
  `ECONNRESET`), so a drop right after `COMMIT` re-runs a transaction that
  already landed, the retry fails on the duplicate key, and the compensation
  then marks an item memory-only that does have a row — the next touch hits the
  same duplicate key, poisons the character again and resyncs. Rare, and
  ambiguous commits already diverged before the compensation existed.
  Recommended fix: make first-touch materialization idempotent (insert the row
  keyed on `items.id` with `ON CONFLICT (id) DO NOTHING` and verify the
  surviving row matches the plan), or stop retrying a transaction whose commit
  outcome is unknown, as `PgEconomyPersistOps` already does. Owner: items.

- **Diagonal steps animate over the 3x duration instead of the cardinal one**
  (2026-08-02). The server sends the diagonal-multiplied step duration
  (`getStepDurationMs`, `DIAGONAL_COST = 3`) and `CreatureView.pixelPosition()`
  interpolates position — and paces the foot animation — across all of it, so a
  diagonal reads as a slow smooth glide. OTClient derives pixel progress from
  `getStepDuration(true)`, the *cardinal* duration (`creature.cpp:788`): the
  creature crosses the tile at normal speed, then stands still for the
  remaining 2x with the idle phase forced during the tail
  (`creature.cpp:687-690`). Deferred deliberately when the walk-cycle fixes
  landed — it is correct parity but makes diagonal movement visibly jerkier, so
  it wants a call on the feel first. Recommended fix: carry the cardinal
  duration alongside the full one on the move message, drive `moveT` from the
  cardinal duration, and hold the idle phase once `moveT` reaches 1 until the
  full duration elapses. Owner: rendering.
- **Mounted walk cycles use the rider's phase count, not the mount's**
  (2026-08-02). OTClient sets `footAnimPhases` from the *mount's* thing type
  when mounted (`creature.cpp:677`); `CreatureView.tick()` uses the rider
  outfit's `phases` and `updateFrame()` clamps the mount to its own last phase.
  Identical whenever both are 3-phase, which is every current pair, so this is
  latent: a 1-phase mount under a 3-phase rider would animate the rider's legs
  where OTClient freezes them on phase 1. Recommended fix: pass the mount
  object's phase count into the foot-animation step when `mountObject` is set.
  Owner: rendering.
- **Parity playtests run flat rates but staged multipliers** (2026-08-02).
  `writeParityConfig` in `server/src/playtest/startPlaytestServer.ts` rewrites
  `config.rates` to 1x so parity scenarios compare against Canary's own
  numbers, but it leaves `progression.stages.enabled` alone, so experience,
  skill and magic awards still get the level-banded multiplier. Pre-dates the
  move of the tables into `config.yml`; no current scenario asserts a raw
  award, so nothing fails today. Recommended fix: set
  `config.progression.stages.enabled = false` in `writeParityConfig` alongside
  the rate flattening, then re-run the combat parity suite to confirm no
  scenario was silently relying on the staged numbers. Owner: playtest harness.
- **Logout discards up to 59 seconds of aggressive imbuement decay**
  (2026-08-03). `ImbuementService` counts burned seconds in a per-item ledger
  and only writes a durable checkpoint every 60 qualifying seconds, so a
  character who leaves a fight mid-window carries pending seconds that are
  billed on the next fight. `detachCharacter` flushes that ledger through
  `checkpointCharacter`, but it recomputes `aggressiveBurns` at flush time —
  and `leaveWorld` only runs once the combat lock has expired, so the flag is
  always false there and `checkpointItem` skips every aggressive slot. The
  pending seconds are dropped instead of billed. Bounded at 59 s per equipped
  item per session, but it is farmable: fight, wait out the 60 s lock, relog.
  Recommended fix: flush on the transition instead of at detach — when
  `aggressiveBurns` goes true→false in `sweepCharacter`, checkpoint the item
  with the old flag before continuing; the write budget stays at one per
  combat window. Add a regression test for "fight 30 s, leave combat, log
  out" asserting the attribute lost 30 s. Owner: imbuements (Feature 78).


## Repo-wide known breakage

- **`yarn playtest:look` fails at the fire-sword leg** (2026-08-12, found
  while fixing monster spawns in protection zones — pre-existing, reproduced
  on `main` against a freshly created playtest database). `/i fire sword`
  succeeds, but the scenario then times out waiting for an
  `inventory-updated` whose `inventory.containers` hold an item named "fire
  sword", so the drop/look legs and everything after them never run. The
  scenario is also not idempotent against the persistent playtest DB (a
  second run dies earlier on `/level 30` → "Already level 30"); run it with
  `PLAYTEST_DATABASE=<fresh name>` to see the real failure. Recommended fix:
  find where a conjured item now lands (equipment slot? pouch? a container
  the message reports separately) and assert on that, and give the scenario a
  per-run character the way the newer scenarios do. Owner: Feature 52 (look).
- **`yarn playtest:bestiary` fails on stale stage-gating assertions**
  (2026-08-01). The "add wiki" commit (898e2c3) deliberately made the
  bestiary detail sheet a public catalog — stage gating on stats/loot/
  locations was removed from `BestiaryService.handleMonster` — but
  `server/src/playtest/scenarios/bestiaryUnlock.ts` still asserts the old
  gated behavior ("stage-1 sheet leaked stage-gated fields") and the
  locked/refusal probe. Charm earning itself is verified working (unit tests
  plus an ad-hoc e2e probe: 249 seeded + 1 live rat kill → stage-4 push,
  5 charm points in `bestiary-creatures-state`). Recommended fix: rewrite
  the scenario around the public-catalog design (sheet always full; keep the
  milestone-push, persistence, rate-limit, and unknown-race probes, plus a
  charm-award leg via a seeded near-complete counter). Owner: bestiary.
- The `yarn parity:check` converter-hash drift recorded here previously
  was reconciled 2026-07-25 (Feature 53): `importTibiaAssets.mjs`,
  `importCanaryCreatures.mjs` and `importCanaryNpcs.mjs` had all drifted from
  their `content/source-manifest.json` entries. `yarn test:tools` passes.

- Equipment can only move skills, magic level, walk speed, and the
  imbuement-driven capacity/health/mana stats (2026-08-03). Three display
  rows are therefore always base-only, and the panel silently shows a zero
  bonus for them: **regeneration** (items carry `healthGain`/`manaGain`/
  `healthTicks`/`manaTicks` in the catalog but nothing reads them — regen
  comes solely from vocation + account tier), **attack speed** (no item or
  imbuement source; `equipmentBonuses.attackSpeedMs` is hardcoded 0), and the
  **XP rate** (no equipment term at all). Recommended fix: feed the regen
  attributes through `setEquipmentModifier` the way item `speed` now is, and
  add an `attackSpeedMs` leg to the same modifier before any item claims it.
  The panel and protocol already carry all three fields, so each is a
  server-side wiring change only. Owner: Feature 18 (stats/progression).

- `yarn db:migrate` must not be pointed at Supabase's transaction-mode pooler
  (port 6543): the session-level advisory lock deadlocks the run and strands
  the lock on a pooled backend, needing `pg_terminate_backend` to clear
  (2026-08-03). `migrate.ts` now rejects that port and prints the session-mode
  (5432) command, but the root `.env` `DATABASE_URL` still uses 6543 because
  the game server wants it, so every migration needs the port swapped by hand.
  Recommended fix: a separate `MIGRATION_DATABASE_URL`, or drop the advisory
  lock in favour of a `migrations` table row lock that works under either mode.

- Wheel revelation actives (all 10: 5 avatars, Executioner's Throw, Divine
  Grenade, Divine Empowerment, Great Death Beam, Spiritual Outburst) shipped
  2026-08-03 with deliberate deviations. (a) **Divine Empowerment** is a flat
  5 s self damage buff (+8 %, +10 % at grade 3) instead of Canary's 3x3
  owned-item zone that buffs only while standing in it; and because the blue
  extra grant collapses stages 2/3 into grade 3, Canary's stage-3 values
  (24 s cooldown, +12 %) are unreachable — stage 3 behaves as stage 2.
  Recommended fix: a Combat-owned buff-zone record checked at damage time,
  plus reading `revelationStages.blue` directly for the cooldown/percent.
  (b) **Spiritual Outburst** has no harmony legs (echo recast at 5 harmony,
  harmony multiplier, spend + cooldown clearing); they land with the harmony
  system. (c) Chain spells draw no per-hop chain visual and Executioner's
  Throw has no weapon-type missile (`CONST_ANI_WEAPONTYPE`). (d) In-avatar
  100 % crit is not mirrored into the Cyclopedia stat display
  (`CyclopediaService` calls `playerSpecials` without `now`). Owner:
  Feature 79-81 (wheel).
- The Sorcerer blue revelation's **Drain Body leech** (2-5 % life/mana leech
  against monsters debuffed by Sap Strength / Expose Weakness) is not
  implemented — the spells apply their debuffs but no leech reads the wheel
  stage (2026-08-03). Owner: Feature 79-81 (wheel).
- Item rarity (shipped 2026-08-05) — deliberate limits and polish left open.
  (a) Affix life/mana leech applies to auto-attacks only, mirroring how
  imbuement leech works here today; if spell leech ever lands for
  imbuements, add the affix leg beside it in `DamageResolver`. (b) Ground
  tiles carry no attribute data (`mapItemStateSchema`), so rarity shows
  only in corpse/container views, inventory, look text, and the market —
  a tint on dropped map items needs a protocol field. (c) World-decay
  transforms (`WorldItemDecayRunner`) mint empty attribute bags —
  deliberate for corpse owner-protection expiry, and no unequipped gear
  decays today, but a future decaying-equipment type would silently lose
  its affixes there (carried decay spreads the bag correctly). (d) Rarity
  items are excluded from supply stash, NPC bulk sales, and generic market
  buy-offer fills by design; the only sale paths are unique market
  listings and player trade. (e) Polish: kill/loot announcements could
  color grades; the bestiary drop-chance palette (green/blue/purple/
  yellow) overlaps the rarity palette with different semantics; cyclopedia
  item summary could group by grade. Owner: rarity system (done.md
  2026-08-05).
- The public wiki page (`/wiki/items`, 2026-08-05) hand-mirrors the rarity
  tuning: `client/lib/wiki/wikiAffixGuide.ts` and `wikiRarityGuide.ts`
  duplicate the bands/counts/multipliers from `config.yml` (defaults in
  `server/src/rarity/affixDefinitions.ts`), and `formatAffixRange` copies
  the `max(1, round(value × multiplier))` rounding from `rollItemAffixes`.
  If the tuning changes, the page silently goes stale. Recommended fix if
  tuning starts moving: serve the live `ServerConfig.rarity` tables through
  a `PublicApi` endpoint (or lift the affix definitions into `protocol/`)
  instead of the client copy. Owner: rarity system.
  a clean tree, 2026-08-05): `PgGuildStore` (3: gold conservation, racing
  withdrawals, war stake), `PgSocialStores` (3: highscore pages/categories/
  staff filter), `PgItemStore` clean-sweep ("leaves a carried item alone",
  duplicate `items_container_slot_key` in test setup). Likely stale rows in
  the persistent test DB or drifted fixtures; diagnose separately.

- 2026-08-05: `gaps/gap-1.md`…`gap-9.md` record verified open gaps from the
  optimization pass: set-viewport resync amplification (charter rule 10),
  drainDue spread crash risk, missing pg pool timeouts, missing
  audit_log/items sweep indexes, 35-RT login, perf-harness blind spots
  (monsterCapacity asserts nothing / 1900-stage spawn flake / single-player
  only), one flaky + four pre-existing red storybook tests.

- 2026-08-06: NPCs and monsters may still *idle onto* "blockpath" tiles
  (tables, counters, stone piles). They are no longer stranded there —
  `SpawnManager.spawnPositionFor` restores them and falls back to the slot
  home (done.md 2026-08-06) — but Canary's `Npc::canWalkTo`
  (`src/creatures/npcs/npc.cpp:1177`) additionally refuses a destination with
  `toTile->hasHeight(1)` unless the NPC sets `ignoreHeight`, and
  `Monster`'s random step goes through `Map::canWalkTo` with
  `FLAG_PATHFINDING`, which refuses `TILESTATE_BLOCKPATH` outright. Ours uses
  plain walkability for both, so a shopkeeper can be found standing on her
  own counter. Recommended fix: gate idle wandering (`NpcBrain`/`MonsterBrain`
  random steps, not chases and not player movement) on `world.isPathable`, and
  carry an item `hasHeight` bit through the map converter if the NPC-only
  height rule is wanted too. Owner: creatures/spawns/AI (Feature 9/10).

- 2026-08-09: The inventory render-isolation pass (client
  `InventoryContainerView`, `replaceEqualDeep` in `useOptimisticInventory`)
  left `EquipmentPaperdoll` un-memoized: it still re-renders on every
  container-view render because its callbacks are recreated inline in
  `GameInventoryOverlays`/`InventoryContainerView`. Harmless at ~10 slots;
  if the profiler ever shows it hot, memoize it and thread stable
  (useCallback + store.getState()) callbacks down from
  `GameInventoryOverlays`. Owner: client inventory UI.

- 2026-08-09 (updated 2026-08-10): the quest e2e sweep findings were fixed
  by the quest-fix pass (`todo/done.md` 2026-08-09) — chests resolve
  positionally, charged rewards carry `charges`, the "impassable" doors
  were seeded-AI wildlife. What remains open: 12 keyless doors (7+808
  sealed-in-Canary, 3002 Canary-broken, 3012/3940/3142/3666 await NPC
  import), chest 6249 behind a storage-gated quest door, and the
  display-only 51-quest catalog — all carried in
  `todo/quest-parity-triage.md`. Owner: quest platform.

- 2026-08-09: `server/scripts/buildQuestChests.ts` (quest_system1/2 map-chest
  import) knowingly defers two data gaps. (1) 22 quest items with aid
  2000/2001 are classified interactive scenery, not mutable, in the converted
  map (cauldrons, gemmed lamps, obelisks, "search" spots — full instance list
  is printed by `yarn workspace server quest-chests:build` and recorded in
  `server/data/quest-chests.json` `skipped` as "map item is not mutable...").
  They include four importable quest_system2 rewards (uids 4010, 9255, 9277,
  50112). Fix: add their type ids to the converter's `MUTABLE_ITEM_IDS`, rerun
  `map:convert`, rerun `quest-chests:build`. (2) The 43 deferred ChestUnique
  entries from `content/items/canary-chests.json` carry no positions, so the
  builder's shadow check (skip aid chests where a uniqueId chest action exists,
  matching Canary's uid-before-aid dispatch) only sees the 344 implemented
  chests; a quest-system chest could theoretically generate at a deferred
  ChestUnique position that Canary would shadow. None observed; revisit if
  those deferred chests are imported. Owner: quest chests (agents/
  quest-chest-key-parity).

- 2026-08-09: key rewards now carry their door ActionId (`chests.json` reward
  `actionId`, stamped by `quest_reward_common`'s isKey/keyAction semantics),
  but keys granted by chests *before* this change have no `actionId` in their
  item attributes and cannot open their doors. If any such keys exist in
  production, backfill them with `UPDATE items SET attributes =
  jsonb_set(attributes, '{actionId}', to_jsonb(<keyNumber>)) WHERE
  item_type_id IN (2967..2973, 21392) AND attributes = '{}'` after mapping
  each key type to its chest's storage number — or tell players to relog and
  re-loot nothing (the chest gate stays claimed). Owner: quest chests
  (agents/quest-chest-key-parity).

- 2026-08-09: six importable quest_system2 entries (uids 9136 Deeper Fibula
  key, 20002, 20003, 65201, 65208, 65210) have config rewards but no aid-2001
  map item was found for their uid in the converted map, so no chest was
  generated. Likely the host items fell into the 22 non-mutable instances or
  the OTBM never stamps those uids on this map edition. Revisit together with
  the MUTABLE_ITEM_IDS reconvert noted above. Owner: quest chests.

- 2026-08-09: quest-touch actions (Cults of Tibia torch) keep their
  world-shared cooldown and pending wall restores in memory only
  (`QuestTouchService`). A server restart forgets both: the removed wall
  simply returns at boot with the map seed (so a restart *closes* the wall
  early, never leaves it open) and the 306 s cooldown re-arms as expired.
  Canary's global storage does not survive our restarts either; accepted.
  Fix if it ever matters: persist the cooldown stamp/restore deadline in the
  quest-storage tables when todo-20 ships. Owner: quest touches
  (agents/quest-touch-actions).

- 2026-08-09: torch bearer item ids 2928-2931 are missing from the item
  catalog. Cause: `tools/buildItemCatalog.mjs` drops any appearance whose
  first sprite id is 0 (`appearance.sprites[0] <= 0` guard) and these four
  hangable wall torches have a reserved zero first-sprite slot (their real
  art sits in later pattern slots — 2930 has sprites [0, 46832]). The
  quest-touch table therefore resolves the torch purely by position and never
  consults the catalog. If those ids ever need catalog entries (look text,
  market), teach the catalog builder to fall back to the first non-zero
  sprite instead of dropping the item. Owner: quest touches.

- 2026-08-09: `QUEST_TOUCH_ACTIONS` ships with exactly one entry (the Cults
  of Tibia torch at (32400,31793,8)). The table, the position-scoped
  converter override (`MUTABLE_POSITIONS` in `tools/getMapItemSemantics.mjs`)
  and the wall-tile passability overlay (`QUEST_TOUCH_WALL_TILES` consulted
  by `DynamicMapItems.refreshTileOverride`) are the reusable seams for
  importing the other Canary quest touch scripts; each import needs its wall
  positions added to `MUTABLE_POSITIONS` plus a `map:convert` rerun. Owner:
  quest touches (agents/quest-touch-actions).

- 2026-08-09: quest-lever state is only half-persistent: lever/door
  transforms write item rows, but created span items (sewer drawbridge
  5770) are memory-first — a restart retracts the bridge while the levers
  stay pulled. The next pull self-repairs (branch ops are idempotent).
  Full fix: persist quest-lever created items like chest loot, or reset
  the levers at boot. Owner: quest levers (agents/quest-parity-rookgaard).

- 2026-08-09: retracting the Rookgaard sewer bridge relocates creatures
  but not loose dropped ITEMS off the span (Canary moves those to the east
  bank too); and any relocation whose destination tile is occupied leaves
  the creature where it stands (Canary push-moves to a nearby tile). Both
  need a world-item move primitive / push-move search. Owner: quest levers.

- 2026-08-09: the extended sewer drawbridge renders as a drawbridge item
  stacked over the water ground instead of Canary's ground transform (our
  grounds are baked client-side). Server walkability/speed are correct via
  the questTilePassability ground-speed overlay; if the visual reads badly
  in the real client, the fix is a ground-transform channel in tile-states.
  Owner: quest levers.

- 2026-08-09: the dynamic door-open override never supplies a ground speed
  (`DynamicMapItems.refreshTileOverride` builds `{walkable, blocksProjectile}`
  only), so `overrideMapData.getGroundSpeed` falls back to the static value.
  A door standing on speedless ground (water/void, like the sewer-bridge
  span) would open, report walkable, and still refuse the step in
  `MovementRules` with `invalid-transition`. No shipped door does this today
  (verified while exonerating the three 2026-08-09 "impassable" doors); add
  a `groundSpeedWhenWalkable`-style guard when one ever does. Owner: doors.

- 2026-08-09: `overrideMapData.isWalkable` ignores its `pathfinding`
  argument whenever a dynamic override exists, so an overridden tile can
  never be avoided via `blocksPath` by the pathfinder. Harmless for door
  tiles (they should be pathable when open); wrong if an override ever
  lands on avoid-tiles (fields). Recommended fix: merge the static
  `blocksPath` bit into the override instead of shadowing it. Owner:
  movement.

- 2026-08-10: `monotonicNow()` (`performance.timeOrigin + performance.now()`)
  lags wall-clock time by the host's cumulative sleep while the process runs
  (CLOCK_MONOTONIC stalls during suspend — routine on the WSL2 dev laptop,
  negligible on Fly VMs). Everything persisted as "epoch ms from the server
  clock" (`ready_at`, `skull_expires_at`, prey `free_reroll_at`,
  `last_seen_at` stamina anchoring) skews when written and read under
  differently-lagged clocks. Cooldown restore now caps remaining at the
  spell's `totalMs` (2026-08-10 fix), but the other timers have no such
  bound. Recommended fix: anchor monotonicNow to `Date.now()` at startup and
  re-anchor when `Date.now()` and the monotonic clock diverge past a
  threshold, keeping in-tick monotonicity. Owner: server time.

- 2026-08-30: Pix payments — remaining accepted gaps after the same-day
  hardening pass (everything else found in review was closed; see
  `todo/done.md` 2026-08-30 entries). (1) `coin-order-open` is deliberately
  outside the 1 s action cooldown: one indexed point-read per message,
  bounded only by the 30 msg/s socket limit; the provider re-check behind it
  is throttled to one per 10 s per account. (2) The webhook signature
  tolerance stays at MP's 24 h; replays inside it are now absorbed by a
  digest cache (10k entries, in-process — a restart forgets them, after
  which a replay can only trigger an idempotent re-fetch, never a credit).
  (3) `PIX_PAYER_EMAIL_FALLBACK` defaults to a placeholder domain when an
  account has no e-mail. (4) A `charged_back`/`in_mediation` dispute is
  treated as a refund (clawback) / logged as unknown respectively; there is
  no MED dispute workflow and no automatic account lock when a clawback
  shortfall is non-zero — operators see it in `pix-refund.shortfall` and act
  by hand (`/pixorders`, moderation commands). (5) The `/pixrefund` operator
  command refunds the whole payment only. Migrations 082 and 083 were applied
  to prod on 2026-08-31 03:28 UTC (ahead of the server build, as required —
  the old build keeps working on the widened schema). Owner: payments.
