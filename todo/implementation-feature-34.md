# Feature 34 — Durable decay deadlines

Part of [Todo 9 — Death, corpses, loot, and decay](todo-9.md).

## Why
Decay deadlines are in-memory only; on boot every persisted world item with decay metadata is re-armed with its full duration, so transforms run late but never early and never twice. That is an accepted limitation — this feature persists a `decay_at` column so deadlines survive restarts exactly.

## Remaining work
- Add a persisted `decay_at` only if re-arm-on-boot becomes exploitable (players hoarding decayables across restarts to extend their lifetime). Low priority by design.

## Implementation
- Migration adding `decay_at` to world items.
- Write it in `server/src/item/PgDecayOps.ts` when arming a deadline.
- On boot, schedule from the persisted deadline instead of re-arming with full duration.
- Keep every other invariant of the current design: version-checked store transaction, stale-guard at execution, audited transforms.

## Tests
- Restart with a persisted `decay_at` in the past transforms once, immediately, not twice.
- Restart mid-duration resumes the remaining time, not the full duration.
- Stale-decay guards unchanged (moved/transformed items still immune to old tasks).

## Dependencies
- None blocking — deliberately deferred until the restart-hoarding exploit matters. Feature 33 (carried decay) may motivate it sooner if carried deadlines also need durability.
