# Todo 2 — Map, world actions, and world events

**Features 4, 50, 51, 52, 54.** Shipped: the full converter/movement/
visibility stack, the fail-closed world-action registry with shared
precondition table and write-map, doors/levers/readables/rope-spots/shovel
holes/chests/pressure plates/traps/teleports, the tool family, the
world-action parity inventory (313 registrations, 0 unclassified), and the
durable restart-safe world-event engine with the 18-raid import lane (see
[done.md](done.md)). Everything left is per-entry content resolution, two
asset-blocked slices, and the rest of the event content.

## Feature 4 — Disabled map transitions and movement-action parity resolution

Open umbrella: every disabled transition, movement action, zone behavior, and
invalid placement from the pinned source must be individually resolved so no
player-visible map behavior stays silently unsupported. Entries stay disabled
rather than ever accepting client-authored destinations. As of 2026-07-25:
**348 disabled world actions** (was 3,554) and **2,225 unresolved floor
transitions** (was 5,557), plus 3,332 transitions audited correctly
transition-less — all pinned by `server/src/mapParityCeiling.test.ts` as a
monotonic ceiling (an unlabelled entry or new category fails the gate).

**Remaining work**

- The 348 disabled actions each need a content decision, not a classifier
  fix: 207 `blocked-destination` + 74 `missing-destination` (no walkable
  landing even after the moveUpstairs neighbour scan), 53 `no-floor-below` /
  1 `no-floor-above` (correct at map limits), 9 `duplicate-action`,
  4 `requires-content-action`. The 233 rope holes with no reachable landing
  are map-content review, not code.
- `source-blocked-by-item` transitions (824) need per-entry review — standable
  ground with something solid on it (small boat 285, ramp 204, cave entrance
  132, hole 55, stairs 53): deliberate content or map defect.
- `missing-destination` (892) and `blocked-destination` (182) transitions need
  per-entry review; `requires-content-action` (323) waits on scripted
  action/unique-id ownership (Features 50–52 here, quests in todo-13).
- House/zone ownership behaviors belong to todo-9.

**Implementation**

- The converter classifies unresolved floor-change items as disabled metadata:
  `tools/convertOtbm.mjs` + `tools/getMapItemSemantics.mjs`, consumed by
  `server/src/MapAction.ts` / `server/src/MapTransition.ts`. Drive each entry
  through its owner, implement as server-side world actions executed in the
  tick, update converter classification + parity report until zero silently
  unsupported behaviors remain.

**Tests**

- Per-resolved-action converter fixtures; the aggregate ceiling test is
  landed and must keep passing.

## Feature 50 — Fields and recorded dropdown deviations

Chests, pressure plates, traps, and teleports shipped; fields and two
recorded deviations remain.

**Remaining work**

- **Fields (fire/energy/poison).** Blocked on content: the catalog imports
  `kind: "magicfield"` for 45 types but no `field` payload —
  `tools/importTibiaAssets.mjs` must emit `ItemType.field` (declared, always
  undefined today) before the combat-damage hook can be written. The
  regeneration is owned by Feature 108 (todo-4).
- **Trap disarm on use** (3482 → 3481 transform; step-in half ships in
  `PressurePlateRegistry`). Classified `deferred` in
  `content/canary-world-action-parity.json`.
- **Dropdown deviations:** Oramond sewer grate 21298 drops one floor here vs
  two floors + one tile east in Canary's quest script; dropdowns over
  blocked/missing destinations are disabled at conversion instead of Canary's
  `FLAG_NOLIMIT` force-teleport.

**Tests** (forged-input and replay cases for chests/plates/teleports are
done): extend forged action id/target/position/destination rejection when
fields land.

**Blockers:** `ItemType.field` importer work; storage-gated chest variants
(43 chests outside `quest_reward_common.lua` uid ranges) defer to todo-13.

## Feature 51 — Use-with tool actions (remainder)

Machete, scythe, pick, crowbar, watch, fishing rod, and rope-on-open-holes
shipped (the last replaced name-matched hole classification with Canary's
pinned `holeId` table — 4,968 working rope actions).

**Remaining work**

- **Shovel sand digging (item 231):** scarab coins/spawns and quest digs —
  needs loot RNG + spawn hooks (todo-6 infrastructure).
