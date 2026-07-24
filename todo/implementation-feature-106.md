# Feature 106 — Server performance deferred items

Part of [Todo 22 — Performance follow-ups](todo-22.md).

## Why
These items were deliberately deferred from the 2026-07-24 optimization pass because they lacked evidence of need. All are **measure first**: implement only when load data (Feature 100's staging gates) shows they matter.

## Remaining work
- `PG_POOL_MAX` default (20) may be low under load; raise to 30–40 once player counts and the Postgres `max_connections` budget are known (`server/src/index.ts` line 34, bounds 1–50 at line 49).
- `MonsterBrain.acquireTarget` (`server/src/ai/MonsterBrain.ts`) sorts all candidates with `localeCompare` tiebreaks and re-checks `world.canSee` per candidate. Fix: short-circuit cheap predicates before `canSee`; replace the full sort with a single-pass min for nearest/health/damage. Behavior-sensitive (tie ordering) — write a parity test against the current picker first (`MonsterBrain.test.ts` scaffold exists).
- Character creation runs per-item/per-skill INSERT loops (`insertStarterSet.ts`, `insertCharacterSkills.ts`); batch with `unnest` only if creation latency proves to matter.
- `ChatHandler.findOnlinePlayerByName` linear-scans with `toLowerCase` per candidate; index by normalized name only if PM volume grows.
- `ConditionManager.tick` clones the condition object per advancing tick; `project` re-sorts per fight-state send; low priority.
- permessage-deflate is off — if bandwidth matters, enable with a ~1–2 KB threshold so only join/teleport `tile-states` bursts compress; measure CPU cost first (ws options in `GameServer.ts` ~line 506).

## Implementation
- Each item names its file above; none should land without a measurement justifying it and, for `acquireTarget`, a passing parity test against the current selection order.

## Tests
- `MonsterBrain` target-selection parity test before any rewrite.
- Load measurements from staging (Feature 100) recorded alongside any change; re-run relevant playtest gates after.

## Dependencies
- Feature 100 (staging capacity/soak gates provide the load measurements that justify or reject each item).
