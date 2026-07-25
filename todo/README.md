# Canary-parity backlog overview

Backlog restructured 2026-07-24 from a full audit of the previous per-area todo
files against the current repository. Completed work now lives in
[`done.md`](done.md); everything still needed to reach full parity with the
pinned Canary baseline is organized as numbered todo areas (`todo-1.md` …
`todo-22.md`), each listing its remaining features. Every feature has its own
implementation file (`implementation-feature-N.md`) with the concrete plan,
file surface, Canary references, and required exploit/regression tests.

Pinned upstream snapshots:

- [Canary `a879c931`](https://github.com/opentibiabr/canary/tree/a879c9312e34381e8eedf397b8ed44510698b689)
  (server mechanics and OTServBR Global content).
- [OpenTibiaBR OTClient `bdea0b23`](https://github.com/opentibiabr/otclient/tree/bdea0b23b4a738809d698cb7e4f88a299dd6bffc)
  (rendering and client behavior; MIT).

`AGENTS.md` and the project security charter are mandatory for every feature
below. Features may land incrementally in dependency order, but "later" and
"deferred" describe scheduling, not a reduced final scope.

## Rewrite boundary

This project is a complete rewrite of the Tibia stack. Canary and OTClient are
reference implementations only: inspect them for behavior, formulas, data
layouts, content locations, and edge cases, then re-express the result in this
repository's architecture.

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
- Static definitions (`ItemType`, `MonsterType`, `Vocation`) stay separate from
  mutable instances; every dynamic system is z-aware.
- Correctness never depends on a daily global save: economy/ownership commits
  are transactional-before-acknowledgement with audit entries; ordinary
  character state persists continuously within a documented bounded window;
  schedules are durable, idempotent, server-clock driven.
- New packets get a zod schema, max size, and rate expectation in `protocol/`
  before any handler.

## Backlog index

| Area | Remaining features |
|---|---|
| [Todo 1 — Foundations and Canary parity ledger](todo-1.md) | 1 |
| [Todo 2 — Characters](todo-2.md) | 2 |
| [Todo 3 — Map and movement](todo-3.md) | 3–4 |
| [Todo 4 — Rendering and animation](todo-4.md) | none (5–8 complete) |
| [Todo 5 — Creatures, spawns, and AI](todo-5.md) | 9–10 |
| [Todo 6 — Items and inventory](todo-6.md) | 11–17 |
| [Todo 7 — Vocations, stats, and progression](todo-7.md) | 18–20 |
| [Todo 8 — Combat, spells, and conditions](todo-8.md) | 21–28 |
| [Todo 9 — Death, corpses, loot, and decay](todo-9.md) | 29–34 |
| [Todo 10 — Chat and channels](todo-10.md) | 35–36 |
| [Todo 11 — NPCs, dialogue, and travel](todo-11.md) | 37–42 |
| [Todo 12 — Economy: shops, bank, depot, trade, market](todo-12.md) | 43–49 |
| [Todo 13 — Typed world actions](todo-13.md) | 50–53 |
| [Todo 14 — Raids and world events](todo-14.md) | 54 |
| [Todo 15 — Parties, guilds, PVP, houses, social](todo-15.md) | 55–67 |
| [Todo 16 — Remaining Canary systems and client polish](todo-16.md) | 68–89 |
| [Todo 17 — Client and session resilience](todo-17.md) | 90–92 |
| [Todo 18 — Operations, observability, and security](todo-18.md) | 93–100 |
| [Todo 19 — Auth follow-ups](todo-19.md) | 101 |
| [Todo 20 — Dev tooling](todo-20.md) | 102 |
| [Todo 21 — Quests](todo-21.md) | 103–105 |
| [Todo 22 — Performance follow-ups](todo-22.md) | 106–107 |

Front-end work still outstanding after a feature's server side ships is
collected in [`todo/client/`](client/README.md).

## Recommended order

1. Quick correctness fixes first: Feature 3 (pz-lock transition bypass),
   Feature 12 (use exhausts), Feature 19 (event-id pruning), Feature 47
   (40001 retry), Feature 59 (combat-logout persistence).
2. The role/admin migration (Feature 96) early — one migration + session gate
   unblocks Features 43, 54, 66, 101, and 102.
3. Content-parity grinds in dependency order: creatures/items/combat gates
   (Features 9–10, 17, 24–26), loot tables (29), NPC commands (38–40), world
   actions (50–53), then the world event engine (54).
4. Social/houses completions (55–67) and remaining Canary systems (68–89).
5. Resilience and operations tracks (90–100) continuously alongside features;
   Feature 100 is the final pre-launch gate.
6. Quests last (103–105): the largest pure-content layer; nothing depends on
   it.
7. Performance follow-ups (106–107) are measure-first; do them when the
   staging gates in Feature 100 produce real load numbers.

Implement one feature per session/PR; never more than one economy-relevant
system in a single PR. Add newly discovered gaps to the narrowest matching
todo area and, if needed, a new numbered feature file.

## Completion contract

Feature 1 (the parity ledger) is the cross-cutting completion contract:
finished means zero unsupported registered gameplay definitions, zero
unreviewed procedural callbacks, zero silently ignored gameplay fields, with
stable classifications for non-content — verified by generated reports and CI
gates (Feature 100).
