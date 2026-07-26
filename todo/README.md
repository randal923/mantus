# Canary-parity backlog overview

Everything still needed to reach full parity with the pinned Canary baseline,
consolidated 2026-07-25 into **13 merged area files** (`todo-1.md` …
`todo-13.md`). Each area file carries its features' full plans inline —
remaining work, file surface, Canary references, and required
exploit/regression tests. There are no separate per-feature files anymore.

Structure rules:

- **Feature numbers are stable and never reused.** Closed features live in
  [`done.md`](done.md) (the single permanent record — the former
  `completed/` logs were folded into it). New work gets new numbers (110+)
  as a `## Feature 110 — …` section inside the narrowest matching area file.
- **70 features remain open** (of 109). † marks features whose only
  remainder is a client surface, tracked in [`todo/client/`](client/README.md)
  — the single index of outstanding client-side work.
- When a feature finishes: append a dated entry to `done.md` (problem, what
  changed, files touched, verification, residual risk), delete its section
  from the area file, and transfer any residual sliver to a named owner.

Pinned upstream snapshots:

- [Canary `a879c931`](https://github.com/opentibiabr/canary/tree/a879c9312e34381e8eedf397b8ed44510698b689)
  (server mechanics and OTServBR Global content).
- [OpenTibiaBR OTClient `bdea0b23`](https://github.com/opentibiabr/otclient/tree/bdea0b23b4a738809d698cb7e4f88a299dd6bffc)
  (rendering and client behavior; MIT).

`AGENTS.md` and the project security charter are mandatory for every feature.
Features may land incrementally in dependency order, but "later" and
"deferred" describe scheduling, not a reduced final scope.

## Rewrite boundary

This project is a complete rewrite of the Tibia stack. Canary and OTClient
are reference implementations only: inspect them for behavior, formulas, data
layouts, content locations, and edge cases, then re-express the result in
this repository's architecture.

- Project-native TypeScript server, zod intent/event protocol, Postgres
  persistence, PixiJS/React client.
- Never preserve Canary's C++ class hierarchy, Lua runtime, binary packets,
  database schema, or global-save architecture.
- Never execute downloaded Lua; converted static data is validated, versioned
  build input. Canary and OTClient are never runtime dependencies.
- Match pinned player- and operator-visible gameplay behavior and content;
  prefer this project's stricter security when internal compatibility would
  conflict with the authoritative tick, visibility, atomicity, or operational
  model — but never use architecture differences to omit visible features.

## Cross-cutting rules

- The server owns `Position`, health, outfits, item state, timing, and RNG;
  clients send intents and render authorized projections.
- Static definitions (`ItemType`, `MonsterType`, `Vocation`) stay separate
  from mutable instances; every dynamic system is z-aware.
- Correctness never depends on a daily global save: economy/ownership commits
  are transactional-before-acknowledgement with audit entries; ordinary
  character state persists continuously within a documented bounded window;
  schedules are durable, idempotent, server-clock driven.
- New packets get a zod schema, max size, and rate expectation in `protocol/`
  before any handler.

## Backlog index

| Area | Features |
|---|---|
| [Todo 1 — Canary parity ledger and gates](todo-1.md) | 1, 89 |
| [Todo 2 — Map, world actions, and world events](todo-2.md) | 4, 50–52, 54 |
| [Todo 3 — Creatures, spawns, and AI](todo-3.md) | 9, 10 |
| [Todo 4 — Items and inventory](todo-4.md) | 11, 16, 17, 108 |
| [Todo 5 — Combat and spells](todo-5.md) | 22, 24, 26 |
| [Todo 6 — Death, loot, and decay](todo-6.md) | 29, 32, 33 |
| [Todo 7 — Chat, channels, and NPCs](todo-7.md) | 35, 38, 40, 41 |
| [Todo 8 — Economy](todo-8.md) | 43, 45, 46, 48, 49 |
| [Todo 9 — Characters, social, and houses](todo-9.md) | 2, 57–59, 62†, 65, 67, 109 |
| [Todo 10 — Remaining Canary systems](todo-10.md) | 68†–71†, 72–86 |
| [Todo 11 — Client engineering](todo-11.md) | 87, 88, 90–92, 107 |
| [Todo 12 — Operations, security, auth, dev tooling](todo-12.md) | 93–102, 106 |
| [Todo 13 — Quests](todo-13.md) | 103–105 |

## Known blockers

None stops the majority of the backlog, but each gates a named slice:

1. **Canary checkout — resolved 2026-07-26:** a standing pinned clone lives
   at `~/code/canary` (`a879c931`, blobless). Every importer takes it as
   `argv[2]`/`CANARY_PATH` and hard-fails on commit mismatch; it feeds
   Feature 41's routes, 38's callback semantics, 29's child-container
   re-import, 89's inventory, 103–105. If it goes missing, re-clone:
   `git clone --filter=blob:none --no-checkout https://github.com/opentibiabr/canary.git <dir> && git -C <dir> checkout a879c9312e34381e8eedf397b8ed44510698b689`
2. **Asset regeneration** (`Tibia.dat`/`.spr` outside the repo): re-emitting
   `objects.json` + atlases rewrites every client asset; gates `fluidsource`
   (11), `multiUse`/`usable` (51), `m_transformOnUse`/`ignoreLook` (52),
   `ATTR.market` (49), `ItemType.field` payloads (50). **Feature 108
   (todo-4) owns the single regeneration pass** — never five separate
   rebuilds.
3. **Asset era**: 38 loot entries (29) and 17 raid monsters (54) name content
   absent from pinned Tibia 15.11; test-pinned budgets, closed by a newer
   era, not code.
4. **External data**: Blank Rune / Conjure Royal Star icons absent from
   pinned OTClient data (22).
5. **Product decisions**: rename/delete flows (2 — rename now blocks the
   namelock path), payment provider (43), market expiry full-inbox behavior
   (49), finite shop stock (46); livestream/casting is **excluded** by
   product decision (recorded in Feature 86).
6. **Dependency bottlenecks**: 72 (blessings) gates 32, 38's bless entries,
   and the death-loss stack; 78 (forge) gates 81 and slices of 48/49; 96's
   remainder gates 43/54 operator surfaces; 103 gates storage-gated content
   in 38/41/50/51 and 10's variants.

## Recommended order

1. **Feature 72 first** (todo-10) — blessings + training triggers unblock
   more open work than anything else.
2. **Spell closure chain** (todo-5/6): Feature 24 (Monk unit, conditions,
   field/wall runes with Feature 33's field items) zeroes the combat and
   decay buckets — 45 of the 66 disabled spells. Mass heals co-land with
   Feature 57's party gating; Divine Empowerment trails Features 79–82.
   Feature 26's gate flips to zero only once todo-9's buckets (57, 109,
   65) and Feature 85's familiars close too.
3. **Feature 96 remainder + 101/102** (todo-12) — small, converging,
   unblocks operator surfaces.
4. **Creature/content closure** (todo-10/3/6): 74/76 close Feature 9's big
   blocked buckets (its last 3 entries land with todo-7's NPC work); 75
   rides along and feeds Feature 80's point sources. Feature 10's gate then
   waits only on quest-content variant placements. Feature 29's remainder —
   minus the reward-chest bullet, which waits on Feature 84 (step 6).
5. **Feature 103's quest-state platform** (todo-13) — small on the shipped
   storage substrate, and it unblocks the storage-gated slices deferred
   from Features 38/41/50/51 and Feature 10's variants — then the
   **NPC/economy grind as the Canary checkout allows** (todo-7/8).
6. **Untouched systems** (todo-10) from the Feature 89 inventory; the
   [client backlog](client/README.md) in parallel — it never blocks server
   work.
7. **Resilience and ops** (todo-11/12) continuously alongside; Feature 100
   is the final pre-launch gate.
8. **Quest content last** (104/105, todo-13), then measure-first perf
   (106/107).

Implement one feature per session/PR; never more than one economy-relevant
system in a single PR. Add newly discovered gaps to the narrowest matching
area file — as a bullet under an existing feature, or a new `## Feature
110+` section.

## Completion contract

Feature 1 (the parity ledger) is the cross-cutting completion contract:
finished means zero unsupported registered gameplay definitions, zero
unreviewed procedural callbacks, zero silently ignored gameplay fields, with
stable classifications for non-content — verified by generated reports and
CI gates (Feature 100).
