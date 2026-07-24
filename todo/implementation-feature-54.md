# Feature 54 — World event engine

Part of [Todo 14 — Raids and world events](todo-14.md).

## Why
Nothing exists yet — `server/src/event/` is absent. Raids, global events, daily resets, and boosted rotations all need one durable, restart-safe engine; ad-hoc timers or startup-triggered scripts are exactly how duplicate bosses and double rewards happen.

## Remaining work
- Typed state machines with stable event ids, bounded work per tick, announcements, spawn/action steps, and completion handling.
- Restart-safe, idempotent durable events — a restart cannot create rewards or bosses twice.
- Daily resets, rewards, raids, and event boundaries driven by durable server-clock schedules with idempotency keys/leases — never startup- or daily-save-triggered.
- Operator controls with authorization and audit.
- Import every pinned raid, global event, startup/daily schedule, boosted rotation, announcement, spawn wave, and completion callback as durable typed state.

## Implementation
- New `server/src/event/WorldEventManager.ts` plus a migration for durable schedule/event-state tables carrying idempotency keys and leases.
- Event steps execute in the tick loop with bounded work per tick; spawn steps hook the spawn runtime; announcements are visibility-filtered (charter rule 6 — no server internals or out-of-view state leaks).
- Reward/economy outcomes and operator actions commit with their `audit_log` entries in the same transaction that performs them; operator controls are authorized against operator identity, never a client-supplied id.
- Import lane: a `tools/` script over the pinned Canary XML raids and `data/scripts` globalevents, emitting typed content with a classify-everything report (implemented / deferred / excluded, nothing silently dropped).
- Explicitly does NOT wait for the quest storage platform: the pinned raid scripts use no player storage.

## Tests
- Restart mid-event is idempotent — retry produces no duplicate spawns or rewards.
- Lease prevents double-fire across a simulated crash (two managers racing one schedule fire exactly once).
- Daily-boundary behavior is equivalent whether the server stays online or restarts across the boundary.
- Operator controls are rejected without authorization and are audited when used.
- Parity tests over every registered raid/global event from the import report.

## Dependencies
- Todo-4 (spawn runtime) and todo-13/Feature 50 (event action steps).
- Feature 96 (admin tooling — operator authorization for event controls).
- Shares durable-scheduling infrastructure (idempotency keys/leases) with Feature 46's shop restock schedule.
