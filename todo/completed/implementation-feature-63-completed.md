# Feature 63 — completed

Guildhall purchase, from
[implementation-feature-63.md](../implementation-feature-63.md).

Cross-links: [todo-15.md](../todo-15.md), [Feature 58](implementation-feature-58-completed.md).

---

## 2026-07-25 — Guild-funded guildhalls

**Problem.** `houses.json` already carried the Canary guildhall flag (66 halls
in the pinned `otservbr` artifact, emitted by `tools/importCanaryHouses.mjs`),
but there was no way to buy one: `house-buy` simply rejected guildhalls.

**What changed.** `houses.guild_id` (migration `048_guildhalls.sql`) marks a
house as guild-owned. The one-house-per-character unique index became partial
(`where guild_id is null`) so a leader's personal house and their guild's hall
no longer collide, and a second partial unique index (`where guild_id is not
null`) enforces one hall per guild against racing purchases. `on delete
restrict` stops a guild delete from orphaning a hall.

`house-buy` on a guildhall routes to `purchaseGuildhall`, which locks the house
row and the guild row, **re-reads `guilds.owner_character_id` inside the
transaction** (a leader demoted since the intent was enqueued cannot spend the
guild's gold), debits through the existing conditional `balance >= amount`
UPDATE so racing withdrawals cannot overdraw, and writes a
`guildhall-purchase` guild ledger row plus the `house-purchase` audit row.
Rent follows the same rule: `chargeRent` debits the guild balance
(`guildhall-rent`) when `guild_id` is set, never the leader's bank account.

Access: a guildhall grants at least guest to every member of the owning guild
without anyone listing them, resolved live from the same guild identity
Feature 62 uses. Personal transfer offers on a guildhall are refused —
the hall belongs to the guild, not the leader.

**Files touched.**
`server/db/migrations/048_guildhalls.sql`,
`server/src/house/{HouseService,HouseStore,PgHouseStore,MemoryHouseStore,HouseRegistry,HouseAccessList}.ts`,
`server/src/house/sql/{insertGuildhallQuery,guildOwnerForUpdateQuery,houseRowQuery,houseRowsQuery,houseRowForUpdateQuery}.ts`,
`server/src/guild/{GuildService,guildBalanceOps}.ts`, `server/src/GameServer.ts`,
`client/components/house/HouseOverviewSection.tsx`,
`client/locales/{en,pt-BR}.json`.

**How it was verified.** `HouseService.test.ts` — a member cannot spend the
guild balance, the leader's purchase debits the guild and not their own bank,
members get hall access that disappears when they leave the guild, and a
personal transfer offer on a hall is refused. `PgHouseStore.integration.test.ts`
— non-leader rejected at execution time, guild balance debited and personal
bank untouched, the leader may still buy a personal house, a second hall for
the same guild fails on the partial unique index with the balance unchanged,
and guildhall rent comes out of the guild balance.

**Residual risk.** Leadership handover does not re-point
`houses.owner_character_id`; the row keeps the buying leader's id while
`guild_id` stays authoritative for money and access. Abandoning a hall is still
gated on that stored owner id rather than on current leadership — worth
revisiting when Feature 58's per-rank permissions land.
