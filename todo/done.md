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