- **Toolgear jam:** 9594/9596/9598 multi-tools jam 5% of uses, transforming
  to `itemid + 1` and decaying back after a minute — needs a carried-item
  transform-and-decay path (Feature 33's machinery in todo-6).
- **Tool list is curated:** `getToolDefinition` is an id list, not DAT
  `multiUse`/`usable` bits — `importTibiaAssets.mjs` parses but drops those
  flags; capturing them means regenerating `objects.json` (Feature 108,
  todo-4).
- **Use-with targets beyond a map tile:** no tool-on-ground-item,
  tool-on-creature, or tool-on-inventory-item — shared prerequisite with
  Feature 11's fluids (todo-4).
- Quest-storage branches (`onUsePick`, `onUseCrowbar`, `onUseSpoon`,
  `onUseKitchenKnife`, Dawnport 7749 pile) defer to todo-13; the crowbar has
  no non-quest branch and correctly always fails closed.

**Tests** (done and green, keep passing): forged/wrong-type target rejected
per tool; replayed fishing consumes exactly one worm; rolls never
client-influenced; rope pulls move only players to step-legal tiles, one item
per replay.

## Feature 52 — Registry-wide execution guarantees and flag parsing (remainder)

The shared precondition table (`WORLD_ACTION_REQUIREMENTS` in
`server/src/action/worldActionPreconditions.ts` — compiler + test fail if a
kind lacks a row) and the write-map path shipped.

**Remaining work**

- **Asset-flag parsing, blocked on regeneration:** `m_transformOnUse` and
  `ignoreLook` are parsed-and-dropped by `tools/importTibiaAssets.mjs`;
  capturing them means regenerating `objects.json` + atlases from the pinned
  `Tibia.dat`/`.spr` (outside the repo; the pass is owned by Feature 108,
  todo-4). Until then use-transforms beyond
  `rotateTo` stay unregistered and fail closed. Canary's own bidirectional
  transform tables (`carpets.lua`, `windows.lua`, trap disarm) are an
  alternative source needing no DAT change.
- 181 rotatable-but-immobile types (42 map instances) are baked draw-only —
  promote via `MUTABLE_ITEM_IDS` in `tools/getMapItemSemantics.mjs` if wanted.
- Look deferred: `ignoreLook` unparsed; creature look shows name only; no
  shift+left-click alias. Ctrl-menu deferred: no "Use with…"/Trade/Follow/
  Talk entries. Pixel-perfect hit-testing deferred: elevation/displacement
  not reversed on click.

**Tests:** regenerated catalogs keep shipped-handler behavior green
(`WorldActionRegistry.test.ts`); precondition and write-map suites are done.

## Feature 54 — World event engine (remainder)

The durable engine (lease-guarded, idempotent across restarts, audited
operator attempts) and the 21-raid revscript import lane shipped.

**Remaining work**

- **Import the other global events:** `data/scripts/globalevents`
  (`encounters.lua`, `global_server_save.lua`, `online_record.lua`,
  `save_interval.lua`, `server_initialization.lua`,
  `update_guild_war_status.lua`, plus `hireling_save.lua` — a bare
  `SaveHirelings()` shutdown hook, i.e. global-save architecture; expect to
  classify it non-content since persistence here is continuous) and the
  `data-otservbr-global` tree (spawn sweeps, VIP, world update) — each with
  the same classify-everything report the raid importer emits.
- **Daily resets:** the schedule table carries them (`next_check_at` +
  idempotency key) but no content is imported and the daily-boundary step
  kinds don't exist; `daily_reward_shrine.lua` is classified `deferred`
  here. (The boosted creature/boss rotation shipped 2026-07-26 with Feature
  76 on its own day-keyed `boosted_daily` table — the row is the selection,
  exactly-once across processes — so it no longer waits on an engine step
  kind.)
- **Reward steps:** no pinned raid grants an item/currency, so no reward step
  kind exists. The first one must commit inside a run-keyed transaction (the
  `character_chest_loot` pattern) so a retry cannot double-pay.
- **Operator authorization:** `/raid <eventId>` is dev-commands-only; move it
  behind a `world.content` capability on the Feature 96 surface (todo-12).
- **17 raid monster names cannot spawn** — absent from the pinned creature
  import (`content/events/canary-raids.json` → `unresolvedMonsterNames`);
  budget pinned by `worldEventContent.test.ts`; a newer creature era is the
  fix.

**Tests:** restart-idempotency, crash-lease, raid parity are done; add
daily-boundary equivalence (online vs across restart) with the daily content;
operator-authorization rejection once the capability lands.

[Back to overview](README.md)
