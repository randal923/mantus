# Optimization plan — performance, dead code, duplication

**Date:** 2026-07-31. Produced by a six-lane deep audit: server tick hot paths,
DB/persistence, client rendering, dead-code/duplication tooling (knip + jscpd),
the Canary fork's perf architecture (`~/code/canary`), and the existing
stress-test infrastructure. Successor to the 2026-07-24 pass (whose landed
invariants are listed at the bottom and must not be broken) and to the old
`todo/21-performance-follow-ups.md` deferred list, which this file absorbs.

**Ground truth today** (from `docs/server-capacity.md`, validated 2026-07-23):

- Tick: 25 ms / 40 Hz; tick body `GameServer.tick()` (`server/src/GameServer.ts:1323`).
- 84,294 creature placements, 96,711 static map items, 2,000 max sessions.
- Recorded capacity: 4,000 players @ p95 41.2 ms turn latency (synthetic map,
  no DB, no monsters); 1,900-monster hotspot @ p95 42.9 ms; client 31 FPS at
  1,000 monsters under SwiftShader.
- Login: **35 strictly-sequential DB round trips** (~2.1 s at the current
  ~60 ms cross-region RTT), plus 4–8 concurrent. The "~28" in `TODO.md` and
  `todo/status.md` undercounts by 7.

**Discipline:** every phase below names the harness that gates it. Measure
before, change, measure after, and record the numbers in
`docs/server-capacity.md`. Nothing in phases 2+ ships without a before/after
from Phase 0's instrumentation.

---

## Phase 0 — Instrument first (small, do immediately)

The audit found we cannot currently answer "what does a tick cost and where
does it go". Everything later needs this.

- [ ] **Tick timing.** `server/src/TickLoop.ts` is a bare `setInterval` that
      never measures `onTick`. Wrap it in `process.hrtime.bigint()`: rolling
      p50/p99/max + overrun count, exposed on the existing
      `LOAD_SERVER_METRICS` line and logged once a minute in production.
- [ ] **Per-phase tick breakdown.** `GameServer.tick()` has ~8 documented
      phases; add a fixed-slot accumulator (array of bigints, zero
      allocation) around each phase, reported with the tick metric.
- [ ] **DB query timing.** Wrap the shared pool's `query` with a
      name→histogram map (top-10 dumped with metrics). This also finally
      quantifies the login sequence and the 5-minute sweeps.
- [ ] **Login/world-entry latency.** `LoadTestClient` already timestamps
      messages; record auth→welcome per stage in `playerCapacity`.
