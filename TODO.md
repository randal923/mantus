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
- **The Postgres connection budget is per-process, not shared** (2026-07-26,
  largely resolved 2026-07-29 — see `todo/done.md`). `DATABASE_URL` now uses
  the transaction pooler (port 6543), which multiplexes instead of pinning one
  Postgres connection per pooled client, so `PG_POOL_MAX` no longer has to fit
  inside the pooler's `pool_size` (15) and a second client — a rolling
  deploy's old machine, a migration, a tool run — no longer trips
  `EMAXCONNSESSION`. Still per-process: each server budgets `PG_POOL_MAX`
  independently, so many processes can jointly exhaust the pooler's *server*
  side. A direct connection remains the best option where IPv6 is available.
- **A potion flask is destroyed when the drinker has no room for it**
  (2026-07-31, see `todo/done.md`). Canary's `player:addItem(potion.flask, 1)`
  defaults `canDropOnMap = true`, so a flask that fits nowhere in the
  backpack tree lands on the ground under the drinker. Our `discard` potion
  plan drinks the potion and destroys the flask instead, because dropping it
  would mean creating a world item inside the potion transaction. Recommended
  fix when the world-item write joins that transaction: turn `discard` into a
  ground placement at the drinker's tile.
- **The game server and its database are in different regions**
  (2026-07-29). `server/fly.toml` pins `primary_region = "iad"` while
  `DATABASE_URL` points at `aws-1-us-west-2`, i.e. ~60 ms per round trip on
  every query. Login is now serialized onto one connection (Feature 106), so
  its ~28 round trips are paid sequentially and this latency sets login time
  directly. Recommended fix: move the Supabase project to `us-east-1` (or the
  Fly app to a west-coast region) before collapsing login into a single
  statement, since co-location is worth more than the query-count work.
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

- **Auto-loot migration `066_character_loot_filter.sql` is unapplied** (added
  2026-07-30). `characters.loot_filter` is read by `toCharacter` and written
  by `PgCharacterStore.updateLootFilter`, but the migration has never run:
  this environment has no Docker and no reachable Postgres. The SQL mirrors
  `039_character_aim_at_target.sql` in shape and is reviewed but unexecuted,
  so every loot-filter save will fail against a database that has not been
  migrated (the handler rolls the session back and reports
  `loot-filter-update-failed`, so it degrades rather than corrupts).
  Recommended fix: run `yarn db:migrate` before this reaches any live server.
  Owner: the auto-loot work recorded in `todo/done.md` (2026-07-30).
- **Auto-loot needs the killer within one tile of the corpse** (accepted
  2026-07-30). `ItemIntentHandler.autoLoot` reuses `isNear`, the same reach
  rule a hand-made loot move obeys, so a ranged or run-away kill auto-loots
  nothing. This is deliberate — the alternative is a reach exemption that
  only auto-loot enjoys — but Canary's quick-loot is more forgiving, so
  revisit if playtest finds it annoying. Recommended fix if changed: widen
  the check inside `autoLoot` only, never in `planLoot`. Owner: same.
- **Auto-loot has no per-category container routing** (accepted 2026-07-30).
  Everything not blacklisted goes through `planBackpackPlacement`, which fills
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


## Repo-wide known breakage

- None. The `yarn parity:check` converter-hash drift recorded here previously
  was reconciled 2026-07-25 (Feature 53): `importTibiaAssets.mjs`,
  `importCanaryCreatures.mjs` and `importCanaryNpcs.mjs` had all drifted from
  their `content/source-manifest.json` entries. `yarn test:tools` passes.
