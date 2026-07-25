# Feature 54 — completed sub-work

World event engine, from
[implementation-feature-54.md](../implementation-feature-54.md). The feature
stays **open**: raids ship, but daily resets, boosted rotations and the other
global events are not imported yet.

Cross-links: [implementation-feature-54.md](../implementation-feature-54.md) ·
[todo-14.md](../todo-14.md).

---

## 2026-07-25 — Durable engine and the raid import lane

**Problem.** `server/src/event/` did not exist. Raids, global events, daily
resets and boosted rotations all needed one restart-safe engine; ad-hoc timers
are how duplicate bosses and double rewards happen.

**What changed.**

*Import lane.* `tools/parseCanaryRaids.mjs` + `tools/importCanaryRaids.mjs`
(`yarn raids:import`) parse the 21 modern raid revscripts under
`data-otservbr-global/scripts/raids` into
`content/events/canary-raids.json` and `server/data/raids.json`: zone areas,
Canary's roll config (`allowedDays`, `minActivePlayers`, `initialChance`,
`targetChancePerDay`, `maxChancePerCheck`, `minGapBetween`, `maxChecksPerDay`)
and the ordered `addBroadcast`/`addSpawnMonsters` stages with their
`autoAdvance` delays. `for _ = 1, N do` loops are expanded so the imported stage
list matches the one Canary builds at load time (folda.yeti is 23 stages, not
4). **18 raids imported, 3 excluded** — three files re-register an id another
file also uses, which shadows them in Canary too. The 17 raid monster names the
pinned creature import does not carry are reported, not dropped.

*Engine.* `WorldEventManager` drives everything from the database clock.
Rolling: `claimDueChecks` is one conditional UPDATE that advances
`next_check_at` as it returns the row, so the row *is* the lease and two
managers racing one schedule produce exactly one claim. Firing:
`beginRun(idempotencyKey)` is `ON CONFLICT DO NOTHING` on a key derived from the
event id and the claimed check, so a retry or a replay starts no second run.
Restart: `abandonStaleRuns` retires runs left by a dead process instead of
resuming them — matching Canary, where a restart ends an in-flight raid. Steps
execute inside the tick with bounded work per tick (8 spawn placements), and
announcements carry no position or internal state. `rollWorldEventCheck` is a
pure function of the durable roll state, so Canary's chance ramp, day gate,
player gate, gap and daily budget are all reproducible in a test.

Migration `044_world_events.sql` adds `world_event_schedules`,
`world_event_runs`, and the `world-event-started`/`world-event-operator` audit
types. Operator control is `/raid <eventId>` through the GM handler, audited
against the operator's own character whether or not it is accepted.

**Files touched.** `tools/{parseCanaryRaids,importCanaryRaids}.mjs`,
`content/events/canary-raids.json`, `server/data/raids.json`,
`server/db/migrations/044_world_events.sql`,
`server/src/event/{WorldEventDefinition,loadWorldEventContent,WorldEventManager,WorldEventStore,PgWorldEventStore,rollWorldEventCheck}.ts`,
`server/src/{GameServer,index}.ts`, `server/src/gm/GmCommandHandler.ts`,
`package.json`, `content/source-manifest.json`.

**How it was verified.** `WorldEventManager.test.ts` (7 cases: roll →
announce → spawn inside the area; two managers racing one schedule firing once;
the same idempotency key never re-running; an interrupted run abandoned at
startup rather than resumed; no restart while a run is in flight; the operator
path audited and the unknown-event path refused; nothing at all without a
store). `worldEventContent.test.ts` (10 cases) loads every imported raid, keeps
them fail-closed on another map, pins the unresolved-monster budget at 17, and
covers each `rollWorldEventCheck` gate.

**Residual risk.** Reward idempotency is structurally satisfied rather than
exercised: no pinned raid grants an item or currency, so there is no reward leg
to double-pay. When one lands, it must go through a run-keyed transaction like
the chest gate. Spawned raid monsters are memory-only creatures, so a restart
mid-raid loses them — the same as Canary.
