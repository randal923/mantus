# Feature 58 — completed

Guild bank, war stakes, and guild points, from
[implementation-feature-58.md](../implementation-feature-58.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Shared balance, escrowed stakes, points

**Problem.** Guilds had no shared balance (the prerequisite for guildhall rent
and purchase), Canary's `guild_wars.payment` stakes were unimplemented, and
there was no guild points/level progression.

**What changed.** Migration `045_guild_bank.sql` puts `balance`, `points` and
`level` on `guilds` — the balance lives on the guild row so every mutation locks
exactly one row — adds `payment`, `escrowed_payment` and `payout_settled` to
`guild_wars`, adds a `guild_bank_ledger`, and registers the four new audit types
plus the two new bank-ledger entry types.

*Deposits and withdrawals* are one serializable transaction each, money moving
between the member's **bank** balance and the guild balance (bank-only legs, so
no carried coins can be duplicated by the transfer). Membership is re-read from
database truth inside the transaction; withdrawal additionally re-reads the
leader capability. The debit is a conditional `UPDATE … WHERE balance >= $2`, so
two racing withdrawals cannot both succeed and the balance can never go
negative. Each writes a `guild_bank_ledger` row, a `bank_ledger` row, and an
`audit_log` row in the same transaction.

*War stakes* are escrowed in the transaction that activates the war: one
statement debits both guilds guarded by `balance >= payment`, and unless both
sides paid in the whole accept rolls back, so a war never starts half-funded.
Payout happens inside the existing exactly-once end-war transactions (surrender,
withdrawal, and the frag-limit transition) through `settleWarPayout`, whose
`payout_settled` flag flips in the same statement that reads the pot — so a
retried or concurrent end-war pays out at most once. A cancelled declaration
refunds both sides half the pot.

*Points* accrue server-side: a recorded war frag is worth one point, and the
level is derived as `1 + points / 1000`. The projection exposes balance, points
and level to every member.

**Files touched.** `server/db/migrations/045_guild_bank.sql`,
`server/src/guild/{GuildStore,PgGuildStore,MemoryGuildStore,GuildService,guildBalanceOps,projectGuildStateFor}.ts`,
`server/src/guild/sql/{guildBankQueries,guildRowQuery,insertGuildWarQuery,warForUpdateQuery}.ts`,
`server/src/economy/appendBankLedger.ts`, `protocol/src/{guild,clientMessages}.ts`,
`server/src/GameServer.ts`, `client/stories/GuildModal.stories.tsx`.

**How it was verified.** `GuildBank.test.ts` (7 cases against the memory store:
gold conservation across a deposit, an over-balance deposit refused, withdrawal
restricted to the leader, racing withdrawals leaving the balance non-negative, a
non-member refused outright, the derived level, and the member projection).
`PgGuildStore.integration.test.ts` gains four cases for the durable
guarantees — gold conservation across deposit and withdrawal with the ledger
rows, racing withdrawals, a stake escrowed on accept and paid out exactly once
with the pot conserved, and a war neither guild can stake left pending with no
balance moved. They are registered in `yarn workspace server test:integration`
and need a Postgres; they were not run in this pass.

**Residual risk.** Withdrawal is leader-only rather than rank-capability
driven — there is no per-rank permission model yet. There is no client UI for
deposit/withdraw; the intents and the projection are in place for one.
