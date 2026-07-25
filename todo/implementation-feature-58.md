# Feature 58 — Guild bank, war stakes, and guild points

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-58-completed.md).

## Remaining work

- **Client UI for deposit/withdraw.** The `guild-deposit`/`guild-withdraw`
  intents and the balance/points/level projection exist; the guild modal has no
  controls for them yet.
- **Per-rank withdrawal permission.** Withdrawal is leader-only. Canary gates it
  on a rank capability, which needs a permission model on `guild_ranks`.
- **Integration tests unrun.** The four durable cases added to
  `PgGuildStore.integration.test.ts` need a Postgres
  (`yarn workspace server test:integration`).

## Consumed by

- Feature 63 (guildhall purchase) and guildhall rent in Feature 64's area.
