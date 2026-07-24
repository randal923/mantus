# Feature 84 — Rewards and loot QoL

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Reward bosses, quick loot, and daily rewards are heavily-used Canary systems that create items — every grant path must be atomic, audited, and respect the item-ownership model.

## Remaining work
- Reward bosses and reward chests.
- Quick loot + loot containers.
- Supply stash interaction with quick loot (the stash itself shipped in the economy area; the remaining bit is quick-loot routing into it).
- Daily rewards; reward calendars/streaks.

## Implementation
- Reward chest as a per-player instanced container on the item-ownership model, following the shipped depot pattern (todo-12) — one owner row per item, single-step moves.
- Quick loot as a server-validated loot intent that respects the memory-first corpse invariant (Feature 31): corpses/loot have no DB rows until first touch, so quick-loot's first touch drives persistence exactly like manual looting.
- Loot-container assignment as bounded per-character preferences; routing (including into the supply stash) resolved server-side at loot execution.
- Daily rewards with durable streak timers advanced by the server clock only; all grants in single transactions with audit rows for economy-relevant items (charter rules 2 and 11).

## Tests
- Quick-loot races (two players, or quick-loot vs. manual open) conserve every item under the memory-first invariant.
- Daily reward claims exactly-once per day; clock manipulation cannot advance streaks.
- Reward-chest grants atomic with the boss-kill credit.

## Dependencies
- Corpse loot core and Feature 31 (memory-first corpse invariants).
- Item model / depot-stash patterns (todo-12).
