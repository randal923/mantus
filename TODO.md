# TODO

The backlog for full parity with the pinned Canary baseline lives under
[`todo/`](todo/README.md). It was restructured 2026-07-24 from a full audit of
the previous per-area files against the codebase:

- [`todo/done.md`](todo/done.md) — everything already shipped, grouped by area.
- [`todo/todo-1.md`](todo/todo-1.md) … [`todo/todo-22.md`](todo/todo-22.md) —
  the 22 remaining areas, each listing its numbered features.
- `todo/implementation-feature-N.md` — one implementation plan per remaining
  feature (107 total): remaining work, file surface, approach, Canary
  references, and required exploit/regression tests.

Start with the [overview](todo/README.md) for the pinned upstream snapshots,
rewrite boundary, cross-cutting rules, and recommended order. Feature 1 (the
Canary parity ledger) is the cross-cutting completion contract; Feature 100
(testing and release gates) is the final pre-launch gate.

Add a newly discovered gap to the narrowest matching todo area; add it here
only when it needs a new area or changes the implementation order. Known
limitations accepted during a session are recorded in the owning feature file
(per `AGENTS.md`).

## Accepted gaps

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
  storage, which charter rule 10 forbids. Owner: Feature 64.
- **Ignore lists are not durable** (2026-07-25, Feature 65). Server-side
  suppression ships (`chat/IgnoreList.ts`, stricter than pinned Tibia's
  client-side list) but is held in memory only, so a restart clears every
  list. The fix is a per-character table loaded at attach. Owner: Feature 65.
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
- **Mounts do not render** (2026-07-25, Feature 71). Ownership, selection
  validation, and the server-side speed bonus ship, and creature state carries
  `mountLookType`, but `CreatureView` still draws only the rider. Drawing the
  mount under it needs a second sprite layer subject to the pattern/layer
  rules in `client/ASSETS.md`. Owner: Feature 71.
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
  (2026-07-25, Feature 55). Canary reads live market statistics; there is no
  market price index to read. The `npc` mode uses real shop sell prices, so the
  toggle is not a no-op. Owner: Feature 55.
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
  pattern) first. Owner: Feature 47 (depot/market transaction hardening).
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

- **Wheel-upgraded (WOD) combat areas are modelled at their base grade only**
  (2026-07-25, Feature 25). Spells that build one combat per Wheel of Destiny
  grade — Energy Beam (`AREA_BEAM5` → `AREA_BEAM7`), Energy Wave
  (`AREA_SQUAREWAVE5` → `AREA_WAVE7`), Great Energy Beam (`AREA_BEAM8` →
  `AREA_BEAM10`), Great Death Beam (`AREA_BEAM6`/`7`/`8` by grade), Mass
  Healing and Sap Strength — import the **first** helper call site, which is
  the un-upgraded combat. The upgraded areas are simply not applied; nothing
  is mis-applied. Fix: extend the catalog entry to carry a per-grade area list
  and pick the grade from `player.wheelBonuses` at cast time, the same way
  `wheelRevelation` is now enforced in `SpellCaster.spellRejectionCode`.
  Owner: Todo 15 (deferred wheel combat perks).

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
- **Ignore lists are memory-only** (2026-07-25, Feature 35). They survive a
  relogin (keyed by character id for the server's lifetime) but not a restart.
  Fix: a table alongside the other social stores; the suppression path itself
  needs no change.
- **Chat flood escalation is memory-only** (2026-07-25, Feature 36). The
  repeat-offender counter behind escalating mutes is keyed by character id for
  the server's lifetime, so it survives relogging but a restart forgives every
  offender. Accepted deliberately over persisting it: the counter now decays on
  a schedule (`chat.escalationDecayMs`), so its worst case is one forgiven
  escalation step, and keeping it out of the database keeps the chat hot path
  free of I/O. Fix if abuse warrants: a `character_chat_escalation` row loaded
  at login next to the durable mute (`ModerationService.attachCharacter`) and
  written behind the tick when a mute is issued. Owner: Feature 36.

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
  `todo/implementation-feature-11.md`. Owner: Feature 11.

## Repo-wide known breakage

- None. The `yarn parity:check` converter-hash drift recorded here previously
  was reconciled 2026-07-25 (Feature 53): `importTibiaAssets.mjs`,
  `importCanaryCreatures.mjs` and `importCanaryNpcs.mjs` had all drifted from
  their `content/source-manifest.json` entries. `yarn test:tools` passes.
