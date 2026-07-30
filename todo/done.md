# Completed work

Everything already shipped toward pinned Canary parity. Two layers of record:

1. The per-area sections below (old `todo 00`–`21` numbering), recorded from
   the 2026-07-24 backlog audit.
2. The [feature-numbered completion wave](#2026-07-2425-completion-wave-feature-numbered-backlog)
   at the end, recorded from the 2026-07-25 restructure — every feature of the
   numbered backlog that has fully closed since.

This file is **the** permanent record of completed work (the former
`todo/completed/` per-feature logs were folded in here and removed
2026-07-25). Remaining work lives in [`todo-1.md` … `todo-13.md`](README.md).

---

## Foundations and migrations (old todo 00)
- Source provenance pinned in `content/source-manifest.json` (exact map, DAT/SPR, Canary commit, OTClient commit, converter version, hashes); conversion fails on asset/map/content era mismatch.
- No downloaded Lua is ever executed during imports; only a whitelisted literal subset is parsed offline (callbacks/function calls/unknown constants rejected); procedural monster/NPC scripts require a TypeScript reimplementation.
- Migration system replaced `server/db/schema.sql` entirely: numbered migrations in `server/db/migrations/` (36 migrations, `001_accounts.sql` through `036_restrict_combat_item_consumption.sql`) plus a `schema_migrations(version, applied_at)` table.
- `server/scripts/migrate.ts` takes a Postgres advisory lock, applies each migration once in one transaction, fails on changed checksum.
- `yarn db:migrate` is the only schema-changing command (root/server package.json); Yarn used throughout.
- CI covers migrate-from-empty and migrate-from-current-schema in `.github/workflows/migrations.yml`; nothing runs migrations from the game tick.
- Completion gates passed: reproducible provenance manifest; machine-readable parity inventory (`content/canary-parity-inventory.json`, `tools/buildCanaryParityInventory.mjs`, `tools/verifyCanaryParityInventory.mjs`) that fails CI on missing/ignored/ownerless entries; migrations serialized, transactional, checksummed, CI-covered.

## Canary parity ledger (old todo 00a)
- 1 of 12 required workstreams checked: machine-readable source inventory covering Canary XML, Lua registrations, map/spawn content, item definitions, protocol-facing systems, and persistent player/world systems, with CI detection of disappearing/ownerless entries.
- World creature import enables all 83,286 monster and 1,008 NPC placements.
- Static item numbers and appearance semantics are imported.

## Characters and saved world entry (old todo 01)
- `characters` migration (`003_characters.sql`): immutable id, account FK, display/normalized name, vocation, level/exp, hp/mana, capacity, x/y/z, direction, outfit fields, town/temple id, timestamps, `last_login_at`, optimistic version.
- Globally unique normalized names + bounded characters-per-account enforced in DB transaction and service.
- Explicit `Character`, `CharacterSummary`, `CreateCharacterInput`, `CharacterSaveSnapshot` types; persistence model separate from public creature projection.
- Outfits stored as palette indexes + allowed look type, not client RGB or client-claimed unlocks.
- Expanding state in later normalized migrations (`007_progression.sql`, `014_character_storages.sql`, …), not a JSON blob.
- Character-list / create-character / select-character flows; each message zod-defined in `protocol/src/character.ts` with max byte size and rate expectations; rename/delete deferred.
- `account_id` always derived from the authenticated session.
- Server-side name validation: normalized uniqueness, length, allowed characters/spacing, reserved names, impersonation policy.
- Server chooses starter vocation options, stats, outfit ownership, town, spawn; client only selects from advertised options.
- Ownership re-checked at selection; atomic one-live-session-per-character claim kicks the older session.
- Saved position validated against current map at login with temple fallback, optimistic versioning; `last_login_at` set only after successful world entry.
- Only selected character's private stats sent; lists are summaries. `placeholderCharacter.ts` removed; HUD renders the real projection.
- `CharacterStore` interface + `PgCharacterStore` with parameterized queries (`server/src/character/`).
- Full aggregate loaded once at world entry; locked against concurrent online loads; synchronous in-tick mutation; queued immutable versioned save snapshots; dirty-interval/logout/shutdown saves with capped retry + unsaved-players metric; stale saves cannot overwrite newer versions; item/economy ownership excluded from snapshot path.
- Client: character-select screen with loading/empty/failure/reconnect/selected states (`client/components/characters/`); free/premium status; server-driven create form; portraits colorized from saved palette indexes.
- Tests: pg-backed name-race, slot-limit race, cross-account list/select denial, forged position/stats/outfit/vocation rejected, two connections → one live session, stale-save rollback, invalid-position temple recovery, reconnect without leaking other characters.

## Map semantics and multi-floor movement (old todo 02)
- Converter exports all floors 0-15 for server navigation and client regions; decodes unique/action ids, text, subtype/count, charges, depot/door data, teleports, tile flags; merges OTBM ids with `items.xml` semantics (blocking, projectile/path blocking, ground speed, elevation, stack order, floor-change direction, movable/pickupable, container, door, field, hangable).
- Explicit floor-transition metadata exported (stairs, ladders, ramps, holes, rope spots, teleports with source/destination rules); floor-change items with absent Canary-compatible targets classified and kept disabled as unresolved metadata.
- External spawn-file/town references preserved; immutable decoration classified separately from server-owned mutable world items; generated format versioned with source hashes; staging-directory build with atomic replace; conversion fails on unknown attributes, out-of-range positions, era mismatches, duplicate transitions, invalid destinations.
- Server: one typed `Position` + z-aware key utility; z-aware `getTile`/`isWalkable`/`getGroundSpeed`/`blocksProjectile`/`getTransition`; occupancy/spatial buckets keyed x/y/z (`server/src/MapData.ts`, `MapTransition.ts`, `MapAction.ts`, `SpatialGrid.ts`, `World.ts`, `MovementHandler.ts`, `server/src/world/MovementRules.ts`).
- Movement packets are direction/intents only; tick-time re-check of adjacency, ownership, walkability, occupancy, speed delay, conditions, transition rules; cardinal stairs/ramps with Tibia-compatible offsets incl. step-up/auto step-down; ladder/hole/rope/shovel/teleport as server-side world actions; Canary-compatible diagonal movement + bounded auto-walk with per-step revalidation and correct diagonal duration; walk duration from server speed x ground speed x diagonal factor x conditions; bounded corrections carry authoritative position/revision.
- Visibility: floor-aware viewport tests (above-ground vs underground rules, cover reduction); reconciliation after every transition; one visibility policy filters dynamic tiles/items/creatures; region-delivery publicity documented.
- Tests: converter fixtures (ground, borders, blocking, speed, subtype/action, every floor-change kind, invalid data); stair/ramp offsets in every direction; forged destination / non-adjacent / illegal z rejected; early speed replay and blocked transition destination rejected at execution; simultaneous moves serialize to one winner; equal x/y across floors no collide/leak; reconnect after floor change; deterministic outputs per manifest.

## Rendering, animation, floors, and occlusion (old todo 03)
- Atlas/appearance layer exposes every animation phase and timing mode (~4,887 animated item types; water ids 622, 629, 4597); pure `getItemAnimationPhase(appearance, elapsedMs, instanceSeed)` supporting the legacy async 500ms cycle, API ready for enhanced animator metadata; stable per-instance seed for async items, shared clock for synchronized; render clock in Pixi's ticker swaps textures on existing sprites; registry registers/deregisters animated items as regions stream, stops ticker work for invisible regions; exact animator phase durations/start phase/loop type/patterns/light decoded from matching DAT; animation kept visual-only.
- Floor-aware rendering: visible floors per OTClient rules; all visible regions/floors drawn top-down with correct x/y projection shift; dynamic entities drawn only on their own floor within authorized view; stair/teleport floor+camera change as one coherent update with interpolation rebase; bounded region cache/unload.
- Draw order: OTBM stack positions + DAT flags → explicit layers (ground, borders, bottom, common, creatures, effects, top); Tibia reverse ordering for common stackables; creatures between common and always-on-top (roofs/arches occlude); cumulative item elevation applied to feet/outfits/health bars/names with cap; multi-tile/oversized sprites, displacement/anchors, NW-neighbor spill handled; nameplates/health bars anchored to final elevated position with deterministic overlap layering.
- File surface: `client/lib/render/getItemAnimationPhase.ts`, `AnimatedMapItemRegistry.ts`, `getVisibleFloors.ts`, `getTileRenderLayers.ts`, `AssetStore.ts`; pinned DAT is legacy (`enhancedAnim: false`) with 500ms timing at load time.
- All required tests passed: phase-boundary units, registry cleanup on region unload, stack-order snapshot fixtures, creature/nameplate elevation on stacked parcels, arch/canopy occlusion, visible floors before/during/after stairs, dense-water profiling bounded by visible animated items.
- 2026-07-20 audit fixes: liquid grounds no longer stripped (trashholder→mutable misclassification), multi-tile pieces sorted at anchor, `limitsFloorView` uses OTClient first-stack-thing rule, underground cover calculation added, surface viewers can see down to ground floor.

## Creatures, world spawns, respawns, and AI (old todo 04)
- OTBM external spawn import: monster positions from `otservbr-monster.xml`, NPCs from `otservbr-npc.xml`, with center/radius/offset resolution, spawn time, and direction preserved.
- Import normalization with hard failure on unmatched placements; the report covers aliases, duplicates, out-of-map positions, blocked tiles, and unsupported definitions.
- Typed project-native `MonsterType` format (outfit, health, speed, flags, target strategy, attacks/defenses, elements, immunities, summons, voices, loot refs, experience, corpse id); no Canary Lua execution — a whitelisted literal subset is parsed offline and procedural callbacks are reimplemented as reviewed TypeScript.
- Curated starter-region slice first, then all 84,294 world placements enabled after memory/spawn/AI/pathfinding/tick benchmarks passed.
- Server-only `Creature` base shared by `Player`/`Monster`/`Npc`: generalized occupancy, spatial queries, visibility deltas, protocol ids; exact stats stay server-only (viewers get health percentage); non-colliding id namespace.
- `SpawnManager` owned by the game tick (no timer-callback mutation); stable spawn-slot ids separate from live instances; execution-time re-check of tile/walkability/occupancy/region activation; documented restart semantics; region activation never heals/duplicates/rerolls; spawns emitted as ordinary visibility deltas.
- Minimal AI: bounded tick schedules with a per-tick work budget; idle/walk-home/random-walk/acquire/chase/lose-target/return-home states; server-side z-aware A* with caching, leash/floor bounds, occupied-destination recovery; server-owned, deterministic-under-seed target selection and RNG.
- Client: generic `CreatureView` by kind/outfit/direction with movement animation; names/health % without stat leaks; battle list built from visible projections with stable ids.
- All required tests pass: spawn offset/centerz resolution, no duplicate live creatures per slot, single respawn per death, safe blocked-tile retry, AI blocker/floor/budget limits, hidden creatures absent from packets, full-world load/tick/pathfinding benchmarks with explicit budgets.
- 911-monster audit vs pinned Canary applied shared corrections: `runHealth` as absolute HP threshold, invisibility-immunity sees invisible targets, speed-zero monsters never move when fleeing/dancing, 407 untargeted beam/cone abilities face the current target; all 1,561 voice lines from 585 speakers and all 77 static summon rows from 69 summoners with Canary global/per-type limits.
- Shared movement/spawn flags `isBlockable`, `canWalkOnPoison`, `canWalkOnFire`, `canWalkOnEnergy` with authoritative field ownership, duration, pathfinding, step validation, and damage.

## Items, inventory, equipment, and map use (old todo 05)
- Typed `ItemType` catalog from DAT metadata + static `items.xml` rules; mutable OTBM ids absent from the catalog rejected; full property set (stackability, weight, currency worth, slots, weapon/armor stats, container capacity, flags, decay/transform, field/door/bed/depot, light, elevation, render flags); pinned versions and source hashes; full catalog server-side, display data only to the client.
- `items` table with immutable instance id, type, subtype/count, attributes, version, and exactly one location/owner; location as a constrained union (equipment slot, container slot, tile, depot, inbox, house, trade reservation, market escrow, corpse); DB constraints on counts, unique slots, legal owner/location combos, parent ids; ancestry-cycle prevention plus nesting/slot/content caps; UUID ids with audit_log entries in the same transaction; durability handled in the operation's transaction.
- Bounded zod intents for move/use/use-with/open/close/equip/unequip/split/rotate plus generic container-to-container movement; server-issued ids and revisions; acting character taken from the session; execution-time re-checks (existence/version, ownership, visibility, reach/LOS, slot, count, capacity/weight, destination, cooldown, target compatibility); no await between checked and changed; same-item/container/player operations serialized.
- Map items: immutable decoration split from mutable items at conversion; atomic first-mutation materialization with a stable seed origin; authoritative `TileState` with revisioned visible diffs; pickup/drop, stack merge/split, containers, equipment, capacity/weight, rotate, readables, use/use-with; client controls (double-click use, Shift-double-click pickup, right-click menus, drag to tiles); nested container windows with ancestry; pinned food/regeneration consume path.
- Inventory/equipment UI is a projection of committed server state (`I` hotkey).
- Exploit tests: concurrent moves leave one item; two-player pickup has one durable winner; replay/stale revisions cannot dupe/destroy/rollback; invalid counts/indexes/ids/capacity/cycles/nesting rejected; disconnect/persistence-failure resolves to one owner; lazy materialization idempotent under concurrency; economy audit entries commit atomically.
- Memory-first item ops: carried + ground ops planned in `server/src/item/plan/`, applied in the tick, flushed as guarded single-transaction writes (`PgItemPersistOps`); world items memory-resident (`DynamicMapItems.worldItems`); one global FIFO persist lane (`ItemIntentHandler.persistChain`).
- Client-side item-op prechecks (`client/lib/inventory/validateItemOp.ts`, `exceedsCapacity.ts`, `client/lib/shop/precheckShopPurchase.ts`/`precheckShopSale.ts`) mirroring exact server capacity math.
- Optimistic drag queue: move/equip/unequip/drop/pickup/move-map-item through `useOptimisticInventory`; optimistic tile previews via `MapView.tileOverrides`.

## Vocations, stats, and progression (old todo 06)
- Typed `Vocation` data (base/promoted, health/mana/cap gains, regen, attack-speed/formula coefficients, skill/magic rates, starter options, display data); explicit `Skill` union with progression curves; no runtime Lua/XML; definitions versioned with the content manifest.
- Persistent experience/level/magic-level/mana-spent plus normalized `character_skills(character_id, skill, level, tries)` with constraints; derived totals pure and recomputable.
- Authoritative runtime: XP/skill/magic awarded only from validated server events, capped, idempotent; level-ups computed server-side with immutable versioned snapshots after synchronous tick mutation; regen/training on bounded tick schedules (max five overdue intervals per tick, online-only; reconnect cannot manufacture offline ticks); exact progression sent only to the owning session.
- All required tests: deterministic curve boundaries and multi-level gains, no double awards from duplicate events, invalid/negative/overflow rejected, derived stats match inputs, stale save cannot erase newer gains.
- Every pinned vocation and promotion including Monk/Exalted Monk with exact gains, curves, regen, attack speed, formulas, requirements, projections.
- NPC promotion purchase: all five Canary rulers promote at level 20 for 20,000 gold, atomically spending carried then bank money, persisting vocation plus 100 minor charm echoes, updating live regen/spell availability.
- UI: collapsible character-details pane in the inventory (edge arrow, top-nav Character button, or `C` hotkey).

## Combat, spells, and conditions (old todo 07)
Status note: the previously flagged uncommitted combat work was committed as `2e25fa9 add magic rope` (on top of `4b332a1 spell in chat`), which also updated the old todo file itself. The recent commits did not fully close any open checkbox; they advanced the floor-moving support spells (exani tera magic rope and exani hur levitate now executable as `worldAction` spells) and added spell-words-via-chat with its own recorded known-gaps list (now Feature 28).
- Bounded attack-target/cancel-attack and fight-mode/cast/use-rune intents defined before handlers; no client damage, coordinates, hit chance, mana result, rolls, or cooldown completion accepted.
- Target selection enqueued into the tick with execution-time re-checks (session character, target existence, attackability, visibility, floor); attack/cast execution re-checks range, LOS, weapon/ammo/rune ownership, mana/soul, cooldown/exhaust, conditions, PZ, PVP rules.
- Server-side seeded formulas and RNG; the complete synchronous in-memory outcome applied once, then persisted; outcomes sent only to observers who can see them, exact stats only to the owner.
- Combat model: typed damage/healing types, origin, area shape, target rules, block/result, effect/missile ids; melee, distance/ammo, wand/rod, mitigation, armor/shielding, elemental resistances/immunities, crits, and healing all incrementally tested.
- Typed spell/rune data (vocation/level/magic reqs, cost, cooldown groups, range/LOS, target/area, formula, effect, conditions); procedural behavior as reviewed TypeScript.
- Conditions: haste/paralyze, poison/fire/energy DoT, regeneration, invisibility, light, outfit, drunk, mute, combat/PZ lock with server-clock expirations; explicit application/refresh/stack rules, persisted only where logout/restart requires.
- Health/mana/spirit potions: bounded player-target intent, self or adjacent visible players, Canary level/vocation gates, server-rolled restoration, potion consumed and empty flask returned in one audited transaction, separate 1 s exhaust; client right-click targeting plus a nine-slot Shift+1-9 potion bar with OTClient modes (self, attack target, cursor, crosshair).
- Monster combat AI: target selection, attack scheduling, distance keeping/fleeing, retargeting, spell chance, summon limits, return-home; every AI action revalidated like a player intent; per-tick budgets.
- Client: right-click attack target and fight mode as intent + server state; server-sent damage/heal text, magic effects, missiles, condition icons, cooldown decoration, health changes; target cleared when the server forgets the creature; predicted cooldowns reconcile after rejection/resync.
- All exploit tests: forged/hidden/wrong-floor/unattackable ids never change the target; forged parameters never affect outcomes; replay/rapid intents cannot bypass attack speed or exhaust; two lethal hits/DoT/disconnect races resolve death once; LOS/PZ/PVP enforced at execution; no out-of-view leaks; seeded determinism.
- Monster-spell parity: all 171 distinct registered monster-spell names (285 references across 911 reachable types) resolved to reviewed typed behavior — chains, custom matrices, delayed waves, field creation, dispels, fear/root, skill reducers, special target rules, magic-wall destruction, scripted summons/heals; zero unresolved `registeredSpell` entries.
- Condition-backed player spells (haste, strong haste, paralyze, magic shield) with Canary speed formulas, magic-shield capacity/depletion, refresh rules, dispels.
- Monster-created energy/fire/poison fields with server-owned duration, damage ticks, source attribution, per-monster walking rules; destroy-magic-walls removes pinned magic-wall ids via the authoritative item path.
- Every procedural summon, chain, named-monster heal/damage rule, reducer, and vocation-specific callback in the reachable monster catalog implemented as reviewed server TypeScript.
- Ground-targeting cursor for position runes.
- Monk/Exalted Monk added after protocol/progression/creation/UI support existed.
- Customizable action bars: per-character spell bar (`update-action-bar` → `characters.action_bar`) and potion bar (`characters.potion_action_bar` with target mode).
- Spell words via chat (`4b332a1` + `2e25fa9`): `ChatHandler` → `Combat.castSpellByWords`, exact match after case/whitespace normalization, full validation in the cast pipeline; parameter parsing (longest words prefix + remainder, optional quotes); exani tera (magic rope) and exani hur up/down (levitate) executable as `worldAction` spells resolved by movement rules with Canary levitate.lua semantics, resources spent only when the move succeeds.

## Monster death and loot (old todo 08a)
- Stable life/death transition: `Creature.claimDeath()` guards alive→dead exactly once even with multiple lethal events in one tick; each death mints a unique `death:{uuid}` event id.
- Ordered death handler (`Combat.handleDeath` in `server/src/combat/Combat.ts` + `DeathHandler.ts`): stops AI/combat, removes occupancy, notifies only visible observers, schedules the spawn slot, creates the correct corpse. (Planned `server/src/death/` extraction deferred.)
- Loot rolled once server-side; corpse/container items created atomically with `item-created` audits (`ItemStore.createCorpse`, single transaction; `server/src/item/CorpseCreator.ts`).
- Pinned v1 kill attribution: direct source player else top damager; killer gets 100% experience; corpse stamped `attributes.ownerCharacterId`; ownership expires on first decay transform. Party rights / boss contribution deferred until parties exist.
- Restart safety: loot roll and corpse commit happen once per in-memory death; monsters are not persisted; no replayable path into `handleDeath`.
- Corpse contents exposed: `use-map` opens a per-session view (`server/src/item/WorldContainerViews.ts`), reach-checked and re-validated every tick; contents sent as `world-container-state` with viewers reconciled on mutation. `loot-item` moves a direct child to carried inventory (`planLoot`): memory-first atomic mutation, expected-version guard, `ownerCharacterId` re-checked at execution, transfer/merge audits in the same persist transaction. Client renders the corpse as a loot section in the inventory panel.
- Memory-first corpse redesign (2026-07-19): no DB rows until first touch (`appendUnpersistedLootInserts`), in-memory decay via `WorldItemDecayRunner.decayInMemory`; untouched corpses vanish on restart by design (matches Canary).
- Exploit tests: concurrent lethal hits → one death/corpse/roll/XP (`Combat.test.ts`); restart cannot reroll or duplicate committed loot (`ItemIntentHandler.decay.test.ts`); two players racing for protected loot → exactly one item, with stale-revision/out-of-reach/non-owner rejected (`server/src/item/ItemIntentHandler.loot.test.ts`); corpse packets visibility/permission-filtered.
- 2026-07-19 fix: `withSerializableTransaction` retries SQLSTATE 40001 — 5 attempts with growing backoff on `isTransientDatabaseError` (`server/src/item/withSerializableTransaction.ts` + tests).

## Player death (old todo 08b)
- Pinned v1 death penalty (`server/src/progression/getDeathExperienceLoss.ts`): lose 10% of total experience, floored; level/max-health/max-mana/capacity re-derived; full heal and mana restore, temple teleport, 2s invulnerability.
- Penalty and respawn state applied atomically before acknowledging respawn/login: one character snapshot (`progression.syncPlayer` immediate save) carrying the applied-penalty event id.
- Replay-proof: deaths are server-computed (no death packet); `Creature.claimDeath()` dedupes; the persisted `death:{uuid}` event id blocks replay across reconnects.
- Tests: penalties neither skipped nor doubled on reconnect (`server/src/progression/CharacterProgression.test.ts`); concurrent lethal events apply the penalty exactly once (`Combat.test.ts`).

## Decay (old todo 08c)
- Bounded tick-owned `DecayManager` (`server/src/item/DecayManager.ts`): timers are bookkeeping only; `ItemIntentHandler.tickDecay` collects a bounded batch per tick and applies it via the outcome queue.
- Documented restart semantics: deadlines in-memory only; on boot every persisted world item with decay metadata is re-armed with its full duration — transforms run late, never early, never twice.
- Stale-decay safety: identity/version/location re-checked at execution both in-memory and in the version-checked store transaction. `ItemStore.decayWorldItem` (`PgItemStore` transactional, audited `item-transformed`/`item-destroyed` with reason `decay`; first transform clears `ownerCharacterId`; `PgDecayOps.ts`).
- World (ground) item decay fully imported: transform chains, capacity-shrinking stages that destroy overflow contents, audited removal.
- Tests: a stale decay task cannot remove a moved/transformed/new instance; restart reschedules and transforms exactly once.

## Chat and channels (old todo 09)
- Bounded zod intents for say/whisper/yell/private message in `protocol/src/chat.ts`; channel-message intents deliberately deferred until guild/party/help channels exist; channel ids/recipients are references, never authority.
- Speaker identity derived from the session; schemas `.strict()` with no forgeable sender field.
- Server-enforced limits: 255-char messages, no control characters, flood limits (4-message burst, one slot per 1.5s, 5·n² s escalating mutes via `ChatRateLimiter`), mute checked at execution time.
- Floor-aware, mode-specific routing: say/whisper reach normal view range (whisper muffles to "pspsps" beyond one tile); yell covers 18x14, uppercased, 30s exhaust, level-2 minimum; local chat never broadcast world-wide.
- Private messages resolve online recipients by name; the sender learns only online/offline; offline probes consume flood budget.
- Text rendered inert everywhere: React text nodes in the panel, canvas text in world (regression story `PlayerTextIsInert`). Chat bodies never logged.
- Client: accessible tabbed chat panel (`client/components/chat/ChatPanel.tsx`) with bounded local history; `SpeechTextRenderer` draws only server-delivered speakers, keyed per speaker, expiring by length, removed on creature-left/destroy; system (read-only gold channel), private (violet tabs), own lines, localized `chat-rejected` notices.
- Tests: forged sender rejected (`ChatIntentSchemas.test.ts`); wrong-floor/out-of-range never delivered (`ChatHandler.test.ts`); flood/oversize/control-character/mute limits enforced; private content not delivered to bystanders; HTML/script-like text inert (`ChatPanel.stories.tsx`).

## NPC content import (old todo 10a)
- All 1,008 external-XML NPC placements imported (center/radius, offsets, `centerz`, direction, matched type id); 956 NPC types resolved without executing Lua. Ambiguous script variants explicitly disabled in `content/spawns/world-import-report.json`.
- `tools/importCanaryNpcs.mjs` statically parses the 956 world-selected definitions; generates conversational baselines for all 949 interactive types (6,745 literal keyword/shop/bank nodes); classifies the 7 non-interactive types; reviewed graphs in `content/npcs/canary-dialogues.json` override the baseline.
- Import report `content/npcs/canary-npc-import-report.json` records every selected source, all shop rows/callbacks, all 80 unselected global NPC sources, and every procedural dialogue gap; source commit, definition count, and aggregate hash pinned in the manifest.
- Loader rejects mismatched commits, duplicate node/offer ids, duplicate child/choice references, missing references, unknown NPC types, unsupported actions, out-of-range content. A world-map fixture proves all ten reviewed travel destinations resolve to walkable tiles.

## NPC dialogue and travel (old todo 10b)
- NPCs modeled as creatures: occupancy, movement, visibility, rendering share the z-aware paths (`server/src/creature/Npc.ts`).
- Per-NPC/per-character conversation state with server-clock timeout, range/floor checks, cleanup on logout/death/removal; opaque server-issued conversation ids, explicit offered choices, private delivery; NPC wandering pauses during conversation.
- Hello/goodbye/local NPC speech routed through visibility-aware chat; private dialogue state goes only to that player.
- Travel as intent outcome: eligibility/cost validated, payment reserved and committed atomically, server-known destination; destination walkability validated with safe fallback; full visibility/tile-state reconciliation after travel.
- Vertical slice (2026-07-17): 16 coastal boat NPCs, 90 unconditional pinned routes; haunted/storm routes pick a diversion with server RNG; confirmation sends only an opaque choice; fare + character position/version + item-destruction audits + travel audit in one serializable transaction before the tick teleports; exact fares skip backpack/change allocation; a bounded server-owned prefetch hint warms client caches.
- Quentin: greeting, healing fallback, pilgrimage, blessing information (informational only).
- All 949 interactive world NPC types have a safe generated greeting, farewell, walk-away, literal keyword-tree baseline, and typed shop/bank links where declared.
- Tests: dialogue state cannot be stolen/replayed/continued after range/floor/logout timeout; forged node/action ids, quest state, prices, destinations rejected; concurrent travel/payment cannot double-charge or travel unpaid (`TravelService.test.ts`, `NpcHandler.test.ts`, `NpcIntentSchemas.test.ts`); NPC private state/offers delivered only to the relevant player.

## Economy overview and Mantus Store (old todo 11)
- First Mantus Store slice (2026-07-23): account-scoped Mantus Coins, server-owned Premium Time catalog, atomic coin debit + entitlement renewal, coin ledger + economy audit records, online-session propagation, and the Mantus Store client. Surface: `server/src/store/MantusStoreService.ts`, `PgMantusStore.ts`, `PgMantusStore.integration.test.ts`, `MANTUS_STORE_CATEGORIES.ts`.

## Currency and bank (old todo 11a)
- Canonical carried-money/bank model: `server/src/economy/CurrencyBalance.ts` provides the single gold/platinum/crystal conversion; `planMoneySpend`/`planMoneyGrant` are the only conversion paths.
- Bank balances with nonnegative checks: `bank_accounts` + `bank_ledger` (`012_bank.sql`); `server/src/economy/PgBankStore.ts` commits ledger + audit in one SERIALIZABLE transaction.
- Exact integer units, overflow-bounded: `BANK_LIMITS` caps single operations at 1e12 and balances at 1e15; all inputs integer-validated.
- All four exploit tests pass (`PgBankStore.integration.test.ts`, gated on `TEST_DATABASE_URL`): racing spends can't go negative; failed ops change nothing; every balance change has a same-transaction audit/ledger entry; carried↔balance conversion conserves currency under concurrency.

## NPC shops (old todo 11b)
- All four main checkboxes: typed server catalogs (type, buy/sell price, subtype, amount bounds, availability/quest rules, optional stock); execution-time re-check of catalog/range/floor/money/capacity/space/ownership/amount; purchase/sale item + money legs + audit in one transaction before success; full pinned catalog import.
- Import completeness (2026-07-17): 956 NPC types, all 286 shop declarations accounted for — 284 non-empty catalogs, 8,368 executable offers (6,176 buy, 3,368 sell, 530 subtype, 125 storage-gated); Larry/Squeekquek empty catalogs classified; every buy/sell callback mapped; Cledwyn silver-token and Yana gold-token item-currency catalogs atomic; Simon the Beggar's free shovel preserved and audited; 3 stale Black Bert rows recorded.
- Shop access via NPC dialogue action bound to an opaque expiring server session; serializable transactions couple money, items, finite stock, bank ledger, and audit; accessible localized client shop panel with catalogs split into ordered messages under the payload limit.
- All three exploit-test boxes: forgery rejection, concurrent balance/stock races, same-transaction audit. Surface: `server/src/economy/ShopService.ts`, `PgShopStore.ts`, `loadShopCatalogs.ts`, `PgShopStore.integration.test.ts`.

## Depot and inbox (old todo 11c)
- All four main checkboxes: account/character depot ownership with bounded containers keyed by server-known town/depot ids; open authorization at a visible/reachable depot with per-move session/revision/slot/capacity/owner validation; inbox/mail delivery ownership, limits, expiry/return rules, and offline transactional behavior without loading an offline live aggregate; pinned depot search/retrieval, inbox, mailbox, supply stash, reward delivery, and town/depot behavior via bounded authorized projections.
- All three exploit tests: unreachable/wrong-town depot rejected at execution; concurrent moves leave one item per slot; offline inbox delivery transactional and retry-safe. Surface: `server/src/depot/` (DepotService, DepotCacheManager, DepotMailOps, DepotExpiryOps, DepotRewardOps, PgDepotStore + integration test, stash plans).
- Architecture: memory-authoritative for online characters — loaded at login, mutated synchronously in the tick, persisted behind via a per-character FIFO of guarded single-transaction writes.

## Player trade (old todo 11d)
- All four main checkboxes (2026-07-18): explicit state machine in `server/src/trade/TradeSession.ts` with all cancel paths through `TradeService.cancelTrade` restoring both offers; reservation via synchronous move of the root item to a `trade-reservation` location (subtree leaves reachable inventory; commit re-verifies both roots' location + version against DB); one SERIALIZABLE commit in `PgTradeStore.commitTrade` (character locks in id order, root locks + re-verification, per-receiver capacity/room re-check from fresh rows, both moves, both `item-transferred` audits with `trade` detail); pinned inspection/display/distance/capacity/cancel behavior (2-tile same-floor + LOS, 100-item cap, commit-time capacity with whole-trade abort, already-trading guards, flat root-first projections with nested contents/tooltips).
- All four exploit tests: reserved item unmovable; simultaneous accept/cancel/disconnect conserves ownership + currency; racing double-commit yields exactly one commit; audit in the same transaction with second-leg failure rolling back the first leg + audit. Surface: `server/src/trade/`, `protocol/src/trade.ts`, `client/components/trade/TradePanel.tsx`.
- Additions beyond Canary: 1 s per-session cooldown on request/accept and a 2-minute inactivity timeout. Deliberate tightening: both sides must offer before accepting.

## Market (old todo 11e)
- All four main checkboxes (2026-07-18): durable uuid order ids + escrow (`016_market.sql`: `market_escrow_items` join, `escrow_balance` with DB invariant `= remaining_amount * unit_price`); atomic match/fill/cancel (one SERIALIZABLE transaction per mutation, `market_requests` consumes each client `requestId` exactly once, 2% fee clamped to [20, 1_000_000], creator pays, never refunded); bounded orders/queries/rates (`MARKET_LIMITS` in `protocol/src/market.ts`, 100 offers/character, paged item list, 1 s mutation cooldown, browse exposes no owner names — only a `mine` flag); pinned fees, escrow-at-creation, 30-day expiry, partial fills, same-account accept block, inbox delivery, bank proceeds, premium requirement.
- Money legs: fees, buy escrow, purchases pay carried-coins-first with bank fallback (`spendMarketFunds`, same transaction, Canary order); proceeds/refunds credit the bank; UI shows the combined spendable balance.
- All five exploit tests in `PgMarketStore.integration.test.ts`: escrowed item unmovable/un-re-offerable; partial fill/cancel/replay races can't duplicate escrow or overfill; listings/history leak no private state; same-transaction audit/ledger with zero rows on failure; conservation under concurrent mixed load.
- Surface: `server/src/market/` (MarketService, PgMarketStore + Create/Accept/Cancel/Read ops, marketCategoryOf, marketFeeOf, spendMarketFunds, pickEscrowSources), `protocol/src/market.ts`, `client/components/auction/AuctionOrderBook.tsx`.
- Deliberate product decision: market usable from anywhere — no depot session; sell offers/buy fills source pristine stock from ALL depots with per-depot revision bumps in the same transaction. Canary depot-proximity can be restored, if wanted, via an access check in `MarketService.handle`.

## Typed world actions (old todo 12)
- Action registry: `server/src/action/WorldActionRegistry.ts` (+ `resolveWorldAction.ts`, `handleDoorUse.ts`, `handleLeverUse.ts`, `handleSignRead.ts`, `handleMapRotate.ts`) resolves use-map against current tile state at execution time; ladder/dropdown keep the movement path; scripted placements, unpaired door types, and quest doors fail closed; out-of-view use-map probes fall through identically to empty tiles.
- Doors: Canary pairs imported (`tools/importCanaryDoors.mjs` → `content/items/canary-doors.json`; level requirements from the otservbr startup table → `server/data/door-levels.json`, with OTBM `actionId - 1000` fallback). Custom doors toggle; key-variant closed doors open unless locked (101/1001); locked doors say "It is locked."; level doors gate and auto-close via a step-out hook; closing rejects an occupied doorway; door state overlays passability/projectile blocking (`overrideMapData` + `DynamicMapItems`).
- Levers: bare levers (2772/2773, 9110/9111) toggle; quest-scripted levers fail closed until the quest platform. 2026-07-21: lever ids added to `MUTABLE_ITEM_IDS` in `tools/getMapItemSemantics.mjs` (416 map levers had been baked draw-only).
- Readables: use-map sends `item-text` (protocol `itemId` widened to map instance ids); `allowDistanceRead` within view, otherwise adjacency; map items are read-only.
- Rope spots (2026-07-21): crosshair via `useKind: "useWith"`; converter emits `rope-spot`/`use-with` from Canary `ropeSpots` ground ids (1498); `ToolUseHandler` + `World.tryUseRopeSpot` re-validate tool ownership, adjacency, occupancy, and step cooldown at execution.
- Shovel on closed holes (2026-07-21): 593/606/608 piles made mutable; shovel transforms pile → open hole (`shovelHolePairs.ts`); the digger falls (`MovementHandler.handleHoleFall`); catalog decay re-closes; others fall via `DynamicMapItems.getHoleTransition` consulted by `overrideMapData.getTransition`.
- Quest doors answer "sealed against unwanted intruders" while staying shut until the quest platform; Darashia dragon-lair doors 5115/5124 carry no lock actionId (quest-script territory).
- Look (2026-07-21), fully client-side: `MapView.lookItemIds` + generated `client/public/assets/look-items.json` (`tools/buildLookCatalog.mjs`, chained into `items:catalog`) — zero new protocol surface.
- Ctrl+click action menu: `client/components/ui/ContextMenu.tsx` + `client/components/game-window/GameMapContextMenu.tsx` — Look always; Attack/Stop Attack; Use on tiles.
- Multi-tile sprite click fix: `client/lib/render/resolveInteractiveTile.ts` redirects to the SE anchor of 2x2 items; covering sprites win over 1x1 scenery.
- Map-item rotation/transform-on-use: furniture with `rotateTo` (~1007 types) transforms in place via `planTransformMapItem` (materialize-on-first-mutation, version bump, transform audit, tile-state broadcast).
- Use-activated dropdowns: sewer grates/trapdoors/large holes/grilles (435/7750/21298, 475/8708/21374, 867/7523/7524, 22750) via `primaryType === "dropdowns"` without `floorChange`, moving one floor down after server-side destination checks.
- Exploit tests (2 of 4): concurrent/replayed use on one world item yields exactly one outcome (`WorldActionRegistry.test.ts`); forged action id/target/position/destination rejected for all shipped kinds.

## Raids and world events (old todo 13)
- Nothing implemented yet; `server/src/event/` does not exist.

## Parties (old todo 14a)
- Invite/join/leave/kick/leadership and shared-experience intents with server-derived ids, membership checks, limits, and rates (2026-07-19: `server/src/party/`, `protocol/src/party.ts`, `client/components/party/`). In-memory parties with Canary parity: leader-only controls, auto-promotion on leader leave/logout, disband-when-empty, in-fight leave block.
- Visibility/status sharing + exp eligibility: 30x30x1-floor status range per recipient with hp/mana nulled out of range; shared exp uses the ceil(highest/1.5) level rule, 30/30/1 range from leader, 2-min activity window.
- Party membership/eligibility re-checked at kill-reward execution time.
- Shared-exp activation + status reasons, party shields (gray/blue/gold + shared-exp stroke) on nameplates, vocation-diversity boosts (1.2/1.3/1.6/2.0), invite/leadership edge cases, party chat channel (`/p`).
- Exploit tests: no double-award on membership/reward races (`PartyDeathShares.test.ts`); forged party ids/membership/status targets rejected; status shared only with current members in range/floor (`PartyHandler.test.ts`).

## Guilds (old todo 14b)
- Durable guild/rank/membership/invitation/MOTD/permission tables with normalized unique names and explicit role capabilities (`017_guilds.sql`, `server/src/guild/`, `protocol/src/guild.ts`). Ranks 1/2/3 Member/Vice-Leader/The Leader; one guild per character via membership PK.
- Create/invite/accept/remove/promote/disband as authorized serializable transactions with unique-violation race mapping and execution-time rank re-reads; managed fully in-game via the guild modal.
- Guild `/g` channel through the chat membership/permission path; membership + mute re-checked at execution.
- Pinned guild wars: states 0-4, frag limits with exactly-once end-war, `guild_war_kills` rows written from the death path, viewer-relative ally/enemy/at-war emblems, online/member lists, rank permissions, guild message behavior.
- Exploit tests: permission and concurrent membership/name races fail safely (`GuildService.test.ts`, `PgGuildStore.integration.test.ts`); channel access follows execution-time state; no over-share (roster only to members, invite list only to vice+, public creature state carries only guild name + at-war flag).

## PVP policy (old todo 14c)
- World type + pinned skull/unjustified-kill rules (2026-07-19: `server/src/pvp/`, `018_pvp.sql`). Canary constants: protection level 7; white 15 min / red 24 h / black 72 h; frag windows 4 h/7 d/30 d with 3/5/10 red and 6/10/20 black thresholds; 60 s combat lock; black-skull 40 hp/0 mana respawn + no damage to unmarked; retaliation and justified-avenge rules; per-viewer yellow/orange marks never leaked.
- Enforcement at combat execution: `canPlayerTarget`/`canPlayerHarm`/`DamageResolver` gates re-checked every attack tick; red/black transitions write `pvp-skull-sanction` audit rows exactly once per death event; skulls/frags durable across relogin; client indicators are projections only.
- Exploit tests: no bypass via stale party/guild state (`PvpTracker.test.ts`), exactly-once audited transitions (`PgPvpStore.integration.test.ts`), protection-level/secure-mode held at execution (`PvpEnforcement.test.ts`).

## Houses (old todo 14d)
- House import: `tools/importCanaryHouses.mjs` → `server/data/houses.json` (993 houses, sha-pinned); `tileMetadata.houseId` parsed into a house-tile index on `MapData`/`World`.
- Durable owner/tenant/guest/access-list/rent state + atomic ownership transfer (`019_houses.sql`): buy-at-house from bank (level 100, 1000 gp/sqm), owner-to-player transfer offer/accept with both bank legs in one serializable tx, premium checks, abandon.
- Server-side authorization of doors/item placement/removal/invitations/eviction: execution-time gates via `HouseService.canUseHouseTile`; eviction moves movables to the previous owner's inbox with per-item idempotent delivery keys.
- Audit: `house-purchase/transfer/rent/eviction` events + bank ledger entries in the same transactions.
- Durable idempotent schedules: tick-driven scan ≥60 s apart, each rent charge guarded on `paid_until` in its own tx, 7 warnings then eviction, replay/crash safe.
- Transfers and guest/subowner access managed in-game via the House modal (replaces aleta sio/som), kick, monthly rent warnings, item eviction.
- Exploit tests: sale/eviction/rent races conserve every item and gold unit (`PgHouseStore.integration.test.ts`); schedules exactly-once across uptime and crash/restart; door/item authorization follows current owner/guest state at execution, with mid-session revocation blocking the next step/use and sweeping occupants (`HouseService.test.ts`).

## Social services (old todo 14e)
- VIP/friends core (2026-07-19): character-scoped VIP list, 20 free / 100 premium, description/icon/notify-on-login, live presence via reverse watcher index, private lists, VipPanel UI (`020_social.sql`, `server/src/social/`, `protocol/src/vip.ts`, `client/components/social/VipPanel.tsx`).
- 2026-07-23: full-height Friends panel with Party access and add-friend dialog; entries include server-projected level and vocation; the durable relationship remains a one-way private VIP entry.
- Highscores: 9 categories from persisted progression, vocation filter, LIMIT 50 / max 1000 rows, 10-min cache, fixed parameterized queries; `HighscoresModal.tsx`. Caveat: GM exclusion pending a staff flag.
- Mail/inbox verified end-to-end on the item-ownership model; exploit tests for delivery-key replay idempotency and the racing-sends dupe race in `PgDepotStore.integration.test.ts`. Caveat: no time-based send-mail rate limit beyond the per-session mutex.
- Moderation (`021_moderation.sql`, `server/src/moderation/`): durable mutes enforced across say/private/party/guild at execution time, spam auto-mute 5·n² escalation, bans reuse `accounts.banned_until` + kick live sessions in the same action, every action writes `moderation_actions` in the same tx, `/report <name>` with 1/min + 20/day limits.
- Exploit tests: presence/access-lists/reports/moderation not over-shared (`VipService.test.ts`, `PgSocialStores.integration.test.ts`); moderation authorized/audited/target-validated (`ModerationCommands.test.ts`, `PgModerationStore.integration.test.ts`); highscore queries bounded with no private state (`HighscoreService.test.ts`).

## Remaining Canary systems (old todo 15): minimap, UI settings, bestiary, Wheel, Gem Atelier, store slice
- Minimap panel core (2026-07-19): pre-baked terrain tiles in the classic automap palette (`yarn minimap:build` chained into `map:convert`), NPC/monster/player markers from live visibility, NPC tooltips with sold-item categories, floor navigation, zoom, drag-pan.
- Account-wide UI settings (2026-07-19): `accounts.ui_settings` jsonb (`022_account_ui_settings.sql`), strict bounded `uiSettingsSchema`, draggable/resizable minimap panel, per-account layout persistence via `update-ui-settings` with debounced saves.
- Bestiary + bosstiary core: per-player kill tracking (`025_bestiary_kills.sql`), stage-gated detail projections, per-kill entry-changed pushes, navbar modals with animated sprites, searchable preloaded list (`server/src/bestiary/`, `client/components/bestiary/`, `content/monsters/bestiary.json` via `yarn bestiary:import`).
- Wheel of Destiny core (2026-07-20): shared slice/adjacency/bonus tables + `validateWheelAllocation`/`computeWheelBonuses` in `protocol/src/wheel*`; server `WheelService`/`WheelTracker`/`PgWheelStore` (`027_character_wheel.sql`); wheel HP/mana/capacity threaded through `deriveCharacterStats`; conviction skill boosts in `Player.skillLevel`; exploit tests; Tibia-exact client modal (`client/components/wheel/`, `client/lib/wheel/wheelGeometry.ts`). Points = level − 50, gated on level 51+ and premium. Promoted-vocation requirement enforced in Wheel and gem atelier gates.
- Gem Atelier + Fragment Workshop (Canary-pinned): unrevealed gems drop from bestiary/bosstiary kills; reveal/switch-domain/lock/destroy/equip; global per-mod grades; vessel resonance gating in `server/src/wheel/Gem*` (`028_gem_atelier.sql`, protocol `gemAtelier*`/`computeGemBonuses`); equipped gems grant real max HP/mana, capacity, elemental resistances (in `DamageResolver`), and revelation-mastery points; costs are ACID bank debits with ledger + audit; exploit tests (`GemAtelierService.test.ts`, `PgGemStore.integration.test.ts`).
- Store first slice (2026-07-23): account-scoped Mantus Coins and atomic Premium Time purchases.

## Client resilience (old todo 16a-c)
- Freeze diagnostics: server tick and headless client proven clean; probes retained as regression tests (`yarn playtest:tick-stall`, `client/e2e/gameFreeze.e2e.test.tsx`). Server tick: zero stalls >40ms over 2 min (`server/src/playtest/lagMonitor.mjs`); headless client: zero main-thread stalls ≥250ms over 2 min walking. (Everything else in 16 is not started.)

## Operations and security (old todo 17a-h)
- Protocol limits partially enforced: `protocol/src/limits.ts` defines `PROTOCOL_LIMITS` (`maxMessageBytes: 16_384`, `maxMessagesPerSecond: 30`); `GameServer.ts` sets WS `maxPayload`; `Session.ts` enforces per-connection message rate and outbound size; zod validation repo-wide.
- DEV_COMMANDS-gated moderation suite: `server/src/moderation/` (ModerationService, PgModerationStore, ChatModerationHooks + tests) implements kick/ban/unban/mute/unmute with immediate live-session kick and a `moderation_actions` audit row in the same transaction; `/kick`, `/ban`, `/mute` wired in `GmCommandHandler.ts`. Not role-authorized — production gating is Feature 96.
- Economy audit rows written in-transaction via `audit_log` with event-type check constraints (migrations 004/012/013/016/018/030); parameterized queries are repo policy.
- Load-test baselines: 4,000-player controlled protocol capacity result and isolated 1,900-active-hotspot-monster gate (both explicitly insufficient as launch gates — never combined, never on production-like infra; promotion to staging gates is Feature 100).

## Auth follow-ups (old todo 18)
- Authorized, audited premium purchase/renewal: Mantus Store purchases debit the account wallet and renew `premium_until` with ledger + audit in one transaction (`server/src/store/PgMantusStore.ts` + integration test, `033_mantus_store.sql`, `premium_until` in `PgAccountStore.ts`).
- Store renewals propagate to the online account session and live Player.
- `accounts.premium_until` is authoritative and defaults free; runtime checks use the server clock so premium expiry applies immediately while online.
- Instant ban substantially implemented (todo checkboxes were stale): `ModerationService.gmBan` writes `banned_until` via `PgModerationStore.banAccount` (state change + audit row in the same transaction), immediately disconnects every live session (`sendError("account-banned")`), and login re-checks `banned_until`; wired to `/ban`; tests in `ModerationEnforcement.test.ts` and `PgModerationStore.integration.test.ts`. Residual: DEV_COMMANDS-gated rather than role-gated (Feature 96/101).

## Dev tooling (old todo 19)
- Dev-only testing infrastructure (2026-07-18): `DEV_AUTH=1` swaps Supabase verification for `DevTokenVerifier` (tokens `dev-<name>`); `DEV_COMMANDS=1` enables GM chat commands `/i`, `/spawn`, `/goto`, `/level`, `/heal`, `/where` (`server/src/gm/GmCommandHandler.ts`; now also `/kick`, `/ban`, `/mute`).
- `server/src/playtest/`: headless protocol client plus scenario scripts booting the real server against the local docker Postgres `playtest` DB.

## Quests (old todo 20/20a)
- Nothing implemented yet (`server/src/quest/` does not exist; no `character_storage` migration — latest is 036).

## Performance follow-ups (old todo 21)
- 2026-07-24 optimization pass landed: visibility broadcast dedup + serialize-once, quadratic tile-states batching, non-allocating occupancy checks, findPath parent-pointer reconstruction, first-visible-floor cache keyed on passability-only revision, per-tick queue drains, equipment/stats memoization, dirty-tracked skills/storage saves, client HUD re-render isolation, shared outfit texture cache, atlas-based combat effects.

---

## 2026-07-24/25 completion wave (feature-numbered backlog)

The numbered backlog (features 1–107) replaced the per-area files on
2026-07-24; on 2026-07-25 it was consolidated into the 13 merged area files.
This wave closed the features below. Residual slivers were transferred to
the named owners rather than left in archived files.
Two whole areas closed: **todo 4 — Rendering and animation** (Features 5–8)
and **todo 7 — Vocations, stats, and progression** (Features 18–20; Feature
72 owns the remaining in-world training triggers).

### Closed features

- **Feature 3 — pz-lock on ladder/hole/rope/levitate** (2026-07-24): the pz-lock destination check holds on the walk, `tryUseAction`, and levitate paths; PZ status icon added to the HUD.
- **Feature 5 — Asset cache-busting** (2026-07-24): content-hash `version` in a no-cache `assets/manifest.json`; `AssetStore` appends `?v=` to `objects.json`, `atlas-index.json`, and the sheets.
- **Feature 6 — Underground multi-floor dynamic visibility** (2026-07-24): one shared `visibleFloorRange` policy gives underground viewers cover-aware z±2 creatures and tile-item states without leaking past roofs.
- **Feature 7 — World-item seed reconciliation** (2026-07-24): offline fail-closed `yarn workspace server db:reconcile-world-seed`; deletes only in-place delta rows whose seed fixture survives, one audit row per deletion, aborts on any unclassifiable row.
- **Feature 8 — Effects/missiles vs onTop draw order** (2026-07-24): per-floor `onTop` overlay above the transient effect layer; effects draw beneath archway tops per OTClient.
- **Feature 12 — 200 ms use exhausts** (2026-07-24): per-session `useExhaustReadyAt` gate on `use-item`, `use-item-with`, instant `use-map`, and the action-bar path; `item-exhausted` puff client-side.
- **Feature 13 — Trash holders** (2026-07-24): trashholder-kind tiles destroy dropped/thrown items with poff effect + audit; pristine static-seed decoration exception recorded.
- **Feature 14 — Client walk-then-use auto-retry** (2026-07-24): `ReachActionScheduler` walks adjacent and retries exactly once on arrival; server keeps every reach check.
- **Feature 15 — Process-kill crash durability harness** (2026-07-24): `ITEM_TX_CRASH_POINT` seam kills the process before/after COMMIT; kill-before leaves the original owner, kill-after the new one, never two. Residual map-version seed-reconciliation note moved to `TODO.md` (owner Feature 98).
- **Feature 18 — Stamina, soul rules, training engines** (2026-07-24): stamina persistence/offline regen/hunt decay/XP multiplier, exact soul eligibility, stage + rate config, and the pure offline/exercise training conversion engines. In-world bed/statue/dummy triggers → Feature 72.
- **Feature 19 — Progression event-id pruning** (2026-07-24): `snapshot_version` on `progression_events` (migration 037) pruned in the save transaction; compacting in-memory event queue.
- **Feature 20 — Vocation coefficient fixtures** (2026-07-24): pinned `vocations.xml` transcribed to a fixture; drift or an unclassified field fails the test.
- **Feature 21 — Potion target monster-say** (2026-07-25): unforgeable `monster-say` speech mode; target says `Aaaah...` to observers who see the drinker. Potion sound dropped by product decision — any future audio starts fresh under Feature 87.
- **Feature 23 — Advanced targeting** (2026-07-25): follow, challenge/taunt, aim-at-target, and the combat analyzer, all server-side. Residuals transferred: analyzer panel + aim toggle → [client backlog](client/feature-23-combat-panels.md); reward-boss guard → Feature 76; boss difficulty/hazard/encounters → Feature 86.
- **Feature 25 — Custom combat areas** (2026-07-25): `2`-centre matrices, extended diagonal areas, helper-indirected constants all typed; Ice Burst/Terra Burst/Balanced Brawl enabled, twelve areas corrected; 169 supported.
- **Feature 27 — Action-bar polish** (2026-07-25): debounced action-bar/minimap saves flush on `beforeunload`/`pagehide`/teardown; rune slots already shipped with the unified bar.
- **Feature 28 — Spell-words-via-chat completion** (2026-07-25): name-parameterized casts, `magic` speech mode, yelled words, exani hur action-bar slot, step-cooldown fizzle.
- **Feature 30 — World-container and loot UX** (2026-07-25): bounded multi-view sessions, nested corpse browsing, materialize-on-open map chests, category-filtered quick-loot sweep — all reach/revision-checked per tick.
- **Feature 31 — Corpse persistence/retry hardening** (2026-07-25): shared serializable-retry helper across all economy stores; integration tests replay the real migration directory; loot-origin guard on `planDrop`/`planMoveMapItem`.
- **Feature 34 — Durable decay deadlines** (2026-07-25): boot resumes deadlines from `items.updated_at` age (no new column); `updatedAtInvariant` test protects the derivation.
- **Feature 36 — Chat observability** (2026-07-25): flood metrics, configurable buffer limits, escalation decay, documented retention policy.
- **Feature 37 — Typed NpcType model** (2026-07-25): every declared NPC behavior field carried typed; NPC gaps in the creature report 956 → 3.
- **Feature 39 — NPC import validation** (2026-07-25): fail-closed import validation, whole-world destination proof, pinned parity gate.
- **Feature 42 — Travel bank-fallback payment** (2026-07-25): fares spend carried coins first, bank covers the shortfall in the same serializable transaction with ledger + split audit.
- **Feature 44 — Currency conservation metrics** (2026-07-25): read-only five-minute sweep checking coins vs mint/burn flow, bank vs ledger chain, coin rows vs audits. Operator surface → Feature 96; conditional escrow/rare-watchlist extensions noted in `TODO.md`.
- **Feature 47 — Depot/market transaction hardening** (2026-07-25): persist-failure live resync (retry half closed by Feature 31); latency/deviation trade-offs documented in the log. The conditional connection-transient retry decision moved to Feature 97.
- **Feature 53 — World-action parity inventory** (2026-07-25): 313 registrations classified, 0 unclassified, gated by `worldActionParity.test.ts` + `yarn parity:check`.
- **Feature 55 — Party analyzer** (2026-07-25): full analyzer; accepted gaps (catalog-`worth` market mode, supplies scope) recorded in `TODO.md`.
- **Feature 56 — Party finder** (2026-07-25): finder ships; the `finderVisible` hook defaults open until Feature 65's privacy setting exists (owner: Feature 65).
- **Feature 60 — pvp-zone tiles** (2026-07-25): the already-converted OTBM `pvp` flag now feeds the skull/frag policy; kills inside a pvp zone produce neither. Blessing-loss modifiers → Feature 72.
- **Feature 61 — Timed house auctions** (2026-07-25).
- **Feature 63 — Guildhall purchase** (2026-07-25).
- **Feature 64 — House polish** (2026-07-25): rent letters, mob blocking, eviction edges; inbox-overflow spillover kept as an audited deviation (charter rule 10).
- **Feature 66 — Social-services hardening** (2026-07-25): GM highscore exclusion, mail rate limit, admin reachability. Locale key → [client backlog](client/cross-cutting-locales.md); role operator tooling → Feature 96.

### Server half shipped — only a client surface remains

These stay open in their areas, tracked entirely by [`todo/client/`](client/README.md):

- **Feature 62 — House access lists** (2026-07-25): per-door lists enforced server-side; [door-list editor](client/feature-62-door-list-editor.md) missing.
- **Feature 68 — Minimap completion** (2026-07-25): markers/walk-to shipped; [marker icon/text editing + walk feedback](client/feature-68-marker-editing.md) missing.
- **Feature 69 — UI-settings polish** (2026-07-25): reset + cross-session sync shipped; [chat/battle-list/spell-bar panels still fixed](client/feature-69-movable-panels.md).
- **Feature 70 — Outfits and addons** (2026-07-25): entitlements + validation shipped; outfit window followed 2026-07-26 (below). Unlock sources ride with store/quests/achievements.
- **Feature 71 — Mounts** (2026-07-25): ownership, validation, speed bonus shipped; mounted rendering followed 2026-07-26 (below).

### Major partial cores shipped in the same wave (features stay open)

- Feature 96: `accounts.role` migration (054), fail-closed capability model, per-command gating, audited `/goto`/`/bring`/`/inspect`; role assignment + content/event controls remain.
- Feature 54: durable restart-safe world-event engine + the 18-raid import lane; other global events, daily resets, boosted rotations, reward steps remain.
- Features 24/26/29/32/33/35/38/40/41/43/45/46/48/49/50/51/52/57/58/59/65/67/72: substantial slices each — see their sections in the merged area files (`todo-1.md` … `todo-13.md`) for exactly what remains.

## 2026-07-26 wheel combat wiring + outfit/mount client surfaces

- **Feature 70 — Outfit window (client)** (2026-07-26): closed. `useOutfitSession` +
  `outfit-state`/`outfit-action-failed` branches in `handleCharacterSessionMessage`,
  `GameClient.getOutfits/selectOutfit`, `OutfitModal` (entitled outfits, mounts with
  speed, 133-colour grid, granted-mask-aware addon toggles via
  `client/lib/outfit/selectableAddons` + unit test), live preview
  (`getOutfitPreviewCanvas` composites addon pattern-Y passes and the mount
  underlay with the riding pose), nav-bar button, own-player context-menu entry,
  `outfit.*` locales (en/pt-BR), Storybook stories. `creature-state-changed` now
  also refreshes `ownCharacter.outfit` so the top-bar portrait tracks changes.
  Verified: client typecheck + 232 unit tests; visual pass still recommended on
  first run (pattern indexes are test-blind).
- **Feature 71 — Mounted rendering (client)** (2026-07-26): closed. `CreatureView`
  draws the mount as a second uncolourised sprite below the rider (mount objects
  carry displacement 0 vs the rider's 8), the rider switches to pattern-Z 1,
  `hasAppearance` compares `mountLookType`, `WorldRenderer.loadCreature` preloads
  mount sprites; mount row ships in the outfit window. 4 new `CreatureView` tests.
- **Feature 79 — Wheel combat wiring, first big slice** (2026-07-26): the passive
  layer plus universal actives are live in combat. Player mitigation
  (`playerMitigation.ts`, full Canary formula: shielding skill, held defense,
  fight factor, pinned vocation constants, wheel multiplier; applied after
  shield/armor with Canary's truncated-reduction semantics, drains and condition
  ticks exempt), wheel+gem life/mana leech (multi-target falloff
  `(0.1n+0.9)/n`, capped at damage, condition-origin exempt), gem crit damage,
  gem dodge (pre-block full avoid), wheel magic-skill boost in
  `playerMagicLevel`, revelation flat damage/healing at Canary's post-block
  application point, Blessing of the Grove, Gift of Life (overkill window,
  20/25/30 % heal, 30/20/10 h cooldown ticking 1 s at a time via a character
  storage value in `Combat.tick`, −60 s on every spell cooldown when it fires),
  spell augments (`protocol/src/wheelSpellGrades.ts` grades from slice pairs +
  revelation stages; `server/src/combat/wheelSpellAugments.ts` per-grade
  damage/heal %, mana cost, spell+secondary-group cooldown reductions floored
  at half base, crit, per-spell leech, Sap Strength's grade-2 debuff, chain
  targets/duration for Chivalrous Challenge and Divine Dazzle), upgraded areas
  (AREA_WAVE7/CIRCLE5X5/BEAM7/BEAM10 transcribed from the pinned
  register_spells.lua in `wheelUpgradedAreas.ts`), Beam Mastery (area upgrade,
  per-target accumulating multiplier, 1 s cooldown refund per target),
  Combat Mastery (2H crit / shield defense), Focus Mastery (12 s +35 % window),
  Healing Link (10 % self-heal on Heal Friend/Nature's Embrace), Runic Mastery
  (bell-curved 25 % roll, +20/10 % rune magic level via the conjuring-spell
  lookup). Every value cites the pinned Canary source. Tests: `playerMitigation`,
  `blessingOfTheGroveBonus`, `computeWheelSpellGrades` units + 9 Combat
  integration tests (leech, flat damage, dodge, mana/cooldown augments,
  grade-gated area, Healing Link, Gift of Life once-per-cooldown). Remaining
  Feature 79 work stays in `todo/todo-10.md`.
- **Feature 80 — Wheel rule gaps** (2026-07-26): point removal now requires a
  protection zone within 10 tiles of a town temple at execution time (new
  `temple-required` reason; `MapData.getTownTemples` + `World.townTemplePositions`;
  Canary's literal `areInRange<1,10>` x/y asymmetry is an upstream template
  defect — the documented 10-sqm intent is implemented and the deviation noted
  in `WheelService`). Offline capacity (`PgItemLocks.lockCharacter`) now derives
  the wheel+equipped-gem capacity through the shared `computeWheelBonuses`.
  Boosted (green) skill and magic values ship as `boostedLevel`/
  `boostedMagicLevel` in `projectOwnProgression` and render as signed deltas in
  the skills panel. Wheel saves and gem equips now refresh the inventory
  capacity view (`items.updateCapacity`). Extra point sources (promotion
  scrolls, Monk quest bonus, hunting-task points) stay deferred on Features
  43/75/quests — see `todo/todo-10.md`.

## 2026-07-26 profiles closed + prey + hunting tasks

- **Feature 67 — Profiles: achievements, titles, badges, char info**
  (2026-07-26): **closed**. (a) Full Canary achievement catalog imported:
  `tools/parseCanaryAchievements.mjs` (+ node:test suite) parses the pinned
  `data/scripts/lib/register_achievements.lua` (541 entries, 191 secret,
  grade 4 ×1, points 0-10); `tools/importCanaryAchievements.mjs`
  (`yarn achievements:import`) pins commit + sha256 through
  `content/source-manifest.json` and writes
  `content/profile/canary-achievements.json` with deterministic kebab-case
  slugs (durable grant keys, collision-checked against the 7 pinned mantus
  ids); `server/src/profile/loadCanaryAchievements.ts` re-validates
  provenance and every field at boot; `achievementCatalog.ts` merges to 548
  definitions and throws on id collisions. Protocol: `secret` flag on
  achievement entries, grade widened to 1-4, catalog cap 600, description
  cap 256. (b) Entire client surface: `useProfileSession`, message branches
  (`profile-state`/`achievement-granted`/`profile-action-failed` own-state,
  `character-profile` community), `GameClient.getCharacterProfile/
  selectTitle/reportBug`, components under `client/components/profile/`
  (`ProfileModal` tabs, reusable `AchievementList` with ??? masking for
  ungranted secrets — built for Feature 83 reuse, `TitlePicker` with
  ungranted titles unselectable, `PublicProfileModal` rendering the
  projection exactly as received, `BugReportModal` sending only
  category+text), achievement toast, Ctrl+Z via new ctrl-combo hotkey
  support (`CTRL_HOTKEY_BINDINGS`), "View profile" on the player context
  menu + VIP rows, nav button, `profile.*` + `serverErrors.
  character-namelocked` locales (en/pt-BR), `summarizeProfileProgress`
  helper + unit test, 3 Storybook stories. Verified: client typecheck,
  238-test unit suite, eslint clean, locale key-sets identical. Residuals
  live with Features 2 (rename) and 83 (Cyclopedia display).
- **Feature 74 — Prey system** (2026-07-26): **closed** server+client,
  transcribed from pinned `src/io/ioprey.cpp`. Migration 055:
  `character_prey_slots` + shared `character_prey_resources`
  (wildcards/task points) with conditional-debit semantics. `server/src/
  prey/`: `PreyService` (in-memory slot state loaded at attach, mutated only
  in-tick; Canary state machine incl. selection-change-monster and
  list-selection; premium slot-2 unlock at load; slot 3 locked until the
  Feature 43 store offer), exact grid roll (`rollMonsterGrid` — star-bucket
  quotas 3/3/2/1→1/1/3/4 by level band, blacklist semantics, tries≥10
  fallback, 36-entry pool guard), bonus rolls (`preyBonusRoll` — monotonic
  rarity, type-first-then-value order, 2r+5/2r+10/3r+10 percentages),
  hunting-time drain in Canary's 60/120 s exp-gain chunks with
  auto-reroll/lock expiry options (optimistic renewal corrected on failed
  debit), gold list rerolls (level × 200) through `PgPreyStore` in one
  serializable transaction with `bank_ledger('prey-reroll')` + audit rows,
  wildcard spends conditional and audited, capped `grantWildcards` for
  Features 43/84. Combat: `PreyHooks` consumed post-mitigation/pre-wheel in
  `DamageResolver` (damage boost / defense reduction, floor(amount·pct/100),
  condition ticks and mana drains exempt), `DeathHandler` (exp bonus
  `ceil(amount·(100+pct)/100)` after the drain call, Canary's order), and
  `createMonsterCorpse` (pct% chance of one extra full loot roll). Bestiary
  import now carries `isPreyExclusive` (146 races kept out of random grids,
  wildcard-list selectable) — closes Feature 9's prey typed-data bucket.
  Client: `usePreySession`, `PreyModal`/`PreySlotCard`/`PreyFullListPanel`
  (+shared `PreyCreatureSprite`, `RarityStars`), `GameClient.preyAction`,
  nav toggle, locales, stories. Tests: 22 unit (incl. racing paid rerolls
  debit exactly once; bonuses only for the slot's race at execution; grid
  quota/fallback/exclusive behavior) + 5 Pg integration (racing
  debits/wildcard spends leave one winner, grant cap). Deviations recorded
  in `TODO.md` accepted gaps (bank-only gold, stamina-decoupled drain,
  optimistic option renewals, no chat notices).
- **Feature 75 — Hunting tasks** (2026-07-26): **closed** server+client.
  `server/src/huntingTasks/`: kill credit rides the same death-hook
  damagers set as the bestiary (`HuntingTaskService.onMonsterKilled` in
  GameServer's composite hook; counting continues past the goal, Completed
  at the tier goal), exact 15-row option table in
  `protocol/src/huntingTasks.ts` (`TASK_HUNTING_OPTIONS`, Canary integer
  arithmetic: kills 25/100/400, ×120/125/130 star escalation, second tier
  double), monotonic star rerolls (`rollTaskRarity`), upgrade tier gated on
  full bestiary completion re-checked at selection, list rerolls/cancel
  charging level × 200 gold with ledger + audit, claims through
  `claimTaskSlotQuery`'s conditional UPDATE (selection/kills/state
  re-checked in SQL) crediting `task_points` + audit in the same
  transaction — racing claims grant exactly once; 4★/5★ claim boost roll
  (×2.0 at ≤5, ×1.5 at ≤10, else ×1.0, floor(reward·boost/10)); post-claim
  20 h exhaust with the Canary load fixup (expired exhaust → selection).
  `taskPointsOf` is the durable balance Feature 80 will read as a wheel
  point source. Client: `useHuntingTasksSession`, `HuntingTasksModal`/
  `HuntingTaskSlotCard`/`HuntingTaskFullListPanel` (tier pickers showing
  kills/points from the shared table, claim button, exhaust countdown),
  `GameClient.huntingTaskAction`, nav toggle, locales, stories. Tests: 12
  unit (kill credit only via the death path and only for matching
  selections; claim exactly-once incl. replay and same-tick races; exhaust
  gates; upgrade stripping) + 4 Pg integration (racing claims, short-kill
  rejection, cancel ledger/audit, full-shape persistence). Verified
  end-to-end 2026-07-26: protocol+server+client typecheck, 1201 server +
  242 client tests green, tools tests + parity:check green, new integration
  tests green against Postgres (the 10 failing chest/guild/social
  integration cases predate this work — verified by re-running without
  migration 055 — and are recorded in `TODO.md`). Migration 055 pending
  `yarn db:migrate` alongside 043-054.

## 2026-07-26 boosted/reward-boss, forge complex, proficiency/animus, cyclopedia (server)

- **Feature 76 — Boosted creatures/bosses, kill trackers, reward-boss flag
  (server)** (2026-07-26): daily boosted pair on its own day-keyed
  `boosted_daily` table — the row is the selection, `INSERT … ON CONFLICT
  DO NOTHING` then read, so racing processes/restarts converge
  exactly-once; creature picked with Canary's bell-curved `normal_random`
  over the race-id-sorted bestiary excluding yesterday's race
  (game.cpp:770-844), boss uniformly from archfoes only
  (io_bosstiary.cpp:55-71); rotation happens at the server-clock day
  boundary inside the tick (deviation: Canary only rotates at restart) and
  clears the new boosted boss out of every character's slots. Modifiers at
  execution time: kill exp ×2 before the prey ceil (player.lua:563-574
  order), one extra full loot roll in `createMonsterCorpse` skipped for
  reward bosses (ondroploot_boosted.lua), respawn interval ÷2 via a
  SpawnManager hook, bosstiary kill increment ×3 in `BestiaryTracker`
  (player.cpp:6565; the display-vs-applied 4-vs-3 upstream mismatch is
  resolved to ×3 both ways). Kill trackers: `tracker-set`/`tracker-state`
  mirroring Canary 0x2A/0xB9 (255/list cap silently enforced, boss
  tracking gated on a kill), rows in `character_monster_trackers`, own
  counts only. Boss slots: `character_boss_slots` with Prowess-gated
  assignment, slot two at 1500 boss points, Canary's removal curve
  (300000·n−500000, first two free) charged as a conditional bank debit +
  ledger + audit in one transaction — deliberately fixing upstream's
  unchecked `removeMoney` (game.cpp:11229); loot-bonus application rides
  Feature 84. `flags.rewardBoss` imported onto `MonsterType` (44 bosses;
  the 911-monster blocked bucket closed, report ceilings lowered to
  739/1573/150, converter hashes re-pinned) and `challengeMonster`/
  `pullMonsterToMelee` gate on it. Deviation: boosted matching is by race
  id, so look-variants sharing a race are all boosted where Canary
  compares the primary name. Migration 056. Tests: selection
  exactly-once/day-boundary/adoption, modifiers only for the selected
  race, corpse extra-roll + reward-boss exemption, tracker gates/caps/rate
  limit, slot pricing incl. insufficient-gold refusal and the
  boosted-slot guards, reward-boss challenge/pull refusal.
- **Feature 78 — Imbuements, item tiers, Exaltation Forge (server)**
  (2026-07-26): imbuement catalog transcribed from the pinned
  data/XML/imbuements.xml (72 entries, exact prices/effect values;
  `tools/importCanaryImbuements.mjs` → `content/imbuements.json`);
  per-item category gates from items.xml sub-attributes
  (`imbuementTypes` slugs on the item catalog). Shrine-gated
  `imbuement-window-get`/`apply`/`clear`: one SERIALIZABLE transaction
  covers the astral-source destruction, the bank gold leg, the
  version-guarded attribute write, and the audit row; mirrored Canary
  quirk: no success roll (upstream never rolls its XML `percent`).
  Stricter than Canary: shrine adjacency is re-checked at apply time.
  Decay follows imbuements.cpp:473-497 — aggressive categories burn only
  in-fight outside PZ, non-aggressive whenever worn — via a per-second
  service ledger with durable checkpoints every 60 qualifying seconds, at
  expiry, and on detach. Combat effects at execution time: skill/ML
  boosts, crit, always-on leech (vestigial chance ignored like
  game.cpp:8983), first-imbuement elemental conversion of the physical
  share, sequential elemental protections (player.cpp:3872), feet-slot
  vibrancy paralysis-removal roll. Classification extracted from the
  appearances protobuf (`tools/extractCanaryAppearanceFlags.mjs`, 971
  items, fields 48/61) with items.xml proficiency override; tier lives in
  `items.attributes` behind an immutable-identity row. Tier bonuses from
  the exact quadratics (item.cpp:559-617): weapon onslaught +60% proc
  after crit, armor ruse folded into the dodge roll, helmet momentum −2 s
  spell cooldowns on even seconds in-fight, boots amplification
  multiplying all three; transcendence chance computed but consumption
  rides Feature 79's avatars. Exaltation Forge: fusion with Canary's
  exact bonus table (tools.cpp:1847-1882) and skip semantics (dust kept
  on 1, cores on 2, gold on 3, second item kept at −1/=/+1 on 4/5/6,
  double tier on 7 capped by classification, failure keeps the first item
  and drops the second a tier unless the loss core saves it), transfer
  (donor ≥2 → tier-0 receiver at −1, convergence keeps the tier),
  conversions (60 dust→3 slivers, 50 slivers→1 core, cap raise at
  `dustLevel−75` to 225) — each one SERIALIZABLE transaction over
  version-guarded item rows, the dust balance, the bank leg, the
  `forge_history` row, and the audit row, with all RNG rolled server-side
  pre-transaction; intents are refused while any item write is in flight
  so guarded rows match validated memory. Influenced/fiendish monsters:
  10 s sweep assigns states server-side (influenced `normal_random(1,5)`,
  fiendish stack 15 for 1 h), health ×(1+(15·stack+35)/100), attack/
  defense multipliers and the deliberate integer-division exp quirk
  ((stack+10)/10) at execution time, kill dust `random(stack, 3·stack)`
  clamped to the cap in SQL for every damager, fiendish corpse slivers
  uniform(3,7); caps scale with the live eligible population (deviation:
  Canary's absolute 300/4 assume a fully-live world; mantus activates
  spawns near players). The gem-drop deviation is retired: `GemDropHooks`
  now keys on real instance states + archfoe bosses. Deviations noted:
  bank-only gold legs (consistent with gem atelier/prey), fusion results
  stay in place instead of a conjured exaltation chest, no scroll-item
  flow. Migration 057. Tests: bonus-table boundaries, tier quadratics,
  fusion/transfer validation (imbued items refused, tier caps), unfunded
  refusals, plus 4 Postgres race tests — atomic fusion commit
  (history==audit one-to-one), unfunded-leg rollback, racing fusions
  leave exactly one winner, racing conversions conserve dust and mint
  exactly the committed slivers.
- **Feature 82 — Weapon proficiency + animus mastery (server)**
  (2026-07-26): perk tables transcribed from the pinned
  data/items/proficiencies.json (420 profiles;
  `tools/importCanaryProficiencies.mjs` → `content/proficiencies.json` +
  the client asset) and item→profile ids from the appearances protobuf.
  Accrual only from server-side monster deaths for the killer's wielded
  weapon: bosstiary rarity 500/5000/15000 plus the bestiary-star
  polynomial values [1,30,70,100,165,240], each ×0.33
  (weapon_proficiency.cpp:788-808, cpp:51-59), against the
  crossbow/knight/standard XP tables with mastery two tiers past the last
  perk level. `proficiency-select` re-validates every pick against earned
  progress at execution time (one per level, index bounds); rows persist
  monotonically (`GREATEST` upsert) in `character_weapon_proficiencies`.
  Combat application of the wielded weapon's selected perks: flat attack,
  defense/shield modifier, skill/ML boosts, crit chance/damage, always-on
  leech, powerful-foe % vs bosses and forge-state monsters, ranged hit
  chance, attack range, and the skill-percentage flat auto-attack leg;
  spell-facing families ride Feature 79 and the remaining inert families
  Feature 86 (recorded). Animus mastery: `character_animus_masteries`
  rows, `AnimusService.grant` as the only earn surface (Soul Pit deferred
  to Feature 86), and Canary's exact multiplier
  min(4, 1+(2+⌊N/10⌋·0.1)/100) composed LAST in the exp pipeline
  (player.cpp:3588-3603), only on kills of mastered races. Migration
  058. Tests: killer-only accrual with exact values, no gain without a
  wielded profile weapon, selection locks/bounds, effects gated on
  unlocks, animus multiplier + idempotent/unknown-race grant refusal.
- **Feature 83 — Cyclopedia views (server)** (2026-07-26): bounded,
  authorized own-only projections behind Canary's ownership gate. Combat
  view computed from live equipment/wheel/imbuement/proficiency/tier
  state at request time; item summary aggregates the character's own
  memory-authoritative caches (carried + depot + inbox + stash) by
  (type, tier); recent deaths from a new `character_deaths` table written
  write-behind by the death path before penalties ("Died at level X by
  Y."), 30-day window; PvP kills from the existing `character_kills`
  frags, 70-day window, justified/unjustified status — all through fixed
  parameterized queries with `CYCLOPEDIA_LIMITS` paging (15/page, page
  clamp), a per-session cooldown, and single-flight page queries.
  General/achievements/titles/badges/outfits/monster/house tabs reuse the
  shipped own-state and profile/bestiary/house projections; Canary's map
  view is a stub upstream (protocolgame.cpp:3275-3291) and is skipped
  knowingly. Migration 059. Tests: summary aggregation from own caches
  only, death paging, PvP status mapping, rate limiting.
- **Cross-cutting verification** (2026-07-26): protocol + server
  typecheck clean; 1,241 server unit tests green; `test:integration` runs
  237 tests with only the 10 pre-existing chest/guild/social failures
  (recorded in TODO.md) — the 4 new forge race tests green; tools 74/74
  and `parity:check` green after the inventory regen. Migrations 056-059
  pending `yarn db:migrate` alongside 043-055.

## 2026-07-26 boosted/tracker/boss-slot + forge/imbuement client surfaces

- **Feature 76 — Boosted creatures/bosses, kill trackers, boss slots
  (client)** (2026-07-26): the server+protocol shipped earlier the same
  day; this closes the client surface. New sessions
  `useBoostedSession`/`useTrackerSession`/`useBossSlotsSession` hold the
  `boosted-state`/`tracker-state`/`boss-slots-state` projections (branches
  in `handleProgressionCatalogMessage`, reset on welcome and reconnect;
  live kills merge through the existing `bestiary-entry-changed` push).
  Surfaces: "Today's Boost" section (`components/boosted/
  BoostedTodaySection.tsx`) in the wiki bestiary list header plus a compact
  variant in the bosstiary tab; Track/Untrack buttons in
  `BestiaryMonsterSheet`/`BosstiaryBossSheet` sending `tracker-set` (the
  boss toggle disables at 0 kills, mirroring the server rule); a docked
  kill-tracker overlay (`components/tracker/TrackerPanel.tsx` +
  `TrackerEntryRow`, rendered by `GameTrackerOverlays`, toggled from the
  nav bar, capped at 12 rendered rows per scope with a +N-more line);
  and a boss-slot section in the bosstiary tab
  (`components/bestiary/BossSlotsSection.tsx` + `BossSlotCard` +
  `BossSlotPicker`): unlock states, assigned boss with sprite/kills/loot
  bonus, inactive marker, the boosted third slot, boss points via
  `bossPointsLootBonus`, next removal price, assignment picker over
  `unlockedRaceIds`, `boss-slot-set` sends and localized
  `boss-slot-failed` errors. Boss slots load lazily on the bosstiary tab
  (`boss-slots-get`), including the item-source jump path. Files also:
  `GameClient` senders, `GameWindowSessions`/`SessionActions`/store
  fields (`trackerVisible`), locales en+pt-BR, stories
  `TrackerPanel`/`BossSlotsSection` + `trackerFixtures`. Verified: client
  typecheck, eslint 0 errors, 248 unit tests green.
- **Feature 78 — Imbuements, tiers, Exaltation Forge (client)**
  (2026-07-26): closes the client surface. `useForgeSession`/
  `useImbuementSession` over `forge-state`/`forge-result`/
  `forge-history-state`/`imbuement-window-state` and both failure
  messages. `components/forge/ForgeModal.tsx` (nav "Forge" button) with
  fusion/transfer/conversion/history tabs, a dust/sliver/core resource
  bar, and cost previews from `FORGE_TIER_PRICES`/`FORGE_RULES` matching
  `server/src/forge/ForgeService.ts` exactly (fusion cores =
  usedCore + reduceTierLoss at 1 each, success 50%+15%; transfer pays the
  receiver's resulting tier — donor tier −1, or equal under convergence —
  plus that tier's corePrice; conversions 60 dust→3 slivers, 50
  slivers→1 core, dust-limit raise at `dustLimit−75`). Result banner
  renders `forge-result` with the bonus-roll texts (1–8). Candidate
  derivation is pure display logic in `client/lib/forge/`
  (`collectFusionPairs`, `collectTransferDonors/Receivers`,
  `itemClassificationOf` parsing the server-authored "Classification: X
  Tier: Y" affix; `itemImbuementSlotCountOf` parsing "Imbuement Slots N")
  with unit tests — the server re-validates every id. Imbuements open from
  a hover badge on imbuable inventory slots (`ItemSlot.onImbue` →
  `imbuement-window-get`); `components/imbuement/ImbuementModal.tsx`
  renders occupied slots (name, time left, clear at `removeCostGold`) and
  empty-slot options grouped by category with material availability,
  price, premium badge, and `canApply` gating. Forge monster markers ship
  on both surfaces: battle-list stack badge and a `CreatureView` nameplate
  glyph (influenced diamond + stack number, fiendish star; plate-child
  test updated). Locales en+pt-BR; stories `ForgeModal`/`ImbuementModal` +
  `forgeFixtures`. Verified: client typecheck, eslint 0 errors, 248 unit
  tests green (6 new for the forge libs). Residuals → Feature 87: imbue
  badge reachable only on backpack/container slots (not the equipped
  paperdoll) and the imbuement time-left is static between window pushes.
  Accepted: fusion submits the first two carried copies of a group (no
  per-copy picker; server re-validates).

## 2026-07-26 proficiency + cyclopedia client surfaces

- **Feature 82 — Weapon proficiency + animus mastery (client)**
  (2026-07-26): the server+protocol shipped earlier the same day; this
  closes the client surface. `useProficiencySession`/`useAnimusSession`
  hold the `proficiency-state`/`animus-state` projections (branches in
  `handleProgressionCatalogMessage`, welcome/reconnect resets in
  `handleCharacterSessionMessage` + `createGameWindowStore`). The static
  perk-table asset loads through `client/lib/proficiency/`
  (`parseProficiencyCatalog` hard-validates
  `public/assets/proficiencies.json` like the wiki-item catalog;
  `useProficiencyCatalog` fetches it) and `formatProficiencyPerk` renders
  localized short labels for all 32 slug families (fraction families as
  percentages, flat families as integers, skill/bestiary interpolation)
  with a generic slug-derived fallback for unknown families.
  `components/proficiency/ProficiencyModal.tsx` (nav "Proficiency"
  button, `proficiencyOpen` store flag, `GameProficiencyOverlays`):
  tracked-weapon list (catalog name, `ProgressionBar` toward
  `nextLevelExperience`, "Mastered" badge) and a per-level radio-style
  perk grid — locked rows dimmed ("Locked", with the server's
  `nextLevelExperience` threshold shown only on the next unlockable row),
  picks kept as a local draft and submitted whole via
  `proficiency-select` (WheelModal draft-then-save UX; Revert/Apply,
  localized `proficiency-action-failed` reasons). Animus display:
  bestiary header chip (mastered count + current bonus, next to the charm
  chip) and an "Animus Mastery: +X.X% experience" line in
  `BestiaryMonsterSheet` when the sheet's race is mastered. Files also:
  `GameClient.requestProficiencies/selectProficiencyPerks`, session
  wiring (`GameWindowSessions`/`SessionActions`/controller), nav button
  (`TopNavigationBar` + `GameNavigation`), locales en+pt-BR (incl. all
  perk templates), stories `ProficiencyModal` + `proficiencyFixtures`
  (perk pick → exact `onSelect` payload, locked thresholds, mastered,
  failure, empty), unit tests for the parser and formatter. Verified:
  client typecheck, eslint 0 errors, 257 unit tests, 17 story tests for
  the new surfaces. Residuals → Feature 87 (locked-row thresholds beyond
  the next level, no mastered-race list).
- **Feature 83 — Cyclopedia character views (client)** (2026-07-26):
  closes the client surface inside the wiki modal (the wiki IS the
  Cyclopedia). `WikiTab` gains a fourth "character" tab (`WikiTabIcon`
  maps it to the existing `/assets/cyclopedia/stats/hitpoints.png`; no
  asset importers run). `components/wiki/WikiCharacter.tsx` renders six
  sub-tabs: **General** from the own-character projection with no
  round-trip (XP/magic/stamina/soul bars, skills, stat tiles with
  `BestiaryStatIcon` art, capacity from the inventory projection),
  **Combat** (server-computed grid incl. onslaught/ruse/momentum tier
  rows and absorb rows with `BestiaryResistanceIcon`, negatives red),
  **Deaths**/**PvP Kills** (paged through the modal pagination bar,
  `toLocaleString` timestamps, justified green / unjustified red),
  **Items** (carried/depot/inbox/stash sections via
  `WikiCharacterItemSection`: wiki-catalog sprite + name, ×count, "T{n}"
  tier badge), **Achievements** (read-only reuse of the profile
  projection: `AchievementList` + title list with Selected/Locked chips;
  selection stays in ProfileModal). `useCyclopediaSession` holds per-view
  state with lazy first-visit fetches and page-change fetches
  (`cyclopedia-character-get` via
  `GameClient.requestCyclopediaCharacter`; `cyclopedia-*-state` +
  `cyclopedia-action-failed` branches in
  `handleProgressionCatalogMessage`); wiki props flow through
  `GameProgressionOverlays`. Bonus: `classification` projected into the
  wiki item catalog (`tools/buildWikiItemCatalog.mjs` updated to the v3
  server catalog and re-run — 971 items gained the field, zero other
  diffs; `parseWikiItemCatalog`/`WikiItem`/`WikiItemDetails` stat row;
  builder hash added to `content/source-manifest.json` converterSources,
  `parity:check` verifier green). Locales en+pt-BR; stories
  `WikiCharacter` + `cyclopediaFixtures` and updated `WikiModal` stories
  (lazy-fetch call assertions, paging, tier badges, animus chip).
  Verified: client typecheck, eslint 0 errors, 257 unit tests, story
  tests for WikiModal/WikiCharacter/WikiItems/WikiItemDetails green.
  Residual → Feature 87 (combat view refreshes only on revisit).

## 2026-07-26 reward chests + daily rewards, podium + stat residuals, quest platform/log/catalog

- **Feature 84 — Boss reward chests + daily rewards (server+client)**
  (2026-07-26): closes the whole status row. Reward chests: per-player
  instanced bags on the item-ownership model — migration
  `060_reward_chest.sql` adds the `reward` item location (constraint
  bodies restate migration 032's current shapes; an earlier draft
  restated 015's and broke staging tests — fixed same session),
  `reward_grants` (grant-key claim = exactly-once, Canary
  reward_chest.lua score split `computeBossRewardShares`, crowd penalty
  `1/cbrt(n)`, top-scorer uniques via the previously-unread
  `MonsterLoot.unique` flag, bonus-roll count from the bosstiary slot
  bonus — new `BossSlotService.lootBonusPercentFor` — or the boosted
  +250% with probabilistic fraction, equipment-only extra passes per
  monster.lua:187-227, chance×factor×jitter(0.95–1.05) rolls). Fight
  contributions tracked in-tick by `reward/RewardBossTracker` fed from
  `DamageResolver` (boss damage taken + player-to-player heals gated on
  fight membership); `DeathHandler` fires `onRewardBossDeath` keyed by
  the death event id. `PgRewardStore` grants/loads/collects in
  SERIALIZABLE transactions (7-day expiry deleted on open + audited;
  collect moves the same rows into locked backpack slots, all-or-nothing;
  audits `boss-reward`/`reward-collect`/`reward-expired`).
  `RewardChestService` intercepts map-use of chest 19250 ahead of the
  generic container path, projects owner-only `reward-chest-state`, and
  runs collects through the chest pattern (pending-op guard,
  `applyCommittedMutation`, `trackExternalOperation`). Daily rewards:
  migration `061_daily_rewards.sql` `character_daily_rewards` row is the
  once-per-day lease; `assessDailyStreak`/`claimDailyStreak` transcribe
  daily_reward.lua streak/joker rules (monthly joker cap 3, jokers absorb
  misses one-for-one else only streak LEVEL resets — position keeps
  cycling, a pinned Canary quirk); the 7-day table and per-vocation item
  pools are verbatim in `protocol/src/dailyRewards.ts` +
  `daily/dailyRewardPools.ts`; claims validate picks against pool and
  unit allowance, grant carried items via `PgCoinOperations`, prey
  wildcards through the shipped capped `grantWildcardsQuery` + new
  `PreyService.applyWildcardBalance` refresh, and the day-7 XP boost as a
  DB deadline read by `DeathHandler` at Canary's exact stacking point
  (player.lua:548-601, after boosted/prey, before stamina/base rate).
  Reward shrines (25720-25723/25802/25803) are a new fail-closed world
  action kind `daily-shrine`. Client: `RewardChestModal` +
  `DailyRewardsModal` in `GameCommerceOverlays`, store slices, GameClient
  intents, locales en+pt-BR, stories. Also fixed the six recorded
  pre-existing `PgChestStore.integration.test.ts` failures: the store was
  always correct — the tests asserted `character_id` on container rows,
  which is NULL by schema shape. Verified: protocol/server/client
  typecheck 0 errors, 1290 server + 257 client unit tests, reward + daily
  + chest integration suites green against docker Postgres (exactly-once
  under concurrent grants/claims, double-collect conserves items,
  cross-owner isolation, wildcard cap, XP-boost stacking); migrations
  060-062 pending `yarn db:migrate`. Residuals stay in todo-10/Feature
  84: quick-loot container assignment + stash routing + imbuement astral
  stash auto-draw; accepted deviations recorded in TODO.md (items grant
  carried instead of Canary's store inbox, server-local calendar-day
  boundary instead of the 25 h server-save window, XP boost drains by
  wall clock while Canary drains hunting time only, offline participants
  collect base rolls because slot records are online-only).
- **Feature 86 — Podium unit + difficulty classification + stat
  residuals** (2026-07-26): three of the long-tail units. Imbuement
  Swiftness/Featherweight now apply: `playerImbuementEffects` folds
  `speed` (additive) and `capacityPercent` (highest equipped percent —
  Canary's single `bonusCapacity` slot is order-dependent on mixed
  tiers, player.cpp:3260-3306), `deriveCharacterStats` gained
  `capacityPercentOfBase` off the pre-bonus base, `CharacterProgression`
  an equipment modifier with change detection, `ProgressionSystem.tick`
  a cheap memoized per-tick sync, and `PgItemLocks.lockCharacter` folds
  the same percent from in-transaction equipment rows (imbuement catalog
  forwarded via `ItemStore.setImbuementCatalog`), so DB capacity checks
  cannot drift from live ones. Vibrancy's PvP-deflect leg ships exactly
  per condition.cpp:96-136: a vibrant target never receives player-cast
  paralysis, the clone lands ownerless on a non-vibrant player attacker
  (no ping-pong), and a successful removal roll now also strips running
  paralysis. Podiums (renown 35973/35974, vigour 38707, tenacity
  42367/42368): new world-action kind `podium` opens an owner-scoped
  edit window (outfit/mount entitlements via new
  `OutfitService.entitlementsFor`; vigour lists bosstiary level-2+
  bosses, tenacity completed bestiary races — protocolgame.cpp:11308);
  `podium-set` re-checks reach/house-access/revision/entitlements at
  execution and writes the attribute bag through
  `planSetPodiumMapItem` (planWriteMapItem's shape); monster looks are
  always copied server-side from the pinned type. Tile state carries a
  server-authored `display` payload; `MapView` bakes a static
  south-facing frame per outfit and draws it over the podium. Client
  `PodiumModal` + store + locales + stories. Boss/encounter difficulty
  selection is closed as **no-op upstream**: pinned Canary's
  `parseBossDifficultySelection` drains the packet and does nothing
  (protocolgame.cpp:3260-3266) — nothing to build. Verified: typechecks
  0, podium exploit tests (forged outfits/races, stale revision,
  reach/house/rate limits), vibrancy matrix, fold/derive/progression
  tests, full suites green. Residuals → Feature 87 (podium display
  renders south-facing static, no mount/lookTypeEx layer, platform-hide
  flag unrendered; map-side right-click rotate not wired) and Feature 86
  (hazard, concoctions, inert perk families, animus earn path).
- **Feature 103 — Quest state and storage platform** (2026-07-26): the
  platform exists (`server/src/quest/`). `QuestService` is the one
  gameplay storage write path: alias canonicalization (pinned map,
  identity until aliases exist at this pin), bounded int32 values,
  Canary `-1`-erases semantics now implemented in
  `Player.setStorageValue`, in-tick mutation + dirty-marked persistence,
  and a change hook for quest-log refreshes. `QuestDefinition` +
  fail-closed `loadQuestCatalog`/`loadQuestStorageAliases` mirror
  Canary's catalog.lua integrity rules (per-quest mission ids, start
  storage unique by key). `NpcDialogueExecutor` effects now route
  through the platform. Tests: round-trip/erase, canonical alias
  sharing, out-of-range rejection, no-op writes skip persistence.
- **Feature 104 — Atomic quest rewards + quest-log protocol/UI**
  (2026-07-26): quest-log evaluation is a value-for-value transcription
  of quests.lua:1005-1198 (`evaluateQuestState`: started/completed
  windows, ignoreendvalue, hideWhenNextStarted, end-storage override,
  states-by-exact-value with the clamp and Canary's literal missing-state
  fallback). `quest-log-get`/`quest-line-get` project only the owner's
  started quests/missions (rate-limited; forged quest ids refused).
  Rewards: chest loot gained atomic quest-flag transitions —
  `ChestDefinition.storageWrites` audited as the new `quest-reward`
  event (migration `062_quest_rewards.sql`) in the grant transaction and
  applied through the platform in the same resolved outcome. Client:
  `QuestLogModal` (list + mission detail) wired to the previously inert
  nav button, locales, stories. Tests: evaluation matrix, projection
  isolation, rate limits.
- **Feature 105 — Quest-content inventory + parity gate (platform
  slice)** (2026-07-26): `tools/importCanaryQuests.mjs` +
  `parseCanaryQuestCatalog.mjs` (structural Lua reader: block comments,
  \z continuations, single-quoted strings, mixed positional tables,
  keyword-balanced skipping of dynamic `function` descriptions/states)
  import the full pinned catalog: 51 quest modules, **456 missions**
  (the oft-quoted 457 includes a commented-out placeholder in
  031_tibia_tales.lua:303), 2148 Storage names + 41 GlobalStorage names,
  zero character-storage aliases at this pin, raw numeric ids resolved
  to named keys, upstream table-reference bugs carried losslessly as
  dead keys, and all 114 quest script directories inventoried as
  `pending-behavior` in `content/quests/canary-quest-import-report.json`.
  Content keys follow the dialogue convention (dotted, no `Storage.`
  root) so every consumer shares rows. `questCatalogParity.test.ts`
  pins the counts and evaluates every quest against empty storages;
  tool tests + `parity:check` green; manifest gained
  `converters.quests`, the `canaryQuestCatalog` source pin, and both
  tool hashes. The quest log now serves the real catalog end-to-end.
  Remaining (feature stays open): the 114 directories' behavior
  (storage-gated doors/tiles/chest placements, quest NPC branches,
  creature variants), dynamic mission descriptions, and the KV quest
  tracker.

### 2026-07-27 — Tibia-style windows: weapon proficiency, prey + hunting tasks (client-only)

- Problem: `ProficiencyModal` was a plain radio-row list and Prey / Hunting
  Tasks were two separate modals; none resembled the real Tibia windows.
- Proficiency window rebuilt Tibia-style: left panel with weapon name plate,
  item sprite, `x / y` XP plus "XP for next level" line, search box, and a
  tracked-weapon sprite-tile grid; right panel renders one starred column per
  perk level (square perk tiles, alternating shading, lock/level footer with
  the unlock-XP tooltip). Draft picks + Revert/Apply full-replacement send
  are unchanged. New `tools/buildProficiencySprites.mjs` derives
  proficiencyId→spriteId (398/420 profiles, lowest item id wins) from
  `server/data/item-catalog.json` into
  `client/public/assets/proficiency-sprites.json`, loaded by the new
  `useProficiencySprites` hook (sprites are decoration; "?" fallback).
  `formatProficiencyPerkValue` extracted from `formatProficiencyPerk` so
  tiles can show the big value line.
- Prey + Hunting Tasks merged into one `PreyHuntingModal` on the shared
  `Modal` tabs (Prey Creatures / Hunting Tasks) with a Tibia-style balance
  footer (gold via `countMoneyWorth(inventory)`, prey wildcards, task
  points). Slot cards restyled as Tibia columns: creature-name/state title
  bars, recessed 3×3 selection grids and big creature areas, time-left and
  kill-progress bars with centered text, `SlotActionButton` price plates,
  Auto Bonus Reroll / Lock Prey checkbox rows (unchecking sends
  `set-option none`), locked "?" recess + unlock banner. Store flags are
  unchanged — `preyWindowOpen`/`huntingTasksOpen` now drive which tab is
  shown and stay mutually exclusive via the existing nav toggles. No wire or
  protocol changes; every control still only sends intents.
- Files: `client/components/proficiency/` (ProficiencyPerkColumn,
  ProficiencyPerkTile, ProficiencyWeaponTile new; ProficiencyPerkLevelRow,
  ProficiencyWeaponListItem removed), `client/components/prey/`
  (PreyHuntingModal, SlotActionButton new; PreyModal removed; PreySlotCard
  restyled), `client/components/hunting/` (HuntingTasksModal removed;
  HuntingTaskSlotCard restyled), `GamePreyOverlays`,
  `hooks/useProficiencySprites`, `lib/proficiency/formatProficiencyPerkValue`,
  `tools/buildProficiencySprites.mjs`, locales en/pt-BR (tab/select/exhausted
  titles, XP/search strings, Tibia option wording),
  `stories/PreyHuntingModal.stories.tsx` (replaces the PreyModal and
  HuntingTasksModal stories).
- Verified: client `yarn typecheck`, `yarn lint` (only pre-existing
  warnings), `yarn test` (61 files / 257 tests) green; Storybook built and
  all proficiency/prey/hunting stories screenshotted headlessly — play
  functions (perk pick + apply payload, locked-level threshold, mastered
  weapon switch) ran without error overlays.
- Residual risk: percent perk families with whole-number values render
  inflated (e.g. "+1000% of Magic Level…") — pre-existing data/format
  mismatch, recorded in `TODO.md` under Accepted gaps (owner: Feature 86).

### 2026-07-27 — Round 2: OTClient art for prey/hunting/proficiency windows + prey option fix

- Problem: the rebuilt windows still used our design-system chrome; the user
  wants the exact Tibia layouts, and rapid clicks on the prey option
  checkboxes left them visually checked with zero wildcards (the CSS
  `peer-checked` visual follows the DOM, and a rejected intent never
  re-rendered it back).
- Server: `PreyService.setOption` already refused unfunded options at
  execution time; added the missing regression test (0 wildcards → both paid
  options refused with `insufficient-wildcards` no matter how often
  replayed; funded lock sticks; clearing to "none" needs no funds).
- Client checkbox fix: the option rows now disable when the balance cannot
  fund the option (unchecking stays allowed) and `preventDefault` on click
  keeps the DOM checkbox from ever toggling locally — the visual state is
  purely the server-pushed `slot.option`.
- OTClient art imported from the local mehah/otclient checkout (NOT the
  pinned opentibiabr repo, which has no proficiency module):
  `data/images/game/prey/*` → `client/public/assets/ui/prey/` and
  `modules/game_proficiency/images/*` → `client/public/assets/ui/proficiency/`.
  New `PixelImage` UI component draws scaled, clipped sheet regions.
- Prey/Hunting cards rebuilt to prey.otui geometry at 1.5× zoom: creature
  box + big bonus flag with star rows, gold time/kill bars with centered
  text, reroll/select/bonus-reroll/checkmark card buttons with price plates
  (free-reroll countdown strip, struck gold price when free), Tibia's
  select-then-confirm grid flow (local pick + checkmark card sends the
  intent), hunting-task Amount radios (standard vs. bestiary-gated upgraded
  goal), hourglass exhaust art, locked "?" + blue unlock banner, balance
  footer with gold/wildcard icons, tab icons. New components:
  PreyActionCard, PreyCostPlate, PreyBonusFlag, preyUiScale.
- Proficiency window rebuilt to proficiency.otui at 1.25×: mastery emblem
  (icon-masterylevel-N + gold/silver overlay) behind the weapon sprite,
  per-level star-progress headers, whole-table XP bar, 108×354 XP-filling
  perk columns, 80px perk tiles with the real weapon-mastery icon sheets
  (perk-type → sheet/cell map from const.lua in
  `getProficiencyPerkIcon.ts`, augment badges, grey rows + lock when
  sealed), per-column detail footers, item boxes with tiny mastery stars.
  Per-level XP percents recover the weapon's XP family by matching the
  server-sent next threshold against PROFICIENCY_RULES
  (`getProficiencyLevelPercents.ts`); the server stays authoritative on
  unlocks.
- Verified: client typecheck/lint/tests green (61 files / 257 tests), server
  prey tests green (11), Storybook built and all stories screenshotted
  headlessly against the user's reference captures.
- Residual: no hunting-task flag art in the set (task cards fly the "?"
  no-bonus flag); elemental perk families carry no `element` field at this
  pin so their icons fall back to the sheet's first cell; three perk
  families (`armor-penetration`, alpha/omega strike) are mapped past
  icons-0's edge upstream and fall back to the attack icon. Recorded in
  `TODO.md`.

### 2026-07-27 — Round 3: full-width proficiency table + palette re-skin

- The proficiency table now always draws seven columns like Tibia
  (`Math.max(7, levels.length)`); weapons with shorter perk tables (most:
  158 have 5 levels, 116 have 4, 46 have 3) leave the trailing columns
  empty with lock footers. Story fixture gained the three-level "Crude
  Umbral 1H Club" (id 101) to keep this visible.
- The OTClient grey/teal panel backgrounds clashed with the game design, so
  the chrome was re-skinned with the design tokens while keeping all icon/
  flag/card art: star strips, the whole-table XP bar, and the per-column XP
  fill now use black recesses with `ui-gold-deep` fills; detail cells use
  the standard recess; prey/task time and kill bars dropped the hardcoded
  #C28400/#262626 for tokens; the locked-slot unlock banner went from Tibia
  blue to the gold-deep banner. The unused bonus-select/star-progress/
  progress-bg images were removed from the copied asset set.
- Verified: typecheck/lint/tests green; storybook screenshots re-taken for
  both windows (7-level sword, 3-level club, prey + task tabs).

### 2026-07-27 — Conservation sweep false positive: deleted characters' ledger rows

- Problem: the live server alerted `currency conservation drift detected`
  with `bankLedgerBreaks: 7` but zero drift/orphans/coin delta. All seven
  "breaks" were `bank_ledger` rows whose `character_id` the
  `ON DELETE SET NULL` FK had nulled when their characters were deleted;
  `PARTITION BY character_id` puts every NULL in one window partition, so
  the chain check interleaved unrelated deleted characters' histories and
  compared balances across them. No money moved wrongly.
- Change: `bankLedgerBreakQuery` now excludes NULL-`character_id` rows
  (their per-character chain is unrecoverable), with a comment on why.
- Files: `server/src/economy/sql/bankLedgerBreakQuery.ts`,
  `server/src/economy/CurrencyReconciler.integration.test.ts` (new
  regression: two characters bank identical amounts, both deleted, sweep
  must stay balanced — fails against the old query).
- Verified: reconciler integration suite green (7 tests); the new test
  reproduces the 7-break false positive when the fix is reverted.
- Residual: forged NULL-character ledger rows are now invisible to the
  chain check; attribution loss on deletion recorded under Feature 96
  (todo-12) with the durable fix (non-FK character-id copy or soft
  delete).

## 2026-07-28 character sex + full Canary outfit/mount catalog (Features 70, 71)

- **Problem**: three defects in the shipped outfit/mount surfaces. (1) A
  character had no sex — creation offered "citizen male / citizen female" as a
  look type, and every character was granted both citizen outfits, so the
  wardrobe was sex-blind. (2) The catalog was 14 hand-written outfits and 10
  hand-written mounts instead of Canary's, and starters were the two citizens
  only. (3) Addons were selectable and previewed correctly in the outfit
  window but never drew on the character: every world/portrait bake path drew
  pattern-Y 0 only, so a confirmed addon selection was invisible everywhere
  except the modal preview.
- **Change**:
  - `tools/importCanaryOutfits.mjs` (`yarn outfits:import`) generates
    `server/src/outfit/outfitCatalogData.ts` from Canary `data/XML/outfits.xml`
    + `mounts.xml`, cross-checked against `client/public/assets/objects.json`:
    252 outfits (24 of them starters — Canary's `unlocked="yes"`, 12 per sex)
    and 236 mounts, each carrying sex, premium flag, and the addon-pass count
    the sprite pack actually has (`py - 1`). Entries whose look type is missing
    from the sprite pack are skipped rather than shipped as a client crash.
    `OUTFIT_LIMITS` raised 200 → 400 for both lists.
  - `characters.sex` (migration `063_character_sex.sql`, Canary PlayerSex_t:
    0 female / 1 male) is chosen once at creation and never changes. Existing
    characters become male and any female citizen look type is remapped to the
    male one. The create intent now carries `sex` instead of a look type
    (`createCharacterInputSchema`, `characterCreationOptionsSchema.sexes`), and
    the server derives the starter look type from it.
  - `OutfitService` back-fills only the starter outfits of the character's sex,
    refuses a selection whose look type belongs to the other sex before the
    store is asked, and drops wrong-sex rows from `entitlementsFor`, so a
    stale or hand-written grant is neither listed nor selectable.
  - Addon compositing: new `client/lib/render/addonPatternYs.ts` is the one
    place that decides which pattern-Y passes to draw, used by the new
    `AssetStore.cachedOutfitFrameTexture` (world creatures),
    `getOutfitPortraitCanvas`, `getOutfitAnimationFrames` (podium/bestiary),
    and `getOutfitPreviewCanvas`.
  - Outfit and podium windows now have a fixed-height preview stage and clamp
    the baked canvas into it, so picking a mount no longer resizes the window.
  - `tools/grantAllOutfits.mjs` (`yarn character:grant-outfits "<name>"`)
    grants every outfit of the character's sex with all sprite-supported
    addons plus every mount, in one transaction, merging addon bits like
    `PgOutfitStore` does.
- **Files**: `tools/importCanaryOutfits.mjs`, `tools/grantAllOutfits.mjs`(+test),
  `server/db/migrations/063_character_sex.sql`,
  `server/src/outfit/{outfitCatalog.ts,outfitCatalogData.ts,OutfitService.ts}`,
  `server/src/character/{Character.ts,CharacterRow.ts,CharacterService.ts,
  toCharacter.ts,sexFromCode.ts,sexToCode.ts,PgCharacterStore.ts,sql/*}`,
  `server/src/{Player.ts,CharacterHandler.ts}`, `protocol/src/{character.ts,
  outfit.ts}`, `client/lib/render/{addonPatternYs.ts,AssetStore.ts,
  CreatureView.ts,getOutfitPortraitCanvas.ts,getOutfitAnimationFrames.ts,
  getOutfitPreviewCanvas.ts}`, `client/components/{characters/
  CreateCharacterForm.tsx,outfit/{OutfitModal.tsx,OutfitPreview.tsx},
  podium/PodiumModal.tsx}`, `client/locales/{en,pt-BR}.json`,
  `client/ASSETS.md`.
- **Verified**: `yarn typecheck`, full server suite (1300 passed), client suite
  (257 passed), `yarn test:tools`; new `OutfitService` regression test proves a
  granted wrong-sex row is refused and unlisted. The addon render fix is
  test-blind (canvas compositing) — worth a visual pass on first run.
- **Residual**: premium outfits/mounts are granted without a premium check
  (recorded in TODO.md); addon *unlock sources* (quests/store) still ride with
  Features 43/67; `character_outfits` rows written before the sex column are
  left in place and simply filtered out.

## 2026-07-28 outfit window: sprite grid instead of name lists (Feature 70)

- **Problem**: the outfit and podium windows picked outfits and mounts from
  scrolling lists of *names* — nothing like Tibia's "Customise Character"
  window, and unusable once the catalog grew past a dozen entries. Confirming
  a look also left the window open.
- **Change**: both windows now show a two-column scrollable grid of sprite
  thumbnails with the name under each (`OutfitPickerGrid` +
  `OutfitPickerCell`, thumbnails via `OutfitPortrait`'s new `fit` prop, which
  mirrors `AnimatedOutfit`'s). The outfit window gained Tibia's
  Outfits/Mounts tab pair and a name search box; "No mount" became a `Mount`
  checkbox that remembers the last mount instead of a list row. Thumbnails
  bake with the colours the window opened with — following the live palette
  would re-bake one canvas per entitled outfit on every click. Confirm now
  closes the window once the request is actually sent (a send that never left
  keeps it open).
- **Files**: `client/components/outfit/{OutfitModal.tsx,OutfitPickerGrid.tsx,
  OutfitPickerCell.tsx}`, `client/components/podium/PodiumModal.tsx`,
  `client/components/characters/OutfitPortrait.tsx`,
  `client/components/game-window/GameProgressionOverlays.tsx`,
  `client/locales/{en,pt-BR}.json` (`outfit.search`, `searchPlaceholder`,
  `mountToggle`; dropped the dead `starterOnly` hint),
  `client/stories/OutfitModal.stories.tsx`.
- **Verified**: client typecheck + lint clean, 257 unit tests, Storybook
  browser lane green for both modals, and a headless screenshot of the
  outfits and mounts tabs confirms thumbnails, selection highlight, and
  layout render correctly.

## 2026-07-28 game menu: Change Character returns to the character list

- **Problem**: the game menu's "Change Character" button had been rendered
  permanently disabled since it shipped — `GameSettingsOverlay` never passed
  `onChangeCharacter`, so the only way off a character was a full account
  logout through Supabase and a fresh sign-in.
- **Change**: the overlay now passes `onChangeCharacter={() => reconnect(null)}`.
  `reconnect` already resets every session slice plus `ownCharacter` /
  `characters` / `gameMenuOpen` and bumps `connectionAttempt`, so the
  connection effect flushes pending saves, drops the socket, destroys the
  renderer and rebuilds both; the fresh `auth` → `auth-ok` → `list-characters`
  round-trip lands on the character-select modal with `resumeCharacterIdRef`
  null (no auto re-entry). No new packet and no server change: the leave runs
  through the existing disconnect path (`GameServer.processDisconnects` →
  `leaveWorld`, or the combat-lock linger window), and re-selecting the same
  character reclaims the lingering entity with its locks intact.
- **Files**: `client/components/game-window/GameSettingsOverlay.tsx`.
- **Verified**: client `yarn typecheck` and `yarn lint` clean (only
  pre-existing warnings elsewhere). No unit test — the client suite covers
  pure `lib/` modules only, and this is prop wiring onto an already-tested
  store action (the same one the reconnect banner uses).
- **Residual**: no dedicated leave-world intent, so a change-character during
  a fight parks the character in the linger window instead of refusing with
  Tibia's "you may not logout during a fight" (recorded in TODO.md).

## 2026-07-28 action bot: rules own their action, decoupled from the action bar

- **Problem**: an action bot rule pointed at an action bar slot
  (`rule.slotIndex`). Automating a spell meant first parking it on a bar
  button, the 12 rules competed with the 18 buttons for space, and
  rearranging or clearing the bar silently rewrote or deleted rules
  (`removeInvalidActionBotRules`).
- **Change**: `actionBotRuleSchema` now carries `action:
  actionBotActionSchema` (the spell/item halves of the bar action union —
  text actions are excluded, the bot never speaks). Any spell of the
  character's vocation and any carried object can be automated without
  touching the bar. Because a rule's action is a full action, the worst-case
  `update-action-bar` message no longer fit the 16 KB transport cap, so bot
  settings travel in their own `update-action-bot` intent (server confirms
  with `action-bot-updated`, errors `action-bot-invalid` /
  `-update-failed` / `-update-pending`, own `Session.actionBotUpdatePending`
  and own debounced client save timer). The bar and the bot now persist
  through separate store methods (`updateActionBar` / `updateActionBot`,
  columns `action_bar` and `potion_action_bar`).
  Server-side, `Combat` lost its slot-indexed helpers: `activateAction`,
  `actionCooldown`, `deactivateAction`, and `actionTemporarilyBlockedByItems`
  all take an action, and the bar path resolves its slot once per tick before
  calling them. `ActionBotHandler` validates each rule action on its own
  terms via the extracted `sanitizeActionBarAction` (vocation-owned spell,
  real item type, equip only on equipment) — a rule never inherits legitimacy
  from a bar button. `parseActionBotSettings` gained a migration step that
  resolves persisted `slotIndex` rules against the loaded bar once at login
  and drops rules whose slot was empty.
- **Files**: `protocol/src/{actionBar,clientMessages,serverMessages}.ts`,
  `server/src/{ActionBarHandler,ActionBotHandler,sanitizeActionBarAction,
  Session,CharacterHandler,GameServer}.ts`,
  `server/src/combat/{Combat,ActionBot}.ts`,
  `server/src/character/{parseActionBotSettings,CharacterStore,
  PgCharacterStore}.ts`, `server/src/test/InMemoryCharacterStore.ts`,
  `client/components/action-bar/{ActionBotSettingsPanel,ActionBotRuleRow,
  ActionBarModal,ActionBarSpellPicker}.tsx`,
  `client/lib/action-bar/{createActionBotAction,createSpellAction,
  getActionBotActionValue}.ts` (deleted `removeInvalidActionBotRules.ts`),
  `client/lib/net/GameClient.ts`, `client/lib/game-window/flushPendingSaves.ts`,
  `client/components/game-window/{GameActionBarOverlays,GameHudOverlay}.tsx`,
  `client/components/game-window/{store/createGameWindowStore,
  controllers/handleGameClientStatus,messages/handlePlayerStateMessage,
  types/GameWindowRuntime}.ts`, `client/locales/{en,pt-BR}.json`.
- **Verified**: server `yarn typecheck` + 1308 tests (new
  `ActionBotHandler.test.ts` covers vocation/item/dup-id rejection, pending
  guard, storage-failure rollback; `parseActionBotSettings.test.ts` covers the
  slot→action migration; `ActionBotIntentSchemas.test.ts` now asserts both
  messages' worst case fits `maxMessageBytes`). Client `yarn typecheck`,
  `yarn lint`, 260 unit tests including a new `createActionBotAction.test.ts`.
  Not exercised against a live server.
- **Follow-up (same day)**: the rule's Action dropdown shipped with disabled
  `<option>` separators as group headings, which tripped the `has-disabled:
  pointer-events-none` wrapper on `components/ui/Dropdown.tsx` and made the
  whole control unclickable — every new rule was stuck on its default spell.
  `Dropdown` gained an optional `group` field rendering real `<optgroup>`s and
  the rule row uses that. Never pass a disabled option to that component.
- **Follow-up 2 (same day)**: the rule action picker became a new
  `components/ui/DropUp.tsx` — a viewport-positioned popover that opens
  *upwards* (so the modal's `overflow-hidden` and the panel's scroll container
  never clip it), listing every castable spell and carried object with its
  sprite/spell icon, words and mana cost, grouped headings, and a filter box
  (Enter picks the first match, Escape closes, outside click closes). The
  row's separate icon preview was dropped — the trigger shows it. Stories:
  `DropUp.stories.tsx` and `ActionBarModal`'s `ActionBot` story, both with
  play functions; the Storybook browser lane passes.
- **Residual**: a rule may name an object the character is not carrying; the
  picker keeps it selectable and the rule simply no-ops until the object is
  back in the inventory. The old `slotIndex` shape is migrated at load but
  only rewritten to the database on the next bot save.

## 2026-07-29 — Map input routing, minimap follow lock, spell teachers, status bar

- **Problem**: (1) right-clicking anywhere over the HUD — the inventory panel
  in particular — ran the map's secondary action on the tile *underneath* the
  panel, so an inventory right-click walked the character across the screen;
  (2) right-click also auto-walked to whatever it was pointed at (walk-then-use),
  which the player wanted reserved for left-click; (3) the minimap detached
  from the character the moment it was panned, with only a conditional
  re-center button to get back; (4) Elane, the spell teacher standing next to
  the Thais depot, could not sell any spell; (5) the condition bar showed bare
  icons, so a player could not tell haste from regeneration without hovering.
- **What changed**:
  - `WorldRenderer` now records whether a secondary press started on the map
    canvas (`secondaryPressOnCanvas`, set on the canvas-scoped `mousedown`) and
    the window-level `mouseup` only resolves a right-click when it did. The
    window listener still exists so a drag released off-canvas resolves; it no
    longer acts on presses that belong to a HUD panel. React's
    `stopPropagation` cannot help here — the listener is on `window`, outside
    the React root's propagation path.
  - `performSecondaryMapAction` calls `actions.useMap(tile)` directly instead
    of `useMapWithReach(...)`. Walking is now left-click only: `onMapClick`
    auto-walk plus the walk-then-use reach scheduler, which is reachable only
    from left-button double-click (use) and shift+double-click (pickup).
  - `MinimapPanel` derives `locked` from "no pan center and no view floor" and
    renders an always-visible padlock toggle where the conditional re-center
    button used to be: closed gold padlock = the view follows the character,
    open padlock = frozen where it sits. Locking clears the pan/floor
    overrides; unlocking pins the current center and floor. Panning or a floor
    change still detaches, which now simply reads as "unlocked".
  - `content/npcs/canary-dialogues.json` no longer overrides `elane`. The
    reviewed document replaces an imported graph wholesale, and the
    hand-written three-node Elane (greeting + trade + job) deleted the 68
    imported nodes carrying her twelve `learn-spell` offers. The imported graph
    already contains the same `trade` → `shop: elane` node, so the override was
    pure loss. `loadNpcDialogueGraphs` now refuses any later document that
    lowers the count of an action kind an earlier document defined, so this
    class of silent deletion fails the boot instead of the player.
  - `ConditionBar` chips are icon + localized name (+ `×n` for stacks) instead
    of icon-only; the seconds-remaining tooltip is unchanged.
- **Files**: `client/lib/render/WorldRenderer.ts`,
  `client/components/minimap/MinimapPanel.tsx`,
  `client/components/combat/ConditionBar.tsx`, `client/locales/{en,pt-BR}.json`
  (`hud.minimap.lock`/`unlock` replace `recenter`),
  `server/src/npc/loadNpcDialogueGraphs.ts`,
  `server/src/npc/spellTeacherContent.test.ts` (new),
  `content/npcs/canary-dialogues.json`.
- **Verified**: client `yarn typecheck` + `eslint`, the Storybook browser lane
  for `MinimapPanel` and `ConditionBar`, and headless screenshots of both
  (locked and after a pan). Server `yarn typecheck` and `yarn vitest run
  src/npc src/spawn` (105 passed): the new content test asserts 49 teachers
  keep their offers, walks Elane's root → "light healing" → "yes" to the
  `learn-spell` action, and checks the loader rejects an action-dropping
  override. The NPC purchase path itself was re-walked offline against the real
  imported Muriel graph (greet → choice → Yes reaches `SpellTeacherService`
  with a committed store); no live server run — Docker/Postgres is not
  available in this environment.
- **Residual risk**: whether Elane was the NPC the player tried is unconfirmed;
  the other 48 teachers were already wired. Known content and gameplay gaps
  from this pass are recorded in `TODO.md`.

### 2026-07-29 — Mantus Store rebuilt on Canary's game store (Feature 43)

- **Problem**: the store sold two hand-written categories (premium time and
  four odd items) through a protocol that carried a whole flat catalog in one
  message. Feature 43's backlog owed catalog breadth, a load-time catalog
  gate, and outfit/mount/prey unlock sources; nothing turned coins into
  anything a player actually wanted. Separately, nothing told a player what
  their experience rate currently was.
- **Changed**:
  - **Catalog import.** `tools/parseCanaryStoreCatalog.mjs` reads Canary's
    `gamestore/catalog/*.lua` offline (no Lua executed; local string constants
    and `string.format` resolved, anything else reported unresolved), and
    `tools/importCanaryStoreCatalog.mjs` maps it onto grants this server can
    perform: 13 categories, 279 products, 294 offers. An offer survives only
    if its item exists in the pinned catalog and is pickupable, its look types
    are a real male/female pair, its mount id exists. Canary's own catalog bug
    — the Trophy Hunter offer naming Lupine Warden's look types — is corrected
    against `outfits.xml` and reported. Blessings, hirelings, charm expansion,
    instant reward access, house kits and tournament are skipped by design.
  - **Protocol reshaped to the official store's layout**: a category tree,
    *products* carrying priced *sub-offers* ("Great Health Potion" → 100x/250x),
    paged category requests (26/page — the mount category alone is 140
    products and would blow `maxMessageBytes`), and descriptions fetched per
    selection rather than shipped with every page. `disabled` + a reason are
    computed server-side, Canary's `canBuyOffer` equivalent.
  - **Delivery.** `PgMantusStore.purchase` takes an offer *id* and reads price,
    product and grant from the server's own catalog. One SERIALIZABLE
    transaction locks the account and the character, runs the product's leg
    (`server/src/store/delivery/`: premium, outfit/addon, mount, inbox
    item/stackable/charges with stack splitting, prey wildcards, prey and
    hunting slot unlocks, XP boost, sex change, name change), writes the coin
    ledger row and the audit row, and commits all of it or none. The XP boost's
    price escalates on Canary's curve from a locked per-day counter, so the
    charged price is never the displayed one.
  - **XP boost made real**: it extends the same
    `character_daily_rewards.xp_boost_until_ms` the kill-experience path
    already reads, applied live through `DailyRewardService`, so no relog and
    no second timer.
  - **XP gain rate in character details**, Tibia-style: base staged rate, XP
    boost with its countdown, stamina multiplier, and the composed total,
    computed server-side by `getExperienceRate`.
  - **Client** rebuilt to the official layout (category tree / product list /
    detail pane / coin bar), using OTClient's own art:
    `tools/importOtclientStoreAssets.mjs` slices `store-icons-inline.png` into
    the 15 description-tag icons and copies the Home and star icons, and
    descriptions render `{character}`/`{storeinbox}`/`{speedboost}` lines with
    those icons and Canary's captions. Categories borrow a product's icon
    (item sprite, look type, mount) because OTClient downloads CipSoft's
    category pack rather than bundling it.
  - **Operator tool**: `yarn coins:grant "Name" --mantus N --gold N` credits
    Mantus Coins and bank gold in one transaction with both ledgers and audit
    rows, idempotent per `--key`.
  - **Boot gate**: `assertStoreCatalog` refuses to start on a catalog this
    server could not deliver — the gap Feature 43's backlog named.
- **Files**: `protocol/src/store.ts`, `protocol/src/progression.ts`,
  `server/db/migrations/064_store_catalog.sql`, `server/src/store/**` (catalog,
  availability, delivery legs, SQL), `server/src/progression/getExperienceRate.ts`,
  `server/src/daily/DailyRewardService.ts`, `server/src/prey/PreyService.ts`,
  `server/src/huntingTasks/HuntingTaskService.ts`,
  `server/src/outfit/OutfitService.ts`, `server/src/GameServer.ts`,
  `server/src/Player.ts`, `client/components/store/**`,
  `client/components/wiki/XpGainRatePanel.tsx`,
  `client/lib/store/parseStoreDescription.ts`, `client/locales/{en,pt-BR}.json`,
  `tools/{parseCanaryStoreCatalog,importCanaryStoreCatalog,importOtclientStoreAssets,grantCoins}.mjs`.
- **Verified**: `yarn typecheck` clean; `yarn test` 1323 passed; client unit
  266 passed; `node --test tools/*.test.mjs` 88 passed; the Storybook browser
  lane for `StoreModal` (6 interaction tests, including the name-change prompt
  and an owned-mount refusal) plus headless screenshots of the home and paged
  views and a console sweep of four stories asserting no DOM-nesting or
  hydration errors. The boot gate was run against the real item catalog — it
  caught the duplicate-offer bug above before this landed. The browser lane
  also caught two real defects during the pass: price buttons nested inside a
  `role="button"` row (invalid ARIA, and it swallowed the clicks), and a
  category heading rendered as a `<p>` containing the icon's `<div>`s (a
  hydration error). Both fixed.
- **Layout follow-ups** (same day): pages hold 12 products so a page fits the
  list without an endless inner scroll, the pager shows whenever a category is
  open, rows were compacted to the official store's icon-left/name-and-prices
  -right shape, the modal body is height-bounded (`min-h-0` on the grid item —
  without it the list grows past the row and pushes the pager and coin bar off
  screen), and offer descriptions render at `text-sm`.
- **Residual risk**: **the 20 `PgMantusStore` integration tests did not run** —
  no Postgres is reachable in this environment (Docker is unavailable from this
  WSL distro), so every delivery leg's transaction, concurrency and rollback
  behaviour is asserted only by the tests as written, not by execution. They
  must be run before this is trusted. Remaining gaps are in `TODO.md`.

---

## Exercise-weapon training + animated item icons (2026-07-29, Feature 72 slice)

- **Problem**: exercise weapons did nothing. Right-clicking one tried to equip
  it instead of raising the use-with crosshair, no handler ever consumed the
  intent, and the item icons sat frozen on their first sprite even though the
  DAT gives them five phases. The same freeze hit every animated item —
  supreme/ultimate potions and health/mana kegs (12 phases each), water, fires.
  The store's `{character}`/`{storeinbox}` description icons also tripped
  Next's aspect-ratio warning on every offer.
- **What changed**:
  - `server/src/action/ExerciseTrainingHandler.ts` ports Canary's
    `exercise_training_weapons.lua`: use-with on a dummy starts a scheduled
    loop that re-validates the dummy, the protection zone, and the carried
    weapon *on the tick that awards*, spends one charge atomically, then awards
    skill tries or mana spent from `computeExerciseTrainingGain` and draws
    CONST_ME_HITAREA on the dummy plus the weapon's distance missile. Interval
    is `exerciseTrainingIntervalMs(attackSpeedMs, rates.exerciseTraining)`.
    Start is gated on Canary's 10s exhaustion and its per-house-dummy cap.
  - Weapon and dummy tables transcribed to
    `server/src/action/getExerciseWeaponDefinition.ts` (all four charge tiers
    per weapon) and `getExerciseDummyRate.ts` (rate 100 free / 110 house).
  - New atomic charge spend: `ItemStore.consumeCharge` →
    `PgItemUseOps.consumeCharge` (locks character + row, reads charges under
    the lock, decrements, and on the last charge deletes the row and writes an
    `item-destroyed` audit in the same transaction) + the memory-store twin +
    `ItemIntentHandler.consumeCharge`. `server/src/item/chargesOf.ts` falls
    back to the catalog's charge count for items minted before the attribute.
  - `projectItem` gives exercise weapons `useKind: "useWith"`, so the existing
    client crosshair flow works with no client change.
  - Exercise dummies were invisible to the server: bolted-down scenery is
    neither movable nor pickupable, so the converter classified it as static
    client art and never emitted it. `"dummy"` joined `MUTABLE_TYPES` in
    `getMapItemSemantics` (an *interactive* classification is not enough —
    `loadMapItems` only surfaces mutable entries), and the map was reconverted:
    96,632 → 96,646 world items, and all 14 dummies now resolve through
    `World.getMapItems` on protection-zone tiles.
  - `tools/buildItemAnimations.mjs` emits
    `client/public/assets/item-animations.json` (2,017 sequences, 37 ambiguous
    first sprites dropped), and `itemSpriteAnimationStore` +
    `useAnimatedSpriteId` drive `SpriteIcon` off one shared clock that only
    wakes the icons that actually animate. Every DOM item icon — inventory,
    store, shop, depot, forge, wiki, action bar — now animates.
  - Frame duration moved into `client/lib/render/LEGACY_FRAME_DURATION_MS.ts`
    at 100ms and shared with `AssetStore`'s synthesized legacy animation
    (was 500ms, which read as slow motion; the ripped legacy DAT carries no
    per-phase timings, and parsing it with `--enhanced-animations` fails, so
    a fallback is all there is).
  - `StoreDescription` icons get `self-start`; Tailwind's preflight leaves
    images at `height: auto`, so the flex row was stretching them and Next
    saw a changed height with an unchanged width.
- **Files touched**: `server/src/action/{ExerciseTrainingHandler,
  getExerciseWeaponDefinition,getExerciseDummyRate}.ts`,
  `server/src/item/{chargesOf,ItemStore,PgItemStore,PgItemUseOps,
  MemoryItemStore,ItemIntentHandler,projectItem}.ts`,
  `server/src/item/sql/consumeChargeUpdate.ts`, `server/src/GameServer.ts`,
  `tools/{getMapItemSemantics,buildItemAnimations}.mjs`,
  `client/lib/render/{itemSpriteAnimationStore,useAnimatedSpriteId,
  LEGACY_FRAME_DURATION_MS,AssetStore}.ts`,
  `client/components/inventory/SpriteIcon.tsx`,
  `client/components/store/StoreDescription.tsx`, `package.json`,
  regenerated map + minimap + `client/public/assets/item-animations.json`.
- **Upgrade note**: reconverting the map bumps
  `mapVersion = sha256(mapSha256:itemsSha256)`, so any database holding
  persisted world-item delta rows refuses the boot gate with "persisted world
  items require reconciliation for this map version". Run
  `yarn workspace server db:reconcile-world-seed` with the server down. Done
  here: 7 stale rows (levers/doors, all still seeded and in place, no
  children) deleted in one serializable transaction with 7 `item-destroyed`
  audit rows; those world items revert to their seeded state.
- **Verified**: the four Thais/Carlin/Port Hope dummies resolve through
  `World.getMapItems` against the real reconverted map, on protection-zone
  tiles, at rate 100. `yarn workspace server test` 1331 passed (8 new
  `ExerciseTrainingHandler` tests covering the one-charge-per-interval rule,
  the PZ drop-out, out-of-reach melee, ranged rod training, and weapon
  destruction on the last charge); client unit 271 passed (5 new
  `itemSpriteAnimationStore` tests); both typechecks clean; client lint clean;
  `node --test tools/getMapItemSemantics.test.mjs` passed.
- **Residual risk**: the charge-spend path is covered by the memory store
  only — `PgItemUseOps.consumeCharge` has no integration test and no Postgres
  is reachable here, so its transaction and last-charge deletion are asserted
  by reading, not by execution. Canary's house-membership check for house
  dummies is not implemented (only the per-dummy trainer cap); recorded
  against Feature 72.

---

## Item animations run on Tibia's own phase timings (2026-07-29, Feature 72 slice)

- **Problem**: every animated item and effect played at one invented rate. The
  legacy 15.11 `Tibia.dat` we render from stores a phase count and no timings
  (parsing it with `--enhanced-animations` fails), so `AssetStore` synthesised
  a flat schedule — 500ms per phase originally, dropped to 100ms because 500
  read as slow motion. Neither is what Tibia plays: measured against Canary's
  protobuf `data/items/appearances.dat`, the flat 100ms was **faster** than the
  real schedule for 3,483 of 4,994 animated appearances and slower for 131, and
  it flattened the shape that makes Tibia's animations read correctly — a long
  idle frame followed by a fast glint (924 items vary their duration per phase;
  the durable exercise bow is `500,100,100,100`). Ping-pong and play-once loop
  types were lost the same way, and `getItemAnimationTimeline` still carried a
  private 500ms fallback that never got the 100ms update.
- **What changed**:
  - `tools/importAppearanceAnimations.mjs` walks the pinned protobuf
    (hash-checked against `content/source-manifest.json`) and emits
    `client/public/assets/appearance-animations.json`: per-phase min/max
    durations, `synchronized`, start phase and loop type for **4,887 items and
    198 effects** — every animated appearance the DAT agrees with. 107 items
    and 41 effects whose protobuf phase count disagrees with the DAT are
    skipped, so nothing can animate on another object's clock.
  - `AssetStore` decodes that table (`decodeAppearanceAnimation.ts`) into the
    `TibiaAnimation` the renderer already consumed, keeping the flat fallback
    only for objects neither source describes. Water is 200ms synchronized
    again, `CombatEffectRenderer` picks up real effect timings (many are
    40–80ms, not 100), and `getItemAnimationTimeline` now shares
    `LEGACY_FRAME_DURATION_MS` instead of its own 500.
  - `tools/buildItemAnimations.mjs` folds the same schedules into the DOM icon
    table (`item-animations.json`, now formatVersion 2: `{f, d}` per sequence,
    1,598 of 2,012 on a non-default schedule). Ping-pong sequences are expanded
    into the order they play and 0ms terminal phases dropped, since an icon
    loops forever.
  - `itemSpriteAnimationStore` replaced its single global `setInterval` with a
    time-based clock: it resolves each mounted icon's frame from elapsed time
    (`resolveSpriteFrame.ts`) and sleeps until the *next frame boundary of a
    mounted icon*, so a 2s idle phase costs one wake, not twenty, and only
    icons whose frame actually changed re-render.
  - `yarn animations:import <canary-checkout|appearances.dat>` documented in
    `map/README.md` alongside `yarn items:animations`.
- **Files touched**: `tools/{importAppearanceAnimations,buildItemAnimations}.mjs`,
  `client/lib/render/{AssetStore,decodeAppearanceAnimation,resolveSpriteFrame,
  itemSpriteAnimationStore,getItemAnimationTimeline,LEGACY_FRAME_DURATION_MS}.ts`,
  `client/public/assets/{appearance-animations,item-animations}.json`,
  `package.json`, `map/README.md`, `TODO.md`.
- **Verified**: `yarn animations:import` reproduces the pinned
  `aa44a154…` hash and covers 4,887/4,887 animated items and 198/198 animated
  effects; spot-checked against the real client's values (water 622/629/4597 =
  200ms synchronized, exercise club = 100ms, durable exercise bow =
  500/100/100/100 ping-pong-free, arcanomancer folio = 50ms). Client unit 275
  passed (4 new: per-phase schedules, sleep-until-boundary, and
  `decodeAppearanceAnimation`); client typecheck and lint clean.
- **Residual risk**: outfits are untouched — their protobuf appearances split
  into idle/walking frame groups whose phase counts do not match the legacy
  DAT's single group, so 261 of 275 were rejected by the phase-count guard;
  recorded in `TODO.md`. Timing is decoration only: a missing or stale
  `appearance-animations.json` degrades to the flat fallback rather than
  failing the catalog load, which means an asset re-rip that changes phase
  counts silently loses schedules until the table is rebuilt.

## 2026-07-29 — Item-animation verification + client-id icon keying (Feature 43 / client)

- **Problem**: "Item animations are not working" was reported after the
  animation-schedule work landed. End-to-end verification did not exist, and
  the DOM icon table was keyed by first sprite id, dropping 39 ambiguous
  appearances (dolls, adamant shield, love elixir, magic hat) and forcing
  every icon surface to hope its sprite id was unambiguous.
- **What changed**:
  - Reproduced the report in a real browser against a real server and proved
    the pipeline works: two new e2e lanes. `itemIconAnimation.e2e.test.tsx`
    mounts the real `SpriteIcon` against the real
    `/assets/item-animations.json` (runs in the default e2e lane);
    `itemAnimationWorld.e2e.test.tsx` mounts the full `GameWindow` against a
    new memory-backed probe server
    (`server/src/playtest/itemAnimationProbeServer.ts`, port 4126, no
    Postgres — `yarn workspace server playtest:animation-probe:server`),
    asserts the equipped exercise sword's paperdoll icon cycles atlas cells
    and that the Thais-temple world canvas repaints thousands of pixels
    (animated wall torches) while standing still, via WebGL readback. It
    skips itself unless `VITE_PLAYTEST_WS_URL` points at :4126.
  - `item-animations.json` (formatVersion 3) is keyed by client id with the
    first-frame sprite alongside (`{b, f, d}`), emitting 2,695 sequences with
    zero ambiguity drops. `itemSpriteAnimationStore` resolves a `{clientId,
    spriteId}` key — client id authoritative, bare sprite id falls back to
    the old unambiguous-only index — and `SpriteIcon` takes an optional
    `clientId`, threaded through inventory/paperdoll, drag ghosts, action
    bar, GameHud, depot, mailbox, shop rows, market/auction, forge fusion and
    the store (`storeIconSchema` item icons now carry `clientId`, resolved
    server-side).
- **Files touched**: `tools/buildItemAnimations.mjs`,
  `client/lib/render/{itemSpriteAnimationStore,useAnimatedSpriteId}.ts`,
  `client/components/inventory/{SpriteIcon,ItemSlot}.tsx`, ~10 icon call
  sites, `client/components/store/StoreProductIcon.tsx`,
  `protocol/src/store.ts`, `server/src/store/{storeCatalog,
  MantusStoreService}.ts`, `client/e2e/{itemIconAnimation,
  itemAnimationWorld}.e2e.test.tsx`,
  `server/src/playtest/itemAnimationProbeServer.ts`, `server/package.json`.
- **Verified**: both e2e lanes pass (icon cycles ≥3 cells, potion ≥4; world
  canvas diff > 5,000 px with a lit-frame guard against blank readbacks);
  client unit 89, server 1,331, tools 89 + parity, full typecheck.
- **Residual risk**: surfaces without a client id in their rows (bestiary
  loot, reward chest, daily rewards, wiki) still use the sprite fallback —
  recorded in `TODO.md`.

## 2026-07-30 — Item animation rebuilt on Tibia's own animator (Feature 43 / client)

- **Problem**: "item animations are not working" was reported again after the
  schedule work landed. Both pipelines were in fact alive (the icon e2e passes,
  and the world canvas repaints while standing still), but the animator was ours,
  not Tibia's, and five defects made animation read wrong or absent:
  - the world resolved every phase off one global `elapsedMs` and gave each
    asynchronous instance a *hash rotation* of the phase order, so three adjacent
    lava walls (1441, ping-pong) played `[1,0,1,2]`, `[0,1,2,1]`, `[1,2,1,0]` —
    out of step with each other where Tibia keeps type-mates coherent;
  - play-once schedules (185 item types: `platform rising from water`,
    `chameleon`, `hamster in a wheel`) were *born complete* — any instance
    registered after `cycle × loopCount` froze immediately on a hash-dependent
    phase instead of playing from the moment the item appeared;
  - the `[min, max]` window was rolled once per instance and never again, so
    Tibia's random idles (378 items, e.g. 193 `something crawling` at
    2000–5000ms) ticked like a metronome;
  - phases Tibia gives 0ms became 1ms, so `vortex` (22894/23469/23470, 0ms for
    all 15 phases) strobed a full cycle every 15ms, swapping textures every frame;
  - the DOM icon table skipped every multi-pattern or multi-tile appearance —
    2,192 of 4,887 animated items, 38 of them carryable (enchanted gems, gold
    ingot, `miraculum`, arrows, souls) — and `SpriteIcon` drew a single atlas
    cell, so a 2×2 item showed one corner and no stack ever showed its pile art.
- **What changed** — one animator, ported from OTClient's `Animator`, shared by
  the world and the icons:
  - `getItemAnimationSchedule.ts` normalizes an appearance into Tibia's schedule
    (per-phase `[min, max]`, play order with ping-pong expanded, loop type/count,
    start phase, synchronized), substituting the first non-zero window for 0ms
    phases exactly as `Animator::unserializeAppearance` does, and never treating a
    counted schedule as shared — a loop count only means something counted from
    when the item appeared. Cached per appearance (a screen of water asks
    hundreds of times per redraw).
  - `ItemAnimator.ts` is the state machine: advanced by frame deltas, one phase
    boundary per call with the overshoot carried, `[min, max]` re-rolled on every
    transition from a seeded mulberry32 (so an instance replays identically),
    ping-pong bounce, counted loops that freeze on the true last phase.
  - `getSynchronizedItemPhase.ts` is `calculateSynchronous`: phase as a function
    of the shared clock, so the whole ocean ripples together whenever a tile is
    drawn. Ping-pong order is honoured here too, which OTClient's synchronous
    path drops (123 of Tibia's synchronized item schedules are ping-pong).
  - `AnimatedMapItemRegistry` now owns an animator per asynchronous instance and
    reads the clock for synchronized ones, ticks only visible floors as before,
    re-resolves a synchronized entry when its floor is revealed, and **parks an
    animator for 10s on unregister** so the tile teardown that follows every tile
    update does not restart the flame beside a dropped coin.
  - Icons: `itemIconAnimationStore` + `useItemIcon` + `getItemIconPieces` replace
    the generated sequence table. One animator per appearance (OTClient keeps its
    animator on the `ThingType`, so two potions in a container are never a frame
    apart), sleeping until the next mounted icon's phase boundary, reading the
    same `AssetStore` catalog the world loads — so icons now animate *every*
    animated item, draw all `w×h` pieces scaled into the slot the way
    `UIItem::drawSelf` does, and pick pile art from the stack count
    (`getStackCountPattern`, ported from `Item::updatePatterns`). `count` is
    threaded through inventory/container slots, drag ghosts, depot, mailbox and
    reward rows. Ground items pattern by count too (`getMapItemPattern`).
  - Effects: per-phase **maximum** windows and `loopCount` passes, matching
    `getPhaseAt`/`getTotalDuration`, and the pattern comes from the tile's offset
    to the camera (`getEffectPattern`, `Effect::draw`) instead of always cell 0.
  - Fallback rates are Tibia's own again: `ITEM_FRAME_DURATION_MS` 500 (OTClient
    `itemTicksPerFrame`) and `EFFECT_FRAME_DURATION_MS` 75, replacing the invented
    shared 100ms. `AssetStore` no longer synthesizes a flat schedule that could
    shadow a real one; unscheduled objects fall back at the renderer instead.
  - Deleted: `item-animations.json`, `tools/buildItemAnimations.mjs`, the
    `items:animations` script, `itemSpriteAnimationStore`, `resolveSpriteFrame`,
    `useAnimatedSpriteId`, `getItemAnimationTimeline`, `resolveItemAnimationPhase`,
    `getItemAnimationPhase`, `LEGACY_FRAME_DURATION_MS`.
- **Files touched**: `client/lib/render/{getItemAnimationSchedule,ItemAnimator,
  getSynchronizedItemPhase,AnimatedMapItemRegistry,itemIconAnimationStore,
  useItemIcon,getItemIconPieces,getItemIconPattern,getStackCountPattern,
  getEffectPattern,ITEM_FRAME_DURATION_MS,EFFECT_FRAME_DURATION_MS,AssetStore,
  MapView,CombatEffectRenderer,getMapItemPattern,getMergedTileItems,
  getTileRenderLayers}.ts`, `client/components/inventory/{SpriteIcon,ItemSlot}.tsx`,
  `client/components/{depot/DepotModal,depot/MailboxModal,reward/RewardChestModal}.tsx`,
  `client/e2e/{itemIconAnimation,itemAnimationWorld}.e2e.test.tsx`, `package.json`,
  `map/README.md`, `TODO.md`, `todo/status.md`.
- **Verified**: client unit 309 passed (39 new across `getItemAnimationSchedule`,
  `ItemAnimator`, `getSynchronizedItemPhase`, `AnimatedMapItemRegistry`,
  `getItemIconPieces`, `getStackCountPattern`, `getEffectPattern`,
  `itemIconAnimationStore` — including the two regressions that started this:
  a counted schedule registered 60s late plays every phase, and a redrawn tile
  keeps its phase); client typecheck + lint clean (0 errors); server typecheck
  clean. Both browser lanes pass against the real assets: the icon lane now also
  asserts 100 gold coins draw different art from one coin and that a 2×2 item
  renders four pieces; the world lane, run against
  `itemAnimationProbeServer` (:4126), asserts the standing-still temple keeps
  reaching distinct frames instead of a pixel-count threshold that flapped
  (3,528 vs `>5,000` before this change).
- **Scene note for whoever tests this next**: the Thais temple spawn animates
  **four coal basins** (2110) and nothing else — the map has no lit torches at
  all, and its animated mass is water/lava (2.9M static instances) plus 13k
  server-side fields and campfires elsewhere. The old test and probe comments
  claimed torches and rippling harbour water; both were wrong.
- **Residual risk**: the parked-animator window (10s) is a judgement call, not
  Tibia's behaviour — Tibia's item objects live as long as they are in the
  awareness range, so an item revisited after 10s restarts its asynchronous
  animation. Icons now depend on the 37MB object catalog: they hold their first
  frame until it loads (Storybook fetches it once per session) instead of
  animating from a 163KB table. Creature idle animation, fluid-subtype patterns
  and permanent effects remain open in `TODO.md`.

---

## 2026-07-29 — Store: house items as decoration kits, exercise dummies purchasable (Feature 43)

- **Problem**: the store had no house categories at all — no exercise
  dummies, furniture, decorations, shrines or mailboxes (Canary sells 380+
  such offers) — and the base "Exercise Wraps" offer sold the durable-tier
  item id (Canary data bug).
- **What changed**:
  - New `house-item` grant kind: delivery hands the buyer one decoration kit
    (23398) per piece into the store inbox, each carrying `unwrapTo` and a
    Canary-style row description ("Unwrap it in your own house to create a
    …"), shown by the tooltip via a new instance-description override in
    `toItemTooltip`.
  - New `decoration-kit` world action: using a kit on a tile transforms it
    into its furniture in place (`planTransformMapItem` gained an attributes
    override to shed the routing attributes), gated by
    `HouseService.canDecorateHouseTile` — owner or subowner of that house,
    never a guest, re-checked at execution time; fails closed when no house
    service is wired.
  - `importCanaryStoreCatalog.mjs` imports `house_upgrades`, `house_furniture`
    and `house_decorations` under a "Houses" parent (17 categories, 631
    products, 670 offers), corrects Exercise Wraps 50294→50293 via a new
    item-id corrections table, and drops offers whose global offer id
    collides (Canary's Heart Table/Heart Chest and Volcanic Spire/Sphere
    duplicate-item bugs). Beds and casks stay skipped (systems missing).
- **Files touched**: `server/src/store/{storeCatalog,storeCatalogData,
  assertStoreCatalog,PgMantusStore}.ts`,
  `server/src/store/delivery/deliverInboxItem.ts`,
  `server/src/item/{decorationKitItemId,toItemTooltip}.ts`,
  `server/src/item/plan/planTransformMapItem.ts`,
  `server/src/action/{WorldAction,resolveWorldAction,WorldActionRegistry,
  WorldActionContext,worldActionPreconditions,handleDecorationKitUse}.ts`,
  `server/src/house/HouseService.ts`, `server/src/GameServer.ts`,
  `protocol/src/store.ts`, `tools/importCanaryStoreCatalog.mjs`,
  `client/locales/{en,pt-BR}.json`.
- **Verified**: 4 new `WorldActionRegistry` decoration-kit cases (unwrap with
  access, guest refusal, fail-closed without house service, kit without
  target unsupported); a `PgMantusStore` integration case asserting the kit
  row (written, unrun — no DB); server 1,335, tools + `parity:check`, full
  typecheck all pass.
- **Residual risk**: kit wrap-back missing and Postgres delivery test unrun —
  both in `TODO.md`; exercise dummies placed in houses still miss the
  same-house membership check (pre-existing, Feature 72).

### 2026-07-29 — Spell and item balance moved out of the pinned dumps

- **Problem**: every spell/rune formula lived in `content/spells/canary-spells.json`
  as an expression AST behind a sha256 provenance pin, so tuning one number
  (e.g. sudden death's `magicLevel * 4.605`) meant hand-editing a 604 KB
  generated file and recomputing the pin. Item stats had the same shape in the
  16 MB `server/data/item-catalog.json`.
- **What changed**:
  - Spells: 169 supported definitions became one hand-editable module each
    under `server/src/combat/spells/{attack,healing,support,conjuring,runes}/<spell-id>.ts`,
    collected by `spells/SPELL_DEFINITIONS.ts`. `SpellFormula.minimum/maximum`
    are now plain `(variables: SpellVariables) => number` functions that read
    like the Canary Lua, replacing the AST; `evaluateSpellExpression.ts` and
    `loadCanarySpellCatalog.ts` are deleted.
  - The Canary dump stays as the **upstream reference only** — the parity
    tooling (`parity:check`, `buildSpellReport`, `importCanaryNpcs`) still
    reads it, and the definitions test asserts every upstream-supported id has
    a module while allowing extra modules of our own.
  - Items: 32,197 catalog entries are asset-derived, so instead of splitting
    them, `server/src/item/overrides/` merges hand-written `ItemOverride`
    records over the generated catalog at load (`applyItemOverrides`), failing
    closed on an unknown or duplicated id. `yarn item:override <id | name>`
    scaffolds `overrides/<category>/<item>.ts` prefilled with the item's whole
    current record and registers it in `ITEM_OVERRIDES`.
- **Files touched**: `server/src/combat/{Spell,SpellCaster,SpellRegistry}.ts`,
  `server/src/combat/spells/**` (171 new files),
  `server/src/npc/loadNpcDialogueGraphs.ts`,
  `server/src/playtest/scenarios/{spellParity,monsterParity}.ts`,
  `server/src/item/loadItemCatalog.ts`, `server/src/item/overrides/**`,
  `tools/createItemOverride.mjs`, `package.json`.
- **Verified**: full typecheck (protocol + server + client), server suite
  1,340 passed / 265 skipped, `yarn test:tools` 89 passed, `yarn parity:check`
  clean (236 spells, 313 world actions). The pinned-value assertions moved to
  `spells/SPELL_DEFINITIONS.test.ts` and still pass (Buzz 3, Lesser Front
  Sweep 18, Energy Beam 53, sudden death level 45 / ML 15).
- **Residual risk**: spell modules are no longer diffed field-by-field against
  the dump, so an upstream change to a spell we have already tuned will not
  surface automatically — only a missing spell id fails the test. Item
  overrides carry the whole record by design, so an override pins its item's
  sprite/render fields against a future asset re-import; keep them to items
  actually being tuned. Both recorded in `TODO.md`.

### 2026-07-29 — Look moved server-side: Tibia's left+right click describes creatures, items, and houses (Feature 52)

- **Problem**: the look shipped 2026-07-21 was composed entirely in the
  client. `performMapLook` read a generated `client/public/assets/look-items.json`
  (1.1 MB, `tools/buildLookCatalog.mjs`) and produced "You see a stone pile."
  from article + name + type description alone, and creature looks were the
  bare `You see <name>.`. It knew nothing about stats, requirements, weight,
  stack counts, instance state, vocations, levels, or house ownership, and it
  was a second source of truth for text the server already owns — the very
  shape the charter's golden rule warns about.
- **What changed** (Canary `playerLookAt` / `playerLookInBattleList` +
  `data/scripts/eventcallbacks/player/on_look.lua`, OTClient `Game::look`):
  - **Protocol** (`protocol/src/look.ts`): a `look` intent whose target is
    either `{kind: "creature", creatureId}` or
    `{kind: "map", position, itemId?}`, and a `look-text` server message
    carrying the finished multi-line description (≤1024 chars, newline the only
    control character allowed).
  - **Server** (`server/src/look/`): `LookHandler` resolves the target inside
    the tick — the tile must be in the session's *current* view range, and a
    creature must be one this client was already told about
    (`session.knownCreatureIds`) **and** still visible now. `describeItemLook`
    reproduces Canary's `Item::getDescription` for the fields our pinned
    catalog holds: counted plural or article name, one merged stat group
    (`Vol:`, `Range:`/`Atk`/`Hit%` for bows, `Atk:24 physical + 11 fire`,
    `Def:20 +1`, `Arm:`, skills, magic level, crit/leech, `protection fire
    +8%`, speed), charge suffix, readable text with Canary's 4-tile cut-off,
    `It can only be wielded properly by …` from base vocations only,
    imbuement-slot and classification lines for real instances, and — only for
    an adjacent looker — `It weighs 23.00 oz.` plus flavour text.
    `describeCreatureLook` reads a monster's/NPC's `nameDescription`, and
    `describePlayerLook` composes `Shui Sorc (Level 214). He is a master
    sorcerer.` with live party size and guild rank, switching to second person
    for your own character. A look at a house door appends Canary's
    `House::updateDoorDescription` text (`HouseService.lookStateFor`).
  - **Client**: `GameClient.look()`, `performMapLook` now only *sends* the
    intent (top drawn sprite id for the tile, creature id when one was
    clicked), and `look-text` renders verbatim into the server-log channel and
    the existing centred screen message (`tone: "look"`). `lib/look/`,
    `tools/buildLookCatalog.mjs`, the generated `look-items.json`, and the
    `items:catalog` chain step are deleted — one source of look text now.
    Chat lines and the centred message keep server-authored newlines
    (`whitespace-pre-line`).
- **Deliberate deviation**: wands/rods report `(Range:3, Mana:1)` as real Tibia
  does; Canary drops both from the look line although it has the data.
- **Files touched**: `protocol/src/{look,clientMessages,serverMessages,index}.ts`,
  `server/src/look/**` (13 files incl. 4 test files),
  `server/src/{GameServer,house/HouseService,party/PartyHandler}.ts`,
  `server/src/playtest/scenarios/lookDescriptions.ts`, `server/package.json`,
  `client/lib/net/GameClient.ts`,
  `client/components/game-window/{controllers/performMapLook,controllers/createGameWindowRenderer,messages/handlePlayerStateMessage,GameMapContextMenu,GameNotifications}.tsx?`,
  `client/components/chat/ChatMessageList.tsx`,
  `client/lib/game-window/mapLook.test.ts`, `package.json`; deleted
  `client/lib/look/**`, `tools/buildLookCatalog.mjs`,
  `client/public/assets/look-items.json`.
- **Verified**: full typecheck (protocol + server + client); server suite 1,371
  passed / 265 skipped including 31 new look tests; client suite 281 passed
  including 4 new look-wiring tests; `yarn test:tools` 89 passed and
  `yarn parity:check` clean; client lint 0 errors. Exploit coverage: a look at
  a creature the client was never told about, at one that walked out of view
  between click and tick, at a tile outside the view range, and with an item id
  absent from the pinned catalog all answer *nothing* — no description and no
  error, since the shared `item-action-failed` code has side effects a look must
  not cause (it rolls the optimistic inventory queue back and puffs the player)
  and silence cannot confirm whether anything is standing there.
- **Residual risk**: `yarn playtest:look` (own character before/after a
  promotion, a summoned rat, a dropped fire sword, static scenery, a real house
  door, a silent out-of-view refusal) is written but **unrun** — this
  environment has no Postgres and no Docker. The server only tracks mutable/interactive world
  items, so a look at static scenery is answered from the client-supplied
  client id, validated against the pinned catalog and gated on view range: it
  can pick which catalog description is read back but nothing more. Recorded in
  `TODO.md` along with the flags our catalog does not carry (`showAttributes`,
  ring effect flags, `ignoreLook`).

## 2026-07-29 — Login database connection footprint (Feature 106)

- **Problem**: production logins failed with
  `(EMAXCONNSESSION) max clients reached in session mode - max clients are
  limited to pool_size: 15`. Two causes. (a) `DATABASE_URL` used Supabase's
  *session* pooler (port 5432), where every pooled client pins one Postgres
  connection for its whole life, so the server permanently occupied
  `PG_POOL_MAX` of the pooler's 15 and any second client — a rolling deploy's
  old machine, a migration, a tool run — was refused. (b) A single login
  demanded ~14 concurrent pool checkouts: `resolveWorldEntry` ran five loads in
  a `Promise.all` (one of which, `PgGemStore.load`, fanned out three more), and
  `enterWorld` fired ~14 `attachCharacter` store loads with no awaits between
  them, all in one tick. Five of those "loads" were also writes. For reference,
  Canary runs its whole server — including a ~19-query player load — on one
  mutex-guarded MySQL handle (`src/database/database.hpp`).
- **What changed**:
  - `DATABASE_URL` moved to the transaction pooler (port 6543), which
    multiplexes instead of pinning. Verified compatible: nothing uses
    LISTEN/NOTIFY, `SET`/`SET SESSION`, temp tables, cursors, or named prepared
    statements (node-pg does not use them by default), and the only advisory
    lock is transaction-scoped `pg_advisory_xact_lock`.
  - New `LoginLoadQueue` (`server/src/character/LoginLoadQueue.ts`): a
    per-character promise chain shared by every service that reads at world
    entry, so a login's store reads run one at a time on one connection while
    concurrent logins still proceed in parallel. A rejected load does not
    stall the ones queued behind it; an idle chain starts immediately.
  - `resolveWorldEntry`'s `Promise.all` is now sequential awaits;
    `PgGemStore.load`'s three-way fan-out is sequential too.
  - Writes removed from login reads: `PgForgeStore.load`, `PgGemStore.load`,
    `PgPreyStore.load` and `PgHuntingTaskStore.load` no longer lazily seed
    their resources row (every read already coalesced to the schema defaults,
    and every mutation path seeds its own row — `upsertGemDropsQuery` creates
    the gem row on the first drop, and spend paths are guarded UPDATEs that
    correctly match nothing without it). `insertGemResourcesRowQuery` was
    deleted as unused. `OutfitService.attachCharacter` reads before it writes,
    so the starter-outfit back-fill costs zero writes for the characters that
    already own the set instead of one write per starter outfit per login.
    `PgPvpStore.loadFrags` is a single filtered SELECT — no transaction, no
    dedicated client — and the frag prune moved into `recordKill`'s existing
    transaction, ahead of its insert so a kill cannot collect its own row
    (`RecordKillInput.pruneBefore`; `MemoryPvpStore` mirrors both changes).
- **Files touched**: `.env`, `server/.env.example`, `server/src/index.ts`,
  `docs/server-capacity.md`, `TODO.md`, `todo/todo-12.md`,
  `server/src/character/LoginLoadQueue.ts` (new) + `.test.ts` (new),
  `server/src/{CharacterHandler,GameServer}.ts`,
  `server/src/{social/VipService,social/FriendService,profile/ProfileService,
  minimap/MarkerService,moderation/ModerationService,prey/PreyService,
  daily/DailyRewardService,huntingTasks/HuntingTaskService,
  bestiary/TrackerService,bestiary/BossSlotService,forge/ForgeService,
  proficiency/ProficiencyService,proficiency/AnimusService,
  outfit/OutfitService}.ts`,
  `server/src/{forge/PgForgeStore,wheel/PgGemStore,prey/PgPreyStore,
  huntingTasks/PgHuntingTaskStore}.ts`,
  `server/src/pvp/{PgPvpStore,PvpStore,PvpTracker,MemoryPvpStore,
  sql/killsByKillerQuery,PgPvpStore.integration.test}.ts`; deleted
  `server/src/wheel/sql/insertGemResourcesRowQuery.ts`.
- **Verified**: full workspace typecheck; server suite 1,375 passed / 266
  skipped, including 4 new `LoginLoadQueue` tests (same-character serialization
  with a concurrency peak of 1, no cross-character serialization, a rejected
  load not stranding its successors, a relogin not queueing behind a drained
  chain); `yarn test:tools` 89 passed and `yarn parity:check` clean. The
  `PgPvpStore` integration test was rewritten into two cases — the load
  filters the window and writes nothing (row count unchanged), and `recordKill`
  collects the killer's expired frags while its own in-window row survives.
- **Residual risk**: the rewritten `PgPvpStore.integration.test.ts` and the
  other pg integration suites are **unrun** — this environment has no Postgres
  and no Docker. The four store changes and the pvp SQL are unexercised against
  a real database; the new `character_kills` filter is covered by the existing
  `(killer_character_id, occurred_at desc)` index. Login now pays its ~28 read
  round trips sequentially, so login latency is set directly by database RTT —
  and `server/fly.toml` pins `iad` while the database is in `us-west-2`
  (~60 ms), making login ~1.7 s until the two are co-located. Both recorded in
  `TODO.md` accepted gaps; collapsing the login read set into one statement is
  recorded on Feature 106 in `todo/todo-12.md`.

## 2026-07-30 reward wall reachable + real window, resting-area bonuses, claim history

- **Feature 84 — Reward wall (server+client)** (2026-07-30): the daily-reward
  engine shipped 2026-07-26 but was **unreachable in the running game**. The
  otservbr map places 37 reward shrines, one per city temple (Thais at
  `32376,32239,z7`, four tiles from the town spawn), and all of them are the
  wall-mounted 25802/25803: immovable, unpickupable, untyped scenery. So
  `getMapItemSemantics` classified them neither mutable nor interactive,
  `convertOtbm` baked them into the client's static draw layer, `items.bin`
  carried **zero** shrines, `world.getMapItems` returned nothing on those
  tiles, and `resolveWorldAction` never reached its `DAILY_SHRINE_ITEM_IDS`
  branch — right-click → Use fell through to the movement-correction path and
  the whole claim/window path was dead code. Fixed by adding 25802/25803 plus
  the floor shrines 25720-25723 to `MUTABLE_ITEM_IDS` in
  `tools/getMapItemSemantics.mjs` (the list that already exists for levers and
  shovel holes, for exactly this reason — `loadMapItems` only surfaces
  classification 1, so "interactive" would not have been enough), then
  re-running `convertOtbm` + `buildMinimapTiles`: `items.bin` 96,646 → 96,683
  entries with all 37 shrines at classification 1, diff limited to the 33
  regions that held one (`map.bin` walkability byte-identical).
- **Resting-area bonuses now apply** instead of being display-only. The streak
  level is mirrored onto the live `Player` by `DailyRewardService.setRecord`
  (the same single-writer path the XP-boost deadline already used) and read by
  `CharacterProgression.tick`: inside a protection zone health needs streak 2
  and doubles at 5, mana needs 3 and doubles at 6, soul rests at 7 — bypassing
  both the usual PZ block and the recent-kill arming, since Canary's RegenSoul
  event ticks purely on standing there — and a new
  `regenerateRestingStamina` (staminaRules) refills one stamina-minute every
  3 real minutes at streak 4, every 6 inside the green band. Leaving the zone
  parks the stamina clock rather than banking the time.
- **Claim history**: migration `065_daily_reward_history.sql` adds
  `character_daily_reward_history`, written **inside the claim transaction**
  next to the `daily-reward-claim` audit row, so an entry cannot exist for a
  claim that rolled back. Rows store the claim's parts (day, kind, allowance,
  picked items as jsonb) rather than Canary's prebuilt sentence, so the window
  renders each entry in the player's own language; the read is owner-scoped and
  capped at 15 (Canary daily_reward.lua:220).
- **Protocol**: `dailyRewardsStateMessageSchema` gains `dayEndsAtMs` (the
  server-local day boundary — the client cannot derive it, its time zone need
  not match) and `accountTier`; new `daily-history-get` /
  `daily-reward-history` pair with a 1/s per-session rate limit and a 15-entry
  cap. `DAILY_REWARD_RULES` gains `historyCooldownMs`/`historyLimit`, and its
  `streakBonuses` comment no longer says "(display)".
- **Client**: the placeholder 190-line list is now the real Reward Wall —
  `RestingAreaPanel` (streak ribbon by tier, claim countdown, joker tokens,
  the six resting shields lit by threshold **and** premium, the late-claim
  warning), `DailyRewardCycle` + `DailyRewardDay` (68px type icons, green
  check / red padlock plates, arrows that green out behind the collected run),
  `RewardWallPremiumPanel`, `DailyRewardPickPanel`, `DailyRewardHistoryPanel`,
  with `getDailyRewardDayState` / `getRewardStreakTier` /
  `formatRewardCountdown` / `getDailyRewardKindIcon` as pure helpers. Art comes
  from OTClient's `game_rewardwall` module via a new
  `tools/importOtclientRewardWallAssets.mjs` (`yarn rewardwall:assets`) into
  `client/public/assets/reward-wall/` — 19 images, including the 384x64
  resting-shield strip sliced into six cells and `rewardButton.png` split into
  its locked/collected plates. Locales en+pt-BR (14 keys added, 3 obsolete
  removed), 6 stories.
- **Files**: `tools/{getMapItemSemantics,getMapItemSemantics.test,
  importOtclientRewardWallAssets}.mjs`, `package.json`,
  `protocol/src/{dailyRewards,clientMessages,serverMessages}.ts`,
  `server/db/migrations/065_daily_reward_history.sql`,
  `server/src/daily/{DailyRewardService,DailyRewardStore,PgDailyRewardStore,
  localDayEndMs}.ts`, `server/src/daily/sql/{insertDailyHistoryQuery,
  readDailyHistoryQuery}.ts`,
  `server/src/progression/{CharacterProgression,staminaRules}.ts`,
  `server/src/{Player,GameServer}.ts`, `client/components/daily/*` (7 files),
  `client/lib/daily/*` (4 helpers + 3 tests), `client/locales/{en,pt-BR}.json`,
  `client/stories/DailyRewardsModal.stories.tsx`, plus the regenerated map
  data (`server/data/otservbr.{items.bin,map.json}`, 33 client region JSONs and
  their minimap tiles, `manifest.json`).
- **Verified**: full workspace typecheck 0 errors; client lint 0 errors (the
  15 remaining warnings are pre-existing); server suite 1,382 passed / 268
  skipped including 3 new resting-area cases (PZ regen blocked at streak 0 and
  unaffected outside the zone, unlocked at 3, doubled at 6; double health at 5
  and rested soul at 7 but not 6; rested stamina only while the bonus runs, and
  not at streak 3) and 4 new world-action cases (the wall opens from an
  adjacent tile without consuming itself, the shrine window outranks the floor
  shrine's rotate behaviour, a scripted placement fails closed, out-of-reach is
  refused); client unit suite 317 passed including the 3 new daily helpers;
  `yarn test:tools` 90 passed and `yarn parity:check` clean; all 6
  `DailyRewardsModal` stories render in headless chromium — which caught a real
  nested-`<li>` in the day cell, now fixed. The window was screenshot-verified
  against the reference client: streak ribbon, countdown, six shields, the
  collected/current/locked run with green arrows, premium panel and footer all
  match.
- **Residual risk**: the **history integration tests are unrun**. This
  environment has no Docker and the configured `DATABASE_URL` is a hosted
  Supabase pooler, not a local Postgres, so `test:integration` was not run
  against it. The three new cases (history rides the winning claim only, is
  newest-first/capped/owner-scoped, and absent after a rollback) are written
  and will run wherever a local Postgres exists; the two new SQL statements
  were validated directly against the live schema inside a rolled-back
  transaction (exact `claimed_at_ms` and jsonb round-trip, nothing persisted).
  Migration 065 **has been applied** to the configured database. Blocking base
  PZ regeneration below streak 2 is Canary's rule (condition.cpp:1490) and is a
  live behaviour change for characters with no streak — recorded in `TODO.md`
  with the additive-only alternative.

### 2026-07-30 — Memory-first NPC shops and bank (Features 45, 46)

- **Problem**: buying at an NPC took seconds and spam-clicking Buy produced a
  run of "Please wait until your other action is finished." The purchase path
  was database-first: `ShopService.execute` held `session.itemOperationPending`
  for the whole of `executeShopPurchase`, which made ~10–14 sequential round
  trips inside one SERIALIZABLE transaction (owned rows, bank lock, stock
  reserve, per-row coin destroys, backpack lock, change grants, item grant,
  audit, commit) — against a hosted Supabase pooler measured at ~150 ms RTT,
  so 1–2 s per purchase before any 40001 retry. Every click inside that window
  was refused with `busy`. There was also no amount slider, and no clamp to
  what the player could afford or carry.
- **What changed**: purchases, sales, deposits and withdrawals now compute in
  memory inside the tick and flush behind it, the way Canary does
  (`Game::playerBuyItem` is fully in-memory; its only throttle is a 250 ms
  `isUIExhausted`).
  - The bank balance joined the per-character inventory cache
    (`InventoryCache.bankBalance`, seeded by `ItemIntentHandler.load` through
    an injected reader), so money and items attach, detach and resync as one
    unit and a purchase plans both legs from one snapshot.
  - New pure planners return a `CarriedPlan` plus the durable money/stock/audit
    legs: `planShopPurchase`, `planShopSale`, `planBankDeposit`,
    `planBankWithdraw`, composed over a shared `CarriedItemDraft` (the
    in-memory twin of `PgCoinOperations`: same fill order, same per-row audits,
    same 500-row ceiling).
  - `PgEconomyPersistOps` commits the carried row ops, guarded bank deltas,
    guarded finite-stock decrements and the audit rows in one transaction. It
    runs on `runSerializableTransaction` (40001/40P01 only) rather than the
    item helper, because retrying an ambiguous connection reset could apply a
    balance delta twice. Every bank op carries `expectedBalanceAfter`; a
    mismatch throws, poisoning the write lane into the existing resync path.
  - The gate became a 250 ms `session.shopExhaustReadyAt` plus
    `itemOperationPending` only. `itemPersistsPending` was dropped from it:
    memory-first writes have already reconciled memory, so ordering is the
    persist lane's job — which is what lets purchases repeat.
  - Finite stock gained an in-memory mirror (`ShopStockCache`) seeded at boot
    and refreshed by the restock sweep, keeping one purchase path instead of
    splitting by whether an offer has stock.
  - Client: `ShopPanel` became the Tibia trade window — Buy/Sell tabs, search,
    a scrolling offer list, and one pinned `ShopAmountPanel` (slider + amount
    box + Price/Gold + Buy) driving the selected offer. `maxShopPurchaseAmount`
    mirrors OTClient's `refreshItem` clamp (offer cap, money, capacity); the
    amount is held as *desired* and clamped for display, so it drops to what
    is affordable after each buy and recovers when money returns.
    `useExhaustedAction` holds an early click back for the exhaust window
    instead of sending one that would be refused. `shop-opened` now ships the
    player's own `bankBalance` and a per-offer `owned` count (Canary's
    `sendSaleItemList` sends both).
  - Retired the DB-first path: `executeShopPurchase`, `executeShopSale`,
    `executeBankDeposit`, `executeBankWithdraw`, `reserveShopStock`,
    `debitShopBankBalance`, `sellableShopRows`, `ShopPrechecks`,
    `ShopOperationResult`, `countFreeBackpackSlots`, `validateShopPurchase`,
    `validateShopSale`, `sql/debitShopBankWithLedgerQuery`, and the
    `purchase`/`sell`/`deposit`/`withdraw` members of the shop and bank stores.
    A bank **transfer** stays database-first on purpose — it names a possibly
    offline recipient, so the row can only be found and credited in a
    transaction — but now runs through `runOrderedInternalOperation` so it
    reads the sender's balance after every queued memory-first write.
- **Files touched**: `protocol/src/shop.ts` (SHOP_LIMITS, `bankBalance`,
  `owned`); `server/src/economy/` (`plan/{CarriedItemDraft,backpackContainers,
  planShopPurchase,planShopSale,planBankDeposit,planBankWithdraw}.ts`,
  `{EconomyPersistPlan,EconomyPersistStore,PgEconomyPersistOps,
  BankLedgerEntryType,ShopStockCache}.ts`, `{ShopService,BankService,
  PgShopStore,PgBankStore,ShopStore,BankStore,BankOperationResult,
  ShopRestockRunner,projectShopEntry,appendBankLedger}.ts`,
  `sql/readShopStockQuery.ts`); `server/src/item/`
  (`{InventoryCache,LoadedInventory,InventoryCacheManager,ItemIntentHandler,
  CarriedPersistPlan,PgItemPersistOps,PersistResyncRunner}.ts`);
  `server/src/{Session,GameServer,index}.ts`,
  `server/src/npc/NpcDialogueExecutor.ts`; `client/components/shop/*` (3),
  `client/lib/shop/{maxShopPurchaseAmount,shopMoneyAvailable,
  precheckShopPurchase}.ts`, `client/hooks/useExhaustedAction.ts`,
  `client/components/game-window/{GameCommerceOverlays.tsx,
  types/ShopSessionState.ts,messages/handleCommerceMessage.ts}`,
  `client/locales/{en,pt-BR}.json`, `client/stories/ShopPanel.stories.tsx`.
- **Verified**: workspace typecheck 0 errors; server suite 1,419 passed / 251
  skipped, including 25 `ShopService` cases (buys apply in the same tick with
  nothing pending; three buys spaced by the exhaust all succeed with no
  failure message; a buy inside the window is refused; carried-then-bank
  payment and the `bank-updated` push; refusal when coins+bank fall short; a
  DB-first operation still blocks; finite stock cannot be oversold across
  repeated buys; `owned` excludes equipped rows), 18 `BankService` cases
  (deposit/withdraw land in-tick, withdrawal can never overdraw, no-space vs
  no-capacity, transfer ordering and recipient push), and 24 planner cases
  plus 6 `CarriedItemDraft` cases (a destroyed row's slot is reused by a later
  grant, stacks top up before opening new ones, nested bags are filled,
  equipped rows and non-empty containers are never consumed). Client unit
  suite 326 passed including the new clamp helpers; all 6 `ShopPanel` stories
  pass in headless chromium — `ClampedByMoney` asserts the slider's `max`
  falls to 6 at 137 gold, `ClampedByCapacity` asserts Buy disables at zero
  room. The window was screenshot-verified against the reference: tabs,
  search, offer list, slider, Amount box, Price/Gold and Buy all present.
- **Residual risk**: the **integration tests are unrun**. This environment has
  no Docker and no local Postgres, and the configured `DATABASE_URL` is the
  hosted Supabase pooler, so `PgEconomyPersistOps.integration.test.ts` (10 new
  cases: purchase commits goods+coins+audit together; the bank shortfall writes
  its ledger row; a diverged balance is refused; a debit cannot go negative;
  stock decrements under its guard and a replay is refused; sale overflow is
  banked and audited; deposit/withdraw legs commit together; the bank row is
  created on first use; two racing purchases leave exactly one) has never
  executed against a real database. Nothing in the new writer's SQL is
  therefore proven beyond typechecking — run `test:integration` with a local
  Postgres before trusting it in production. Four client storybook failures
  (ActionBar, GameHud, ProficiencyModal, SpellListModal) are pre-existing and
  reproduce on a clean tree.
