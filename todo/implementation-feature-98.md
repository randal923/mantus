# Feature 98 — Durability and deployment

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
Correctness must not depend on a scheduled global save, map clean, or daily restart; weeks-long uptime must persist correctly and deploys must not lose state. The perf pass's dirty-flag saves are groundwork only — none of the durability model, drain, or restart policy exists.

## Remaining work

### Continuous durability model (no daily-save crutch)
- Correctness independent of scheduled global save/map clean/daily restart; weeks-long uptime persists correctly.
- Define and monitor an accepted durability window per state class: bounded async snapshots for non-economy character state; immediate committed transactions before acknowledgement for economy/ownership/rewards.
- Failure-injection tests for abrupt process death between in-memory mutation and async snapshot persistence.

### Graceful drain + shutdown
- Ordered drain: stop new sessions → stop new gameplay work → flush dirty snapshots with a deadline → unsaved-character metric reaches zero → close connections → stop process.

### Cold-start reconstruction + migration policy
- Startup reconstructs transient world indexes from Postgres plus versioned static content; no clean prior shutdown required.
- Online/backward-compatible migrations by default; maintenance window only for genuinely incompatible changes, never as a persistence mechanism.
- Restart tests prove durable schedules, mutable world state, and ownership rebuild without a global-save routine.

## Implementation
- Durability model is mostly the existing architecture — the work is documenting the window, adding the oldest-unsaved-age metric (Feature 95), and kill-the-process failure-injection tests via `server/src/playtest/` against the docker `playtest` Postgres.
- Drain state machine in `server/src/index.ts`/`GameServer.ts`: admission refusal flag, TickLoop wind-down, dirty-save flush with deadline. Drain state is a readiness input for Feature 95; the fatal-flush deadline shares machinery with Features 94 and 97.
- Verify/extend the load path in `server/src/World.ts` and the loaders; restart tests via the playtest harness (boot the server twice against the same DB). Migration policy doc plus CI checks (Feature 100).

## Tests
- Failure injection: abrupt process death between mutation and snapshot persistence loses at most the documented window, never economy state.
- Graceful deploy test: drain reaches zero unsaved characters before shutdown.
- Restart tests: durable schedules, mutable world state, and ownership rebuild correctly from Postgres with no clean shutdown.

## Dependencies
- Feature 95 (oldest-unsaved-age metric, readiness input), Feature 97 (save-failure handling, fatal-flush deadline).
- Overlaps Feature 100's failure-injection/restart test items; provides the staging environment Features 93 and 100 need.