- [ ] **Gate fixes** (each is a few lines):
  - `monsterCapacity.ts` asserts nothing — add an env-tunable p95 gate
    (copy `playerCapacity`'s pattern; baseline is 42.9 ms).
  - `playerCapacity`'s event-loop + RSS gates silently disable under
    `LOAD_TEST_URL` (the documented container repro) — parse
    `LOAD_SERVER_METRICS` from the container's stdout instead of gating on
    the child handle.
  - Client GPU lane: make the renderer check hard-fail under
    `VITE_CLIENT_RENDERER_PROFILE=hardware` so a SwiftShader fallback can't
    silently "pass" as a GPU benchmark.
- [ ] **Baselines as data.** Commit `docs/baselines.json` (players, monsters,
      FPS, tick p99, login ms); make each harness emit JSON and add a
      comparator that fails on >15% regression. Add a nightly CI perf job
      (`playtest:tick-stall` + a small `playtest:players` stage set; copy the
      Postgres service block from `.github/workflows/migrations.yml`).
- [ ] **CPU profile lane.** Document `NODE_OPTIONS=--cpu-prof` for
      `playerLoadServer`/`monsterLoadServer` docker runs (zero code change).
- [ ] Client: add `performance.mark/measure` around state-apply vs Pixi draw
      in the render loop, reported by `monsterPerformance.e2e` alongside FPS.

---

## Phase 1 — Highest-leverage quick wins

Ordered by measured impact per unit of risk. All are small diffs.

### 1a. Infrastructure: co-locate the database (biggest single lever, zero code)

`server/fly.toml` pins `iad`; `DATABASE_URL` is `aws-1-us-west-2` — ~60 ms per
round trip. Login (35 sequential RTs), every item transaction (12–14 RTs), and
every save pay this. Move the Supabase project to us-east-1 or the Fly app
west **before** the statement-collapse work in Phase 3 — co-location turns
2.1 s logins into ~35 ms and shrinks every SERIALIZABLE window ~60×, which by
itself reduces 40001 contention. (Already recorded in `TODO.md`; it gates this
plan, so it lives here too.)

### 1b. Server: stop paying for work that's thrown away

- [ ] **Per-swing character saves.** `ProgressionSystem.persistAward`
      (`server/src/progression/ProgressionSystem.ts:169`) calls
      `persistence.saveNow` on **every skill/magic try award** — every auto
      attack swing (`combat/PlayerAutoAttack.ts:205`), every blocked hit
      (`combat/DamageResolver.ts:760`), every spell. 100 combatants ≈ 50 save
      transactions/s (~200 RTs/s). The 30 s interval and the fingerprint
      optimization are both bypassed because tries change every swing. Fix:
      keep `saveNow` for experience/level (death durability), switch
      skill/magic tries to `markDirty` so they ride the 30 s interval
      (`progression_events` idempotency already covers replay). Verify with
      the DB query histogram + `PgCharacterStore` tests.
- [ ] **`playerAttackPlan` built before the cooldown gate.**
      `combat/PlayerAutoAttack.ts:47-58` builds the full attack plan (two
      equipment scans, `playerSpecials` = five `.reduce` passes,
      `playerTierBonuses`, spreads) every tick, then ~98% is discarded at the
      `nextAttackAt` check on line 68. Move the cooldown +
      `itemOperationPending` gates first, and WeakMap-memoize
      `playerSpecials`/`playerTierBonuses` on `cache.items` identity (the
      established `combatEquipment` pattern in
      `item/ItemIntentHandler.ts:221-237`).
- [ ] **`MonsterBrain` bypasses the first-visible-floor cache.**
      `ai/MonsterBrain.ts:481-484, 499-502` (and `Combat.ts:840` tickFollow,
      `PlayerAutoAttack.ts:125`, `ActionBot.ts:126`,
      `DepotAccessTracker.ts:81`) call the position-overload
      `world.canSee(position, …)` (`World.ts:268-275`), which recomputes
      `getFirstVisibleFloor` uncached (~75 `getTile` calls) **per target
      candidate**. Route through `canCreatureSee` (which uses the cached
      `World.firstVisibleFloorFor` from the July pass) and make the position
      overload private so this can't regress.
- [ ] **`ChaseController` re-BFS every tick on no-path.**
      `combat/ChaseController.ts:42-63`: a failed `findPath` doesn't advance
      `nextStepAt`, so chasing an unreachable target burns a BFS 40×/sec. Add
      a ~250 ms retry gate.
- [ ] **`drainDue` latent crash + churn.** `server/src/drainDue.ts:8-23` does
      `queue.push(...remaining)` — spreading an unbounded array into
      arguments is a `RangeError` waiting to happen, and it allocates two
      arrays even when 1 of 5,000 entries is due. Track `earliestExecuteAt`
      for an allocation-free early return; compact in place with a write
      cursor. (Correctness flag, not just perf.)
- [ ] **`set-viewport` amplification.** `GameServer.ts:1590-1594`: any
      viewport change triggers a full `syncMapItems` (up to ~25,480 tile
      lookups at 32×24) with no cooldown beyond the 30 msg/s rate limit —
      client-triggerable CPU burn (availability issue, charter rule 10). Add
      a per-session cooldown (the `MovementHandler.walkToReadyAt` pattern).

### 1c. Database: indexes and pool hygiene (no schema migration risk)

- [ ] **`audit_log` full scan every 5 minutes.**
      `economy/sql/currencyAuditFlowQuery.ts:18-23` scans the fastest-growing
      table (56 write sites) — only `(character_id, …)` and `(item_id, …)`
      indexes exist. Add
      `CREATE INDEX CONCURRENTLY audit_log_coin_flow_idx ON audit_log (occurred_at) WHERE event_type IN ('item-created','item-destroyed')`
      (or BRIN — the column is append-ordered). Plan a partition/retention
      policy for `audit_log` as a follow-up.
- [ ] **`items` full scan ×2 every 5 minutes.**
      `economy/sql/currencySupplyQuery.ts:16` + `orphanCoinRowsQuery.ts:32`
      — no `item_type_id` index exists. Add `(item_type_id) INCLUDE (count)`
      and `(item_type_id, created_at) WHERE seed_key IS NULL`.
- [ ] **`bank_ledger` unbounded window scan.**
      `economy/sql/bankLedgerBreakQuery.ts` runs `lag() OVER` across the whole
      table (LIMIT applied after the window). Add
      `(character_id, id DESC)` and bound the break query with a persisted
      watermark (`WHERE id > $lastChecked`).
- [ ] **Highscore ordering indexes** (`social/sql/highscore*.ts` full-scan +
      sort per panel open): `characters(experience DESC, normalized_name)`,
      `characters(magic_level DESC, mana_spent DESC)`,
      `character_skills(skill, level DESC, tries DESC)`.
- [ ] **Boot-time seed scan**: `items(seed_map_name, seed_map_version) WHERE seed_key IS NOT NULL`
      for `incompatibleSeedsQuery` (rolling-deploy boot latency).
- [ ] **Drop `accounts_is_staff_idx`** (`050:18`/`054:28`): a partial index
      `WHERE is_staff` can never serve its only consumers' `WHERE NOT is_staff`.
- [ ] **Pool timeouts** (`server/src/index.ts:92-96`): add
      `statement_timeout` (~10 s), `query_timeout`, 
      `idle_in_transaction_session_timeout` (~15 s), `application_name`,
      `keepAlive`. Give the 5-minute conservation sweep its own
      longer-timeout client. Today one stuck query pins 1 of 10 connections
      forever.
- [ ] **Free login round trips**: delete the duplicate `findForSelection`
      (`CharacterHandler.ts:235` re-runs the exact query from `:191`); fold
      `age_ms` into `ownedItemsQuery` and delete `ownedItemAgesQuery`
      (`item/ItemIntentHandler.ts:171` re-runs the identical recursive CTE).

### 1d. Client: kill the two biggest per-frame wastes

- [ ] **Every server message re-runs ~311 selectors.**
      `components/game-window/messages/handlePlayerStateMessage.ts:181-198`
      calls `setOwnCharacter` for **every** `creature-moved` (not just the own
      player), and zustand always rebuilds the root state and notifies. Guard
      on `message.creatureId === ownCharacter.id`, and make store setters
      skip the notify when the resolved value is `Object.is`-equal (~10 lines
      in `createGameWindowStore.ts`). ~19k selector invocations/sec in a
      30-monster hunt today.
- [ ] **Minimap redraws its whole canvas every animation frame.**
      `components/minimap/MinimapPanel.tsx:131-163`: the creatures array is
      new every rAF batch, and `canvas.width` is re-assigned every run (which
      resets the bitmap even when unchanged). Assign dimensions only on real
      change; split terrain vs creature-marker passes; throttle markers to
      ~10 Hz.
- [ ] **`WorldRenderer.tick` allocations.** ~11 objects/strings per creature
      per frame (`lib/render/WorldRenderer.ts:1115-1188`): cache a visible
      `Set<number>` of floors on `MapView` (removes an `Array.from(8)` per
      creature per frame — one line), numeric tile keys for `tileElevation`,
      scratch `{x,y}` objects. This is the `WorldRenderer` item deferred from
      the July pass; do it with `monsterPerformance.e2e` + the headless
      screenshot harness as the gate.

**Phase 1 verification:** `yarn test` + `yarn typecheck`;
`playtest:tick-stall` (worst stall was 33.7 ms post-July-pass — must not
regress); `yarn test:players`; `yarn test:monsters`; `gameFreeze.e2e` (zero
tolerance); DB query histogram before/after for 1b/1c.

---

## Phase 2 — Server structural work (the scaling cliffs)

### 2a. Player-only spatial index (fixes the two worst findings at once)

- `SpawnManager.hasPlayerNear` (`spawn/SpawnManager.ts:593-597`) answers "any
  player within 32 tiles?" by materializing **every creature** in a 65×65 box
  (81 grid cells, two array allocations) — and runs ~1,024×/tick (~41k/sec).
- `World.playersWhoCanSee` (`World.ts:366-375`) iterates **all online
  players** per broadcast event; `Visibility.viewerSessionsFor` doubles the
  `canCreatureSee` cost with a prefilter+recheck. Cost is O(players ×
  events): fine at 10 players, ~1M canSee calls/tick at 1,000 players with
  512 monster steps. This is the deliberate July trade-off, and it is now the
  dominant scaling cliff.

- [ ] Maintain a second, player-only `SpatialGrid` (all player position
      changes already funnel through `World.addPlayer/removePlayer/
      relocateCreature`).
- [ ] Add an allocation-free `hasPlayerWithin(center, rx, ry): boolean` that
      early-returns on first hit — use it in `hasPlayerNear`.
- [ ] Drive `playersWhoCanSee`/`viewerSessionsFor` candidates from player
      cells near the position (≤63 cells at max view range, independent of
      player count), keeping `canSee.ts` floor-stack semantics; drop the
      redundant double `canCreatureSee`.
- Canary cross-check: it solves the same problem with per-sector
  player/monster/npc lists (`mapsector.hpp`) — the same idea at sector
  granularity.

### 2b. Packed numeric position keys + scalar map accessors

`positionKey.ts` allocates a template string for every tile lookup, and
`loadMapData.getTile` builds an 11-field `MapTile` object per call. One
`tryMoveInternal` ≈ 13 key strings + 3 MapTile objects; BFS pathfinding pays
it per node ×4 neighbours; hundreds of thousands of allocations/sec.

- [ ] Replace string keys with packed integers `((z*65536 + y)*65536 + x)`
      in `SpatialGrid`, `TileOccupancy`, `DynamicMapItems`,
      `CombatFieldManager`, `overrideMapData` (the codebase already uses the
      trick in `findPath.ts:16`).
- [ ] Add allocation-free scalar accessors on `MapData`
      (`isWalkableAt/blocksProjectileAt/groundSpeedAt/limitsFloorViewAt`)
      reading the bitsets directly; keep `getTile` for cold paths.
- [ ] Short-circuit `getTileOverride` when `tileOverrides.size === 0` (the
      common case; `TileOccupancy.isOccupied` already does this).

### 2c. Field index + static tile-item memoization

`World.fieldTypeAt` materializes the tile's full `MapItem` object graph per
probe (`loadMapItems.ts:114-152`, uncached) — per monster step, per BFS node
(~384/path), per creature per tick via `Combat.applyFieldAtCreature`.

- [ ] Maintain an incremental `Map<packedPos, fieldType>` in
      `DynamicMapItems` (fields are spell-created and rare — index, don't
      scan).
- [ ] Memoize `loadMapItems`' per-tile result keyed by packed position,
      invalidated by `tileItemRevisions` (the static buffer never changes).
- [ ] **Fix the field-cache global invalidation:** `World.fieldRevision`
      (`World.ts:126-128`) includes `mapItems.revision`, which bumps on *any*
      item mutation — one loot drop invalidates every creature's field cache.
      Give fields their own revision (the July pass did exactly this split
      for `passabilityRevision`).

### 2d. Container views, condition sweeps, spawn sectors

- [ ] `WorldContainerViews.tick` (`item/WorldContainerViews.ts:162-198`)
      rescans **all tracked world items** per open view per tick and builds a
      sorted string signature. Maintain a `childrenByContainerId` index in
      `DynamicMapItems` + a per-container revision counter; throttle the
      sweep below 40 Hz. Degrades with server uptime — worst on busy hunting
      grounds.
- [ ] `ConditionSystem.tick` scans all creatures to find the tiny active
      subset, and `ConditionManager.tick:130` spreads `[...this.active]` per
      ticking creature. Keep a `Set` of creatures-with-conditions (and one
      for feared); iterate `active` directly.
- [ ] `SpawnManager.activeSectors` (`spawn/SpawnManager.ts:564-590`) is
      rebuilt every tick — O(9 × players) map inserts + strings at 40 Hz.
      Cache it; recompute only when a player crosses a sector boundary
      (per-player `lastSectorKey`).
- [ ] Monster path cache (`ai/MonsterBrain.ts:508-538`) is keyed on the
      target's exact tile, so a moving target misses every think; and
      `danceAround`/`moveAway` call `clearPath()` unconditionally. Tolerate a
      goal within ~2 tiles of the cached goal (Canary re-paths at most every
      2,000 ms); keep execution-time step re-validation.

### 2e. Movement/view-sync path

- [ ] `Visibility.syncMapItemsAfterStep` (`Visibility.ts:343-366`) scans the
      full multi-floor view box per step (2,280 probes at 9×7; 25,480 at
      32×24) when the genuinely-new tiles are one edge strip per floor
      (~150× overwork). Compute entering/leaving strips analytically from the
      step delta; full rescan only when `firstVisibleFloor` changed.
- [ ] `Visibility.sendMapItemChanges` (`Visibility.ts:367-405`) JSON-
      serializes every tile twice (once for batch sizing, once in
      `session.send`) and recomputes a constant envelope per call. Serialize
      once and assemble batches by concatenation through `sendSerialized`;
      convert `onMapItemsChanged` to the serialize-once shared pattern used
      everywhere else.
- [ ] Small churn batch: `[...knownCreatureIds]` copy per step
      (`Visibility.ts:479`); `creaturesInArea` allocating per area tile (225
      arrays per 15×15 spell — add `SpatialGrid.forEachAt`);
      `ImbuementService.ts:92` iterating all sessions every tick (add
      `nextSweepAt`); `canMergeItems.ts:16` `JSON.stringify` equality on the
      loot path (shallow compare); `MonsterEventService.ts:409` array-in-
      closure (module-level `Set`); `Combat.ts:1847` per-application
      `Array.from` (frozen constant).
- [ ] The capacity doc's named remainder: the tick touches **all** connected
      sessions at batch begin/flush boundaries — keep a set of sessions with
      queued output and flush only those.

**Phase 2 verification:** `playtest:tick-stall`, `test:players` at 2k/4k
stages, `monsterCapacity` with its new gate, per-phase tick breakdown
before/after, full `yarn test` (movement/visibility/AI suites are dense
here). These changes touch the charter-critical visibility path — rule 6 (no
over-sharing) must hold: the player-cell candidate set must produce exactly
the same recipient set as the current full scan (add a differential test).

---

## Phase 3 — Database batching (after co-location)

- [ ] **Login collapse.** Merge the 35-RT sequence into 1–2 statements: one
      `loginSnapshotQuery` with `json_agg` scalar sub-selects per subsystem
      (the pattern `depot/sql/storedStateQuery.ts` already establishes),
      keeping depot separate if convenient. Intermediate independent merges
      if the full collapse is too big a bite (each is small): gems+wheel 4→1,
      friends 4→1, profile 4→1, outfits 2→1, vips 2→1, share the
      `prey_resources` row between prey and hunting tasks, batch first-login
      starter-outfit grants. Cheap set alone: ~15 RTs.
- [ ] **Route guild attach through the login queue.**
      `guild/PgGuildStore.ts:120-146` runs a 4-way `Promise.all` off-queue —
      a guilded login peaks at 6 pool checkouts (2 logins can exhaust the
      pool of 10), violating the `LoginLoadQueue` one-connection invariant.
      Merge `loadSnapshot` into one statement or route it through
      `loginLoads`.
- [ ] **`PgItemPersistOps.applyPlan` unnest batching**
      (`item/PgItemPersistOps.ts:50-153`): one RT per row op + per audit row
      inside SERIALIZABLE — a quick-loot is 12–14 RTs holding the
      transaction (this drives 40001 contention against saves). Batch to 3–4
      statements with `unnest` arrays (pattern:
      `character/sql/updateCharacterSkillsQuery.ts`); the per-op
      `rowCount !== 1` divergence guard becomes a returned-id-set
      comparison. **Write the exploit test first** (charter): two racing
      moves for the same item must still leave exactly one item.
- [ ] **`DepotPersistOps.persist`** (`depot/DepotPersistOps.ts:34-124`): same
      shape, five loops (10-stack deposit ≈ 35 RTs) — same unnest fix.
- [ ] **`PgItemLocks.lockCharacter`** (`item/PgItemLocks.ts:50-126`): 5 RTs
      to lock one row + derive capacity; runs per `consumeCharge` (every
      exercise-weapon tick). Collapse to one CTE statement (`FOR UPDATE` in a
      CTE still locks).
- [ ] **Market create/accept N+1** (`market/PgMarketCreateOps.ts:75-95`,
      `PgMarketAcceptOps.ts:209-234`): 2 RTs per source stack → one
      `ANY($1) FOR UPDATE ORDER BY id` + one grouped child-count query.
- [ ] **Coalesce per-kill writes.** `BestiaryTracker.ts:103` and
      `ProficiencyService.ts:354-360` upsert per monster kill (× party size)
      though both maps are memory-resident and authoritative — flush on the
      30 s save cadence and on detach. Defer the login-window prey-slot write
      (`PreyService.ts:148`).
- [ ] **Storage/skills delta writes.** `replaceCharacterStoragesQuery`
      deletes + reinserts every row when one quest flag changes; move to
      `ON CONFLICT … WHERE DISTINCT FROM` upsert + targeted delete. Skills:
      only write changed rows (adjust the row-count guard to a set
      comparison).
- [ ] After the above: raise the serializable retry backoff from 15 ms×attempt
      to something RTT-aware (~100 ms), and revisit `PG_POOL_MAX` (default
      10; the old follow-ups file suggested 30–40 once concurrency is known).
- [ ] Confirm-and-delete: `PgEquipmentOps`, `PgWorldItemOps`,
      `PgContainerMoveOps`, `PgStackOps` appear to have no live callers (the
      live path is memory-first `store.persist`; `PgItemStore.equip/…` are
      referenced only from tests). One more grep pass over `admin//gm/
      playtest/`, then delete — a large dead SERIALIZABLE surface.

**Phase 3 verification:** `yarn workspace server test:integration` (budget
for the 4 known-red guild/social tests), the item crash harness
(`PgItemCrashHarness.integration.test.ts`), login-latency metric from
Phase 0, DB query histogram. Charter checklist applies: atomicity, audit log
in-transaction, exploit regression tests.

---

## Phase 4 — Client rendering and startup

### 4a. Startup / time-to-play

- [ ] **`objects.json` (36.8 MB, 54,091 objects)** is fetched and
      `JSON.parse`d on the main thread, then re-materialized with two spreads
      per object (~108k allocations), blocking world entry
      (`lib/render/AssetStore.ts:148-198`). Move parse+build to a Web Worker
      (or a binary/columnar format); interim: mutate parsed objects in place,
      split the catalog per category (lazy-load effects/missiles), verify
      Brotli is actually served.
- [ ] **Locale bundles**: both languages (218 KB raw) are inlined into a
      495 KB chunk emitted six times, on every route including the landing
      page (`i18n/i18n.ts:3-4`, `app/layout.tsx:3`). Dynamic-import the
      non-default locale (`resourcesToBackend`); hardcode the two layout
      metadata strings.
- [ ] **Code-split the game overlays**: `GameWorldOverlayParent.tsx` statically
      imports 16 modal surfaces (market, wiki, forge, wheel, bestiary, …) into
      the first-load chunk; wrap each in `next/dynamic(..., {ssr:false})` —
      they all render `null` until opened.
- [ ] **Atlas retention**: all 40 decoded 4096² ImageBitmaps (~67 MB RGBA
      each) are retained for the session and all are GPU-uploaded at login
      (40 rAF stalls) (`AssetStore.ts:266-286`, `WorldRenderer.ts:369-390`).
      Release bitmaps once textures exist (re-acquire lazily for outfit
      bakes); upload only sheets the spawn area references.

### 4b. Steady-state frame cost (after Phase 1d)

- [ ] **Creature sort isolation.** Creatures share `floor.objects` with every
      static tile sprite (`MapView.ts:108-132`, `sortableChildren = true`);
      any creature zIndex write re-sorts the whole container (thousands of
      sprites, ~every frame in a hunt). Move creatures to a pixi 8.19
      `RenderLayer` (or at minimum stop rewriting every creature's
      `creatureOrder` when the count changes — use a stable spawn ordinal).
      Highest-ceiling render fix; needs the screenshot harness.
- [ ] **Outfit texture keys**: `CreatureView.updateFrame` rebuilds a
      7-element join key (with RGB-tuple `toString`) per moving creature per
      frame (`CreatureView.ts:556-588`) — precompute the invariant prefix,
      index by packed `(dir<<8)|(z<<4)|phase`.
- [ ] **Item icon animation store**: mounting an icon triggers a full
      listener sweep (opening a depot is O(N²)), and the global revision
      re-renders every mounted icon on any phase change
      (`lib/render/itemIconAnimationStore.ts`, `useItemIcon.ts:32`). Coalesce
      `restartClock` per commit; per-appearance revisions.
- [ ] **Chat re-mapping**: every combat-log line re-maps all channel history
      through `toChatMessage` and defeats `ChatPanel`'s memo
      (`GameHudOverlay.tsx:86-118`). Split the combat-log memo from channel
      memos, or store entries pre-localized.
- [ ] **`MapView` step costs** (the deferred `tileItems` item from July):
      memoize `tileItems` per tile key with the `tileElevations` invalidation
      points; `applyCover` runs twice per step over uncached merges. Diff
      `drawFloorWindow`'s window rect (edge strips) instead of rebuilding
      ~2,800 wanted-keys + ~22k `startsWith` scans per step; nested
      `Map<floor, Map<idx>>` for `drawnTiles`.
- [ ] **Sprite pooling** in `drawItem`/`destroyRenderedTile`
      (`MapView.ts:659-741`): free-list Sprites instead of destroy/create per
      window edge; skip phase machinery when `phases === 1`.
- [ ] **Session-controller fan-out**: `GameWindowSessionController.tsx`
      rebuilds a 26-key sessions object and re-notifies the whole store on
      every inventory update — write per-domain state slices instead.
- [ ] **List hygiene**: memoize `BattleList`'s sorted view and rows (3
      `localeCompare` per comparison per render today — plain compare is
      fine for ASCII names); row-memo depot/auction/container lists.
