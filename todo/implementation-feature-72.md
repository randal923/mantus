# Feature 72 — Beds, sleep, stamina, training, blessings, regeneration

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
These are the offline/timed systems: they all share the same abuse surface (clock manipulation) and the same fix (server-clock-only durable timers with exact Canary persistence). This feature also absorbs the beds/sleep item from the old houses todo (14d), and it unblocks blessing-dependent behavior elsewhere: Feature 32's death penalty and Feature 60's blessing-loss extras.

## Remaining work
- Beds/sleep: house authorization through the existing `HouseService` gates; server-side sleep state persisted; regeneration math server-only. (Absorbed from old todo 14d — beds were N/A there because no bed system existed.)
- Offline training and exercise training.
- Stamina.
- Blessings — purchase via bank transaction + audit (charter rule 11).
- Food/soul regeneration with exact Canary persistence.

## Implementation
- Durable per-character timers persisted in Postgres, advanced by the server clock at login/tick — never client-reported time.
- Bed use authorized at execution time via `server/src/house/HouseService.canUseHouseTile`; sleep state and offline-regen accrual computed server-side on next login.
- Blessing purchases as single ACID bank transactions with ledger + audit rows; blessing state consumed by the Feature 32 death path and `server/src/pvp/PvpHooks.ts` (Feature 60).
- Stamina/exercise-training overlap with Feature 18 (combat-progression stamina/training) — coordinate so the timer substrate is shared, not duplicated.

## Tests
- Clock manipulation/replay cannot mint stamina, sleep regen, or training time (login with skewed client clock changes nothing).
- Blessing purchase races cannot double-charge or double-grant; audit rows present.
- Offline accrual is exactly-once across crash/restart.

## Dependencies
- Feeds Feature 32 (death penalty uses blessings), Feature 60 (blessing-loss extras), and house beds use shipped `HouseService` gates.
- Overlaps Feature 18 (stamina/training in combat progression) — reconcile scope before starting.
- Bank core (shipped, todo-12).
