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

- **The Postgres connection budget is per-process, not shared** (2026-07-26).
  The pg pool default dropped 20 → 10 because the Supabase session pooler
  (`pooler.supabase.com:5432`) refuses clients beyond its `pool_size` (15),
  which was failing login-burst loads/persists with `EMAXCONNSESSION`. Each
  server process budgets independently, so a dev server plus a playtest
  server or long-running tools can still jointly exceed the cap. Durable fix
  per `server/.env.example`: a direct connection where available; the
  transaction pooler (port 6543) is also compatible today — the only advisory
  lock is `pg_advisory_xact_lock` and nothing uses LISTEN/NOTIFY or named
  prepared statements.
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
- **Podium display rendering** (2026-07-26, Feature 86 → 87): the tile
  overlay bakes a static south-facing outfit frame — stored direction,
  mounts, lookTypeEx monsters, and the platform-hide flag are not
  rendered yet; map-side right-click rotation is not wired (the edit
  window's direction buttons cover rotation).
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
- **Mantus Store item offers have no load-time catalog gate** (2026-07-25,
  Feature 43). Nothing asserts that every offer's `itemTypeId` exists in the
  pinned catalog and is pickupable. `PgMantusStore` validates at purchase time
  (`catalog.require` throws, `pickupable` is checked), so a bad id fails loudly
  on first purchase rather than silently — but `loadShopCatalogs`-style
  validation at boot would be better. Owner: Feature 43.
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
- **Blessings are always zero** (2026-07-25, Features 32/72). The full Canary
  death loss formula reads a blessing count through `Player.blessings`, which
  is a seam that still returns 0. The pinned blessing catalog, both cost curves
  and the equipment-loss table now exist as typed data
  (`server/src/progression/blessings.ts`, Feature 72), but nothing persists or
  grants a blessing yet, so the penalty is still only reduced by promotion and
  the unfair-fight reduction and no items drop into a player corpse. Next
  slice: the `characters.blessings` bitmask column + `CharacterStore`
  load/save, then the purchase path (economy-relevant — its own PR).
  Owner: Feature 72.
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

## Repo-wide known breakage

- None. The `yarn parity:check` converter-hash drift recorded here previously
  was reconciled 2026-07-25 (Feature 53): `importTibiaAssets.mjs`,
  `importCanaryCreatures.mjs` and `importCanaryNpcs.mjs` had all drifted from
  their `content/source-manifest.json` entries. `yarn test:tools` passes.