- [ ] **Message parse fast-path** (measure first): zod `safeParse` per
      message is discriminated-union O(1) dispatch but still clones; profile
      `onMessage` at the 500/1000-monster stages, then either zod v4 or
      hand-rolled validators for the 4–5 hot server→client types. (Server
      must keep full zod validation of client→server messages — charter
      rule 1; this item is client-side only.)
- [ ] Two-line items: hoist `getFirstVisibleFloor`'s neighbour table +
      `applyCover` closures (`lib/render/getFirstVisibleFloor.ts:19-25`).

**Phase 4 verification:** `yarn test:monsters` (then raise
`MIN_AVERAGE_FPS` above 15 to lock in gains), `gameFreeze.e2e`, headless
screenshot checks for any render-order-touching change (RenderLayer,
pooling), Next build size output for 4a.

---

## Phase 5 — Dead code removal (safe, do anytime)

Confirmed dead (grep-verified zero references, including dynamic/string refs):

- [ ] `server/src/action/ropeHoleIds.ts` — also fix the stale comment at
      `tools/convertOtbm.mjs:369` claiming it's "the execution-time
      authority" (the live path uses converter-classified `rope-hole`
      actions).
- [ ] `server/src/depot/DepotStateRow.ts`, `server/src/depot/sql/deleteItemById.ts`
      (stray copy of `item/sql/deleteItemById.ts`),
      `server/src/market/sql/ensureCharacterDepotQuery.ts`.
