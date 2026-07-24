# Feature 58 — Guild bank, war stakes, and guild points

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Guilds need a shared balance (the prerequisite for guildhall rent and purchase), Canary's guild-war payment stakes (`guild_wars.payment`), and guild points/level progression.

## Remaining work
- Guild bank/balance with deposits and withdrawals (prerequisite for guildhall rent in the houses area).
- War payment stakes per Canary `guild_wars.payment`: escrow on invite-accept, payout to the winner.
- Guild points/level.

## Implementation
- New migration adding guild balance; store methods in `server/src/guild/PgGuildStore.ts`.
- Deposits/withdrawals/stake escrow each as a single ACID transaction with bank ledger entries + audit rows in the same transaction (charter rules 2 and 11).
- Wire war stakes into the existing war-state machine in `server/src/guild/GuildService.ts`: escrow the stake in the invite-accept transaction, pay out inside the existing exactly-once end-war transaction.
- Withdrawal authorization re-checks rank capability at execution time (existing execution-time rank re-read pattern).
- Guild points/level as durable columns with server-side grant hooks; no client-supplied values.

## Tests
- Racing withdrawals cannot drive the guild balance negative.
- Stake payout fires exactly once even under concurrent end-war attempts.
- Gold conservation across escrow/payout/refund verified in `PgGuildStore.integration.test.ts`.

## Dependencies
- Bank core (shipped, todo-12).
- Consumed by Feature 63 (guildhall purchase) and guildhall rent in Feature 64's area.
