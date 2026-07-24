# Feature 74 — Prey system

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Prey is a core Canary progression system: per-slot creature bonuses that modify combat, loot, and experience, with paid rerolls — an economy touchpoint requiring ACID handling.

## Remaining work
- Prey slots with durable state.
- Reroll costs and wildcards.
- Bonus application to combat, loot, and exp.

## Implementation
- New `server/src/prey/` module with durable per-character slot state (migration + store).
- Reroll debits via bank transactions with ledger + audit rows (charter rules 2 and 11); wildcard balances durable.
- Bonuses applied server-side at kill-reward and damage execution time — re-checked at execution, not cached from selection time.
- Bounded zod intents in `protocol/` (select/reroll/lock) with rate limits before handlers.

## Tests
- Reroll races cannot double-debit or grant two rolls for one payment.
- Bonuses only apply to the slot's creature race, evaluated at kill execution.
- Reroll RNG is server-side.

## Dependencies
- Bestiary creature catalog (shipped).
- Bank core (shipped, todo-12).
