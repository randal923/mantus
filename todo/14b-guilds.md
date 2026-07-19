# Guilds

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on stable
character ids and [`chat`](09-chat.md) channel membership.

## Guilds

- [x] Add durable guild, rank, membership, invitation, MOTD, and permission
  tables with normalized unique names and explicit role capabilities.
  (Shipped 2026-07-19: migration `017_guilds.sql`, `server/src/guild/`,
  `protocol/src/guild.ts`; ranks 1/2/3 = Member/Vice-Leader/The Leader,
  one guild per character via membership PK.)
- [x] Implement create/invite/accept/remove/promote/disband as authorized
  transactions; handle concurrent membership/name races in the database.
  (Serializable txs, unique-violation race mapping, execution-time rank
  re-reads inside each tx. Managed fully in-game via the guild modal.)
- [x] Add guild channels only through the chat membership/permission path.
  (`/g` channel; membership + mute re-checked at execution; vice+/leader
  highlight.)
- [x] Implement pinned guild wars, war invitations/ends, kill accounting,
  emblems, online/member lists, rank permissions, and guild message behavior.
  (War states 0–4, frag limits with exactly-once end-war, `guild_war_kills`
  rows from the death path, viewer-relative ally/enemy/at-war emblems.)
  - Deferred: guild bank/balance (needed later for guildhall rent), war
    payment stakes (`guild_wars.payment` in Canary), guild points/level.

## Planned file surface

- Feature-local migrations and `server/src/guild/` with one main export per
  file.
- Bounded protocol intents/projections and a focused client panel.

## Required exploit tests

- [x] Guild permission and concurrent membership/name races fail safely.
  (`GuildService.test.ts`, `PgGuildStore.integration.test.ts`)
- [x] Guild channel access follows membership/permission state at execution
  time. (`GuildService.test.ts`)
- [x] Membership and rank data are not over-shared beyond what a member may
  see. (Roster only to members; invite list only to vice+; public creature
  state carries only guild name + at-war flag.)

[Back to overview](README.md)