- [ ] `server/src/economy/` superseded validation layer: `itemHasShopSubtype.ts`,
      `ownedRowHasAttributes.ts`, `ownedRowHasSubtype.ts`,
      `sql/insertItemTransferredAuditQuery.ts`, `validateShopCharacterId.ts`,
      `validateShopCommon.ts`, `validateShopCurrency.ts`.
- [ ] `client/lib/combat/getSpellCombatTarget.ts`,
      `client/lib/imbuement/formatImbuementTime.ts`,
      `client/lib/inventory/toInventoryItemPresentation.ts`.
- [ ] Story-only components with zero product references: `CombatLog.tsx`,
      `LoadingBar.tsx`, `SpellListModal.tsx`, `DurabilityIcon.tsx`,
      `tibiaTooltipItems.ts` (delete or ship the surfaces they were built
      for — decide per component).
- [ ] **`.creature-staging-4451/` — 28 MB tracked in git**, an interrupted
      `importCanaryCreatures.mjs` staging dir (stale monster data, duplicate
      npc/spawn files). `git rm -r` + add `.creature-staging-*` to
      `.gitignore`.
- [ ] Protocol export surface: ~90 fully dead exported symbols (mostly
      `z.infer` convenience aliases) + ~249 over-exported sub-schemas
      (de-export, don't delete). Mechanical cleanup; shrinks the API surface
      knip can't see through.
- [ ] Unused exports flagged by knip (27 exports + 35 types): wheelGeometry
      constants, blessing/stamina/offline-training constants, `Spell.ts`
      types, store record interfaces (mostly de-export).
- [ ] Dependencies: **declare `sharp` and `pg` at the root** — `sharp` is
      used by 5 `tools/*.mjs` but declared in no package.json (a fresh clone
      breaks `yarn assets:import`); `pg` resolves only via hoisting. Drop
      client `@vitest/coverage-v8` if no one uses `--coverage`.
- [ ] Wire the 10 manual one-off import CLIs (`importCanaryDoors.mjs` etc.)
      into root package.json scripts like their siblings, so tooling stops
      flagging them and they stay discoverable.
- [ ] The likely-dead `Pg*Ops` SERIALIZABLE layer — tracked in Phase 3 (needs
      the extra grep pass first).

Caution: knip had a 24% false-positive rate on files (all dynamic/string
references) — re-verify each deletion with a grep in the PR, and run the full
suite + a Storybook build.

---

## Phase 6 — Duplication merges (respect the no-abstraction-layers rule)

Worth merging (real logic, not scaffolding):

- [ ] **Spell definitions** — the biggest cluster: ~20 conjuring spells are
      byte-identical in their body; `exevo-gran-mas-tera/vis` share 104
      lines; the `-hur` beam family ~50 lines ×5; `exevo-mas-san` shares
      43–97 with four rune files. Move to data-driven spell tables (formula
      coefficients + area matrix + element) feeding one factory. Gate with
      `playtest:spells` (the parity suite exists precisely for this).
- [ ] `combat/wheelUpgradedAreas.ts` re-pastes area matrices from three spell
      files — export areas from one shared module.
- [ ] `depot/locationFromRow.ts` ↔ `item/locationFromRow.ts` (59 identical
      lines) — keep `item/`, delete the depot copy.
- [ ] `item/plan/planSetPodiumMapItem.ts:37-91` ↔ `planWriteMapItem.ts:37-91`
      — extract the shared map-item precondition helper.
- [ ] Prey ↔ Hunting Tasks twins (server services 139 dup lines, client slot
      cards 86): extract a shared slot-lifecycle core (roll/reroll/lock/
      wildcard) parameterized by option type — worthwhile, but only if the
      seam is clean; both systems are shipped and stable, so gate with their
      existing suites.
- [ ] `CharacterService.test.ts:32-127` re-implements
      `test/InMemoryCharacterStore.ts` — import it instead.
- Deliberately **not** merging: the ~17× service/session subscribe-push
  scaffolding and ~15× `use*Session` hooks (cohesive boilerplate; an
  abstraction would fight the project's explicit no-helper-layers rule), Pg
  integration-test setup, story fixtures, `carpetTravelRoutes` data.

---

## Phase 7 — Canary-inspired architecture (measure-first, larger bets)

Our server already has the important Canary ideas in some form (activation
range = idle sleep, AI budgets, serialize-once broadcasts, 128-msg coalescing,
96-node path cap). The fork at `~/code/canary` offers these still-unadopted
mechanisms — take them only if Phase 0 numbers say the relevant path is hot
after Phases 1–3:

- **Visible/background monster tiering with hysteresis** (promote ≤10 tiles,
  demote >12, 3 s hold; small frequent batches for visible, coarse for
  background; never replay missed ticks). Ours is binary active/inactive.
- **Time-sliced queue draining** (drain ≤N items AND ≤ a time budget, requeue
  the remainder) — bounds worst-case tick time under bursts; pairs with lane
  budgets so background AI can never starve player input (Canary: player
  lanes 256 tasks/pass, maintenance 16; p99-based backpressure at 50 ms SLO).
- **Single-timer sorted decay map** (one scheduled event aimed at the
  earliest expiry for the whole world) if decay/timer volume ever shows up in
  the tick breakdown.
- **Position-keyed spectator cache** deduplicating fan-out queries within one
  game event (Canary invalidates the whole cache on any creature tile change
  — brutally simple and still wins).
- **Path-refresh throttle** at 2,000 ms per chasing monster (our per-think
  recompute is addressed in 2d; this is the fuller version).
- **Save coalescing by generation token** (stamp on schedule, skip on execute
  if superseded) if save bursts persist after 1b/3.
- Client worker-thread message parsing (the July deferred item) — only if the
  Phase 4 profile still shows parse time after the zod fast-path.

---

## Standing constraints

- The security charter overrides everything: no validation moves client-side,
  no reduction of server-side checks, recipients of any broadcast must remain
  exactly those who can see (rule 6) — add differential tests when touching
  visibility. Item batching keeps single-transaction atomicity + in-transaction
  audit logs (rules 2, 11), with race exploit tests written first.
- July 2026 pass invariants to preserve: immutable `InventoryCache`
  replacement; `canSee.ts` as the single floor-stack authority;
  `firstVisibleFloorFor` keyed on `passabilityRevision` only; fingerprinted
  skill/storage saves; `drainDue`'s same-array in-place contract (handlers
  enqueue during processing); load-time stackIndex-sort guarantee.
- Memory-first corpse/loot invariant: no DB rows until first touch.
- Rendering changes ride the headless screenshot harness; effects-above-onTop
  is a recorded deviation, don't "fix" it in passing.

## Documentation corrections to fold into the first PR

- `docs/server-capacity.md:361` claims world-entry reads run in parallel —
  false since Feature 106 serialized them onto `LoginLoadQueue`.
- `TODO.md` / `todo/status.md` say login is "~28 round trips" — the measured
  count is 35 sequential (+4–8 concurrent off-queue).
- `tools/convertOtbm.mjs:369` references `ropeHoleIds.ts` as authoritative —
  stale (Phase 5).

## Expected outcomes (rough, to be validated by Phase 0 numbers)

- Login: ~2.1 s → tens of ms (co-location + statement collapse).
- Save/write volume: order-of-magnitude reduction in combat (per-swing saves,
  per-kill upserts, item-op batching) with a matching drop in 40001 retries.
- Tick headroom: the 4,000-player p95 was measured with no monsters and no
  DB; phases 2a–2c remove the O(players×events) and allocation-churn terms
  that would dominate a combined load, unlocking an honest combined
  players+monsters+DB capacity run (the capacity doc's gate list).
- Client: measurable FPS gain at the 500/1000-monster stages (lock in by
  raising `MIN_AVERAGE_FPS`), visibly faster world entry, and a smaller
  first-load bundle.
- ~16 dead files, one 28 MB tracked orphan directory, ~90 dead protocol
  exports, and ~11.5k duplicated lines reduced to data tables and shared
  modules.
