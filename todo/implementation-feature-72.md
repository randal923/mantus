# Feature 72 — Beds, sleep, stamina, training, blessings, regeneration

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
These are the offline/timed systems: they all share the same abuse surface (clock manipulation) and the same fix (server-clock-only durable timers with exact Canary persistence). This feature also absorbs the beds/sleep item from the old houses todo (14d), and it unblocks blessing-dependent behavior elsewhere: Feature 32's death penalty and Feature 60's blessing-loss extras.

> **Status: open.** The blessing data layer shipped 2026-07-25 — see the
> [completed log](completed/implementation-feature-72-completed.md).

## Remaining work
- Beds/sleep: house authorization through the existing `HouseService` gates; server-side sleep state persisted; regeneration math server-only. (Absorbed from old todo 14d — beds were N/A there because no bed system existed.)
- Offline training and exercise training **in-world triggers only** — the
  conversion engines already exist (Feature 18); do not re-derive the math.
- ~~Stamina.~~ Shipped with Feature 18 (2026-07-24).
- Blessings:
  - ~~Pinned catalog, both cost curves, equipment-loss table as typed data.~~
    Shipped 2026-07-25 (`server/src/progression/blessings.ts`).
  - **Persistence** — `characters.blessings` bitmask column, `CharacterStore`
    load/save, `Player.blessings` reading `lossReducingBlessingCount(mask)`
    instead of the literal 0 it returns today.
  - **Purchase via bank transaction + audit** (charter rule 11). Canary uses
    `removeMoneyBank` (carried gold first, then bank) and refuses while
    pz-locked outside a protection zone — re-check both at execution time.
    Economy-relevant, so it gets its own PR.
  - **Consumption on death** — feeds Feature 32's item drop into a player
    corpse, including the amulet-of-loss and red/black-skull branches from
    `Blessings.PlayerDeath`.
- Food/soul regeneration with exact Canary persistence (soul eligibility
  shipped with Feature 18).

## Implementation
- Durable per-character timers persisted in Postgres, advanced by the server clock at login/tick — never client-reported time.
- Bed use authorized at execution time via `server/src/house/HouseService.canUseHouseTile`; sleep state and offline-regen accrual computed server-side on next login.
- Blessing purchases as single ACID bank transactions with ledger + audit rows; blessing state consumed by the Feature 32 death path and `server/src/pvp/PvpHooks.ts` (Feature 60).
- Stamina/exercise-training overlap with Feature 18 (combat-progression stamina/training) — coordinate so the timer substrate is shared, not duplicated. **Feature 18 shipped 2026-07-24**: stamina is fully done (persistence, offline regen, hunt decay, XP multiplier — do not re-implement); the parity math for offline and exercise training already lives in `server/src/progression/offlineTraining.ts` (`computeOfflineTraining`) and `server/src/progression/exerciseTraining.ts` (`computeExerciseTrainingGain`) with config knobs `rates.offlineTraining`/`rates.exerciseTraining`. This feature only needs to add the in-world triggers: the offline-training bar column + statue action + transactional login conversion, and the exercise-weapon/dummy charge-consuming, PZ-gated, exhausted action loop. Reuse those engines; do not re-derive the formulas. See [completed log](completed/implementation-feature-18-completed.md).

## Tests
- Clock manipulation/replay cannot mint stamina, sleep regen, or training time (login with skewed client clock changes nothing).
- Blessing purchase races cannot double-charge or double-grant; audit rows present.
- Offline accrual is exactly-once across crash/restart.

## Dependencies
- Feeds Feature 32 (death penalty uses blessings), Feature 60 (blessing-loss extras), and house beds use shipped `HouseService` gates.
- Overlaps Feature 18 (stamina/training in combat progression) — reconcile scope before starting.
- Bank core (shipped, todo-12).
